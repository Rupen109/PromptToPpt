import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { zValidator } from '@hono/zod-validator'
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { db } from '../../db/index.ts'
import { post } from '../../db/schema.ts'
import { KINDS, type Kind, type PostRow, adminRow, cleanTags, createPost, publishProblem, readingMinutes, RESERVED_SLUGS, slugify, SUMMARY_MAX, updatePost } from '../../content/posts.ts'
import { notifyWebsite, pathsFor } from '../../content/revalidate.ts'
import { audit, ipOf } from '../../lib/audit.ts'
import { sniffImage } from '../../lib/image-sniff.ts'
import type { AppEnv } from '../../middleware/session.ts'
import { extensionFor, getStorage } from '../../storage/index.ts'

/** Owner section: blog, news and guides. Mounted by routes/admin.ts under /api/v1/admin/posts; auth + role + audit + rate limit are applied there. */
export const postsRoutes = new Hono<AppEnv>()

const err = (c: any, status: 400 | 404 | 409 | 413 | 422, code: string, message: string) => c.json({ success: false, error: { code, message } }, status)
const actor = (c: any) => c.get('session')!.user.id as string
const TAKEN = 'That web address is already used by another post of this type. Change the address.'

/** an address nobody uses yet: "my-title", then "my-title-2"… */
async function freeSlug(kind: Kind, base: string, ignoreId?: string): Promise<string> {
  const root = (slugify(base) || 'post').replace(/-+$/, '')
  for (let i = 1; i < 200; i++) {
    const s = i === 1 ? root : `${root.slice(0, 76)}-${i}`
    if (RESERVED_SLUGS.has(s)) continue
    const [hit] = await db.select({ id: post.id }).from(post).where(and(eq(post.kind, kind), eq(post.slug, s))).limit(1)
    if (!hit || hit.id === ignoreId) return s
  }
  return `${root.slice(0, 60)}-${nanoid(6).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`
}
const isUnique = (e: unknown) => (e as { code?: string; cause?: { code?: string } })?.code === '23505' || (e as { cause?: { code?: string } })?.cause?.code === '23505'

postsRoutes.get('/', zValidator('query', z.object({ kind: z.enum(KINDS).optional(), state: z.enum(['draft', 'scheduled', 'published']).optional(), q: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1) })), async (c) => {
  const { kind, state, q, page } = c.req.valid('query')
  const stateSql = state === 'draft' ? sql`${post.status} = 'draft'` : state === 'published' ? sql`${post.status} = 'published' AND ${post.publishedAt} <= now()` : state === 'scheduled' ? sql`${post.status} = 'published' AND ${post.publishedAt} > now()` : undefined
  const where = and(kind ? eq(post.kind, kind) : undefined, stateSql, q ? or(ilike(post.title, `%${q.replace(/[%_\\]/g, '\\$&')}%`), ilike(post.slug, `%${q.replace(/[%_\\]/g, '\\$&')}%`)) : undefined)
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(post).where(where)
  const rows = (await db.select().from(post).where(where).orderBy(desc(post.updatedAt)).limit(30).offset((page - 1) * 30)) as PostRow[]
  const counts = await db.execute(sql`SELECT kind, count(*)::int AS n FROM post GROUP BY kind`)
  return c.json({ success: true, data: { items: rows.map((r) => { const { body: _body, ...rest } = adminRow(r); return rest }), total: n, page, pages: Math.max(1, Math.ceil(n / 30)), counts: Object.fromEntries((counts.rows as { kind: string; n: number }[]).map((r) => [r.kind, r.n])) } })
})

postsRoutes.get('/:id', async (c) => {
  const [row] = (await db.select().from(post).where(eq(post.id, c.req.param('id'))).limit(1)) as PostRow[]
  return row ? c.json({ success: true, data: adminRow(row) }) : err(c, 404, 'NOT_FOUND', 'Post not found')
})

postsRoutes.post('/', bodyLimit({ maxSize: 1024 * 1024, onError: (c) => err(c, 413, 'TOO_LARGE', 'That post is too large.') }), zValidator('json', createPost), async (c) => {
  const i = c.req.valid('json')
  const slug = i.slug ?? (await freeSlug(i.kind, i.title))
  if (i.slug && (await freeSlug(i.kind, i.slug)) !== i.slug) return err(c, 409, 'SLUG_TAKEN', TAKEN)
  if (i.summary.length > SUMMARY_MAX[i.kind]) return err(c, 422, 'INVALID_REQUEST', `The summary can be at most ${SUMMARY_MAX[i.kind]} characters.`)
  const id = nanoid(16)
  const [row] = (await db.insert(post).values({ ...i, id, slug, tags: cleanTags(i.tags), readingMinutes: readingMinutes(i.body), authorUserId: actor(c), status: 'draft', publishedAt: null }).returning()) as PostRow[]
  await audit(actor(c), 'post.create', { id, kind: i.kind, slug }, ipOf(c.req.raw.headers))
  return c.json({ success: true, data: adminRow(row!) }, 201)
})

postsRoutes.patch('/:id', bodyLimit({ maxSize: 1024 * 1024, onError: (c) => err(c, 413, 'TOO_LARGE', 'That post is too large.') }), zValidator('json', updatePost), async (c) => {
  const id = c.req.param('id')
  const [cur] = (await db.select().from(post).where(eq(post.id, id)).limit(1)) as PostRow[]
  if (!cur) return err(c, 404, 'NOT_FOUND', 'Post not found')
  const i = c.req.valid('json')
  const kind = cur.kind as Kind
  if (i.summary !== undefined && i.summary.length > SUMMARY_MAX[kind]) return err(c, 422, 'INVALID_REQUEST', `The summary can be at most ${SUMMARY_MAX[kind]} characters.`)
  if (i.slug && i.slug !== cur.slug && (await freeSlug(kind, i.slug, id)) !== i.slug) return err(c, 409, 'SLUG_TAKEN', TAKEN)
  const next = { ...cur, ...i, tags: i.tags ? cleanTags(i.tags) : cur.tags }
  // a post that is already live must stay publishable: no emptying its summary or article
  if (cur.status === 'published') { const problem = publishProblem(next as PostRow); if (problem) return err(c, 422, 'NOT_READY', problem) }
  try {
    const [row] = (await db.update(post).set({ ...i, ...(i.tags ? { tags: next.tags } : {}), ...(i.body !== undefined ? { readingMinutes: readingMinutes(i.body) } : {}), updatedAt: new Date() }).where(eq(post.id, id)).returning()) as PostRow[]
    await audit(actor(c), 'post.update', { id, fields: Object.keys(i) }, ipOf(c.req.raw.headers))
    if (cur.status === 'published') await notifyWebsite([...pathsFor(row!.kind, row!.slug), ...(row!.slug !== cur.slug ? pathsFor(cur.kind, cur.slug) : [])])
    return c.json({ success: true, data: adminRow(row!) })
  } catch (e) { if (isUnique(e)) return err(c, 409, 'SLUG_TAKEN', TAKEN); throw e }
})

/** Publish now, or on a later date (scheduled). Re-publishing keeps the original date unless a new one is given. */
postsRoutes.post('/:id/publish', zValidator('json', z.object({ publishedAt: z.string().datetime({ offset: true }).optional() }).default({})), async (c) => {
  const id = c.req.param('id')
  const [cur] = (await db.select().from(post).where(eq(post.id, id)).limit(1)) as PostRow[]
  if (!cur) return err(c, 404, 'NOT_FOUND', 'Post not found')
  const problem = publishProblem(cur)
  if (problem) return err(c, 422, 'NOT_READY', problem)
  const when = c.req.valid('json').publishedAt ? new Date(c.req.valid('json').publishedAt!) : cur.publishedAt && cur.status === 'published' ? cur.publishedAt : new Date()
  if (when.getTime() > Date.now() + 366 * 24 * 3600_000) return err(c, 422, 'INVALID_REQUEST', 'Choose a date within the next year.')
  const [row] = (await db.update(post).set({ status: 'published', publishedAt: when, updatedAt: new Date() }).where(eq(post.id, id)).returning()) as PostRow[]
  await audit(actor(c), 'post.publish', { id, at: when.toISOString() }, ipOf(c.req.raw.headers))
  await notifyWebsite(pathsFor(row!.kind, row!.slug))
  return c.json({ success: true, data: adminRow(row!) })
})

postsRoutes.post('/:id/unpublish', async (c) => {
  const [row] = (await db.update(post).set({ status: 'draft', updatedAt: new Date() }).where(eq(post.id, c.req.param('id'))).returning()) as PostRow[]
  if (!row) return err(c, 404, 'NOT_FOUND', 'Post not found')
  await audit(actor(c), 'post.unpublish', { id: row.id }, ipOf(c.req.raw.headers))
  await notifyWebsite(pathsFor(row.kind, row.slug))
  return c.json({ success: true, data: adminRow(row) })
})

postsRoutes.delete('/:id', async (c) => {
  const gone = await db.delete(post).where(eq(post.id, c.req.param('id'))).returning({ id: post.id, kind: post.kind, slug: post.slug })
  if (!gone.length) return err(c, 404, 'NOT_FOUND', 'Post not found')
  await audit(actor(c), 'post.delete', { id: gone[0]!.id }, ipOf(c.req.raw.headers))
  await notifyWebsite(pathsFor(gone[0]!.kind, gone[0]!.slug))
  return c.json({ success: true, data: null })
})

/** Picture for a post (cover or inside the text): PNG, JPEG or WebP up to 5 MB, judged by its first bytes, never by its name. */
const IMAGE_MAX = 5 * 1024 * 1024
postsRoutes.post('/images/upload', bodyLimit({ maxSize: IMAGE_MAX + 64 * 1024, onError: (c) => err(c, 413, 'TOO_LARGE', 'That picture is larger than 5 MB.') }), async (c) => {
  const file = (await c.req.parseBody())['file']
  if (!(file instanceof File)) return err(c, 400, 'NO_FILE', 'Choose a picture first.')
  if (file.size > IMAGE_MAX) return err(c, 413, 'TOO_LARGE', 'That picture is larger than 5 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = sniffImage(bytes)
  if (!mime) return err(c, 422, 'UNSUPPORTED', 'Use a PNG, JPG or WebP picture.')
  const key = `post-${nanoid(21)}.${extensionFor(mime)}`
  await (await getStorage()).put(key, bytes, mime)
  await audit(actor(c), 'post.image', { key, bytes: bytes.length }, ipOf(c.req.raw.headers))
  return c.json({ success: true, data: { url: `/api/v1/content/images/${key}`, mime, bytes: bytes.length } }, 201)
})
