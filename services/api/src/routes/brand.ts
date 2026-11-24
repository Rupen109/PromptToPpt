import { zValidator } from '@hono/zod-validator'
import { bodyLimit } from 'hono/body-limit'
import { Hono } from 'hono'
import { z } from 'zod'
import { getEntitlements } from '../billing/entitlements.ts'
import { BrandReadError, findBrand } from '../brand/find.ts'
import { brandFromFile } from '../brand/from-file.ts'
import { MAX_BRAND_FILE_BYTES } from '../brand/file-types.ts'
import { refuseIfOn } from '../flags/flags.ts'
import { busyAnswer, uploadGate } from '../middleware/upload-gate.ts'
import { SourceError } from '../sources/errors.ts'
import { BusyError } from '../sources/parse-pool.ts'
import { MAX_IMAGE_BYTES, KitError, assertBrand, brandAllowed, kitLimit, addKitImage, createKit, deleteKit, listKits, removeKitImage, setKitLogo, updateKit } from '../brand/kits.ts'
import { byUser, rateLimit } from '../middleware/rate-limit.ts'
import { MAX_BRAND_THEMES, createBrandTheme, deleteBrandTheme, listBrandThemes } from '../brand/themes.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'
import { BlockedUrlError } from '../sources/ssrf.ts'
import type { Context } from 'hono'

export const brand = new Hono<AppEnv>()
brand.use('*', requireAuth)

/**
 * "Use my brand": paste a company website, get its colours, fonts and logo back. No AI call and no credits (it reads the page's own
 * HTML and CSS); the cost is network + CPU, so it is rate-limited per user. Only plans with brand kits (`assertBrand`).
 */
brand.post('/extract', rateLimit({ windowMs: 3_600_000, max: 10, message: 'You have looked up a lot of websites in the last hour. Please wait a little while and try again.', key: (c) => `brand:${(c.get('session') as { user: { id: string } }).user.id}` }), zValidator('json', z.object({ url: z.string().trim().min(3).max(2000) })), async (c) => {
  const userId = c.get('session')!.user.id
  const ent = await getEntitlements(userId)
  assertBrand(ent, 'Matching your brand from a website is available on Gold and Premium.')
  const raw = c.req.valid('json').url
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    return c.json({ success: true, data: await findBrand(userId, url) })
  } catch (e) {
    if (e instanceof BlockedUrlError) return c.json({ success: false, error: { code: 'URL_NOT_ALLOWED', message: e.message } }, 400)
    console.warn('[brand] extract failed:', (e as Error).message)
    const msg = (e as Error).message
    return c.json({ success: false, error: { code: 'BRAND_FAILED', message: e instanceof BrandReadError || /^Invalid URL/.test(msg) ? msg : 'We could not read that website. Check the address and try again.' } }, 422)
  }
})

/**
 * "Use my brand" from a file: a PowerPoint (.pptx) or a PDF gives its colours, fonts, logo and name, in the same review card as a website. No AI call and no credits;
 * the cost is CPU in the parse worker, so it is rate-limited per user, admitted by memory (uploadGate) and read under the same worker limits as every other upload.
 * Only plans with brand kits (checked BEFORE the body is read). Nothing is saved except the logo (as the person's own asset): saving a kit is a separate, explicit step.
 */
brand.post('/from-file', rateLimit({ windowMs: 3_600_000, max: 20, key: byUser('brand-file'), message: 'You have read a lot of files in the last hour. Please wait a little while and try again.' }), async (c, next) => {
  const ent = await getEntitlements(c.get('session')!.user.id)
  assertBrand(ent, 'Matching your brand from a PowerPoint or PDF is available on Gold and Premium.')
  await next()
}, uploadGate, bodyLimit({ maxSize: MAX_BRAND_FILE_BYTES + 64 * 1024, onError: (c) => c.json({ success: false, error: { code: 'TOO_LARGE', message: 'That file is too large (up to 15 MB).' } }, 413) }), async (c) => {
  const userId = c.get('session')!.user.id
  const maint = await refuseIfOn('maintenance_mode', c, userId)
  if (maint) return maint
  const file = (await c.req.parseBody())['file']
  if (!(file instanceof File)) return c.json({ success: false, error: { code: 'NO_FILE', message: 'Attach a PowerPoint or PDF file as "file".' } }, 400)
  if (file.size > MAX_BRAND_FILE_BYTES) return c.json({ success: false, error: { code: 'TOO_LARGE', message: 'That file is too large (up to 15 MB).' } }, 413)
  try {
    return c.json({ success: true, data: await brandFromFile(userId, new Uint8Array(await file.arrayBuffer()), file.name || 'brand') })
  } catch (e) {
    if (e instanceof BusyError) return busyAnswer(c)
    if (e instanceof SourceError) return c.json({ success: false, error: { code: 'PARSE_FAILED', message: e.message } }, 422)
    console.warn('[brand] file failed:', (e as Error).message)
    return c.json({ success: false, error: { code: 'BRAND_FAILED', message: 'We could not read that file. Check it opens normally, or try another copy.' } }, 422)
  }
})

// ─── brand kits: saved colours, fonts, logo and pictures (Gold and Premium: 5) ─────────────────────────────────

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const kitBody = z.object({
  name: z.string().trim().max(60).optional(),
  primary: hex.nullable().optional(),
  accent: hex.nullable().optional(),
  extra: z.array(hex).max(8).optional(),
  headingFont: z.string().max(60).nullable().optional(),
  bodyFont: z.string().max(60).nullable().optional(),
  sourceUrl: z.string().max(2000).nullable().optional(),
  logoUrl: z.string().max(2048).optional(),
})
const entOf = (c: Context<AppEnv>) => getEntitlements(c.get('session')!.user.id)
/** every change to a kit needs a plan with brand kits (a person who moved to a plan without them keeps their kits stored, unused, until they come back) */
const kitGate = async (c: Context<AppEnv>, next: () => Promise<void>) => { assertBrand(await entOf(c)); await next() }
const fail = (c: Context<AppEnv>, e: unknown) => {
  if (e instanceof KitError) return c.json({ success: false, error: { code: e.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INVALID_INPUT', message: e.message } }, e.code === 'NOT_FOUND' ? 404 : 422)
  throw e
}
const upload = rateLimit({ windowMs: 3_600_000, max: 60, key: (c) => `brandup:${(c.get('session') as { user: { id: string } }).user.id}` })
const limit = bodyLimit({ maxSize: MAX_IMAGE_BYTES + 256 * 1024, onError: (c) => c.json({ success: false, error: { code: 'TOO_LARGE', message: 'That picture is too large.' } }, 413) })
const fileOf = async (c: Context<AppEnv>): Promise<{ bytes: Buffer; name: string; label: string } | null> => {
  const form = await c.req.parseBody()
  const f = form['file']
  if (!(f instanceof File)) return null
  return { bytes: Buffer.from(await f.arrayBuffer()), name: f.name, label: typeof form['name'] === 'string' ? form['name'] : f.name.replace(/\.[^.]+$/, '') }
}

brand.get('/kits', async (c) => {
  const userId = c.get('session')!.user.id
  const ent = await entOf(c)
  // a plan without brand kits sees none: nothing can offer a kit it may not use (the Brand tab, a new deck, the assistant)
  return c.json({ success: true, data: brandAllowed(ent) ? { kits: await listKits(userId), limit: kitLimit(ent) } : { kits: [], limit: 0 } })
})
brand.post('/kits', zValidator('json', kitBody), async (c) => {
  try { return c.json({ success: true, data: await createKit(c.get('session')!.user.id, await entOf(c), c.req.valid('json')) }, 201) } catch (e) { return fail(c, e) }
})
brand.patch('/kits/:id', kitGate, zValidator('json', kitBody.extend({ isDefault: z.boolean().optional(), removeLogo: z.boolean().optional() })), async (c) => {
  try { return c.json({ success: true, data: await updateKit(c.get('session')!.user.id, c.req.param('id'), c.req.valid('json')) }) } catch (e) { return fail(c, e) }
})
brand.delete('/kits/:id', async (c) => {
  try { await deleteKit(c.get('session')!.user.id, c.req.param('id')); return c.json({ success: true, data: { deleted: true } }) } catch (e) { return fail(c, e) }
})
/** themes made from a kit (brand/themes.ts): a design in light or dark with the kit's colours, fonts and logo; listed with the theme worked out from the kit as it is now */
brand.get('/themes', async (c) => {
  const ent = await entOf(c)
  return c.json({ success: true, data: brandAllowed(ent) ? { themes: await listBrandThemes(c.get('session')!.user.id), limit: MAX_BRAND_THEMES } : { themes: [], limit: 0 } })
})
brand.post('/themes', rateLimit({ windowMs: 60_000, max: 30, key: byUser('brand-theme') }), zValidator('json', z.object({ kitId: z.string().min(1).max(32), designId: z.string().min(1).max(80), mode: z.enum(['light', 'dark']), name: z.string().max(60).optional() })), async (c) => {
  try { return c.json({ success: true, data: await createBrandTheme(c.get('session')!.user.id, await entOf(c), c.req.valid('json')) }, 201) } catch (e) { return fail(c, e) }
})
brand.delete('/themes/:id', async (c) => {
  try { await deleteBrandTheme(c.get('session')!.user.id, c.req.param('id')); return c.json({ success: true, data: { deleted: true } }) } catch (e) { return fail(c, e) }
})
brand.post('/kits/:id/logo', kitGate, upload, limit, async (c) => {
  const f = await fileOf(c)
  if (!f) return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Choose a PNG or JPEG file.' } }, 422)
  try { return c.json({ success: true, data: await setKitLogo(c.get('session')!.user.id, c.req.param('id'), f.bytes) }) } catch (e) { return fail(c, e) }
})
brand.post('/kits/:id/images', kitGate, upload, limit, async (c) => {
  const f = await fileOf(c)
  if (!f) return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Choose a PNG or JPEG file.' } }, 422)
  try { return c.json({ success: true, data: await addKitImage(c.get('session')!.user.id, c.req.param('id'), f.label, f.bytes) }, 201) } catch (e) { return fail(c, e) }
})
brand.delete('/kits/:id/images/:imageId', async (c) => {
  try { return c.json({ success: true, data: await removeKitImage(c.get('session')!.user.id, c.req.param('id'), c.req.param('imageId')) }) } catch (e) { return fail(c, e) }
})
