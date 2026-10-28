import { EventEmitter } from 'node:events'
import pg from 'pg'
import { pool } from '../db/index.ts'
import { env } from '../env.ts'

/**
 * Live-editing event bus. Events are tiny JSON messages about ONE deck:
 *   rev      a new revision of the deck was saved (clients fetch it and merge)
 *   presence who is where: current slide, selection, text being edited, pointer
 *   leave    a browser tab closed its stream
 *   comments someone added, changed or resolved a comment (clients re-read the comments)
 *   kick     a person's access to the deck ended (removed / left / plan lapsed): their streams close
 * `memory` = one API process. `pg` = Postgres LISTEN/NOTIFY, so every API task sees every event (needed as soon as there is more than one task).
 */
export interface Peer {
  clientId: string
  userId: string
  name: string
  color: string
  slideId: string | null
  selection: string[]
  editing: string | null
  cursor: { x: number; y: number } | null
  at: number
}
export type LiveEvent =
  | { t: 'rev'; deck: string; rev: number; by: string }
  | { t: 'presence'; deck: string; peer: Peer }
  | { t: 'leave'; deck: string; clientId: string }
  | { t: 'kick'; deck: string; userId: string }
  | { t: 'comments'; deck: string; by: string }

export interface Bus {
  publish(e: LiveEvent): Promise<void>
  subscribe(fn: (e: LiveEvent) => void): () => void
  close(): Promise<void>
}

class MemoryBus implements Bus {
  private em = new EventEmitter().setMaxListeners(0)
  async publish(e: LiveEvent) { queueMicrotask(() => this.em.emit('e', e)) }
  subscribe(fn: (e: LiveEvent) => void) { this.em.on('e', fn); return () => void this.em.off('e', fn) }
  async close() { this.em.removeAllListeners() }
}

const CHANNEL = 'deck_live'
const MAX_PAYLOAD = 7000 // Postgres NOTIFY limit is 8000 bytes

export class PgBus implements Bus {
  private em = new EventEmitter().setMaxListeners(0)
  private client: pg.PoolClient | null = null
  private closed = false
  private retry: ReturnType<typeof setTimeout> | null = null
  constructor(private readonly db: pg.Pool = pool) { void this.listen() }

  private async listen(): Promise<void> {
    if (this.closed) return
    try {
      const c = await this.db.connect()
      if (this.closed) return c.release()
      this.client = c
      c.on('notification', (m) => { if (m.channel === CHANNEL && m.payload) { try { this.em.emit('e', JSON.parse(m.payload) as LiveEvent) } catch { /* ignore a malformed message */ } } })
      c.on('error', () => this.lost(c))
      c.on('end', () => this.lost(c))
      await c.query(`LISTEN ${CHANNEL}`)
    } catch {
      this.schedule()
    }
  }
  private lost(c: pg.PoolClient) {
    if (this.client !== c) return
    this.client = null
    try { c.release(true) } catch { /* already gone */ }
    this.schedule()
  }
  private schedule() { if (!this.closed && !this.retry) this.retry = setTimeout(() => { this.retry = null; void this.listen() }, 2000) }

  async publish(e: LiveEvent) {
    let payload = JSON.stringify(e)
    if (payload.length > MAX_PAYLOAD && e.t === 'presence') payload = JSON.stringify({ ...e, peer: { ...e.peer, selection: e.peer.selection.slice(0, 5) } })
    if (payload.length > MAX_PAYLOAD) return
    await this.db.query('select pg_notify($1, $2)', [CHANNEL, payload])
  }
  subscribe(fn: (e: LiveEvent) => void) { this.em.on('e', fn); return () => void this.em.off('e', fn) }
  async close() {
    this.closed = true
    if (this.retry) clearTimeout(this.retry)
    this.em.removeAllListeners()
    const c = this.client
    this.client = null
    if (c) { try { await c.query(`UNLISTEN ${CHANNEL}`) } catch { /* ignore */ } c.release() }
  }
}

export const createBus = (kind: 'memory' | 'pg'): Bus => (kind === 'pg' ? new PgBus() : new MemoryBus())
let singleton: Bus | null = null
export const bus = (): Bus => (singleton ??= createBus(env.LIVE_BUS))
export const publishRevision = (deck: string, rev: number, by: string) => void bus().publish({ t: 'rev', deck, rev, by }).catch((e) => console.error('[live]', e))
export const publishComments = (deck: string, by: string) => void bus().publish({ t: 'comments', deck, by }).catch((e) => console.error('[live]', e))
export const kickUser = (deck: string, userId: string) => void bus().publish({ t: 'kick', deck, userId }).catch((e) => console.error('[live]', e))
