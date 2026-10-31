import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../db/index.ts'
import { review, user } from '../../db/schema.ts'
import { audit, ipOf } from '../../lib/audit.ts'
import type { AppEnv } from '../../middleware/session.ts'

/** Owner section: reviews. Mounted by routes/admin.ts under /api/v1/admin/reviews; auth + role + audit + rate limit are applied there. */
export const reviewsRoutes = new Hono<AppEnv>()
const status = z.enum(['pending', 'approved', 'rejected'])

reviewsRoutes.get('/', zValidator('query', z.object({ status: status.default('pending') })), async (c) => {
  const rows = await db.select({ id: review.id, rating: review.rating, body: review.body, displayName: review.displayName, role: review.role, status: review.status, email: user.email, createdAt: review.createdAt, updatedAt: review.updatedAt })
    .from(review).innerJoin(user, eq(user.id, review.userId)).where(eq(review.status, c.req.valid('query').status)).orderBy(desc(review.updatedAt)).limit(200)
  return c.json({ success: true, data: rows })
})

reviewsRoutes.patch('/:id', zValidator('json', z.object({ status })), async (c) => {
  const [row] = await db.update(review).set({ status: c.req.valid('json').status, updatedAt: new Date() }).where(eq(review.id, c.req.param('id'))).returning({ id: review.id, status: review.status })
  if (!row) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Review not found' } }, 404)
  await audit(c.get('session')!.user.id, 'review.moderate', { id: row.id, status: row.status }, ipOf(c.req.raw.headers))
  return c.json({ success: true, data: row })
})

reviewsRoutes.delete('/:id', async (c) => {
  const gone = await db.delete(review).where(eq(review.id, c.req.param('id'))).returning({ id: review.id })
  if (!gone.length) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Review not found' } }, 404)
  await audit(c.get('session')!.user.id, 'review.delete', { id: c.req.param('id') }, ipOf(c.req.raw.headers))
  return c.json({ success: true, data: null })
})
