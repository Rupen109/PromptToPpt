import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, asc, count, desc, eq, lte, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.ts'
import { post } from '../db/schema.ts'
import { KINDS, type PostRow, publicCard, publicFull } from '../content/posts.ts'
import { rateLimit } from '../middleware/rate-limit.ts'
import { getStorage } from '../storage/index.ts'
import type { AppEnv } from '../middleware/session.ts'

/** Public, no login: what the website shows. Mounted at /api/v1/content. Only published posts whose date has come are visible. */
export const content = new Hono<AppEnv>()
content.use('*', rateLimit({ windowMs: 60_000, max: 240 }))
content.use('*', async (c, next) => { await next(); if (c.res.status === 200 && !c.res.headers.has('cache-control')) c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=120') })

const live = (kind: (typeof KINDS)[number]) => and(eq(post.kind, kind), eq(post.status, 'published'), lte(post.publishedAt, sql`now()`))
const kindQ = z.enum(KINDS)
const notFound = (c: any) => c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, 404)

content.get('/posts', zValidator('query', z.object({ kind: kindQ, tag: z.string().trim().toLowerCase().max(30).optional(), page: z.coerce.number().int().min(1).max(500).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(12) })), async (c) => {
  const { kind, tag, page, pageSize } = c.req.valid('query')
  const where = and(live(kind), tag ? sql`${post.tags} @> ${JSON.stringify([tag])}::jsonb` : undefined)
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(post).where(where)
  const rows = await db.select().from(post).where(where).orderBy(desc(post.featured), desc(post.publishedAt), desc(post.createdAt)).limit(pageSize).offset((page - 1) * pageSize)
  return c.json({ success: true, data: { items: rows.map((r) => publicCard(r as PostRow)), total: n, page, pages: Math.max(1, Math.ceil(n / pageSize)) } })
})

/** the news strip: items the owner marked trending, newest first */
content.get('/news/trending', async (c) => {
  const rows = await db.select().from(post).where(and(live('news'), eq(post.trending, true))).orderBy(desc(post.publishedAt)).limit(6)
  return c.json({ success: true, data: rows.map((r) => publicCard(r as PostRow)) })
})

/** guides grouped by section; sections are ordered by their lowest order number */
content.get('/guides', async (c) => {
  const rows = (await db.select().from(post).where(live('guide')).orderBy(asc(post.sortOrder), asc(post.title))) as PostRow[]
  const sections = new Map<string, PostRow[]>()
  for (const r of rows) { const k = r.section?.trim() || 'Guides'; sections.set(k, [...(sections.get(k) ?? []), r]) }
  return c.json({ success: true, data: [...sections].map(([name, items]) => ({ name, items: items.map(publicCard) })) })
})

content.get('/tags', zValidator('query', z.object({ kind: kindQ })), async (c) => {
  const rows = await db.execute(sql`SELECT t AS tag, count(*)::int AS n FROM post, jsonb_array_elements_text(tags) AS t WHERE kind = ${c.req.valid('query').kind} AND status = 'published' AND published_at <= now() GROUP BY t ORDER BY n DESC, t ASC LIMIT 40`)
  return c.json({ success: true, data: (rows.rows as { tag: string; n: number }[]).map((r) => ({ tag: r.tag, count: r.n })) })
})

/** everything public, for the sitemap */
content.get('/index', async (c) => {
  const rows = await db.select({ kind: post.kind, slug: post.slug, updatedAt: post.updatedAt, publishedAt: post.publishedAt }).from(post).where(and(eq(post.status, 'published'), lte(post.publishedAt, sql`now()`))).orderBy(desc(post.publishedAt)).limit(5000)
  return c.json({ success: true, data: rows.map((r) => ({ kind: r.kind, slug: r.slug, updatedAt: r.updatedAt.toISOString(), publishedAt: r.publishedAt?.toISOString() ?? null })) })
})

content.get('/posts/:kind/:slug', async (c) => {
  const kind = kindQ.safeParse(c.req.param('kind'))
  if (!kind.success) return notFound(c)
  const [row] = (await db.select().from(post).where(and(live(kind.data), eq(post.slug, c.req.param('slug')))).limit(1)) as PostRow[]
  if (!row) return notFound(c)
  let related: PostRow[] = []
  let prev: PostRow | undefined, next: PostRow | undefined
  if (kind.data === 'guide') {
    const all = (await db.select().from(post).where(live('guide')).orderBy(asc(post.sortOrder), asc(post.title))) as PostRow[]
    const i = all.findIndex((g) => g.id === row.id)
    prev = all[i - 1]; next = all[i + 1]
  } else {
    related = (await db.select().from(post).where(and(live(kind.data), ne(post.id, row.id), row.tags.length ? sql`${post.tags} ?| array[${sql.join(row.tags.map((t) => sql`${t}`), sql`, `)}]::text[]` : undefined)).orderBy(desc(post.publishedAt)).limit(3)) as PostRow[]
    if (related.length < 3) related = [...related, ...((await db.select().from(post).where(and(live(kind.data), ne(post.id, row.id))).orderBy(desc(post.publishedAt)).limit(3)) as PostRow[]).filter((p) => !related.some((r) => r.id === p.id))].slice(0, 3)
  }
  return c.json({ success: true, data: { ...publicFull(row), related: related.map(publicCard), prev: prev ? publicCard(prev) : null, next: next ? publicCard(next) : null } })
})

/** pictures uploaded in the dashboard. Only keys that start with "post-" are served here: never a customer's picture. */
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }
content.get('/images/:file', async (c) => {
  const m = /^(post-[A-Za-z0-9_-]{16,40})\.(png|jpg|webp)$/.exec(c.req.param('file'))
  if (!m) return notFound(c)
  const bytes = await (await getStorage()).get(`${m[1]}.${m[2]}`)
  if (!bytes) return notFound(c)
  return new Response(Buffer.from(bytes), { headers: { 'Content-Type': MIME[m[2]!]!, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } })
})
