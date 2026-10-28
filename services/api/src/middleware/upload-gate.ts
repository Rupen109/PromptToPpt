import type { MiddlewareHandler } from 'hono'
import { env } from '../env.ts'

/**
 * Admission control for file uploads. A request body is held in memory while it is read and then read again by a worker, so uploads are admitted by the
 * memory they will hold — their declared size (a missing size counts as the largest allowed) — against SOURCE_UPLOAD_BUDGET_MB, plus a cap on the number of
 * uploads. Small files flow through freely; a burst of big ones gets "busy, try again" at once, BEFORE its body is read, instead of piling memory up.
 * A reservation is released when the request ends or after 60 s, so a client that declares a big file and then crawls cannot hold the budget for long.
 */
const MAX_REQUEST_BYTES = 16 * 1024 * 1024
const HOLD_LIMIT_MS = 60_000
let count = 0, reserved = 0
export const uploadStats = { rejected: 0 }
export const busyAnswer = (c: Parameters<MiddlewareHandler>[0]) => {
  c.header('Retry-After', '5')
  return c.json({ success: false, error: { code: 'BUSY', message: 'Lots of files are being read right now. Please try again in a few seconds.' } }, 503)
}
export const uploadGate: MiddlewareHandler = async (c, next) => {
  const declared = Number(c.req.header('content-length') ?? 0)
  const need = Math.min(declared > 0 ? declared : MAX_REQUEST_BYTES, MAX_REQUEST_BYTES)
  if (count >= env.SOURCE_UPLOAD_INFLIGHT || reserved + need > env.SOURCE_UPLOAD_BUDGET_MB * 1024 * 1024) { uploadStats.rejected++; return busyAnswer(c) }
  count++; reserved += need
  let released = false
  const release = () => { if (released) return; released = true; count--; reserved -= need }
  const timer = setTimeout(release, HOLD_LIMIT_MS); timer.unref()
  try { await next() } finally { clearTimeout(timer); release() }
}
export const uploadsInFlight = () => ({ count, reservedMB: Math.round(reserved / 1048576) })
