import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { rangeSchema } from '../range.ts'
import { breakdown, errors, exportsBreakdownSchema, exportsRecentSchema, exportsSeriesSchema, limitSchema, recent, slides, summary, timeseries, topUsers } from '../exports.ts'
import type { AppEnv } from '../../middleware/session.ts'

/** Owner section: exports. Mounted by routes/admin.ts under /api/v1/admin/exports; auth + role + audit + rate limit are applied there. */
export const exportsRoutes = new Hono<AppEnv>()
  .get('/summary', zValidator('query', rangeSchema), async (c) => c.json({ success: true, data: await summary(c.req.valid('query')) }))
  .get('/timeseries', zValidator('query', exportsSeriesSchema), async (c) => c.json({ success: true, data: await timeseries(c.req.valid('query')) }))
  .get('/breakdown', zValidator('query', exportsBreakdownSchema), async (c) => c.json({ success: true, data: await breakdown(c.req.valid('query')) }))
  .get('/errors', zValidator('query', rangeSchema.merge(limitSchema)), async (c) => {
    const { limit, ...q } = c.req.valid('query')
    return c.json({ success: true, data: await errors(q, limit) })
  })
  .get('/slides', zValidator('query', rangeSchema), async (c) => c.json({ success: true, data: await slides(c.req.valid('query')) }))
  .get('/top-users', zValidator('query', rangeSchema.merge(limitSchema)), async (c) => {
    const { limit, ...q } = c.req.valid('query')
    return c.json({ success: true, data: await topUsers(q, limit) })
  })
  .get('/recent', zValidator('query', exportsRecentSchema), async (c) => c.json({ success: true, data: await recent(c.req.valid('query')) }))
