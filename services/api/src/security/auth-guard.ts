import type { Context, MiddlewareHandler } from 'hono'
import { and, count, eq, gte, lt } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db/index.ts'
import { authAttempt, user } from '../db/schema.ts'
import { env } from '../env.ts'
import { clientIp } from '../middleware/rate-limit.ts'
import { canonicalEmail, isDisposableEmail } from './email.ts'

/**
 * Abuse protection in front of Better Auth, counted from the database (shared across API instances, survives restarts):
 *  · sign-up: per-IP per hour/day, per canonical email per day, disposable domains refused, alias duplicates refused, optional CAPTCHA
 *  · sign-in: per-email lockout after repeated failures (stops credential stuffing from many IPs), per-IP failure cap, CAPTCHA step-up
 *  · password reset / verification mails: per email and per IP (stops mail-bombing a victim)
 * Responses never reveal whether an account exists beyond what Better Auth already answers.
 */
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR

const limits = () => ({
  signupIpHour: env.AUTH_SIGNUPS_PER_IP_HOUR, signupIpDay: env.AUTH_SIGNUPS_PER_IP_DAY, signupEmailDay: 3,
  failsEmail: env.AUTH_SIGNIN_FAILS_PER_EMAIL, failsIp: env.AUTH_SIGNIN_FAILS_PER_IP, failWindow: 15 * MIN,
  resetEmailHour: env.AUTH_RESET_PER_EMAIL_HOUR, resetIpHour: env.AUTH_RESET_PER_IP_HOUR,
})

export async function recent(kind: string, by: 'ip' | 'subject', value: string, windowMs: number): Promise<number> {
  const col = by === 'ip' ? authAttempt.ip : authAttempt.subject
  const [row] = await db.select({ n: count() }).from(authAttempt).where(and(eq(authAttempt.kind, kind), eq(col, value), gte(authAttempt.createdAt, new Date(Date.now() - windowMs))))
  return row?.n ?? 0
}
export async function record(kind: string, ip: string, subject: string) {
  await db.insert(authAttempt).values({ id: nanoid(), kind, ip, subject })
  if (Math.random() < 0.02) void db.delete(authAttempt).where(lt(authAttempt.createdAt, new Date(Date.now() - 2 * DAY))).catch(() => {})
}

/**
 * Takes a place in the count BEFORE the checks run (and gives it back when the request is turned away or, for sign-in, succeeds). Counting first and recording
 * afterwards lets a burst of parallel requests all read "0 so far" and all pass: with this order the k-th request in a burst sees at least k rows, so no more
 * than the limit can ever get through, however many arrive at once.
 */
async function reserve(kind: string, ip: string, subject: string): Promise<string> {
  const id = nanoid()
  await db.insert(authAttempt).values({ id, kind, ip, subject })
  if (Math.random() < 0.02) void db.delete(authAttempt).where(lt(authAttempt.createdAt, new Date(Date.now() - 2 * DAY))).catch(() => {})
  return id
}
const release = (id: string) => db.delete(authAttempt).where(eq(authAttempt.id, id)).then(() => undefined, () => undefined)

const tooMany = (c: Context, seconds: number, message = 'Too many attempts. Please try again later.') => {
  c.header('Retry-After', String(Math.max(1, Math.ceil(seconds))))
  return c.json({ code: 'TOO_MANY_REQUESTS', message }, 429)
}

export type CaptchaVerifier = (token: string | undefined, ip: string) => Promise<boolean>
/** Cloudflare Turnstile. Only enforced when TURNSTILE_SECRET_KEY is configured. */
export const verifyTurnstile: CaptchaVerifier = async (token, ip) => {
  if (!env.TURNSTILE_SECRET_KEY) return true
  if (!token || token.length > 2048) return false
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }), signal: AbortSignal.timeout(5000),
    })
    return ((await res.json()) as { success?: boolean }).success === true
  } catch {
    return false // fail closed: if the challenge cannot be verified, the sign-up does not proceed
  }
}
let captcha: CaptchaVerifier = verifyTurnstile
export const setCaptchaVerifier = (v: CaptchaVerifier) => { captcha = v }
const captchaRequired = () => !!env.TURNSTILE_SECRET_KEY || captcha !== verifyTurnstile

/**
 * Reads the email from the JSON body, then hands Better Auth a FRESH request carrying the same body (reading a body twice, or via a
 * tee'd clone under load, can leave the downstream handler with an unusable stream).
 */
const emailOf = async (c: Context): Promise<string> => {
  let text = ''
  try {
    const raw = c.req.raw
    text = await raw.text()
    c.req.raw = new Request(raw.url, { method: raw.method, headers: raw.headers, body: text })
    const body = JSON.parse(text) as { email?: unknown }
    return typeof body.email === 'string' && body.email.length <= 320 ? body.email : ''
  } catch {
    return ''
  }
}

export const authGuard: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== 'POST') return next()
  const path = new URL(c.req.url).pathname
  const L = limits()
  const ip = clientIp(c)

  if (path === '/api/auth/sign-up/email') {
    const email = await emailOf(c)
    if (!email.includes('@')) return next() // Better Auth answers the validation error
    const canon = canonicalEmail(email)
    if (!env.ALLOW_DISPOSABLE_EMAILS && isDisposableEmail(email, env.EXTRA_BLOCKED_EMAIL_DOMAINS)) {
      return c.json({ code: 'INVALID_EMAIL_DOMAIN', message: 'Please sign up with a permanent email address.' }, 422)
    }
    const slot = await reserve('signup', ip, canon)
    const [h, d, e] = await Promise.all([recent('signup', 'ip', ip, HOUR), recent('signup', 'ip', ip, DAY), recent('signup', 'subject', canon, DAY)]) // each includes this request
    if (h > L.signupIpHour) { await release(slot); return tooMany(c, 3600, 'Too many sign-ups from this network. Please try again in an hour.') }
    if (d > L.signupIpDay) { await release(slot); return tooMany(c, 86400, 'Too many sign-ups from this network. Please try again tomorrow.') }
    if (e > L.signupEmailDay) { await release(slot); return tooMany(c, 86400) }
    if (captchaRequired() && !(await captcha(c.req.header('x-turnstile-token'), ip))) { await release(slot); return c.json({ code: 'CAPTCHA_FAILED', message: 'Please complete the security check and try again.' }, 400) }
    const [dup] = await db.select({ id: user.id }).from(user).where(eq(user.emailCanonical, canon)).limit(1)
    if (dup) return c.json({ code: 'USER_ALREADY_EXISTS', message: 'User already exists. Use another email.' }, 422) // same wording Better Auth uses: no new oracle
    return next()
  }

  if (path === '/api/auth/sign-in/email') {
    const email = await emailOf(c)
    const canon = email ? canonicalEmail(email) : ''
    // every attempt counts as a failure from the moment it starts (so a parallel burst of guesses cannot all slip in before the first is counted) and is given back if it succeeds
    const slot = await reserve('signin_fail', ip, canon)
    const [fe, fi] = await Promise.all([canon ? recent('signin_fail', 'subject', canon, L.failWindow) : Promise.resolve(1), recent('signin_fail', 'ip', ip, L.failWindow)]) // each includes this attempt
    if (fe > L.failsEmail) { await release(slot); return tooMany(c, L.failWindow / 1000, 'Too many failed attempts for this account. Try again in 15 minutes, or reset your password.') }
    if (fi > L.failsIp) { await release(slot); return tooMany(c, L.failWindow / 1000) }
    if (captchaRequired() && (fe > 3 || fi > 10) && !(await captcha(c.req.header('x-turnstile-token'), ip))) { await release(slot); return c.json({ code: 'CAPTCHA_FAILED', message: 'Please complete the security check and try again.' }, 400) }
    await next()
    if (c.res.status < 400) await release(slot)
    return
  }

  if (/^\/api\/auth\/(request-password-reset|forget-password|send-verification-email)$/.test(path)) {
    const email = await emailOf(c)
    const canon = email ? canonicalEmail(email) : ''
    const slot = await reserve('reset', ip, canon)
    const [pe, pi] = await Promise.all([canon ? recent('reset', 'subject', canon, HOUR) : Promise.resolve(0), recent('reset', 'ip', ip, HOUR)]) // each includes this request
    if (pe > L.resetEmailHour || pi > L.resetIpHour) { await release(slot); return tooMany(c, 3600, 'Too many requests. Please try again later.') }
    return next()
  }
  return next()
}
