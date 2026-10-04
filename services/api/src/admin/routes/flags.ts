import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { flagBody, listFlags, resetFlag, setFlag } from '../flags.ts'
import { isFlagKey } from '../../flags/registry.ts'
import { audit, ipOf } from '../../lib/audit.ts'
import type { AppEnv } from '../../middleware/session.ts'

/** Owner section: flags. Mounted by routes/admin.ts under /api/v1/admin/flags; auth + role + audit + rate limit are applied there. */
export const flagsRoutes = new Hono<AppEnv>()

const notFound = (c: any) => c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Unknown flag' } }, 404)

flagsRoutes.get('/', async (c) => c.json({ success: true, data: await listFlags() }))

flagsRoutes.put('/:key', zValidator('json', flagBody), async (c) => {
  const key = c.req.param('key')
  if (!isFlagKey(key)) return notFound(c)
  const actor = c.get('session')!.user.id
  const { before, after } = await setFlag(key, c.req.valid('json'), actor)
  await audit(actor, 'flag.update', { key, before, after }, ipOf(c.req.raw.headers))
  return c.json({ success: true, data: (await listFlags()).find((f) => f.key === key) })
})

flagsRoutes.delete('/:key', async (c) => {
  const key = c.req.param('key')
  if (!isFlagKey(key)) return notFound(c)
  const actor = c.get('session')!.user.id
  const { before, after } = await resetFlag(key)
  await audit(actor, 'flag.reset', { key, before, after }, ipOf(c.req.raw.headers))
  return c.json({ success: true, data: (await listFlags()).find((f) => f.key === key) })
})
