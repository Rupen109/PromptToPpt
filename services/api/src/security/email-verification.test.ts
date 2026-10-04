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
    const link = new URL(mail!.text.match(/https?:\/\/\S+verify-email\?\S+/)![0])
    const verified = await app.request(link.pathname + link.search, { method: 'GET' })
    expect([200, 302]).toContain(verified.status)

    const after = await json('/api/auth/sign-in/email', { email, password: 'a-long-password-1' }, '198.51.100.9')
    expect(after.status).toBe(200)
    vi.unstubAllEnvs()
  })
})
