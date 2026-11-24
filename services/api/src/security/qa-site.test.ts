import { afterEach, describe, expect, it, vi } from 'vitest'
import { signupAllowed } from './email.ts'

/**
 * The QA site (docs/RELEASES.md): invite-only sign-up, because its AI runs on a free daily allowance, and its own login cookie name, because production's cookie
 * (Domain=.slidesdone.app) also reaches qa.slidesdone.app.
 */
describe('invite-only sign-up', () => {
  it('an empty list lets everyone in (production)', () => {
    expect(signupAllowed('anyone@gmail.com', undefined)).toBe(true)
    expect(signupAllowed('anyone@gmail.com', ' , ')).toBe(true)
  })
  it('addresses and whole domains, compared on the canonical address', () => {
    const list = 'owner@gmail.com, @team.example'
    expect(signupAllowed('Ow.Ner+qa@Gmail.com', list)).toBe(true)
    expect(signupAllowed('dev@team.example', list)).toBe(true)
    expect(signupAllowed('dev@sub.team.example', list)).toBe(false)
    expect(signupAllowed('stranger@gmail.com', list)).toBe(false)
    expect(signupAllowed('owner@gmail.com.evil.test', list)).toBe(false)
  })
})

describe('the QA site in the app', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

  it('a stranger cannot sign up, an invited address can, and the login cookie carries the QA name', async () => {
    vi.resetModules()
    vi.stubEnv('SIGNUP_ALLOWED_EMAILS', '@invited.example')
    vi.stubEnv('COOKIE_PREFIX', 'slidesdone-qa')
    const { app } = await import('../app.ts')
    const origin = process.env['WEB_URL'] ?? 'http://localhost:3000'
    const signUp = (email: string, ip: string) => app.request('/api/auth/sign-up/email', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'x-forwarded-for': ip }, body: JSON.stringify({ email, password: 'a-long-password-1', name: 'Q' }) })
    const id = Math.random().toString(36).slice(2, 10)
    const stranger = await signUp(`qa-${id}@example.com`, '198.51.100.61')
    expect(stranger.status).toBe(403)
    expect(JSON.stringify(await stranger.json())).toMatch(/invitation only/)
    const invited = await signUp(`qa-${id}@invited.example`, '198.51.100.62')
    expect(invited.status).toBe(200)
    const cookies = invited.headers.getSetCookie?.() ?? [invited.headers.get('set-cookie') ?? '']
    expect(cookies.join('\n')).toMatch(/slidesdone-qa\.session_token=/)
    expect(cookies.join('\n')).not.toMatch(/better-auth\./)
  })

  it('with email verification on (as on QA), a stranger is told plainly and no account is made (Better Auth would otherwise hide the refusal behind "check your email")', async () => {
    vi.resetModules()
    vi.stubEnv('SIGNUP_ALLOWED_EMAILS', '@invited.example')
    vi.stubEnv('REQUIRE_EMAIL_VERIFICATION', 'true')
    const { app } = await import('../app.ts')
    const { db } = await import('../db/index.ts')
    const { user } = await import('../db/schema.ts')
    const { eq } = await import('drizzle-orm')
    const origin = process.env['WEB_URL'] ?? 'http://localhost:3000'
    const email = `qa-${Math.random().toString(36).slice(2, 10)}@example.com`
    const res = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'x-forwarded-for': '198.51.100.63' }, body: JSON.stringify({ email, password: 'a-long-password-1', name: 'Q' }) })
    expect(res.status).toBe(403)
    expect(((await res.json()) as { code: string }).code).toBe('SIGNUP_INVITE_ONLY')
    expect(await db.select().from(user).where(eq(user.email, email))).toHaveLength(0)
  })
})
