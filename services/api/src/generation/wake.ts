import { EventEmitter } from 'node:events'
import type pg from 'pg'
import { pool } from '../db/index.ts'

/**
 * "A job is waiting" nudge, so an idle worker starts it within milliseconds instead of at its next poll. Postgres LISTEN/NOTIFY reaches every worker
 * process (the API creates the job, a worker elsewhere takes it). It only ever wakes workers up: if a nudge is lost the worker's slow poll finds the
 * job anyway, so nothing depends on it.
 */
const CHANNEL = 'generation_job'
const local = new EventEmitter().setMaxListeners(0)

/** Called by whoever makes a job runnable (creation, retry). */
export async function notifyJob(): Promise<void> {
  local.emit('wake') // this process (tests, API + worker in one)
  try { await pool.query('select pg_notify($1, $2)', [CHANNEL, '1']) } catch { /* the poll still finds it */ }
}

/** Listens for nudges; returns a function that stops. Reconnects by itself. */
export function onJobWaiting(fn: () => void): () => void {
  let client: pg.PoolClient | null = null
  let closed = false
  let retry: ReturnType<typeof setTimeout> | null = null
  local.on('wake', fn)
  const schedule = () => { if (!closed && !retry) retry = setTimeout(() => { retry = null; void listen() }, 2000) }
  const lost = (c: pg.PoolClient) => { if (client !== c) return; client = null; try { c.release(true) } catch { /* already gone */ } schedule() }
  async function listen() {
    if (closed) return
    try {
      const c = await pool.connect()
      if (closed) return c.release()
      client = c
      c.on('notification', (m) => { if (m.channel === CHANNEL) fn() })
      c.on('error', () => lost(c)); c.on('end', () => lost(c))
      await c.query(`LISTEN ${CHANNEL}`)
    } catch { schedule() }
  }
  void listen()
  return () => {
    closed = true
    local.off('wake', fn)
    if (retry) clearTimeout(retry)
    const c = client; client = null
    if (c) void c.query(`UNLISTEN ${CHANNEL}`).catch(() => {}).finally(() => c.release())
  }
}
