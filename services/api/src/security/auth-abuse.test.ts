import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { env } from '../env.ts'
import { origin, rid } from '../test-utils.ts'
import { setCaptchaVerifier, verifyTurnstile } from './auth-guard.ts'

/**
 * Attack simulations against the real HTTP surface: sign-up floods, alias/disposable farming, credential stuffing, mail-bombing, CSRF,
 * oversized bodies, CAPTCHA. Each scenario uses its own client address (via a trusted X-Forwarded-For) so counters never overlap.
 */
const post = (path: string, body: unknown, ip: string, extra: Record<string, string> = {}) =>
  app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'x-forwarded-for': ip, ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body) })
const signUp = (email: string, ip: string, password = 'a-long-password-1') => post('/api/auth/sign-up/email', { email, password, name: 'T' }, ip)
const signIn = (email: string, password: string, ip: string) => post('/api/auth/sign-in/email', { email, password }, ip)
const body = async (r: Response) => (await r.json()) as { code?: string; message?: string }
const ipv4 = () => `198.51.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`

const saved = { ...env }
beforeEach(() => { env.TRUSTED_PROXY_HOPS = 1 })
afterEach(() => { Object.assign(env, saved); setCaptchaVerifier(verifyTurnstile) })

describe('sign-up abuse', () => {
  it('one address cannot create accounts in bulk: the per-hour cap answers 429 with Retry-After', async () => {
    env.AUTH_SIGNUPS_PER_IP_HOUR = 3
    const ip = ipv4()
    for (let i = 0; i < 3; i++) expect((await signUp(`bulk-${rid()}@example.com`, ip)).status).toBe(200)
    const blocked = await signUp(`bulk-${rid()}@example.com`, ip)
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await signUp(`bulk-${rid()}@example.com`, ipv4())).status).toBe(200) // another network is unaffected
  })
  it('a spoofed X-Forwarded-For prefix does not buy a fresh quota (only the trusted hop counts)', async () => {
    env.AUTH_SIGNUPS_PER_IP_HOUR = 2
    const real = ipv4()
    for (let i = 0; i < 2; i++) expect((await signUp(`spoof-${rid()}@example.com`, `${ipv4()}, ${real}`)).status).toBe(200)
    expect((await signUp(`spoof-${rid()}@example.com`, `${ipv4()}, ${real}`)).status).toBe(429)
  })
  it('plus-tags, dots and googlemail do not create extra accounts for the same mailbox', async () => {
    const base = `farm${rid()}${rid()}`
    expect((await signUp(`${base}@gmail.com`, ipv4())).status).toBe(200)
    const aliases = [`${base}+1@gmail.com`, `${base.slice(0, 4)}.${base.slice(4)}@gmail.com`, `${base}@googlemail.com`, `${base.toUpperCase()}+promo@GMAIL.COM`]
    for (const [i, alias] of aliases.entries()) {
      const r = await signUp(alias, ipv4())
      if (i < 2) { expect(r.status, alias).toBe(422); expect((await body(r)).code).toBe('USER_ALREADY_EXISTS') }
      else expect([422, 429], alias).toContain(r.status) // after a few tries the mailbox itself is rate-limited
    }
  })
  it('throwaway-inbox domains are refused', async () => {
    for (const d of ['mailinator.com', 'sub.guerrillamail.com', 'yopmail.com']) {
      const r = await signUp(`x${rid()}@${d}`, ipv4())
      expect(r.status, d).toBe(422)
      expect((await body(r)).code).toBe('INVALID_EMAIL_DOMAIN')
    }
  })
  it('a 100 KB or 100,000-character password body is refused before any hashing happens', async () => {
    expect((await post('/api/auth/sign-up/email', { email: `big-${rid()}@example.com`, password: 'x'.repeat(100_000), name: 'T' }, ipv4())).status).toBe(413)
    expect((await signUp(`long-${rid()}@example.com`, ipv4(), 'x'.repeat(500))).status).toBeGreaterThanOrEqual(400)
    expect((await signUp(`short-${rid()}@example.com`, ipv4(), 'short')).status).toBeGreaterThanOrEqual(400)
  })
  it('CAPTCHA is enforced when configured and fails closed', async () => {
    setCaptchaVerifier(async () => false)
    const r = await signUp(`cap-${rid()}@example.com`, ipv4())
    expect(r.status).toBe(400)
    expect((await body(r)).code).toBe('CAPTCHA_FAILED')
    setCaptchaVerifier(async (t) => t === 'good')
    expect((await post('/api/auth/sign-up/email', { email: `cap-${rid()}@example.com`, password: 'a-long-password-1', name: 'T' }, ipv4(), { 'x-turnstile-token': 'good' })).status).toBe(200)
  })
})

describe('login abuse', () => {
  it('credential stuffing: 5 wrong passwords lock the ACCOUNT, even for the right password and from other addresses', async () => {
    env.AUTH_SIGNIN_FAILS_PER_EMAIL = 5
    const email = `victim-${rid()}@example.com`
    expect((await signUp(email, ipv4())).status).toBe(200)
    for (let i = 0; i < 5; i++) expect((await signIn(email, `wrong-password-${i}`, ipv4())).status).toBe(401) // every guess from a different IP
    const locked = await signIn(email, 'a-long-password-1', ipv4())
    expect(locked.status).toBe(429)
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0)
  })
  it('one address guessing across many accounts hits the per-IP failure cap', async () => {
    env.AUTH_SIGNIN_FAILS_PER_IP = 6
    const ip = ipv4()
    for (let i = 0; i < 6; i++) await signIn(`nobody-${rid()}@example.com`, 'whatever-password', ip)
    expect((await signIn(`nobody-${rid()}@example.com`, 'whatever-password', ip)).status).toBe(429)
  })
  it('unknown and known accounts get the same failure answer (no account enumeration on sign-in)', async () => {
    const email = `enum-${rid()}@example.com`
    await signUp(email, ipv4())
    const a = await signIn(email, 'wrong-password-123', ipv4())
    const b = await signIn(`ghost-${rid()}@example.com`, 'wrong-password-123', ipv4())
    expect(a.status).toBe(b.status)
    expect((await body(a)).message).toBe((await body(b)).message)
  })
  it('password-reset / verification mail cannot be used to bomb a victim', async () => {
    env.AUTH_RESET_PER_EMAIL_HOUR = 3
    const victim = `bomb-${rid()}@example.com`
    for (let i = 0; i < 3; i++) expect((await post('/api/auth/request-password-reset', { email: victim, redirectTo: `${origin}/reset` }, ipv4())).status).not.toBe(429)
    expect((await post('/api/auth/request-password-reset', { email: victim, redirectTo: `${origin}/reset` }, ipv4())).status).toBe(429)
  })
})

describe('CSRF and cross-origin writes', () => {
  it('state-changing API calls from a foreign Origin are refused; our own apps and non-browser clients pass', async () => {
    const evil = await app.request('/api/v1/presentations', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' })
    expect(evil.status).toBe(403)
    const crossSite = await app.request('/api/v1/presentations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }, body: '{}' })
    expect(crossSite.status).toBe(403)
    const own = await app.request('/api/v1/presentations', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: '{}' })
    expect(own.status).toBe(401) // got past the origin check, stopped by auth
    const evilAuth = await app.request('/api/auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' })
    expect(evilAuth.status).toBe(403)
  })
})
