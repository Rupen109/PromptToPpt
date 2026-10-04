import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { AppEnv } from '../../middleware/session.ts'
import { rangeSchema } from '../range.ts'
import { breakdown, payments, paymentsQuerySchema, salesBucketSchema, salesDimensionSchema, summary, timeseries, topCustomers } from '../sales.ts'

/** Owner section: sales. Mounted by routes/admin.ts under /api/v1/admin/sales; auth + role + audit + rate limit are applied there. */
export const salesRoutes = new Hono<AppEnv>()

salesRoutes.get('/summary', zValidator('query', rangeSchema), async (c) => c.json({ success: true, data: await summary(c.req.valid('query')) }))

salesRoutes.get('/timeseries', zValidator('query', rangeSchema.extend({ bucket: salesBucketSchema })), async (c) => {
  const { bucket, ...q } = c.req.valid('query')
  return c.json({ success: true, data: await timeseries(q, bucket) })
})

salesRoutes.get('/breakdown', zValidator('query', rangeSchema.extend({ by: salesDimensionSchema })), async (c) => {
  const { by, ...q } = c.req.valid('query')
  return c.json({ success: true, data: await breakdown(q, by) })
})

salesRoutes.get('/payments', zValidator('query', rangeSchema.merge(paymentsQuerySchema)), async (c) => {
  const { from, to, ...o } = c.req.valid('query')
  return c.json({ success: true, data: await payments({ from, to }, o) })
})

salesRoutes.get('/top-customers', zValidator('query', rangeSchema.extend({ limit: z.coerce.number().int().min(1).max(50).default(10) })), async (c) => {
  const { limit, ...q } = c.req.valid('query')
  return c.json({ success: true, data: await topCustomers(q, limit) })
})
