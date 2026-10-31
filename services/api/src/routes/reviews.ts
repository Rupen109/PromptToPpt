import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, avg, count, desc, eq, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { db } from '../db/index.ts'
import { presentation, review } from '../db/schema.ts'
import { byUser, rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'

/**
 * Customer reviews. Public: only APPROVED reviews, as written by the customer (name they chose, never an e-mail). Writing needs an account that has made
 * at least one presentation; one review per person; an edit goes back to "pending" so nothing unchecked ever appears on the website.
 */
export const reviews = new Hono<AppEnv>()

const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
const LINKY = /(https?:\/\/|www\.|\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b|\.(com|net|org|io|ai|app)\b\/)/i
const reviewInput = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().transform(clean).pipe(z.string().min(20, 'Please write at least a sentence (20 characters)').max(600, 'Please keep it under 600 characters')),
  displayName: z.string().transform(clean).pipe(z.string().min(2, 'Add the name to show').max(60)),
  role: z.string().transform(clean).pipe(z.string().max(80)).optional(),
})
const err = (c: any, status: 400 | 403 | 404, code: string, message: string) => c.json({ success: false, error: { code, message } }, status)

/** Public: the average and the newest approved reviews for the website. Cached for a few minutes. */
reviews.get('/', async (c) => {
  const [agg] = await db.select({ n: count(), avg: avg(review.rating) }).from(review).where(eq(review.status, 'approved'))
  const items = await db.select({ id: review.id, rating: review.rating, body: review.body, name: review.displayName, role: review.role, createdAt: review.createdAt }).from(review).where(eq(review.status, 'approved')).orderBy(desc(review.createdAt)).limit(12)
  c.header('Cache-Control', 'public, max-age=60, s-maxage=300')
  return c.json({ success: true, data: { count: agg?.n ?? 0, average: agg?.avg ? Math.round(Number(agg.avg) * 10) / 10 : null, items } })
})

reviews.get('/mine', requireAuth, async (c) => {
  const [mine] = await db.select({ rating: review.rating, body: review.body, displayName: review.displayName, role: review.role, status: review.status }).from(review).where(eq(review.userId, c.get('session')!.user.id))
  return c.json({ success: true, data: mine ?? null })
})

reviews.put('/mine', requireAuth, rateLimit({ windowMs: 3_600_000, max: 6, key: byUser('review') }), zValidator('json', reviewInput), async (c) => {
  const userId = c.get('session')!.user.id
  const i = c.req.valid('json')
  if (LINKY.test(i.body) || LINKY.test(i.displayName) || (i.role && LINKY.test(i.role))) return err(c, 400, 'INVALID_REQUEST', 'Links and e-mail addresses are not allowed in reviews.')
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(presentation).where(and(eq(presentation.userId, userId), isNull(presentation.deletedAt)))
  if (n === 0) return err(c, 403, 'NEEDS_USAGE', 'Make a presentation first, then tell us how it went.')
  const now = new Date()
  await db.insert(review).values({ id: nanoid(), userId, rating: i.rating, body: i.body, displayName: i.displayName, role: i.role || null, status: 'pending' })
    .onConflictDoUpdate({ target: review.userId, set: { rating: i.rating, body: i.body, displayName: i.displayName, role: i.role || null, status: 'pending', updatedAt: now } })
  return c.json({ success: true, data: { status: 'pending' } })
})

reviews.delete('/mine', requireAuth, async (c) => {
  await db.delete(review).where(eq(review.userId, c.get('session')!.user.id))
  return c.json({ success: true, data: null })
})
