import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { json, signUp } from '../test-utils.ts'

const origin = process.env['WEB_URL'] ?? 'http://localhost:3000'
const call = (cookie: string, expectedUser?: string) =>
  app.request('/api/v1/me/entitlements', { headers: { Cookie: cookie, Origin: origin, ...(expectedUser ? { 'X-Session-User': expectedUser } : {}) } })

describe('a tab whose account changed in another tab', () => {
  it('is refused with SESSION_CHANGED instead of silently acting as the new account', async () => {
    const a = await signUp('sw'), b = await signUp('sw')
    expect((await call(b.cookie)).status).toBe(200) // old clients / no header: unchanged behaviour
    expect((await call(b.cookie, b.id)).status).toBe(200) // header matches the session
    const res = await call(b.cookie, a.id) // the tab thinks it is A, the shared cookie is now B's
    expect(res.status).toBe(409)
    expect((await json(res)).error.code).toBe('SESSION_CHANGED')
    expect((await call('', a.id)).status).toBe(401) // signed out: still a plain 401
  })

  it('the browser may send the header (CORS allows X-Session-User)', async () => {
    const res = await app.request('/api/v1/me/entitlements', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-session-user' } })
    expect((res.headers.get('access-control-allow-headers') ?? '').toLowerCase()).toContain('x-session-user')
  })
})
