import { zValidator } from '@hono/zod-validator'
import { bodyLimit } from 'hono/body-limit'
import { Hono } from 'hono'
import { z } from 'zod'
import { getEntitlements } from '../billing/entitlements.ts'
import { GateError } from '../billing/errors.ts'
import { BrandReadError, findBrand } from '../brand/find.ts'
import { MAX_IMAGE_BYTES, MAX_KITS, KitError, addKitImage, createKit, deleteKit, listKits, removeKitImage, setKitLogo, updateKit } from '../brand/kits.ts'
import { rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'
import { BlockedUrlError } from '../sources/ssrf.ts'
import type { Context } from 'hono'

export const brand = new Hono<AppEnv>()
brand.use('*', requireAuth)

/**
 * "Use my brand": paste a company website, get its colours, fonts and logo back. No AI call and no credits (it reads the page's own
 * HTML and CSS); the cost is network + CPU, so it is rate-limited per user. Paid plans only (Pro and Gold).
 */
brand.post('/extract', rateLimit({ windowMs: 3_600_000, max: 10, message: 'You have looked up a lot of websites in the last hour. Please wait a little while and try again.', key: (c) => `brand:${(c.get('session') as { user: { id: string } }).user.id}` }), zValidator('json', z.object({ url: z.string().trim().min(3).max(2000) })), async (c) => {
  const userId = c.get('session')!.user.id
  const ent = await getEntitlements(userId)
  if (ent.plan.id === 'starter') throw new GateError('UPGRADE_REQUIRED', 'Matching your brand from a website is available on Pro and Gold.', 403, { feature: 'brand' })
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

// ─── brand kits: saved colours, fonts, logo and pictures (Pro: 1 kit, Gold: 5) ─────────────────────────────────

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
const planOf = async (c: Context<AppEnv>) => (await getEntitlements(c.get('session')!.user.id)).plan.id
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
  return c.json({ success: true, data: { kits: await listKits(userId), limit: MAX_KITS[await planOf(c)] ?? 0 } })
})
brand.post('/kits', zValidator('json', kitBody), async (c) => {
  try { return c.json({ success: true, data: await createKit(c.get('session')!.user.id, await planOf(c), c.req.valid('json')) }, 201) } catch (e) { return fail(c, e) }
})
brand.patch('/kits/:id', zValidator('json', kitBody.extend({ isDefault: z.boolean().optional(), removeLogo: z.boolean().optional() })), async (c) => {
  try { return c.json({ success: true, data: await updateKit(c.get('session')!.user.id, c.req.param('id'), c.req.valid('json')) }) } catch (e) { return fail(c, e) }
})
brand.delete('/kits/:id', async (c) => {
  try { await deleteKit(c.get('session')!.user.id, c.req.param('id')); return c.json({ success: true, data: { deleted: true } }) } catch (e) { return fail(c, e) }
})
brand.post('/kits/:id/logo', upload, limit, async (c) => {
  const f = await fileOf(c)
  if (!f) return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Choose a PNG or JPEG file.' } }, 422)
  try { return c.json({ success: true, data: await setKitLogo(c.get('session')!.user.id, c.req.param('id'), f.bytes) }) } catch (e) { return fail(c, e) }
})
brand.post('/kits/:id/images', upload, limit, async (c) => {
  const f = await fileOf(c)
  if (!f) return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Choose a PNG or JPEG file.' } }, 422)
  try { return c.json({ success: true, data: await addKitImage(c.get('session')!.user.id, c.req.param('id'), f.label, f.bytes) }, 201) } catch (e) { return fail(c, e) }
})
brand.delete('/kits/:id/images/:imageId', async (c) => {
  try { return c.json({ success: true, data: await removeKitImage(c.get('session')!.user.id, c.req.param('id'), c.req.param('imageId')) }) } catch (e) { return fail(c, e) }
})
