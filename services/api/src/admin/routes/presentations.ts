import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { rangeSchema } from '../range.ts'
import { composition, limitSchema, pageSchema, recent, seriesSchema, summary, templates, timeseries, topUsers } from '../presentations.ts'
import type { AppEnv } from '../../middleware/session.ts'

/** Owner section: presentations. Mounted by routes/admin.ts under /api/v1/admin/presentations; auth + role + audit + rate limit are applied there. */
export const presentationsRoutes = new Hono<AppEnv>()
  .get('/summary', zValidator('query', rangeSchema), async (c) => c.json({ success: true, data: await summary(c.req.valid('query')) }))
  .get('/timeseries', zValidator('query', seriesSchema), async (c) => c.json({ success: true, data: await timeseries(c.req.valid('query')) }))
  .get('/composition', zValidator('query', rangeSchema), async (c) => c.json({ success: true, data: await composition(c.req.valid('query')) }))
  .get('/templates', zValidator('query', rangeSchema.merge(limitSchema)), async (c) => {
    const { limit, ...q } = c.req.valid('query')
    return c.json({ success: true, data: await templates(q, limit) })
  })
  .get('/top-users', zValidator('query', rangeSchema.merge(limitSchema)), async (c) => {
    const { limit, ...q } = c.req.valid('query')
    return c.json({ success: true, data: await topUsers(q, limit) })
  })
  .get('/recent', zValidator('query', rangeSchema.merge(pageSchema)), async (c) => c.json({ success: true, data: await recent(c.req.valid('query')) }))
