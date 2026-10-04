import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { creditBalance } from '../db/schema.ts'
import { reserveCredits, refundCredits } from './credits.ts'
import { setPlan, signUp } from '../test-utils.ts'

const balance = async (id: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, id)))[0]?.balance ?? 0

describe('request-id replay is never free (security S1)', () => {
  it('a paid request id cannot be reused: the second reserve is rejected with 409 and charges nothing', async () => {
    const u = await signUp('replay')
    await setPlan(u.id, 'pro')
    await reserveCredits(u.id, 0, 'x', 'warm') // no-op: makes sure nothing else is needed
    await db.insert(creditBalance).values({ userId: u.id, balance: 50, periodKey: 'p' }).onConflictDoUpdate({ target: creditBalance.userId, set: { balance: 50, periodKey: 'p' } })
    await reserveCredits(u.id, 5, 'ai_edit', 'req-1', { strict: true })
    expect(await balance(u.id)).toBe(45)
    await expect(reserveCredits(u.id, 5, 'ai_edit', 'req-1', { strict: true })).rejects.toMatchObject({ code: 'DUPLICATE_REQUEST', status: 409 })
    expect(await balance(u.id)).toBe(45)
  })
  it('parallel replays: exactly one is charged, the rest are rejected', async () => {
    const u = await signUp('replay')
    await db.insert(creditBalance).values({ userId: u.id, balance: 50, periodKey: 'p' }).onConflictDoUpdate({ target: creditBalance.userId, set: { balance: 50, periodKey: 'p' } })
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => reserveCredits(u.id, 5, 'ai_assist', 'same-id', { strict: true })))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await balance(u.id)).toBe(45)
  })
  it('refund-then-retry with the same id is charged again (the safety-blocked-then-real-prompt trick gains nothing)', async () => {
    const u = await signUp('replay')
    await db.insert(creditBalance).values({ userId: u.id, balance: 50, periodKey: 'p' }).onConflictDoUpdate({ target: creditBalance.userId, set: { balance: 50, periodKey: 'p' } })
    await reserveCredits(u.id, 5, 'image', 'img-1', { strict: true })
    await refundCredits(u.id, 'image', 'img-1')
    expect(await balance(u.id)).toBe(50)
    await reserveCredits(u.id, 5, 'image', 'img-1', { strict: true }) // honest retry after a refund: charged
    expect(await balance(u.id)).toBe(45)
    await expect(reserveCredits(u.id, 5, 'image', 'img-1', { strict: true })).rejects.toMatchObject({ code: 'DUPLICATE_REQUEST' })
    await refundCredits(u.id, 'image', 'img-1')
    await refundCredits(u.id, 'image', 'img-1') // refunds are idempotent
    expect(await balance(u.id)).toBe(50)
  })
})
