import { timingSafeEqual } from 'node:crypto'
import { env } from '../env.ts'

/** True when the request provably came through our own edge: it carries the secret the CDN adds to every request it forwards (X-Origin-Verify). */
function fromOurEdge(headers: Headers): boolean {
  if (!env.EDGE_SHARED_SECRET) return env.APP_ENV === 'development' // no secret configured: only local development trusts these headers
  const got = Buffer.from(headers.get('x-origin-verify') ?? '')
  const want = Buffer.from(env.EDGE_SHARED_SECRET)
  return got.length === want.length && timingSafeEqual(got, want)
}

/**
 * Country from a header our own edge sets (CloudFront-Viewer-Country / Cloudflare), never from client-supplied data.
 * In development only, `x-debug-country` lets us exercise India pricing and country analytics locally.
 * Used for DISPLAY and ANALYTICS; payment authorisation must re-derive it server-side.
 */
export function countryFromHeaders(headers: Headers): string | null {
  if (!fromOurEdge(headers)) return null // a client talking to the origin directly can write any header it likes: the country (and so the cheaper India price) cannot be chosen that way
  const raw = headers.get('cloudfront-viewer-country') ?? headers.get('cf-ipcountry') ?? (env.APP_ENV === 'development' ? headers.get('x-debug-country') : null)
  const c = raw?.trim().toUpperCase()
  return c && /^[A-Z]{2}$/.test(c) && c !== 'XX' && c !== 'T1' ? c : null
}
