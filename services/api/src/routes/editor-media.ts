import { zValidator } from '@hono/zod-validator'
import { and, count, desc, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { checkRaster, InvalidImageError, storeAsset } from '../brand/assets.ts'
import { BrandReadError, fetchLimited } from '../brand/find.ts'
import { resolveAccess } from '../collab/access.ts'
import { db } from '../db/index.ts'
import { generatedAsset } from '../db/schema.ts'
import { env } from '../env.ts'
import { rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'
import { LIBRARY_TAGS } from '../pictures/library-tags.ts'
import { pingStockUse, searchStockForEditor } from '../pictures/pick.ts'
import { BlockedUrlError } from '../sources/ssrf.ts'

/**
 * The editor's "Media library": the person's own uploads, free stock photos (Unsplash, Pexels) and the pictures that ship with the templates.
 * Uploaded and stock pictures are copied to OUR storage (a slide must keep working when the other site moves the file), under the deck owner's account.
 */
export const editorMedia = new Hono<AppEnv>()

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
export const MAX_KEPT_PICTURES = 300
const assetUrl = (id: string) => `${env.API_URL}/api/v1/assets/${id}`
const err = (c: any, status: 400 | 404 | 413 | 422 | 503, code: string, message: string) => c.json({ success: false, error: { code, message } }, status)
const uid = (c: any) => (c.get('session') as { user: { id: string } }).user.id

async function roomFor(userId: string): Promise<boolean> {
  const [held] = await db.select({ n: count() }).from(generatedAsset).where(and(eq(generatedAsset.userId, userId), eq(generatedAsset.kind, 'brand'), isNull(generatedAsset.deletedAt)))
  return (held?.n ?? 0) < MAX_KEPT_PICTURES
}
const FULL = `You can keep up to ${MAX_KEPT_PICTURES} pictures. Delete a few of your uploads first.`

/** Add media from the computer: one PNG or JPEG (checked by its first bytes, not its name), up to 8 MB. */
editorMedia.post(
  '/presentations/:id/images/upload',
  requireAuth,
  rateLimit({ windowMs: 3_600_000, max: 120, key: (c) => `mediaup:${uid(c)}` }),
  bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 256 * 1024, onError: (c) => c.json({ success: false, error: { code: 'TOO_LARGE', message: 'That picture is larger than 8 MB.' } }, 413) }),
  async (c) => {
    const access = await resolveAccess(c.req.param('id'), uid(c))
    if (!access) return err(c, 404, 'NOT_FOUND', 'Presentation not found')
    if (!(await roomFor(access.ownerId))) return err(c, 422, 'LIMIT_REACHED', FULL)
    const form = await c.req.parseBody().catch(() => null)
    const f = form?.['file']
    if (!(f instanceof File)) return err(c, 400, 'INVALID_INPUT', 'Choose a picture to add.')
    try {
      const bytes = Buffer.from(await f.arrayBuffer())
      const { mime, aspect } = checkRaster(bytes, { maxBytes: MAX_UPLOAD_BYTES, minSide: 16, maxAspect: 20 })
      const label = f.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'upload'
      const id = await storeAsset(access.ownerId, 'brand', bytes, mime, label)
      return c.json({ success: true, data: { assetId: id, url: assetUrl(id), mime, aspect, name: label } })
    } catch (e) {
      if (e instanceof InvalidImageError) return err(c, 422, 'NOT_A_PICTURE', e.message)
      throw e
    }
  },
)

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
  if (!r.ok) return err(c, 503, r.reason === 'busy' ? 'SEARCH_BUSY' : 'SEARCH_UNAVAILABLE', r.reason === 'busy' ? 'Photo search is busy right now. Try again in a few minutes, or use the template pictures and your uploads.' : 'Photo search is not set up on this server.')
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
const STOCK_HOSTS = { unsplash: /^images\.unsplash\.com$/, pexels: /^images\.pexels\.com$/ } as const

/** Use a stock photo: copied to our storage; Unsplash is told the photo was used (their API terms). Only the providers' own picture hosts are accepted. */
editorMedia.post('/presentations/:id/images/stock', requireAuth, rateLimit({ windowMs: 60_000, max: 20, key: (c) => `mediastock:${uid(c)}` }), zValidator('json', stockInput), async (c) => {
  const access = await resolveAccess(c.req.param('id'), uid(c))
  if (!access) return err(c, 404, 'NOT_FOUND', 'Presentation not found')
  const input = c.req.valid('json')
  let host = ''
  try { host = new URL(input.imageUrl).hostname } catch { /* validated above */ }
  if (!STOCK_HOSTS[input.provider].test(host)) return err(c, 422, 'NOT_A_PICTURE', 'That picture is not from the photo library.')
  if (!(await roomFor(access.ownerId))) return err(c, 422, 'LIMIT_REACHED', FULL)
  try {
    const got = await fetchLimited(input.imageUrl, { accept: /^(image\/(png|jpe?g)|application\/octet-stream|binary\/octet-stream)$/, maxBytes: MAX_UPLOAD_BYTES, timeoutMs: 15_000, headerAccept: 'image/jpeg,image/png,*/*;q=0.5' })
    if (!got) return err(c, 422, 'NOT_A_PICTURE', 'We could not download that picture. Try another one.')
    const { mime, aspect } = checkRaster(got.bytes, { maxBytes: MAX_UPLOAD_BYTES, minSide: 16, maxAspect: 20 })
    const id = await storeAsset(access.ownerId, 'brand', got.bytes, mime, `${input.provider} photo by ${input.author || 'unknown'}`.slice(0, 200))
    void pingStockUse(input.trackUrl)
    const source = input.provider === 'unsplash' ? `Photo by ${input.author || 'an Unsplash photographer'} on Unsplash` : `Photo by ${input.author || 'a Pexels photographer'} on Pexels`
    return c.json({ success: true, data: { assetId: id, url: assetUrl(id), mime, aspect, alt: input.alt, attribution: { source, license: input.provider === 'unsplash' ? 'Unsplash License' : 'Pexels License', ...(input.pageUrl ? { url: input.pageUrl } : {}) } } })
  } catch (e) {
    if (e instanceof InvalidImageError || e instanceof BrandReadError || e instanceof BlockedUrlError) return err(c, 422, 'NOT_A_PICTURE', e.message)
    throw e
  }
})
