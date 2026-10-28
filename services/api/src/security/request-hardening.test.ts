import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'

const headers = { 'Content-Type': 'application/json', Origin: process.env['WEB_URL'] ?? 'http://localhost:3000' }
const post = (path: string, body: string) => app.request(path, { method: 'POST', headers, body })

describe('request hardening', () => {
  it('answers unreadable JSON with a 400, not a 500', async () => {
    for (const path of ['/api/v1/drafts', '/api/v1/presentations', '/api/auth/sign-in/email']) {
      const r = await post(path, '{"title":"ab')
      expect(r.status, path).toBeLessThan(500)
      expect(r.status, path).toBeGreaterThanOrEqual(400)
    }
    const r = await post('/api/v1/drafts', '{bad')
    expect(r.status).toBe(400)
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('INVALID_REQUEST')
  })

  it('refuses NUL characters (raw or as an escape) before they reach the database', async () => {
    for (const body of [`{"email":"a@example.com","password":"x\u0000y","name":"n"}`, `{"email":"a@example.com","password":"x\\u0000y","name":"n"}`]) {
      expect((await post('/api/auth/sign-in/email', body)).status).toBe(400)
      expect((await post('/api/auth/sign-up/email', body)).status).toBe(400)
      expect((await post('/api/v1/drafts', `{"prompt":"hello\\u0000world"}`)).status).toBe(400)
    }
  })

  it('refuses state-changing requests a browser labels cross-site, even when Origin claims to be ours', async () => {
    for (const path of ['/api/v1/drafts', '/api/auth/sign-in/email', '/api/auth/sign-out']) {
      const r = await app.request(path, { method: 'POST', headers: { ...headers, 'Sec-Fetch-Site': 'cross-site' }, body: '{}' })
      expect(r.status, path).toBe(403)
    }
    expect((await app.request('/api/v1/drafts', { method: 'POST', headers: { ...headers, 'Sec-Fetch-Site': 'same-site' }, body: JSON.stringify({ prompt: 'a normal prompt about cats' }) })).status).toBeLessThan(300)
  })

  it('the session token never appears in an auth answer (it stays in the HttpOnly cookie) and auth answers are not cached', async () => {
    const email = `tok-${Math.random().toString(36).slice(2, 10)}@example.com`
    const up = await app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({ email, password: 'a-long-password-1', name: 'T' }) })
    expect(up.status).toBe(200)
    const cookie = up.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
    const raw = decodeURIComponent(cookie.split('=')[1] ?? '').split('.')[0]!
    expect(raw.length).toBeGreaterThan(10)
    expect(await up.text()).not.toContain(raw)
    const sess = await app.request('/api/auth/get-session', { headers: { Cookie: cookie } })
    const text = await sess.text()
    expect(text).not.toContain(raw)
    expect(JSON.parse(text).user.email).toBe(email) // the screen still gets what it needs
    expect(sess.headers.get('cache-control')).toBe('no-store')
    const list = await app.request('/api/auth/list-sessions', { headers: { Cookie: cookie } })
    expect(await list.text()).not.toContain(raw)
  })

  it('private API answers default to no-store', async () => {
    const r = await app.request('/api/v1/me')
    expect(r.headers.get('cache-control')).toMatch(/no-store/)
  })

  it('still accepts ordinary JSON on those routes', async () => {
    expect((await post('/api/v1/drafts', JSON.stringify({ prompt: 'a normal prompt about cats' }))).status).toBeLessThan(300)
  })
})
