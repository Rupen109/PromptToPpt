import { appendFileSync, mkdirSync, statSync, truncateSync } from 'node:fs'
import { resolve } from 'node:path'
import { env, isProd } from '../env.ts'

/**
 * Transactional email (verification, password reset, invitations, shared links) through Brevo's or Resend's HTTPS API (whichever key is set;
 * Brevo wins if both are). Without a key (local dev / tests) the message is printed to the console so the flow can still be completed by hand;
 * production refuses to boot without a key (see env.ts).
 */
export interface Mail { to: string; subject: string; text: string; html?: string }
export type Mailer = (m: Mail) => Promise<void>

export const mailOutbox: Mail[] = [] // inspected by tests

/** `Name <a@b.com>` → { name, email }; a bare address has no name. */
export function parseFrom(from: string): { name?: string; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from)
  return m ? { ...(m[1]!.trim() ? { name: m[1]!.trim() } : {}), email: m[2]!.trim() } : { email: from.trim() }
}

/**
 * Domains reserved for examples and tests (RFC 2606 / 6761): they can never receive mail, so nothing is sent to them. Test accounts use
 * them everywhere; sending would only waste the daily quota and teach inboxes that our sender produces bounces.
 */
const RESERVED = /(^|\.)(example\.(com|net|org)|test|invalid|localhost|local)$/i
export const isReservedAddress = (to: string) => RESERVED.test(to.slice(to.lastIndexOf('@') + 1).trim())

/** Where mail goes in development, in tests, and for reserved addresses: the outbox (inspected by tests) and the console. */
const OUTBOX_FILE = resolve(process.cwd(), '.data/outbox.jsonl')
const keep = (m: Mail) => {
  mailOutbox.push(m)
  if (env.NODE_ENV === 'test') return
  console.log(`[mail → ${m.to}] ${m.subject}\n${m.text}`)
  if (env.NODE_ENV === 'development') {
    // local development only: the browser tests read the links out of this file (git-ignored; never written in production)
    try {
      mkdirSync(resolve(process.cwd(), '.data'), { recursive: true })
      try { if (statSync(OUTBOX_FILE).size > 2_000_000) truncateSync(OUTBOX_FILE, 0) } catch { /* no file yet */ }
      appendFileSync(OUTBOX_FILE, JSON.stringify({ at: new Date().toISOString(), to: m.to, subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) }) + '\n')
    } catch { /* a read-only disk must never break sign-up */ }
  }
}

export const sendMail: Mailer = async (m) => {
  if (env.NODE_ENV === 'test' || isReservedAddress(m.to)) return keep(m)
  return deliverMail(m)
}

/** The real hand-over to Brevo or Resend (tests call this directly with a stubbed network). */
export const deliverMail: Mailer = async (m) => {
  if (env.BREVO_API_KEY && env.EMAIL_FROM) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: parseFrom(env.EMAIL_FROM), to: [{ email: m.to }], subject: m.subject, textContent: m.text, ...(m.html ? { htmlContent: m.html } : {}) }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`mail provider answered ${res.status}`)
    return
  }
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    if (isProd) throw new Error('mailer not configured')
    return keep(m)
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [m.to], subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`mail provider answered ${res.status}`)
}
