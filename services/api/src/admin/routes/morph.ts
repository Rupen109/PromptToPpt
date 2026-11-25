import { Hono } from 'hono'
import { zValidator } from '../../lib/validate.ts'
import { rangeSchema } from '../range.ts'
import { summary, templates, unmatched, unmatchedQuery } from '../morph.ts'
import type { AppEnv } from '../../middleware/session.ts'

/** Owner section: Morph matches. Mounted by routes/admin.ts under /api/v1/admin/morph; auth + role + audit + rate limit are applied there. */
export const morphRoutes = new Hono<AppEnv>()
  .get('/summary', zValidator('query', rangeSchema), async (c) => c.json({ success: true, data: await summary(c.req.valid('query')) }))
  .get('/templates', zValidator('query', rangeSchema), async (c) => c.json({ success: true, data: await templates(c.req.valid('query')) }))
  .get('/unmatched', zValidator('query', unmatchedQuery), async (c) => c.json({ success: true, data: await unmatched(c.req.valid('query')) }))
