import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { audit } from '../../lib/audit.ts'
import type { AppEnv } from '../../middleware/session.ts'
import { billedBetween, gcpConfigured, SETUP_STEPS } from '../gcp.ts'
import { rangeOf, rangeSchema } from '../range.ts'
import { addCheckin, reconcile, removeCheckin } from '../reconcile.ts'

/** Owner section: Google Cloud reconciliation. Mounted under /api/v1/admin/cloud. */
export const cloudRoutes = new Hono<AppEnv>()

const uid = (c: { get: (k: 'session') => unknown }) => (c.get('session') as { user: { id: string } }).user.id

cloudRoutes.get('/', async (c) => c.json({ success: true, data: { ...(await reconcile()), connector: { configured: gcpConfigured(), setup: gcpConfigured() ? [] : SETUP_STEPS } } }))

cloudRoutes.post('/checkins', zValidator('json', z.object({
  amount: z.number().min(0).max(1e9),
  kind: z.enum(['credit_remaining', 'cumulative_spend']).default('credit_remaining'),
  readAt: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 5 * 60_000, 'Time cannot be in the future').optional(), // checked per request (a fixed `max` would freeze at server start)
  note: z.string().trim().max(200).optional(),
})), async (c) => {
  const b = c.req.valid('json')
  const id = await addCheckin(uid(c), b)
  audit(uid(c), 'cloud.checkin_added', { id, amount: b.amount, kind: b.kind })
  return c.json({ success: true, data: { id } })
})

cloudRoutes.delete('/checkins/:id', async (c) => {
  const ok = await removeCheckin(c.req.param('id'))
  if (!ok) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Reading not found' } }, 404)
  audit(uid(c), 'cloud.checkin_removed', { id: c.req.param('id') })
  return c.json({ success: true, data: { removed: true } })
})

/** What Google billed (BigQuery billing export). 200 with `configured:false` when the connector is not set up. */
cloudRoutes.get('/billed', zValidator('query', rangeSchema), async (c) => {
  if (!gcpConfigured()) return c.json({ success: true, data: { configured: false, setup: SETUP_STEPS, rows: [] } })
  const { from, to } = rangeOf(c.req.valid('query'))
  try { return c.json({ success: true, data: { configured: true, rows: await billedBetween(from, to) } }) }
  catch (e) { return c.json({ success: false, error: { code: 'GCP_BILLING_ERROR', message: `Google billing export could not be read: ${(e as Error).message}` } }, 502) }
})
