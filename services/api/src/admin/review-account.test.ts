import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { mailOutbox } from '../lib/mailer.ts'
import { user } from '../db/schema.ts'
import { origin, rid } from '../test-utils.ts'
import { upsertReviewAccount } from './review-account.ts'

const signIn = (email: string, password: string) =>
  app.request('/api/auth/sign-in/email', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ email, password }) })

describe('review account (an outside reviewer, e.g. Razorpay)', () => {
  it('is created verified, logs in with its password at once, and no e-mail is sent', async () => {
    const email = `reviewer-${rid()}@example.com`
    const before = mailOutbox.length
    const r = await upsertReviewAccount(email, 'Review-pass-123!')
    expect(r.created).toBe(true)
    const res = await signIn(email, 'Review-pass-123!')
    expect(res.status).toBe(200)
    expect(res.headers.getSetCookie().join(';')).toMatch(/session_token=/)
    const [u] = await db.select().from(user).where(eq(user.email, email))
    expect(u).toMatchObject({ emailVerified: true, role: 'user', persona: 'other' })
    expect(mailOutbox.length).toBe(before) // nothing goes to a mailbox nobody may be reading
  })

  it('running it again only resets the password: the old one stops working, the new one works, still one account', async () => {
    const email = `reviewer-${rid()}@example.com`
    const first = await upsertReviewAccount(email, 'First-password-1')
    const again = await upsertReviewAccount(email.toUpperCase(), 'Second-password-2')
    expect(again).toEqual({ id: first.id, created: false })
    expect((await signIn(email, 'First-password-1')).status).toBe(401)
    expect((await signIn(email, 'Second-password-2')).status).toBe(200)
    expect(await db.select().from(user).where(eq(user.email, email))).toHaveLength(1)
  })

  it('refuses a password the sign-in system would refuse, and a non-address', async () => {
    await expect(upsertReviewAccount(`reviewer-${rid()}@example.com`, 'short')).rejects.toThrow(/at least 10 characters/)
    await expect(upsertReviewAccount('not-an-address', 'Long-enough-pass-1')).rejects.toThrow(/not an e-mail address/)
  })
})
