import { describe, expect, it } from 'vitest'
import { app } from './app.ts'

const json = { 'Content-Type': 'application/json', Origin: process.env['WEB_URL'] ?? 'http://localhost:3000' }
type Body = { data: { id: string; role: string; email: string; prompt: string } }
const body = async (r: Response) => (await r.json()) as Body
const rid = () => Math.random().toString(36).slice(2, 10)

async function signUp(extra: Record<string, unknown> = {}) {
  const email = `test-${rid()}@example.com`
  const res = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email, password: 'password123', name: 'Test', ...extra }),
  })
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  return { res, cookie, email }
}
const createDraft = (prompt: string) =>
  app.request('/api/v1/drafts', { method: 'POST', headers: json, body: JSON.stringify({ prompt }) })
const claim = (id: string, cookie?: string) =>
  app.request(`/api/v1/drafts/${id}/claim`, { method: 'POST', headers: cookie ? { Cookie: cookie } : {} })

describe('auth', () => {
  it('rejects anonymous /me and returns the user once signed in', async () => {
    expect((await app.request('/api/v1/me')).status).toBe(401)
    const { cookie, email } = await signUp()
    const me = await body(await app.request('/api/v1/me', { headers: { Cookie: cookie } }))
    expect(me.data).toMatchObject({ email, role: 'user' })
  })

  it('never lets a client choose its own role', async () => {
    const { cookie } = await signUp({ role: 'admin' })
    const me = await body(await app.request('/api/v1/me', { headers: { Cookie: cookie } }))
    expect(me.data.role).toBe('user')
  })

})

describe('prompt drafts', () => {
  it('validates the prompt', async () => {
    expect((await createDraft('   ')).status).toBe(400)
    expect((await createDraft('x'.repeat(4001))).status).toBe(400)
  })

  it('requires auth to claim', async () => {
    const { data } = await body(await createDraft('hello'))
    expect((await claim(data.id)).status).toBe(401)
  })

  it('is single-owner: the claimer can re-read it, other users cannot', async () => {
    const { data } = await body(await createDraft('AI in healthcare'))
    const a = await signUp()
    const b = await signUp()
    expect(await body(await claim(data.id, a.cookie))).toMatchObject({ data: { prompt: 'AI in healthcare' } })
    expect((await claim(data.id, a.cookie)).status).toBe(200)
    expect((await claim(data.id, b.cookie)).status).toBe(404)
  })

  it('unknown ids are 404', async () => {
    const { cookie } = await signUp()
    expect((await claim('does-not-exist', cookie)).status).toBe(404)
  })
})
