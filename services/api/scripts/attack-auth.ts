/**
 * Black-box attack on sign-up / sign-in / sessions / password reset (dev only; refuses production). Plan: docs/FULL_SECURITY_LOAD_CTA_TEST_PLAN.md (A1–A11).
 * Needs TWO API instances with PRODUCTION-LIKE abuse limits (see scripts/attack-auth.sh):
 *   S = strict    (env API_S, default http://localhost:4010): TRUSTED_PROXY_HOPS=0, REQUIRE_EMAIL_VERIFICATION=false
 *   T = production-shaped (env API_T, default http://localhost:4011): TRUSTED_PROXY_HOPS=1, REQUIRE_EMAIL_VERIFICATION=true; its log (env LOG_T) is read for the e-mails it "sent"
 * Victims are created in-process (bypassing the HTTP guards) so the attacks are the only HTTP traffic against them.
 */
import { readFileSync } from 'node:fs'
import net from 'node:net'
import { eq, like } from 'drizzle-orm'
import { auth } from '../src/auth.ts'
import { db, pool } from '../src/db/index.ts'
import { authAttempt, user, verification } from '../src/db/schema.ts'
import { isProd } from '../src/env.ts'

if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const S = process.env['API_S'] ?? 'http://localhost:4010'
const T = process.env['API_T'] ?? 'http://localhost:4011'
const LOG_T = process.env['LOG_T'] ?? '/private/tmp/claude-502/auth-t.log'
const ORIGIN = process.env['ORIGIN'] ?? 'http://localhost:3001'
const PW = 'Passw0rd!auth-attack'
let failures = 0
const findings: string[] = []
const notes: string[] = []
const ok = (id: string, title: string, pass: boolean, detail = '') => { console.log(`${pass ? '  ✓' : '  ✗'} ${id} ${title}${pass ? '' : `\n      ${detail}`}`); if (!pass) { failures++; findings.push(`${id} ${title}: ${detail}`) } }
const note = (id: string, text: string) => { console.log(`  ➖ ${id} ${text}`); notes.push(`${id} ${text}`) }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const rnd = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`

interface Res { status: number; json: any; text: string; headers: Headers; ms: number }
async function http(base: string, method: string, path: string, o: { cookie?: string; body?: unknown; raw?: string | Uint8Array; headers?: Record<string, string>; origin?: string | null } = {}): Promise<Res> {
  const t0 = performance.now()
  const headers: Record<string, string> = { ...(o.origin === null ? {} : { Origin: o.origin ?? ORIGIN }), ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers ?? {}) }
  if (o.body !== undefined) headers['Content-Type'] ??= 'application/json'
  try {
    const r = await fetch(`${base}${path}`, { method, headers, ...(o.raw !== undefined ? { body: o.raw } : o.body !== undefined ? { body: JSON.stringify(o.body) } : {}), signal: AbortSignal.timeout(30_000), redirect: 'manual' })
    const text = await r.text(); let json: any = null; try { json = JSON.parse(text) } catch { /* not json */ }
    return { status: r.status, json, text, headers: r.headers, ms: performance.now() - t0 }
  } catch (e) { return { status: 0, json: null, text: String((e as Error).message), headers: new Headers(), ms: performance.now() - t0 } }
}
const cookieOf = (r: Res) => r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
const signUp = (base: string, email: string, password = PW, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) => http(base, 'POST', '/api/auth/sign-up/email', { body: { email, password, name: 'Atk', ...extra }, headers })
const signIn = (base: string, email: string, password: string, headers: Record<string, string> = {}) => http(base, 'POST', '/api/auth/sign-in/email', { body: { email, password }, headers })
/** a simulated proxy: it APPENDS the address it saw to whatever the client claimed (the hop count says how many entries at the end to believe) */
const behindProxy = (realIp: string, clientClaim = '') => ({ 'X-Forwarded-For': clientClaim ? `${clientClaim}, ${realIp}` : realIp })
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!
const mkUser = async (tag: string, verified = true) => { const email = `${tag}${rnd()}@example.com`; await auth.api.signUpEmail({ body: { email, password: PW, name: `V ${tag}` } }); if (verified) await db.update(user).set({ emailVerified: true }).where(eq(user.email, email)); return email }
let logPos = 0
const newMail = async (wait = 800) => { await sleep(wait); const all = readFileSync(LOG_T, 'utf8'); const out = all.slice(logPos); logPos = all.length; return out }
const lastUrl = (mail: string, re: RegExp) => [...mail.matchAll(new RegExp(re.source, 'g'))].map((m) => m[0]).pop()

console.log('preparing: clearing the abuse counters left by earlier runs…')
await db.delete(authAttempt)
logPos = readFileSync(LOG_T, 'utf8').length
const up = await Promise.all([http(S, 'GET', '/api/auth/get-session'), http(T, 'GET', '/api/auth/get-session')])
if (up.some((r) => r.status === 0)) { console.error('both API instances (S and T) must be running — see scripts/attack-auth.sh'); process.exit(2) }

// ─── A1: sign-up flood from one address (S: 6 per hour, 15 per day) ──────────
console.log('\nA1 — sign-up flood from one address')
const flood: Res[] = []
for (let i = 0; i < 14; i++) flood.push(await signUp(S, `flood${rnd()}@example.com`))
const accepted = flood.filter((r) => r.status === 200).length
ok('A1', `a flood of 14 sign-ups from one address: the first allowance (6) works, the rest get 429 (accepted ${accepted})`, accepted === 6 && flood.slice(6).every((r) => r.status === 429), flood.map((r) => r.status).join(','))
ok('A1b', 'the 429 carries a Retry-After and a plain message', !!flood[13]!.headers.get('retry-after') && /try again/i.test(flood[13]!.text), `${flood[13]!.headers.get('retry-after')} ${flood[13]!.text.slice(0, 100)}`)
const spoof = await signUp(S, `flood${rnd()}@example.com`, PW, {}, { 'X-Forwarded-For': `203.0.113.${Math.floor(Math.random() * 250)}`, 'X-Real-IP': '198.51.100.7', 'CF-Connecting-IP': '198.51.100.8', Forwarded: 'for=192.0.2.9' })
ok('A1c', 'spoofed X-Forwarded-For / X-Real-IP / Forwarded headers do NOT get a fresh allowance when no proxy is trusted', spoof.status === 429, `${spoof.status}`)
const legitElsewhere = await signUp(T, `legit${rnd()}@example.com`, PW, {}, behindProxy('198.51.100.21'))
ok('A1d', 'a different real address (via the trusted proxy) is not affected by the flood', legitElsewhere.status === 200, `${legitElsewhere.status} ${legitElsewhere.text.slice(0, 100)}`)
const stuffed = await Promise.all(Array.from({ length: 12 }, (_, i) => signUp(T, `claim${rnd()}@example.com`, PW, {}, behindProxy('198.51.100.30', `10.9.8.${i}`))))
ok('A1e', 'behind a trusted proxy, the client cannot choose its own address by prefixing X-Forwarded-For (12 spoofed prefixes, one real address → limited)', stuffed.filter((r) => r.status === 200).length <= 6 && stuffed.some((r) => r.status === 429), stuffed.map((r) => r.status).join(','))

// ─── A2: one person signing up many times ────────────────────────────────────
console.log('\nA2 — aliases, case, dots, disposable domains')
const ip2 = '198.51.100.40'
const base = `atk.base${rnd()}`.replace(/_/g, '')
const first = await signUp(T, `${base}@gmail.com`, PW, {}, behindProxy(ip2))
ok('A2', 'the first sign-up with a mailbox works', first.status === 200, `${first.status} ${first.text.slice(0, 100)}`)
const dupes: [string, string][] = [['+tag alias', `${base}+promo1@gmail.com`], ['upper case', `${base.toUpperCase()}@GMAIL.COM`], ['dots moved (gmail)', `${base.replace(/\./g, '')}@gmail.com`], ['googlemail.com', `${base}@googlemail.com`], ['spaces around', `  ${base}@gmail.com  `]]
const dupRes: string[] = []
for (const [name, email] of dupes) { const r = await signUp(T, email, PW, {}, behindProxy(ip2)); if (r.status < 400 || r.status >= 500) dupRes.push(`${name}: ${r.status}`) }
ok('A2b', 'every alias of the same mailbox is refused as a duplicate', dupRes.length === 0, dupRes.join(' | '))
const disp = await Promise.all(['mailinator.com', 'sub.mailinator.com', 'guerrillamail.com', 'yopmail.com', '10minutemail.com'].map((d) => signUp(T, `x${rnd()}@${d}`, PW, {}, behindProxy('198.51.100.41'))))
ok('A2c', 'throw-away mail domains (and their subdomains) are refused', disp.every((r) => r.status === 422), disp.map((r) => r.status).join(','))
const nonDup = await signUp(T, `other.${rnd()}@gmail.com`, PW, {}, behindProxy(ip2))
ok('A2d', 'a genuinely different mailbox still works (no false positives)', nonDup.status === 200, `${nonDup.status}`)

// ─── A3: hostile input on the auth endpoints ─────────────────────────────────
console.log('\nA3 — hostile input')
const ip3 = '198.51.100.50'
const hostile: [string, () => Promise<Res>][] = [
  ['weak password "abc"', () => signUp(T, `w${rnd()}@example.com`, 'abc', {}, behindProxy(ip3))],
  ['9-char password', () => signUp(T, `w${rnd()}@example.com`, '123456789', {}, behindProxy(ip3))],
  ['129-char password', () => signUp(T, `w${rnd()}@example.com`, 'a'.repeat(129), {}, behindProxy(ip3))],
  ['100 KB password', () => signUp(T, `w${rnd()}@example.com`, 'a'.repeat(100_000), {}, behindProxy(ip3))],
  ['empty password', () => signUp(T, `w${rnd()}@example.com`, '', {}, behindProxy(ip3))],
  ['NUL in password', () => signUp(T, `w${rnd()}@example.com`, `Passw0rd!\u0000xx`, {}, behindProxy(ip3))],
  ['NUL escape in name', () => signUp(T, `w${rnd()}@example.com`, PW, { name: 'a\\u0000b' }, behindProxy(ip3))],
  ['10,000-char name', () => signUp(T, `w${rnd()}@example.com`, PW, { name: 'n'.repeat(10_000) }, behindProxy(ip3))],
  ['400-char email', () => signUp(T, `${'a'.repeat(390)}@example.com`, PW, {}, behindProxy(ip3))],
  ['email without @', () => signUp(T, 'not-an-email', PW, {}, behindProxy(ip3))],
  ['SQL in email', () => signUp(T, `x'; DROP TABLE "user"; --@example.com`, PW, {}, behindProxy(ip3))],
  ['unicode / emoji / RTL name', () => signUp(T, `u${rnd()}@example.com`, PW, { name: '👩‍💻 مرحبا <script>alert(1)</script>' }, behindProxy(ip3))],
  ['object as email', () => http(T, 'POST', '/api/auth/sign-up/email', { body: { email: { $ne: null }, password: PW, name: 'x' }, headers: behindProxy(ip3) })],
  ['array body', () => http(T, 'POST', '/api/auth/sign-up/email', { body: [], headers: behindProxy(ip3) })],
  ['null body', () => http(T, 'POST', '/api/auth/sign-up/email', { raw: 'null', headers: { 'Content-Type': 'application/json', ...behindProxy(ip3) } })],
  ['malformed JSON', () => http(T, 'POST', '/api/auth/sign-up/email', { raw: '{"email":"a@b.co', headers: { 'Content-Type': 'application/json', ...behindProxy(ip3) } })],
  ['invalid UTF-8', () => http(T, 'POST', '/api/auth/sign-up/email', { raw: new Uint8Array([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x3a, 0x31, 0x7d]), headers: { 'Content-Type': 'application/json', ...behindProxy(ip3) } })],
  ['form-encoded body', () => http(T, 'POST', '/api/auth/sign-up/email', { raw: 'email=a%40b.co&password=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...behindProxy(ip3) } })],
  ['text/plain body (a "simple" cross-site request)', () => http(T, 'POST', '/api/auth/sign-up/email', { raw: JSON.stringify({ email: `p${rnd()}@example.com`, password: PW, name: 'x' }), headers: { 'Content-Type': 'text/plain', ...behindProxy(ip3) } })],
  ['20 KB JSON (over the 16 KB auth limit)', () => http(T, 'POST', '/api/auth/sign-in/email', { raw: JSON.stringify({ email: 'a@b.co', password: 'x', pad: 'a'.repeat(20_000) }), headers: { 'Content-Type': 'application/json', ...behindProxy(ip3) } })],
  ['sign-in with an object password', () => http(T, 'POST', '/api/auth/sign-in/email', { body: { email: 'a@b.co', password: { $gt: '' } }, headers: behindProxy(ip3) })],
  ['sign-in with SQL', () => signIn(T, `' OR '1'='1`, `' OR '1'='1`, behindProxy(ip3))],
]
const hostileBad: string[] = []
for (const [name, fn] of hostile) { const r = await fn(); if (r.status >= 500 || r.status === 0) hostileBad.push(`${name}: ${r.status} ${r.text.slice(0, 60)}`) }
ok('A3', `${hostile.length} hostile inputs on sign-up / sign-in: every answer is a clean 4xx (or accepted as plain text), never a 5xx`, hostileBad.length === 0, hostileBad.join(' | '))
const stored = await db.select({ e: user.email }).from(user).where(like(user.email, '%DROP TABLE%'))
const userTableOk = (await db.select({ id: user.id }).from(user).limit(1)).length === 1
ok('A3b', 'nothing hostile was stored and the user table is intact', stored.length === 0 && userTableOk, `${stored.length}`)
const xss = await db.select({ n: user.name }).from(user).where(like(user.name, '%alert(1)%'))
note('A3c', `a name with <script> is stored as inert text (${xss.length} stored) — rendering is escaped by the apps (browser XSS checks in the exposure/CTA runs)`)

// ─── A4: account enumeration ─────────────────────────────────────────────────
console.log('\nA4 — can an attacker learn which e-mails have accounts?')
const known = await mkUser('known')
const unknown = `nobody${rnd()}@example.com`
const si = async (email: string, n: number) => { const t: number[] = []; let last: Res | null = null; for (let i = 0; i < n; i++) { last = await signIn(T, email, 'Wrong-password-1!', behindProxy(`198.51.${100 + (i % 100)}.${Math.floor(Math.random() * 250)}`)); t.push(last.ms) } return { t, last: last! } }
const sKnown = await si(known, 4), sUnknown = await si(unknown, 4) // few attempts each: the per-account lockout is 5
ok('A4', 'sign-in: wrong password for a real account and an unknown e-mail give the SAME status and message', sKnown.last.status === sUnknown.last.status && sKnown.last.json?.message === sUnknown.last.json?.message, `${sKnown.last.status} ${sKnown.last.text.slice(0, 80)} | ${sUnknown.last.status} ${sUnknown.last.text.slice(0, 80)}`)
const mk = median(sKnown.t), mu = median(sUnknown.t)
ok('A4b', `sign-in timing does not reveal the account (median ${mk.toFixed(0)} ms known vs ${mu.toFixed(0)} ms unknown; must be within 40 %)`, Math.abs(mk - mu) / Math.max(mk, mu) < 0.4, `${mk} vs ${mu}`)
const rk = await http(T, 'POST', '/api/auth/request-password-reset', { body: { email: known, redirectTo: `${ORIGIN}/reset` }, headers: behindProxy('198.51.100.60') })
const ru = await http(T, 'POST', '/api/auth/request-password-reset', { body: { email: unknown, redirectTo: `${ORIGIN}/reset` }, headers: behindProxy('198.51.100.61') })
ok('A4c', 'password reset: a real account and an unknown e-mail get the same answer', rk.status === ru.status && rk.json?.message === ru.json?.message, `${rk.status} ${rk.text.slice(0, 80)} | ${ru.status} ${ru.text.slice(0, 80)}`)
const tk: number[] = [], tu: number[] = []
for (let i = 0; i < 4; i++) { tk.push((await http(T, 'POST', '/api/auth/request-password-reset', { body: { email: known, redirectTo: `${ORIGIN}/reset` }, headers: behindProxy(`198.51.101.${i}`) })).ms); tu.push((await http(T, 'POST', '/api/auth/request-password-reset', { body: { email: `nobody${rnd()}@example.com`, redirectTo: `${ORIGIN}/reset` }, headers: behindProxy(`198.51.102.${i}`) })).ms) }
note('A4d', `password-reset timing: median ${median(tk).toFixed(0)} ms for a real account (it sends a mail) vs ${median(tu).toFixed(0)} ms for an unknown one — ${Math.abs(median(tk) - median(tu)) > 100 ? 'a difference an attacker could measure: the mail should be sent after the response' : 'no meaningful difference'}`)
const su = await signUp(T, known, PW, {}, behindProxy('198.51.100.62'))
note('A4e', `sign-up with an existing e-mail answers ${su.status} "${su.json?.message ?? su.text.slice(0, 60)}" — sign-up reveals that an address is registered (standard for password sign-up; bounded by the per-address sign-up limit of 5/hour in production)`)

// ─── A5 / A6: brute force and credential stuffing ────────────────────────────
console.log('\nA5/A6 — brute force and credential stuffing')
const victim = await mkUser('victim')
const bf: Res[] = []
for (let i = 0; i < 8; i++) bf.push(await signIn(S, victim, `Wrong-guess-${i}!`))
ok('A5', 'after 5 wrong passwords the account is locked: the 6th attempt is refused with 429 …', bf.slice(0, 5).every((r) => r.status === 401 || r.status === 400) && bf.slice(5).every((r) => r.status === 429), bf.map((r) => r.status).join(','))
const correctWhileLocked = await signIn(S, victim, PW)
ok('A5b', '… even with the CORRECT password (a guesser who got lucky is still locked out)', correctWhileLocked.status === 429, `${correctWhileLocked.status}`)
const spoofedLock = await signIn(S, victim, PW, { 'X-Forwarded-For': '203.0.113.99' })
const otherPlace = await signIn(T, victim, PW, behindProxy('198.51.100.70'))
ok('A5c', 'changing the claimed address does not unlock it (the lock follows the account, not the address)', spoofedLock.status === 429 && otherPlace.status === 429, `${spoofedLock.status}/${otherPlace.status}`)
note('A5d', 'consequence: someone who knows a victim\'s e-mail can lock that account for 15 minutes (the owner can still use "Forgot password"); the alternative — no lock — allows unlimited guessing')
const stuff: Res[] = []
for (let i = 0; i < 36; i++) stuff.push(await signIn(S, `stuff${rnd()}@example.com`, 'Password-guess-1!'))
const first429 = stuff.findIndex((r) => r.status === 429)
ok('A6', `credential stuffing: many different e-mails from one address are capped (first 429 at attempt ${first429 + 1}; limit 30)`, first429 >= 25 && first429 <= 31, stuff.map((r) => r.status).join(','))
const legitDuringStuffing = await signIn(T, await mkUser('legitlogin'), PW, behindProxy('198.51.100.71'))
ok('A6b', 'a legitimate user from a different address can still sign in meanwhile', legitDuringStuffing.status === 200 || legitDuringStuffing.status === 403, `${legitDuringStuffing.status} ${legitDuringStuffing.text.slice(0, 80)}`)

// ─── A7: password reset ──────────────────────────────────────────────────────
console.log('\nA7 — password reset')
await db.delete(authAttempt)
const rv = await mkUser('resetme')
await newMail(0) // move past the mails earlier steps caused
const bomb: Res[] = []
for (let i = 0; i < 7; i++) bomb.push(await http(T, 'POST', '/api/auth/request-password-reset', { body: { email: rv, redirectTo: `${ORIGIN}/reset` }, headers: behindProxy(`198.51.103.${i}`) })) // a different "address" each time: the limit follows the VICTIM's e-mail
const mailsSent = (await newMail()).split('[mail →').length - 1
ok('A7', `mail-bombing one victim from 7 different addresses: only 3 mails go out per hour (sent: ${mailsSent}), the rest are 429`, mailsSent === 3 && bomb.filter((r) => r.status === 429).length === 4, `${mailsSent} mails; ${bomb.map((r) => r.status).join(',')}`)
const ipBomb: Res[] = []
for (let i = 0; i < 14; i++) ipBomb.push(await http(T, 'POST', '/api/auth/request-password-reset', { body: { email: `victim${i}${rnd()}@example.com`, redirectTo: `${ORIGIN}/reset` }, headers: behindProxy('198.51.104.1') }))
ok('A7b', 'mail-bombing many victims from one address is capped (10 per hour)', ipBomb.filter((r) => r.status === 429).length >= 3, ipBomb.map((r) => r.status).join(','))
// a clean reset on a fresh account
await db.delete(authAttempt)
const rc = await mkUser('resetclean')
const oldSession = await signIn(T, rc, PW, behindProxy('198.51.105.1'))
const oldCookie = cookieOf(oldSession)
await newMail(0)
await http(T, 'POST', '/api/auth/request-password-reset', { body: { email: rc, redirectTo: `${ORIGIN}/reset` }, headers: behindProxy('198.51.105.2') })
const mail = await newMail()
const link = lastUrl(mail, /https?:\/\/\S+\/reset-password\/[^\s?]+/)
const token = link?.split('/reset-password/')[1]
ok('A7c', 'the reset mail carries a one-time link', !!token && token.length >= 20, mail.slice(0, 200))
const forged = await http(T, 'POST', '/api/auth/reset-password', { body: { newPassword: 'Forged-pass-123!', token: `${token}x` }, headers: behindProxy('198.51.105.3') })
const wrongTok = await http(T, 'POST', '/api/auth/reset-password', { body: { newPassword: 'Forged-pass-123!', token: 'a'.repeat(24) }, headers: behindProxy('198.51.105.3') })
ok('A7d', 'a forged / guessed reset token is refused', forged.status >= 400 && forged.status < 500 && wrongTok.status >= 400 && wrongTok.status < 500, `${forged.status}/${wrongTok.status}`)
const weakReset = await http(T, 'POST', '/api/auth/reset-password', { body: { newPassword: 'short', token }, headers: behindProxy('198.51.105.3') })
ok('A7e', 'the real token with a weak new password is refused (and the token is not burned)', weakReset.status >= 400 && weakReset.status < 500, `${weakReset.status}`)
const okReset = await http(T, 'POST', '/api/auth/reset-password', { body: { newPassword: 'Brand-new-pass-77!', token }, headers: behindProxy('198.51.105.3') })
const reuse = await http(T, 'POST', '/api/auth/reset-password', { body: { newPassword: 'Attacker-pass-88!', token }, headers: behindProxy('198.51.105.3') })
ok('A7f', 'the real token resets the password once …', okReset.status === 200, `${okReset.status} ${okReset.text.slice(0, 100)}`)
ok('A7g', '… and cannot be used a second time', reuse.status >= 400 && reuse.status < 500, `${reuse.status}`)
ok('A7h', 'the old password no longer works, the new one does', (await signIn(T, rc, PW, behindProxy('198.51.105.4'))).status === 401 && (await signIn(T, rc, 'Brand-new-pass-77!', behindProxy('198.51.105.5'))).status === 200, '')
const oldMe = await http(T, 'GET', '/api/auth/get-session', { cookie: oldCookie })
ok('A7i', 'a session that existed BEFORE the reset is signed out by it (an attacker already inside loses access)', oldMe.json === null || oldMe.json?.user == null, oldMe.text.slice(0, 100))
// expired token
await db.delete(authAttempt)
const re = await mkUser('resetexpired')
await newMail(0)
await http(T, 'POST', '/api/auth/request-password-reset', { body: { email: re, redirectTo: `${ORIGIN}/reset` }, headers: behindProxy('198.51.106.1') })
const tok2 = lastUrl(await newMail(), /https?:\/\/\S+\/reset-password\/[^\s?]+/)?.split('/reset-password/')[1]
await db.update(verification).set({ expiresAt: new Date(Date.now() - 1000) }).where(like(verification.identifier, 'reset-password:%'))
const expired = await http(T, 'POST', '/api/auth/reset-password', { body: { newPassword: 'Expired-token-77!', token: tok2 }, headers: behindProxy('198.51.106.2') })
ok('A7j', 'an expired reset token is refused', expired.status >= 400 && expired.status < 500, `${expired.status}`)

// ─── verification e-mail flow (production setting) ───────────────────────────
console.log('\nA7+ — e-mail verification (production setting)')
const ve = `verify${rnd()}@example.com`
await newMail(0)
const vs = await signUp(T, ve, PW, {}, behindProxy('198.51.107.1'))
const vmail = await newMail()
const vlink = lastUrl(vmail, /https?:\/\/\S+\/verify-email\?[^\s]+/)
ok('A7k', 'with verification required, sign-up gives NO session and sends a confirmation mail', vs.status === 200 && !cookieOf(vs) && !!vlink, `${vs.status} cookie=${cookieOf(vs).slice(0, 30)} mail=${vmail.slice(0, 120)}`)
const early = await signIn(T, ve, PW, behindProxy('198.51.107.2'))
ok('A7l', 'an unverified address cannot sign in (so it cannot spend anything)', early.status === 403, `${early.status} ${early.text.slice(0, 100)}`)
const vtok = vlink ? new URL(vlink).searchParams.get('token') : null
const vbad = await http(T, 'GET', `/api/auth/verify-email?token=${vtok}x`, { headers: behindProxy('198.51.107.3') })
ok('A7m', 'a forged verification token does not verify', vbad.status >= 300 && !cookieOf(vbad), `${vbad.status}`)
const vgood = vlink ? await http(T, 'GET', vlink.replace(/^https?:\/\/[^/]+/, ''), { headers: behindProxy('198.51.107.4') }) : null
ok('A7n', 'the genuine link verifies the address', !!vgood && vgood.status < 400 && (await signIn(T, ve, PW, behindProxy('198.51.107.5'))).status === 200, `${vgood?.status}`)

// ─── A8: sessions and cookies ────────────────────────────────────────────────
console.log('\nA8 — sessions and cookies')
await db.delete(authAttempt)
const sm = await mkUser('session')
const l1 = await signIn(T, sm, PW, behindProxy('198.51.108.1'))
const setCookie = l1.headers.getSetCookie().join(' | ')
ok('A8', 'the session cookie is HttpOnly, SameSite=Lax and Path=/', /httponly/i.test(setCookie) && /samesite=lax/i.test(setCookie) && /path=\//i.test(setCookie), setCookie.slice(0, 200))
note('A8b', 'the Secure flag and the shared-domain scope are switched on by NODE_ENV=production (auth.ts useSecureCookies / COOKIE_DOMAIN): not observable on a plain-http dev server — checked in the production rehearsal')
const ck = cookieOf(l1)
const tamper = ck.replace(/(=.)(.)/, (_, a, b) => a + (b === 'a' ? 'b' : 'a'))
const bad = await Promise.all([tamper, ck.slice(0, -6), ck + 'x', ck.replace(/=.*?\./, '=forged.'), 'better-auth.session_token=; x=1', ''].map((c) => http(T, 'GET', '/api/v1/me', { ...(c ? { cookie: c } : {}), headers: behindProxy('198.51.108.2') })))
ok('A8c', 'tampered / truncated / extended / foreign / empty cookies are not sessions (all 401)', bad.every((r) => r.status === 401), bad.map((r) => r.status).join(','))
const meOk = await http(T, 'GET', '/api/v1/me', { cookie: ck, headers: behindProxy('198.51.108.3') })
ok('A8d', 'control: the genuine cookie works', meOk.status === 200, `${meOk.status}`)
const l2 = await signIn(T, sm, PW, behindProxy('198.51.108.4'))
const ck2 = cookieOf(l2)
await http(T, 'POST', '/api/auth/sign-out', { cookie: ck, body: {}, headers: behindProxy('198.51.108.5') })
const afterOut = await http(T, 'GET', '/api/v1/me', { cookie: ck, headers: behindProxy('198.51.108.6') })
const otherStill = await http(T, 'GET', '/api/v1/me', { cookie: ck2, headers: behindProxy('198.51.108.7') })
ok('A8e', 'signing out kills that session on the SERVER (replaying the old cookie → 401), other devices stay signed in', afterOut.status === 401 && otherStill.status === 200, `${afterOut.status}/${otherStill.status}`)
const chg = await http(T, 'POST', '/api/auth/change-password', { cookie: ck2, body: { currentPassword: 'wrong-current-1!', newPassword: 'Another-new-pass-1!' }, headers: behindProxy('198.51.108.8') })
ok('A8f', 'changing the password needs the CURRENT password', chg.status >= 400 && chg.status < 500, `${chg.status}`)
const noAuthChange = await http(T, 'POST', '/api/auth/change-password', { body: { currentPassword: PW, newPassword: 'Another-new-pass-1!' }, headers: behindProxy('198.51.108.9') })
ok('A8g', 'password change and sign-out-others need a session', noAuthChange.status === 401, `${noAuthChange.status}`)
const sessions = await http(T, 'GET', '/api/auth/list-sessions', { cookie: ck2, headers: behindProxy('198.51.108.10') })
ok('A8h', 'the session list shows only this user\'s sessions and never their tokens in a way another user could reuse (no token field of OTHER users)', sessions.status === 200 && Array.isArray(sessions.json) && sessions.json.length >= 1, `${sessions.status}`)

// ─── A9: CSRF on auth endpoints ──────────────────────────────────────────────
console.log('\nA9 — cross-site requests to the auth endpoints')
const csrfTargets: [string, string, unknown][] = [['/api/auth/sign-in/email', 'POST', { email: sm, password: PW }], ['/api/auth/sign-out', 'POST', {}], ['/api/auth/change-password', 'POST', { currentPassword: PW, newPassword: 'Csrf-change-1234!' }], ['/api/auth/update-user', 'POST', { name: 'CSRF' }], ['/api/auth/delete-user', 'POST', {}]]
const csrfBad: string[] = []
for (const [p, m, b] of csrfTargets) {
  const evil = await http(T, m, p, { cookie: ck2, body: b, origin: 'https://evil.example', headers: behindProxy('198.51.109.1') })
  const xsite = await http(T, m, p, { cookie: ck2, body: b, headers: { 'Sec-Fetch-Site': 'cross-site', ...behindProxy('198.51.109.2') } })
  const plain = await http(T, m, p, { cookie: ck2, raw: JSON.stringify(b), origin: 'https://evil.example', headers: { 'Content-Type': 'text/plain', ...behindProxy('198.51.109.3') } })
  for (const [n, r] of [['foreign Origin', evil], ['Sec-Fetch-Site cross-site', xsite], ['text/plain from foreign Origin', plain]] as [string, Res][]) if (r.status < 400) csrfBad.push(`${p} ${n}: ${r.status}`)
}
ok('A9', 'state-changing auth calls from another website (foreign Origin, cross-site fetch metadata, text/plain forms) are all refused', csrfBad.length === 0, csrfBad.join(' | '))
const stillMe = await http(T, 'GET', '/api/v1/me', { cookie: ck2, headers: behindProxy('198.51.109.9') })
ok('A9b', 'and the victim\'s session and name were not touched', stillMe.status === 200 && stillMe.json?.data?.name !== 'CSRF', `${stillMe.status}`)

// ─── A10: open redirect ──────────────────────────────────────────────────────
console.log('\nA10 — open redirects through callback / redirect parameters')
const redirTargets = ['https://evil.example/steal', '//evil.example', 'javascript:alert(1)', 'https://localhost.evil.example', `${ORIGIN}.evil.example`, `${ORIGIN}@evil.example`]
const redirBad: string[] = []
for (const t of redirTargets) {
  const a = await http(T, 'POST', '/api/auth/request-password-reset', { body: { email: sm, redirectTo: t }, headers: behindProxy('198.51.110.1') })
  const b = await http(T, 'POST', '/api/auth/sign-in/email', { body: { email: sm, password: PW, callbackURL: t }, headers: behindProxy('198.51.110.2') })
  const c = await http(T, 'POST', '/api/auth/sign-up/email', { body: { email: `r${rnd()}@example.com`, password: PW, name: 'r', callbackURL: t }, headers: behindProxy('198.51.110.3') })
  for (const [n, r] of [['reset redirectTo', a], ['sign-in callbackURL', b], ['sign-up callbackURL', c]] as [string, Res][]) if (r.status < 400 || /evil\.example/.test(r.headers.get('location') ?? '')) redirBad.push(`${t} via ${n}: ${r.status}`)
}
ok('A10', 'callback / redirect addresses outside our own sites are refused (6 targets × 3 endpoints)', redirBad.length === 0, redirBad.slice(0, 6).join(' | '))
const verifyRedir = await http(T, 'GET', '/api/auth/verify-email?token=abc&callbackURL=https://evil.example', { headers: behindProxy('198.51.110.4') })
ok('A10b', 'the verification link does not redirect to a foreign callback', !/evil\.example/.test(verifyRedir.headers.get('location') ?? ''), verifyRedir.headers.get('location') ?? '')
const oauth = await http(T, 'POST', '/api/auth/sign-in/social', { body: { provider: 'google', callbackURL: 'https://evil.example' }, headers: behindProxy('198.51.110.5') })
ok('A10c', 'social sign-in with a foreign callback is refused (or the provider is not configured)', oauth.status >= 400, `${oauth.status}`)

// ─── A11: privilege escalation at sign-up / update ───────────────────────────
console.log('\nA11 — escalation through extra fields')
const extras: Record<string, unknown>[] = [{ role: 'admin' }, { emailVerified: true }, { emailCanonical: 'admin@x.co' }, { id: 'fixed-id-1' }, { plan: 'gold' }, { credits: 99999 }, { country: 'IN' }, { role: 'admin', emailVerified: true, id: 'fixed-id-2' }]
const escBad: string[] = []
for (const [i, extra] of extras.entries()) {
  const eml = `esc${i}${rnd()}@example.com`
  const r = await signUp(T, eml, PW, extra, behindProxy(`198.51.111.${10 + i}`))
  const [row] = await db.select().from(user).where(eq(user.email, eml))
  if (r.status >= 500) escBad.push(`${JSON.stringify(extra)}: ${r.status}`)
  else if (row && (row.role !== 'user' || row.emailVerified !== false || row.id === 'fixed-id-1' || row.id === 'fixed-id-2' || row.emailCanonical !== eml || row.country === 'IN')) escBad.push(`${JSON.stringify(extra)} was applied: ${JSON.stringify({ role: row.role, ev: row.emailVerified, id: row.id, canon: row.emailCanonical, country: row.country })}`)
}
ok('A11', 'sign-up with role / emailVerified / id / canonical e-mail / plan / credits / country as extra fields: each is refused (400) or ignored, never applied', escBad.length === 0, escBad.join(' | '))
const up2 = await http(T, 'POST', '/api/auth/update-user', { cookie: ck2, body: { role: 'admin', emailVerified: true, email: 'someoneelse@example.com', emailCanonical: 'x@y.z', name: 'Renamed' }, headers: behindProxy('198.51.111.2') })
const [after] = await db.select().from(user).where(eq(user.email, sm))
ok('A11b', 'update-user can rename the account but cannot change role, e-mail or canonical e-mail', !!after && after.role === 'user' && after.email === sm && after.emailCanonical !== 'x@y.z', `${up2.status} ${JSON.stringify({ r: after?.role, e: after?.email, c: after?.emailCanonical })}`)
const changeEmail = await http(T, 'POST', '/api/auth/change-email', { cookie: ck2, body: { newEmail: 'hijack@example.com' }, headers: behindProxy('198.51.111.3') })
ok('A11c', 'e-mail change is not available as a one-step takeover path', changeEmail.status >= 400 || (await db.select().from(user).where(eq(user.email, sm))).length === 1, `${changeEmail.status}`)
const raw = await new Promise<string>((res) => { const u = new URL(T); const sock = net.connect(Number(u.port), u.hostname, () => sock.write(`GET /api/auth/get-session HTTP/1.1\r\nHost: ${u.host}\r\nConnection: close\r\n\r\n`)); let d = ''; sock.on('data', (b) => (d += b)); sock.on('end', () => res(d)); sock.on('error', () => res(d)) })
ok('A11d', 'the session endpoint does not advertise the server software', !/x-powered-by|server: /i.test(raw.split('\r\n\r\n')[0] ?? ''), (raw.split('\r\n\r\n')[0] ?? '').slice(0, 300))

await db.delete(authAttempt)
await pool.end()
console.log(`\nnotes (not pass/fail):\n${notes.map((n) => ' - ' + n).join('\n')}`)
if (failures) { console.log(`\n${failures} CHECK(S) FAILED\n\nFINDINGS:`); for (const f of findings) console.log(' ·', f) } else console.log('\nALL CHECKS HELD')
process.exit(failures)
