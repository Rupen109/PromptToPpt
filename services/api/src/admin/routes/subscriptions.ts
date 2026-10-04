import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import type { AppEnv } from '../../middleware/session.ts'
import { rangeSchema } from '../range.ts'
import { list, listQuerySchema, subsBucketSchema, summary, timeseries } from '../subscriptions.ts'

/** Owner section: subscriptions. Mounted by routes/admin.ts under /api/v1/admin/subscriptions; auth + role + audit + rate limit are applied there. */
export const subscriptionsRoutes = new Hono<AppEnv>()

subscriptionsRoutes.get('/summary', zValidator('query', rangeSchema), async (c) => c.json({ success: true, data: await summary(c.req.valid('query')) }))

subscriptionsRoutes.get('/timeseries', zValidator('query', rangeSchema.extend({ bucket: subsBucketSchema })), async (c) => {
  const { bucket, ...q } = c.req.valid('query')
  return c.json({ success: true, data: await timeseries(q, bucket) })
})

subscriptionsRoutes.get('/list', zValidator('query', listQuerySchema), async (c) => c.json({ success: true, data: await list(c.req.valid('query')) }))
