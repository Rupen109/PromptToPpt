import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import type { AppEnv } from '../../middleware/session.ts'
import { generation, overview, perfQuery, queue, timeseries, timeseriesQuery } from '../performance.ts'

/** Owner section: performance. Mounted by routes/admin.ts under /api/v1/admin/performance; auth + role + audit + rate limit are applied there. */
export const performanceRoutes = new Hono<AppEnv>()

performanceRoutes.get('/overview', zValidator('query', perfQuery), async (c) => c.json({ success: true, data: await overview(c.req.valid('query')) }))
performanceRoutes.get('/timeseries', zValidator('query', timeseriesQuery), async (c) => {
  const { bucket, ...q } = c.req.valid('query')
  return c.json({ success: true, data: await timeseries(q, bucket) })
})
performanceRoutes.get('/generation', zValidator('query', perfQuery), async (c) => c.json({ success: true, data: await generation(c.req.valid('query')) }))
performanceRoutes.get('/queue', zValidator('query', perfQuery), async (c) => c.json({ success: true, data: await queue(c.req.valid('query')) }))
