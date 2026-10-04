import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import type { AppEnv } from '../../middleware/session.ts'
import { providers, providersQuery } from '../providers.ts'

/** Owner section: providers. Mounted by routes/admin.ts under /api/v1/admin/providers; auth + role + audit + rate limit are applied there. */
export const providersRoutes = new Hono<AppEnv>()

providersRoutes.get('/overview', zValidator('query', providersQuery), async (c) => c.json({ success: true, data: await providers(c.req.valid('query')) }))
