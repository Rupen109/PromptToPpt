import { Hono } from 'hono'
import { effectiveFlags } from '../flags/flags.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'

/** What is switched on FOR THIS USER — booleans only, never rollout/plan rules or notes. The server still enforces every flag itself. */
export const flagsPublic = new Hono<AppEnv>()
flagsPublic.get('/', requireAuth, async (c) => {
  c.header('Cache-Control', 'no-store')
  return c.json({ success: true, data: await effectiveFlags({ userId: c.get('session')!.user.id }) })
})
