import { zValidator } from '../lib/validate.ts'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { assetUrl, checkRaster, InvalidImageError, storeAsset } from '../brand/assets.ts'
import { BrandReadError } from '../brand/find.ts'
import { resolveAccess } from '../collab/access.ts'
import { db } from '../db/index.ts'
import { generatedAsset } from '../db/schema.ts'
import { env } from '../env.ts'
import { rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'
import { CutoutCancelledError, CutoutError } from '../media/cutout.ts'
import { cutOutPicture, CutoutBusyError, maskOfPicture, originalOfPicture } from '../media/cutout-picture.ts'
import { refuseIfOff } from '../flags/flags.ts'
import { LIBRARY_TAGS } from '../pictures/library-tags.ts'
import { searchStockForEditor } from '../pictures/pick.ts'
import { hasPictureRoom, importStockPhoto, isStockHost, MAX_KEPT_PICTURES, MAX_PICTURE_BYTES } from '../pictures/stock-import.ts'
import { BlockedUrlError } from '../sources/ssrf.ts'

/**
 * The editor's "Media library": the person's own uploads, free stock photos (Unsplash, Pexels) and the pictures that ship with the templates.
 * Uploaded and stock pictures are copied to OUR storage (a slide must keep working when the other site moves the file), under the deck owner's account.
 */
export const editorMedia = new Hono<AppEnv>()

const err = (c: any, status: 400 | 404 | 413 | 422 | 503, code: string, message: string) => c.json({ success: false, error: { code, message } }, status)
const uid = (c: any) => (c.get('session') as { user: { id: string } }).user.id

const FULL = `You can keep up to ${MAX_KEPT_PICTURES} pictures. Delete a few of your uploads first.`

/** Add media from the computer: one PNG or JPEG (checked by its first bytes, not its name), up to 8 MB. */
editorMedia.post(
  '/presentations/:id/images/upload',
  requireAuth,
  rateLimit({ windowMs: 3_600_000, max: 120, key: (c) => `mediaup:${uid(c)}` }),
  bodyLimit({ maxSize: MAX_PICTURE_BYTES + 256 * 1024, onError: (c) => c.json({ success: false, error: { code: 'TOO_LARGE', message: 'That picture is larger than 8 MB.' } }, 413) }),
  async (c) => {
    const access = await resolveAccess(c.req.param('id'), uid(c))
    if (!access) return err(c, 404, 'NOT_FOUND', 'Presentation not found')
    if (!(await hasPictureRoom(access.ownerId))) return err(c, 422, 'LIMIT_REACHED', FULL)
    const form = await c.req.parseBody().catch(() => null)
    const f = form?.['file']
    if (!(f instanceof File)) return err(c, 400, 'INVALID_INPUT', 'Choose a picture to add.')
    try {
      const bytes = Buffer.from(await f.arrayBuffer())
      const { mime, aspect } = checkRaster(bytes, { maxBytes: MAX_PICTURE_BYTES, minSide: 16, maxAspect: 20 })
      const label = f.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'upload'
      const id = await storeAsset(access.ownerId, 'brand', bytes, mime, label)
      return c.json({ success: true, data: { assetId: id, url: assetUrl(id), mime, aspect, name: label } })
    } catch (e) {
      if (e instanceof InvalidImageError) return err(c, 422, 'NOT_A_PICTURE', e.message)
      throw e
    }
  },
)

const cutoutBody = z.object({ url: z.string().url().max(2000) })
/**
 * "Remove background": the subject of one of the person's pictures is cut out (an open model on this server, see media/cutout.ts) and kept as a new transparent PNG in their pictures;
 * the original stays. Nothing leaves the server, and it costs no credits.
 */
editorMedia.post('/presentations/:id/images/cutout', requireAuth, rateLimit({ windowMs: 3_600_000, max: 60, key: (c) => `cutout:${uid(c)}` }), zValidator('json', cutoutBody), async (c) => {
  const off = await refuseIfOff('background_removal', c, uid(c)) // development only until a commercially approved model or provider is chosen
  if (off) return off
  const access = await resolveAccess(c.req.param('id'), uid(c))
  if (!access) return err(c, 404, 'NOT_FOUND', 'Presentation not found')
  if (!(await hasPictureRoom(access.ownerId))) return err(c, 422, 'LIMIT_REACHED', FULL)
  const { url } = c.req.valid('json')
  try {
    return c.json({ success: true, data: await cutOutPicture(access.ownerId, url, { signal: c.req.raw.signal }) })
  } catch (e) {
    if (e instanceof CutoutCancelledError) return err(c, 503, 'CANCELLED', 'Cancelled. Nothing was changed.') // the person has gone: the work was stopped
    if (e instanceof CutoutBusyError) return err(c, 503, 'BUSY', e.message)
    if (e instanceof CutoutError) return err(c, 422, e.message.startsWith('I can only') ? 'NOT_A_PICTURE' : 'CUTOUT_FAILED', e.message)
    console.error('[cutout]', e)
    return err(c, 503, 'CUTOUT_UNAVAILABLE', 'Removing the background is not available right now. Nothing was changed.')
  }
})

/**
 * The background removal dialog (development only, see the flag): the model's foreground MASK of one of the person's pictures, as a grey-scale PNG at the model's working size (the editor
 * resamples it to the picture's own size and lets the person refine it), and the picture's original bytes so the editor never needs cross-site access to where it is kept.
 */
editorMedia.post('/presentations/:id/images/cutout-mask', requireAuth, rateLimit({ windowMs: 3_600_000, max: 60, key: (c) => `cutout:${uid(c)}` }), zValidator('json', cutoutBody), async (c) => {
  const off = await refuseIfOff('background_removal', c, uid(c))
  if (off) return off
  const access = await resolveAccess(c.req.param('id'), uid(c))
  if (!access) return err(c, 404, 'NOT_FOUND', 'Presentation not found')
  try {
    const { png, width, height } = await maskOfPicture(access.ownerId, c.req.valid('json').url, { signal: c.req.raw.signal })
    return c.body(new Uint8Array(png), 200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Mask-Width': String(width), 'X-Mask-Height': String(height) })
  } catch (e) {
    if (e instanceof CutoutCancelledError) return err(c, 503, 'CANCELLED', 'Cancelled. Nothing was changed.') // the person has gone: the work was stopped
    if (e instanceof CutoutBusyError) return err(c, 503, 'BUSY', e.message)
    if (e instanceof CutoutError) return err(c, 422, e.message.startsWith('I can only') ? 'NOT_A_PICTURE' : 'CUTOUT_FAILED', e.message)
    console.error('[cutout-mask]', e)
    return err(c, 503, 'CUTOUT_UNAVAILABLE', 'Removing the background is not available right now. Nothing was changed.')
  }
})

/**
 * One of the person's own pictures, exactly as stored (the editor needs the bytes for any editing feature and any provider; it is NOT part of background removal, so it does not depend on
 * that feature's flag). Signed in, the deck must be one they can open, and only their own stored pictures or the template pictures of our website are served, and only if their first bytes say
 * PNG, JPEG or WebP.
 */
editorMedia.post('/presentations/:id/images/original', requireAuth, rateLimit({ windowMs: 3_600_000, max: 240, key: (c) => `picbytes:${uid(c)}` }), zValidator('json', cutoutBody), async (c) => {
  const access = await resolveAccess(c.req.param('id'), uid(c))
  if (!access) return err(c, 404, 'NOT_FOUND', 'Presentation not found')
  try {
    const { bytes, mime } = await originalOfPicture(access.ownerId, c.req.valid('json').url)
    return c.body(new Uint8Array(bytes), 200, { 'Content-Type': mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  } catch (e) {
    if (e instanceof CutoutError) return err(c, 422, e.message.startsWith('I can only') ? 'NOT_A_PICTURE' : 'UNSUPPORTED_FORMAT', e.message)
    throw e
  }
})

/** The person's own uploaded pictures, newest first (the "My uploads" tab). */
editorMedia.get('/media/mine', requireAuth, async (c) => {
  const rows = await db.select({ id: generatedAsset.id, label: generatedAsset.prompt, mime: generatedAsset.mime, createdAt: generatedAsset.createdAt }).from(generatedAsset)
    .where(and(eq(generatedAsset.userId, uid(c)), eq(generatedAsset.kind, 'brand'), eq(generatedAsset.model, 'upload'), eq(generatedAsset.status, 'ready'), isNull(generatedAsset.deletedAt)))
    .orderBy(desc(generatedAsset.createdAt)).limit(60)
  return c.json({ success: true, data: { items: rows.map((r) => ({ id: r.id, url: assetUrl(r.id), name: r.label, createdAt: r.createdAt })) } })
})

editorMedia.delete('/media/mine/:assetId', requireAuth, async (c) => {
  const done = await db.update(generatedAsset).set({ deletedAt: new Date() })
    .where(and(eq(generatedAsset.id, c.req.param('assetId')), eq(generatedAsset.userId, uid(c)), eq(generatedAsset.kind, 'brand'), eq(generatedAsset.model, 'upload'), isNull(generatedAsset.deletedAt))).returning({ id: generatedAsset.id })
  if (!done.length) return err(c, 404, 'NOT_FOUND', 'Picture not found')
  return c.json({ success: true, data: { deleted: true } })
})

const searchQuery = z.object({ q: z.string().trim().min(2).max(80), page: z.coerce.number().int().min(1).max(20).default(1) })
/** Free stock photos. Shares the hourly provider quota and a per-person budget with deck generation (see pick.ts). */
editorMedia.get('/media/search', requireAuth, rateLimit({ windowMs: 60_000, max: 40, key: (c) => `mediasearch:${uid(c)}` }), zValidator('query', searchQuery), async (c) => {
  const { q, page } = c.req.valid('query')
  const r = await searchStockForEditor(q, uid(c), page)
  if (!r.ok) return err(c, 503, r.reason === 'busy' ? 'SEARCH_BUSY' : 'SEARCH_UNAVAILABLE', r.reason === 'busy' ? 'Photo search is busy right now. Try again in a few minutes, or use the template pictures and your uploads.' : 'Photo search is not available right now. You can still use the gradients, your uploads and the template photos.')
  return c.json({ success: true, data: { photos: r.photos, page: r.page, hasMore: r.hasMore } })
})

/** The pictures that ship with the templates, found by keyword (free, no quota). */
editorMedia.get('/media/library', requireAuth, zValidator('query', z.object({ q: z.string().trim().max(80).default('') })), (c) => {
  const words = c.req.valid('query').q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1)
  const base = env.WEB_URL.replace(/\/+$/, '')
  const scored = Object.entries(LIBRARY_TAGS).map(([key, tag]) => ({ key, tag, score: words.length ? words.filter((w) => tag.keywords.some((k) => k.startsWith(w) || w.startsWith(k)) || tag.description.toLowerCase().includes(w)).length : 1 })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 48)
  return c.json({ success: true, data: { items: scored.map((x) => ({ key: x.key, url: `${base}/template-assets/${x.key}.jpg`, alt: x.tag.description })) } })
})

const stockInput = z.object({
  provider: z.enum(['unsplash', 'pexels']),
  imageUrl: z.string().url().max(2000),
  trackUrl: z.string().url().max(2000).optional(),
  alt: z.string().max(300).default(''),
  author: z.string().max(200).default(''),
  pageUrl: z.string().url().max(2000).optional(),
})
/** Use a stock photo: copied to our storage; Unsplash is told the photo was used (their API terms). Only the providers' own picture hosts are accepted. */
editorMedia.post('/presentations/:id/images/stock', requireAuth, rateLimit({ windowMs: 60_000, max: 20, key: (c) => `mediastock:${uid(c)}` }), zValidator('json', stockInput), async (c) => {
  const access = await resolveAccess(c.req.param('id'), uid(c))
  if (!access) return err(c, 404, 'NOT_FOUND', 'Presentation not found')
  const input = c.req.valid('json')
  if (!isStockHost(input.provider, input.imageUrl)) return err(c, 422, 'NOT_A_PICTURE', 'That picture is not from the photo library.')
  if (!(await hasPictureRoom(access.ownerId))) return err(c, 422, 'LIMIT_REACHED', FULL)
  try {
    const got = await importStockPhoto(access.ownerId, { provider: input.provider, full: input.imageUrl, ...(input.trackUrl ? { trackUrl: input.trackUrl } : {}), alt: input.alt, author: input.author, ...(input.pageUrl ? { pageUrl: input.pageUrl } : {}) })
    if (!got) return err(c, 422, 'NOT_A_PICTURE', 'We could not download that picture. Try another one.')
    return c.json({ success: true, data: got })
  } catch (e) {
    if (e instanceof InvalidImageError || e instanceof BrandReadError || e instanceof BlockedUrlError) return err(c, 422, 'NOT_A_PICTURE', e.message)
    throw e
  }
})
