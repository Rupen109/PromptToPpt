import type { MiddlewareHandler } from 'hono'
import { auth, type Session } from '../auth.ts'

export type AppEnv = { Variables: { session: Session | null } }

/** Resolves the session from the cookie on every request (null when anonymous). */
export const loadSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('session', await auth.api.getSession({ headers: c.req.raw.headers }))
  await next()
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('session')) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Sign in required' } }, 401)
  }
  // The editor names the account its tab believes is signed in. The cookie is shared by every tab, so if another tab switched
  // accounts this request would silently run as someone else: refuse it and let the tab tell the user.
  const expected = c.req.header('x-session-user')
  if (expected && expected !== c.get('session')!.user.id) {
    return c.json({ success: false, error: { code: 'SESSION_CHANGED', message: 'You signed in as a different account in another tab. Reload this tab to continue.' } }, 409)
  }
  await next()
}
