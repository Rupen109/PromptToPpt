import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { AccessTier } from '@prompttoppt/validation'
import { db } from '../db/index.ts'
import { creditBalance, creditCost, creditLedger, plan } from '../db/schema.ts'
import { BillingError, GateError } from './errors.ts'
import type { Period } from './entitlements.ts'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type PlanRow = typeof plan.$inferSelect

export async function creditPrice(action: 'generate_slide' | 'ai_edit' | 'image', tier: AccessTier): Promise<number> {
  const [row] = await db.select().from(creditCost).where(and(eq(creditCost.action, action), eq(creditCost.tier, tier)))
  if (!row) throw new Error(`no credit price for ${action}/${tier}`)
  return row.credits
}

export async function estimateGeneration(tier: AccessTier, slides: number): Promise<number> {
  return slides * (await creditPrice('generate_slide', tier))
}

/** Locks the user's balance row (creating it if needed). All balance changes go through a transaction holding this lock. */
async function lockBalance(tx: Tx, userId: string) {
  await tx.insert(creditBalance).values({ userId, balance: 0, periodKey: '' }).onConflictDoNothing()
  const [row] = await tx.select().from(creditBalance).where(eq(creditBalance.userId, userId)).for('update')
  return row!
}

/**
 * Lazily grants the plan allowance when a new period starts (monthly for Starter, billing period for paid).
 * Idempotent: the grant has a unique key per (user, period), so concurrent requests grant exactly once.
 * Unused credits do not roll over: the balance is reset to the allowance.
 */
export async function ensureAllowance(userId: string, p: Pick<PlanRow, 'monthlyCredits'>, period: Period): Promise<number> {
  return db.transaction(async (tx) => {
    const row = await lockBalance(tx, userId)
    if (row.periodKey === period.key) return row.balance
    const target = p.monthlyCredits
    const [granted] = await tx
      .insert(creditLedger)
      .values({ id: nanoid(), userId, delta: target - row.balance, balanceAfter: target, reason: 'plan_grant', refType: 'period', refId: period.key, idempotencyKey: `grant:${userId}:${period.key}` })
      .onConflictDoNothing()
      .returning({ id: creditLedger.id })
    if (!granted) return row.balance
    await tx.update(creditBalance).set({ balance: target, periodKey: period.key, updatedAt: new Date() }).where(eq(creditBalance.userId, userId))
    return target
  })
}

/**
 * Attempt keys for one (refType, refId). Attempt 0 is `reserve:<type>:<id>`; after a refund the same ref may be tried again as attempt 1
 * (`…#1`), and so on. This is what makes a request id usable exactly once while it is paid for: a replay is never free,
 * and a refunded request can still be retried honestly (it is simply charged again).
 */
// the user id is part of the key: request ids are client-chosen, so two users must never share (or be able to burn) each other's keys
const attemptKey = (userId: string, refType: string, refId: string, n: number) => `reserve:${userId}:${refType}:${refId}${n ? `#${n}` : ''}`
const refundKeyOf = (reserveKey: string) => reserveKey.replace(/^reserve:/, 'refund:')

/**
 * Atomically takes `amount` credits for (refType, refId). Safe to retry: the same ref is only ever charged once per attempt.
 * `strict` (used by every route that runs the AI per request id): replaying an id that is already paid for and not refunded
 * is rejected with 409 instead of silently running the model again for free.
 */
export async function reserveCredits(userId: string, amount: number, refType: string, refId: string, opts: { strict?: boolean } = {}): Promise<number> {
  if (amount <= 0) return 0
  return db.transaction(async (tx) => {
    const row = await lockBalance(tx, userId)
    let n = 0
    for (;; n++) {
      const [reserved] = await tx.select({ id: creditLedger.id }).from(creditLedger).where(eq(creditLedger.idempotencyKey, attemptKey(userId, refType, refId, n)))
      if (!reserved) break
      const [refunded] = await tx.select({ id: creditLedger.id }).from(creditLedger).where(eq(creditLedger.idempotencyKey, refundKeyOf(attemptKey(userId, refType, refId, n))))
      if (!refunded) {
        if (opts.strict) throw new BillingError('DUPLICATE_REQUEST', 'This request was already processed. Start a new one.', 409)
        return row.balance // already charged for this ref
      }
      if (n >= 50) throw new BillingError('DUPLICATE_REQUEST', 'Too many retries of the same request.', 409)
    }
    const key = attemptKey(userId, refType, refId, n)
    if (row.balance < amount) throw new GateError('INSUFFICIENT_CREDITS', `This needs ${amount} credits but you have ${row.balance}.`, 402, { needed: amount, balance: row.balance })
    const after = row.balance - amount
    await tx.update(creditBalance).set({ balance: after, updatedAt: new Date() }).where(eq(creditBalance.userId, userId))
    await tx.insert(creditLedger).values({ id: nanoid(), userId, delta: -amount, balanceAfter: after, reason: 'reserve', refType, refId, idempotencyKey: key })
    return after
  })
}

/** Gives back what `reserveCredits` took for this ref's latest attempt (failed/cancelled work). Idempotent; a no-op if nothing is outstanding. */
export async function refundCredits(userId: string, refType: string, refId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockBalance(tx, userId)
    let outstanding: typeof creditLedger.$inferSelect | undefined
    for (let n = 0; n <= 50; n++) {
      const [reserved] = await tx.select().from(creditLedger).where(eq(creditLedger.idempotencyKey, attemptKey(userId, refType, refId, n)))
      if (!reserved) break
      const [refunded] = await tx.select({ id: creditLedger.id }).from(creditLedger).where(eq(creditLedger.idempotencyKey, refundKeyOf(reserved.idempotencyKey!)))
      if (!refunded) outstanding = reserved
    }
    if (!outstanding) return
    const amount = -outstanding.delta
    const after = row.balance + amount
    const [inserted] = await tx
      .insert(creditLedger)
      .values({ id: nanoid(), userId, delta: amount, balanceAfter: after, reason: 'refund', refType, refId, idempotencyKey: refundKeyOf(outstanding.idempotencyKey!) })
      .onConflictDoNothing()
      .returning({ id: creditLedger.id })
    if (!inserted) return
    await tx.update(creditBalance).set({ balance: after, updatedAt: new Date() }).where(eq(creditBalance.userId, userId))
  })
}

/** Zeroes the balance (refund / chargeback). Idempotent per `ref`. The credits it removes were granted by the payment that was returned. */
export async function clawbackCredits(userId: string, ref: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockBalance(tx, userId)
    if (row.balance <= 0) return
    const [done] = await tx
      .insert(creditLedger)
      .values({ id: nanoid(), userId, delta: -row.balance, balanceAfter: 0, reason: 'clawback', refType: 'payment', refId: ref, idempotencyKey: `clawback:${userId}:${ref}` })
      .onConflictDoNothing()
      .returning({ id: creditLedger.id })
    if (!done) return
    await tx.update(creditBalance).set({ balance: 0, updatedAt: new Date() }).where(eq(creditBalance.userId, userId))
  })
}
