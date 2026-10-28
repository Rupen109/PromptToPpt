import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import type { AppEnv } from '../../middleware/session.ts'
import { marginBucketSchema, plans, summary, timeseries, topUsers, topUsersSchema } from '../margin.ts'
import { activity, planEconomics, sinceLastCheckin } from '../activity.ts'
import { rangeOf, rangeSchema } from '../range.ts'

/** Owner section: margin. Mounted by routes/admin.ts under /api/v1/admin/margin; auth + role + audit + rate limit are applied there. */
export const marginRoutes = new Hono<AppEnv>()

marginRoutes.get('/summary', zValidator('query', rangeSchema), async (c) => c.json({ success: true, data: await summary(c.req.valid('query')) }))

marginRoutes.get('/plans', zValidator('query', rangeSchema), async (c) => c.json({ success: true, data: await plans(c.req.valid('query')) }))

marginRoutes.get('/top-users', zValidator('query', rangeSchema.merge(topUsersSchema)), async (c) => {
  const { limit, ...q } = c.req.valid('query')
  return c.json({ success: true, data: await topUsers(q, limit) })
})

marginRoutes.get('/timeseries', zValidator('query', rangeSchema.extend({ bucket: marginBucketSchema })), async (c) => {
  const { bucket, ...q } = c.req.valid('query')
  return c.json({ success: true, data: await timeseries(q, bucket) })
})

/** Cost per user action (deck generation, edits, assistant, images) + credits charged. `since=checkin` (default when no range is given) = since the last balance reading. */
marginRoutes.get('/activity', zValidator('query', rangeSchema.extend({ since: z.enum(['checkin']).optional() })), async (c) => {
  const q = c.req.valid('query')
  const w = !q.from && !q.to ? await sinceLastCheckin() : { ...rangeOf(q), checkinAt: null }
  return c.json({ success: true, data: { ...(await activity(w.from, w.to)), checkinAt: w.checkinAt } })
})

/** Can each plan make money if its credits are fully used, at the measured provider cost per credit */
marginRoutes.get('/plan-economics', async (c) => c.json({ success: true, data: await planEconomics() }))
