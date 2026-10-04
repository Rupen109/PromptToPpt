import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { nanoid } from 'nanoid'
import { ipOf } from '../lib/audit.ts'
import { z } from 'zod'
import { bucketSchema, breakdown, dimensionSchema, filtersSchema, summary, timeseries } from '../admin/usage.ts'
import { salesRoutes } from '../admin/routes/sales.ts'
import { subscriptionsRoutes } from '../admin/routes/subscriptions.ts'
import { imagesRoutes } from '../admin/routes/images.ts'
import { marginRoutes } from '../admin/routes/margin.ts'
import { presentationsRoutes } from '../admin/routes/presentations.ts'
import { exportsRoutes } from '../admin/routes/exports.ts'
import { promptsRoutes } from '../admin/routes/prompts.ts'
import { performanceRoutes } from '../admin/routes/performance.ts'
import { providersRoutes } from '../admin/routes/providers.ts'
import { auditRoutes } from '../admin/routes/audit.ts'
import { flagsRoutes } from '../admin/routes/flags.ts'
import { env } from '../env.ts'
import { cloudRoutes } from '../admin/routes/billing-sync.ts'
import { db } from '../db/index.ts'
import { auditLog } from '../db/schema.ts'
import { rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'

export const admin = new Hono<AppEnv>()

/** Authorisation is the DB `role` column on the session user — never anything the client sends. */
admin.use('*', requireAuth, async (c, next) => {
  const user = c.get('session')!.user as { id: string; role?: string }
  if (user.role !== 'admin') return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403)
  await next()
  // Audit: who looked at what (spec §18). Failures to audit must not break the response.
  const { pathname, search } = new URL(c.req.url)
  db.insert(auditLog).values({ id: nanoid(), actorUserId: user.id, action: `admin.${pathname.split('/admin/')[1] ?? ''}`, meta: { query: search }, ip: ipOf(c.req.raw.headers) }).catch((e) => console.error('[audit]', e))
})
// dashboards fire several requests per page; per-owner (not per-IP) so one busy view can't lock the owner out
admin.use('*', rateLimit({ windowMs: 60_000, max: 600, key: (c) => `admin:${(c.get('session') as { user: { id: string } }).user.id}` }))

admin.get('/usage/summary', zValidator('query', filtersSchema), async (c) => c.json({ success: true, data: await summary(c.req.valid('query')) }))

admin.get('/usage/timeseries', zValidator('query', filtersSchema.extend({ bucket: bucketSchema })), async (c) => {
  const { bucket, ...f } = c.req.valid('query')
  return c.json({ success: true, data: await timeseries(f, bucket) })
})

admin.get('/usage/breakdown', zValidator('query', filtersSchema.extend({ by: dimensionSchema, limit: z.coerce.number().int().min(1).max(100).default(20) })), async (c) => {
  const { by, limit, ...f } = c.req.valid('query')
  return c.json({ success: true, data: await breakdown(f, by, limit) })
})

admin.route('/sales', salesRoutes)
admin.route('/subscriptions', subscriptionsRoutes)
admin.route('/images', imagesRoutes)
admin.route('/margin', marginRoutes)
admin.route('/presentations', presentationsRoutes)
admin.route('/exports', exportsRoutes)
admin.route('/prompts', promptsRoutes)
admin.route('/performance', performanceRoutes)
admin.route('/providers', providersRoutes)
admin.route('/audit', auditRoutes)
admin.route('/flags', flagsRoutes)
admin.route('/cloud', cloudRoutes)

/** Display settings for the owner UI: provider costs are stored in USD; the dashboard shows INR by default using this rate. */
admin.get('/config', (c) => c.json({ success: true, data: { inrPerUsd: env.INR_PER_USD, defaultCurrency: 'INR' } }))
