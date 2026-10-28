import type { Context, MiddlewareHandler } from 'hono'
import { env } from '../env.ts'
import { getConnInfo } from '@hono/node-server/conninfo'

/**
 * Client IP. X-Forwarded-For is client-controlled for every hop except the ones our own
 * infrastructure appended, so only trust the entry TRUSTED_PROXY_HOPS from the right
 * (0 = no proxy → use the socket address; ALB only = 1; CloudFront + ALB = 2).
 */
export function clientIp(c: Context): string {
  if (env.TRUSTED_PROXY_HOPS > 0) {
    const parts = (c.req.header('x-forwarded-for') ?? '').split(',').map((p) => p.trim()).filter(Boolean)
    const ip = parts[parts.length - env.TRUSTED_PROXY_HOPS]
    if (ip) return ip
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown' // not running under the Node server (e.g. unit tests)
  }
}

interface Options {
  windowMs: number
  max: number
  /** bucket key; defaults to the client IP. Use the user id for authenticated, costly actions (one noisy IP can't starve others). */
  key?: (c: Context) => string
  /** what the person sees when they hit the limit (default: a generic line) */
  message?: string
}

/**
 * Fixed-window in-memory limiter keyed by client IP.
 * Per-instance only — fine for a single API task; swap the store for a shared one
 * (Redis/DynamoDB/WAF) before running multiple instances. Tracked in docs/adr.
 */
export function rateLimit({ windowMs, max, key, message }: Options): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>()
  setInterval(() => {
    const now = Date.now()
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k)
  }, windowMs).unref()

  return async (c, next) => {
    const ip = key ? key(c) : clientIp(c)
    const now = Date.now()
    const entry = hits.get(ip)
    if (!entry || entry.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + windowMs })
    } else if (++entry.count > max) {
      c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
      return c.json({ success: false, error: { code: 'RATE_LIMITED', message: message ?? 'Too many requests' } }, 429)
    }
    await next()
  }
}

/** Bucket key for authenticated, costly routes: one noisy account can't starve others, and rotating IPs doesn't buy a fresh quota. */
export const byUser = (name: string) => (c: Context) => `${name}:${(c.get('session') as { user: { id: string } } | null)?.user.id ?? clientIp(c)}`
