import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { auditCsv, auditFilters, auditListQuery, listAudit } from '../audit.ts'
import type { AppEnv } from '../../middleware/session.ts'

/** Owner section: audit. Mounted by routes/admin.ts under /api/v1/admin/audit; auth + role + audit + rate limit are applied there. */
export const auditRoutes = new Hono<AppEnv>()

auditRoutes.get('/', zValidator('query', auditListQuery), async (c) => c.json({ success: true, data: await listAudit(c.req.valid('query')) }))

auditRoutes.get('/export.csv', zValidator('query', auditFilters), async (c) =>
  c.body(await auditCsv(c.req.valid('query')), 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
    'Cache-Control': 'no-store',
  }),
)
