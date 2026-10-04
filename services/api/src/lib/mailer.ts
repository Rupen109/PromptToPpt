import { env, isProd } from '../env.ts'

/**
 * Transactional email (verification, password reset) through Resend's HTTPS API. Without a key (local dev / tests) the message is
 * printed to the console so the flow can still be completed by hand; production refuses to boot without a key (see env.ts).
 */
export interface Mail { to: string; subject: string; text: string; html?: string }
export type Mailer = (m: Mail) => Promise<void>

export const mailOutbox: Mail[] = [] // inspected by tests

export const sendMail: Mailer = async (m) => {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    if (isProd) throw new Error('mailer not configured')
    mailOutbox.push(m)
    if (env.NODE_ENV !== 'test') console.log(`[mail → ${m.to}] ${m.subject}\n${m.text}`)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [m.to], subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`mail provider answered ${res.status}`)
}
