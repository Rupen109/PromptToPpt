import type { MiddlewareHandler } from 'hono'
import { env } from '../env.ts'

/**
 * CSRF defence in depth for cookie-authenticated, state-changing requests. SameSite cookies and CORS already do most of the work; this
 * additionally refuses any unsafe-method request whose browser-supplied Origin is not one of our own apps (or that the browser itself
 * labels cross-site). Requests without either header (server-to-server, curl, the payment webhook) are not browser CSRF and pass.
 */
const ALLOWED = new Set([new URL(env.WEB_URL).origin, new URL(env.EDITOR_URL).origin])
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

export const originCheck: MiddlewareHandler = async (c, next) => {
  if (SAFE.has(c.req.method)) return next()
  const origin = c.req.header('origin')
  const refuse = () => c.json({ success: false, error: { code: 'FORBIDDEN_ORIGIN', message: 'Cross-site request refused' } }, 403)
  // Our websites and this API are always same-site (sub-domains of one domain), so a browser that labels the request "cross-site" is being used by ANOTHER site: refused whatever Origin says
  if (c.req.header('sec-fetch-site') === 'cross-site') return refuse()
  if (origin && !ALLOWED.has(origin)) return refuse()
  return next()
}
