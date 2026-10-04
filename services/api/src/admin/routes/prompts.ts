import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import type { AppEnv } from '../../middleware/session.ts'
import { keywords, overview, promptsQuery, recent, recentQuery, useCases } from '../prompts.ts'

/** Owner section: prompts. Mounted by routes/admin.ts under /api/v1/admin/prompts; auth + role + audit + rate limit are applied there. */
export const promptsRoutes = new Hono<AppEnv>()

promptsRoutes.get('/overview', zValidator('query', promptsQuery), async (c) => c.json({ success: true, data: await overview(c.req.valid('query')) }))
promptsRoutes.get('/use-cases', zValidator('query', promptsQuery), async (c) => c.json({ success: true, data: await useCases(c.req.valid('query')) }))
promptsRoutes.get('/keywords', zValidator('query', promptsQuery), async (c) => c.json({ success: true, data: await keywords(c.req.valid('query')) }))
promptsRoutes.get('/recent', zValidator('query', recentQuery), async (c) => c.json({ success: true, data: await recent(c.req.valid('query')) }))
