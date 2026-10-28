import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { resolveAccess } from '../collab/access.ts'
import { db } from '../db/index.ts'
import { presentation } from '../db/schema.ts'
import { byUser, rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'
import { bus } from './bus.ts'
import { colorFor, deckListeners, listen, peersOf, startHub, totalListeners } from './hub.ts'

const CLIENT_ID = /^[A-Za-z0-9_-]{8,40}$/
const MAX_PER_USER_DECK = 3 // tabs
const MAX_PER_DECK = 25
const MAX_PER_PROCESS = 2000
const HEARTBEAT_MS = 20_000
const RECHECK_MS = 60_000
const perUser = new Map<string, number>()

export const live = new Hono<AppEnv>()
live.use('*', requireAuth)

const notFound = (c: any) => c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, 404)

/**
 * Server-Sent Events for ONE deck: revisions saved by others, who is here and where. Access is checked when the stream opens, again every minute
 * (a removed collaborator, or an owner whose plan lapsed, is disconnected), and immediately on a `kick` event.
 */
live.get('/:id/live', async (c) => {
  startHub()
  const id = c.req.param('id')
  const actor = c.get('session')!.user as { id: string; name: string }
  const clientId = c.req.query('client') ?? ''
  if (!CLIENT_ID.test(clientId)) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'client id required' } }, 400)
  const access = await resolveAccess(id, actor.id).catch(() => null)
  if (!access) return notFound(c)
  const ukey = `${id}:${actor.id}`
  if ((perUser.get(ukey) ?? 0) >= MAX_PER_USER_DECK || deckListeners(id) >= MAX_PER_DECK || totalListeners() >= MAX_PER_PROCESS) {
    return c.json({ success: false, error: { code: 'TOO_MANY_STREAMS', message: 'Too many live connections for this presentation.' } }, 429)
  }
  const [row] = await db.select({ revision: presentation.revision }).from(presentation).where(eq(presentation.id, id))
  perUser.set(ukey, (perUser.get(ukey) ?? 0) + 1)
  c.header('X-Accel-Buffering', 'no')
  c.header('Cache-Control', 'no-store')

  return streamSSE(c, async (stream) => {
    let open = true
    const send = (event: string, data: unknown) => { if (open) void stream.writeSSE({ event, data: JSON.stringify(data) }).catch(() => { open = false }) }
    const off = listen(id, (e) => {
      if (e.t === 'kick') {
        if (e.userId === actor.id && open) { // tell the browser WHY before hanging up, or it would just reconnect
          open = false
          void stream.writeSSE({ event: 'kick', data: JSON.stringify(e) }).catch(() => {}).then(() => stream.close())
        }
        return
      }
      if (e.t === 'presence' && e.peer.userId === actor.id && e.peer.clientId === clientId) return
      if (e.t === 'leave' && e.clientId === clientId) return
      send(e.t, e)
    })
    stream.onAbort(() => {
      open = false
      off()
      perUser.set(ukey, Math.max(0, (perUser.get(ukey) ?? 1) - 1))
      void bus().publish({ t: 'leave', deck: id, clientId }).catch(() => {})
    })
    send('hello', { you: { clientId, userId: actor.id, name: actor.name, color: colorFor(actor.id) }, role: access.role, revision: row?.revision ?? 0, peers: peersOf(id).filter((p) => !(p.userId === actor.id && p.clientId === clientId)) })
    let since = Date.now()
    while (open && !stream.aborted) {
      await stream.sleep(HEARTBEAT_MS)
      if (!open || stream.aborted) break
      send('ping', { t: Date.now() })
      if (Date.now() - since >= RECHECK_MS) {
        since = Date.now()
        const still = await resolveAccess(id, actor.id).catch(() => null)
        if (!still) { await stream.writeSSE({ event: 'kick', data: JSON.stringify({ t: 'kick', deck: id, userId: actor.id }) }).catch(() => {}); open = false; await stream.close() }
      }
    }
  })
})

const presenceBody = z.object({
  clientId: z.string().regex(CLIENT_ID),
  slideId: z.string().max(64).nullable(),
  selection: z.array(z.string().max(64)).max(50),
  editing: z.string().max(64).nullable(),
  cursor: z.object({ x: z.number().min(-5000).max(10000), y: z.number().min(-5000).max(10000) }).nullable(),
})

/** Who I am and where I'm working on the deck. The server stamps identity (name, colour) itself — a client can never speak as someone else. */
live.post('/:id/live/presence', rateLimit({ windowMs: 1000, max: 25, key: byUser('presence') }), zValidator('json', presenceBody), async (c) => {
  startHub()
  const id = c.req.param('id')
  const actor = c.get('session')!.user as { id: string; name: string }
  const access = await resolveAccess(id, actor.id).catch(() => null)
  if (!access) return notFound(c)
  const b = c.req.valid('json')
  await bus().publish({ t: 'presence', deck: id, peer: { clientId: b.clientId, userId: actor.id, name: actor.name.slice(0, 40), color: colorFor(actor.id), slideId: b.slideId, selection: b.selection, editing: b.editing, cursor: b.cursor, at: Date.now() } })
  return c.json({ success: true, data: { ok: true } })
})
