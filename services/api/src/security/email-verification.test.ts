import { describe, expect, it, vi } from 'vitest'

/**
 * With REQUIRE_EMAIL_VERIFICATION on (production), an account made with someone else's / a made-up mailbox can never sign in, so it can never
 * spend a credit. The app is re-imported with the flag on because Better Auth reads its options at start-up.
 */
describe('email verification gate (security S2)', () => {
  it('sign-up gives no session; sign-in is refused until the emailed link is used', async () => {
    vi.resetModules()
    vi.stubEnv('REQUIRE_EMAIL_VERIFICATION', 'true')
    const { app } = await import('../app.ts')
    const { mailOutbox } = await import('../lib/mailer.ts')
    const origin = process.env['WEB_URL'] ?? 'http://localhost:3000'
    const json = (path: string, body: unknown, ip: string) => app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'x-forwarded-for': ip }, body: JSON.stringify(body) })
    const email = `verify-${Math.random().toString(36).slice(2, 10)}@example.com`

    const up = await json('/api/auth/sign-up/email', { email, password: 'a-long-password-1', name: 'V' }, '198.51.100.7')
    expect(up.status).toBe(200)
    expect(up.headers.getSetCookie().some((c) => /session_token=[^;]+/.test(c))).toBe(false) // no session issued

    const before = await json('/api/auth/sign-in/email', { email, password: 'a-long-password-1' }, '198.51.100.8')
    expect(before.status).toBe(403)

    const mail = mailOutbox.filter((m) => m.to === email).at(-1)
    expect(mail?.text).toMatch(/verify-email\?token=/)
    expect(decodeURIComponent(mail!.text)).toMatch(/callbackURL=https?:\/\/[^\s&]+\/verify-email/) // a sign-up that names no callback still lands on our page, never on raw JSON
    const link = new URL(mail!.text.match(/https?:\/\/\S+verify-email\?\S+/)![0])
    const verified = await app.request(link.pathname + link.search, { method: 'GET' })
    expect([200, 302]).toContain(verified.status)

    const after = await json('/api/auth/sign-in/email', { email, password: 'a-long-password-1' }, '198.51.100.9')
    expect(after.status).toBe(200)
    vi.unstubAllEnvs()
  })

  it('the confirmation link works for 30 minutes: after that, and when damaged, it sends the person to the website with an error (never raw JSON); a new link works', async () => {
    vi.resetModules()
    vi.stubEnv('REQUIRE_EMAIL_VERIFICATION', 'true')
    const { app } = await import('../app.ts')
    const { mailOutbox } = await import('../lib/mailer.ts')
    const origin = process.env['WEB_URL'] ?? 'http://localhost:3000'
    const callbackURL = `${origin}/verify-email`
    const post = (path: string, body: unknown, ip: string) => app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'x-forwarded-for': ip }, body: JSON.stringify(body) })
    const linkOf = (to: string) => { const u = new URL(mailOutbox.filter((m) => m.to === to).at(-1)!.text.match(/https?:\/\/\S+verify-email\?\S+/)![0]); return u.pathname + u.search }
    const email = `expiry-${Math.random().toString(36).slice(2, 10)}@example.com`
    expect((await post('/api/auth/sign-up/email', { email, password: 'a-long-password-1', name: 'E', callbackURL }, '198.51.100.21')).status).toBe(200)
    const first = linkOf(email)
    expect(first).toContain(encodeURIComponent(callbackURL)) // the link carries where to land

    // a damaged link
    const bad = await app.request(first.replace(/token=[^&]+/, 'token=garbage'))
    expect(bad.status).toBe(302)
    expect(bad.headers.get('location')).toBe(`${callbackURL}?error=INVALID_TOKEN`)

    // 31 minutes later: expired
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(Date.now() + 31 * 60 * 1000))
    const late = await app.request(first)
    expect(late.status).toBe(302)
    expect(late.headers.get('location')).toBe(`${callbackURL}?error=TOKEN_EXPIRED`)
    expect((await post('/api/auth/sign-in/email', { email, password: 'a-long-password-1' }, '198.51.100.22')).status).toBe(403) // still not confirmed
    vi.useRealTimers()

    // asking for a new link: it works, signs the person in and lands on the page
    expect((await post('/api/auth/send-verification-email', { email, callbackURL }, '198.51.100.23')).status).toBe(200)
    const second = linkOf(email)
    const ok = await app.request(second)
    expect(ok.status).toBe(302)
    expect(ok.headers.get('location')).toBe(callbackURL)
    expect((await post('/api/auth/sign-in/email', { email, password: 'a-long-password-1' }, '198.51.100.24')).status).toBe(200)
    vi.unstubAllEnvs()
  })

  it('the password-reset link works for 30 minutes and once: expired and reused links send the person to the "no longer works" page', async () => {
    vi.resetModules()
    vi.stubEnv('REQUIRE_EMAIL_VERIFICATION', 'false')
    const { app } = await import('../app.ts')
    const { mailOutbox } = await import('../lib/mailer.ts')
    const origin = process.env['WEB_URL'] ?? 'http://localhost:3000'
    const post = (path: string, body: unknown, ip: string) => app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'x-forwarded-for': ip }, body: JSON.stringify(body) })
    const email = `reset-${Math.random().toString(36).slice(2, 10)}@example.com`
    expect((await post('/api/auth/sign-up/email', { email, password: 'a-long-password-1', name: 'R' }, '198.51.100.31')).status).toBe(200)
    const ask = async (ip: string) => { await post('/api/auth/request-password-reset', { email, redirectTo: `${origin}/reset-password` }, ip); const u = new URL(mailOutbox.filter((m) => m.to === email).at(-1)!.text.match(/https?:\/\/\S+reset-password\/\S+/)![0]); return u.pathname + u.search }
    const expiredLink = await ask('198.51.100.32')
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(Date.now() + 31 * 60 * 1000))
    const late = await app.request(expiredLink)
    expect(late.status).toBe(302)
    expect(late.headers.get('location')).toContain('error=INVALID_TOKEN')
    expect((await post('/api/auth/reset-password', { newPassword: 'another-long-pass-2', token: new URL(origin + expiredLink).pathname.split('/').pop() }, '198.51.100.33')).status).toBe(400)
    vi.useRealTimers()
    const fresh = await ask('198.51.100.34')
    const token = new URL(origin + fresh).pathname.split('/').pop()
    expect((await post('/api/auth/reset-password', { newPassword: 'another-long-pass-2', token }, '198.51.100.35')).status).toBe(200)
    expect((await post('/api/auth/reset-password', { newPassword: 'third-long-pass-3', token }, '198.51.100.36')).status).toBe(400) // used once
    vi.unstubAllEnvs()
  })

  it('right up to the limit the links still work: a confirmation link 29 minutes old confirms the account', async () => {
    vi.resetModules()
    vi.stubEnv('REQUIRE_EMAIL_VERIFICATION', 'true')
    const { app } = await import('../app.ts')
    const { mailOutbox } = await import('../lib/mailer.ts')
    const origin = process.env['WEB_URL'] ?? 'http://localhost:3000'
    const email = `edge-${Math.random().toString(36).slice(2, 10)}@example.com`
    await app.request('/api/auth/sign-up/email', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'x-forwarded-for': '198.51.100.41' }, body: JSON.stringify({ email, password: 'a-long-password-1', name: 'Edge' }) })
    const u = new URL(mailOutbox.filter((m) => m.to === email).at(-1)!.text.match(/https?:\/\/\S+verify-email\?\S+/)![0])
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(Date.now() + 29 * 60 * 1000))
    const r = await app.request(u.pathname + u.search)
    expect(r.status).toBe(302)
    expect(r.headers.get('location') ?? '').not.toContain('error=')
    vi.useRealTimers(); vi.unstubAllEnvs()
  })
})
