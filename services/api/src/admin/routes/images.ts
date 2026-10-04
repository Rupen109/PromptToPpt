import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { rangeSchema } from '../range.ts'
import { breakdown, imageBreakdownSchema, imagesQuery, limitSchema, pageSchema, perDeck, quota, quotaSchema, recent, summary, timeseries, topUsers } from '../images.ts'
import type { AppEnv } from '../../middleware/session.ts'

/** Owner section: images. Mounted by routes/admin.ts under /api/v1/admin/images; auth + role + audit + rate limit are applied there. */
export const imagesRoutes = new Hono<AppEnv>()
  .get('/summary', zValidator('query', rangeSchema), async (c) => c.json({ success: true, data: await summary(c.req.valid('query')) }))
  .get('/timeseries', zValidator('query', imagesQuery), async (c) => c.json({ success: true, data: await timeseries(c.req.valid('query')) }))
  .get('/breakdown', zValidator('query', imageBreakdownSchema), async (c) => c.json({ success: true, data: await breakdown(c.req.valid('query')) }))
  .get('/per-deck', zValidator('query', rangeSchema), async (c) => c.json({ success: true, data: await perDeck(c.req.valid('query')) }))
  .get('/top-users', zValidator('query', rangeSchema.merge(limitSchema)), async (c) => {
    const { limit, ...q } = c.req.valid('query')
    return c.json({ success: true, data: await topUsers(q, limit) })
  })
  .get('/quota', zValidator('query', quotaSchema), async (c) => c.json({ success: true, data: await quota(c.req.valid('query')) }))
  .get('/recent', zValidator('query', rangeSchema.merge(pageSchema)), async (c) => c.json({ success: true, data: await recent(c.req.valid('query')) }))
