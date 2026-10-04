import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import type { AppEnv } from '../../middleware/session.ts'
import { marginBucketSchema, plans, summary, timeseries, topUsers, topUsersSchema } from '../margin.ts'
import { rangeSchema } from '../range.ts'

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
