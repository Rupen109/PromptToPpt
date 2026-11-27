import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { AccessTier } from '@prompttoppt/validation'
import { db } from '../db/index.ts'
import { creditBalance, creditCost, creditLedger, plan } from '../db/schema.ts'
import { BillingError, GateError } from './errors.ts'
import type { Period } from './entitlements.ts'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type PlanRow = typeof plan.$inferSelect

export async function creditPrice(action: 'generate_slide' | 'ai_edit' | 'ai_write_slide' | 'image' | 'ask_deck' | 'web_research' | 'read_image' | 'read_media' | 'read_video', tier: AccessTier): Promise<number> {
  const [row] = await db.select().from(creditCost).where(and(eq(creditCost.action, action), eq(creditCost.tier, tier)))
  if (!row) throw new Error(`no credit price for ${action}/${tier}`)
  return row.credits
}

export async function estimateGeneration(tier: AccessTier, slides: number): Promise<number> {
  return slides * (await creditPrice('generate_slide', tier))
}

/** Locks the user's balance row (creating it if needed). All balance changes go through a transaction holding this lock. */
async function lockBalance(tx: Tx, userId: string) {
  await tx.insert(creditBalance).values({ userId, balance: 0, extra: 0, periodKey: '' }).onConflictDoNothing()
  const [row] = await tx.select().from(creditBalance).where(eq(creditBalance.userId, userId)).for('update')
  return row!
}

/**
 * Lazily grants the plan allowance when a new period starts (monthly for Starter, billing period for paid).
 * Idempotent: the grant has a unique key per (user, period), so concurrent requests grant exactly once.
 * Unused PLAN credits do not roll over: the balance is reset to the allowance. Credits the person BOUGHT (`extra`) are
 * never touched by a reset — they were paid for outside the period and stay until they are spent.
 */
export async function ensureAllowance(userId: string, p: Pick<PlanRow, 'monthlyCredits'>, period: Period): Promise<number> {
  return db.transaction(async (tx) => {
    const row = await lockBalance(tx, userId)
    if (row.periodKey === period.key) return row.balance + row.extra
    const target = p.monthlyCredits
    const [granted] = await tx
      .insert(creditLedger)
      .values({ id: nanoid(), userId, delta: target - row.balance, balanceAfter: target + row.extra, reason: 'plan_grant', refType: 'period', refId: period.key, idempotencyKey: `grant:${userId}:${period.key}` })
      .onConflictDoNothing()
      .returning({ id: creditLedger.id })
    if (!granted) return row.balance + row.extra
    await tx.update(creditBalance).set({ balance: target, periodKey: period.key, updatedAt: new Date() }).where(eq(creditBalance.userId, userId))
    return target + row.extra
  })
}

/**
 * Adds credits the person BOUGHT (a paid top-up). Idempotent per `ref` (the provider payment), so a webhook and the
 * browser's confirmation of the same payment can both call it and it still grants once.
 * Returns the spendable total afterwards.
 */
export async function grantExtraCredits(userId: string, credits: number, ref: string): Promise<number> {
  if (credits <= 0) throw new BillingError('PAYMENT_INVALID', 'Nothing to grant.', 400)
  return db.transaction(async (tx) => {
    const row = await lockBalance(tx, userId)
    const after = row.extra + credits
    const [done] = await tx
      .insert(creditLedger)
      .values({ id: nanoid(), userId, delta: credits, extraDelta: credits, balanceAfter: row.balance + after, reason: 'topup', refType: 'payment', refId: ref, idempotencyKey: `topup:${userId}:${ref}` })
      .onConflictDoNothing()
      .returning({ id: creditLedger.id })
    if (!done) return row.balance + row.extra // already granted for this payment
    await tx.update(creditBalance).set({ extra: after, updatedAt: new Date() }).where(eq(creditBalance.userId, userId))
    return row.balance + after
  })
}

/** What the person can spend right now, and where it comes from. */
export async function creditPots(userId: string): Promise<{ plan: number; extra: number; total: number }> {
  const [row] = await db.select().from(creditBalance).where(eq(creditBalance.userId, userId))
  const planPot = row?.balance ?? 0
  const extra = row?.extra ?? 0
  return { plan: planPot, extra, total: planPot + extra }
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
        return row.balance + row.extra // already charged for this ref
      }
      if (n >= 50) throw new BillingError('DUPLICATE_REQUEST', 'Too many retries of the same request.', 409)
    }
    const key = attemptKey(userId, refType, refId, n)
    const have = row.balance + row.extra
    if (have < amount) throw new GateError('INSUFFICIENT_CREDITS', `This needs ${amount} credits but you have ${have}.`, 402, { needed: amount, balance: have })
    // the plan's credits go first: they expire at the end of the period, the bought ones do not
    const fromPlan = Math.min(row.balance, amount)
    const fromExtra = amount - fromPlan
    const after = have - amount
    await tx.update(creditBalance).set({ balance: row.balance - fromPlan, extra: row.extra - fromExtra, updatedAt: new Date() }).where(eq(creditBalance.userId, userId))
    await tx.insert(creditLedger).values({ id: nanoid(), userId, delta: -amount, extraDelta: -fromExtra, balanceAfter: after, reason: 'reserve', refType, refId, idempotencyKey: key })
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
    const toExtra = -outstanding.extraDelta // what was taken from the bought pot goes back to it
    const toPlan = amount - toExtra
    const after = row.balance + row.extra + amount
    const [inserted] = await tx
      .insert(creditLedger)
      .values({ id: nanoid(), userId, delta: amount, extraDelta: toExtra, balanceAfter: after, reason: 'refund', refType, refId, idempotencyKey: refundKeyOf(outstanding.idempotencyKey!) })
      .onConflictDoNothing()
      .returning({ id: creditLedger.id })
    if (!inserted) return
    await tx.update(creditBalance).set({ balance: row.balance + toPlan, extra: row.extra + toExtra, updatedAt: new Date() }).where(eq(creditBalance.userId, userId))
  })
}

/** Zeroes both pots (refund / chargeback). Idempotent per `ref`. The credits it removes were granted by the payment that was returned. */
export async function clawbackCredits(userId: string, ref: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockBalance(tx, userId)
    const have = row.balance + row.extra
    if (have <= 0) return
    const [done] = await tx
      .insert(creditLedger)
      .values({ id: nanoid(), userId, delta: -have, extraDelta: -row.extra, balanceAfter: 0, reason: 'clawback', refType: 'payment', refId: ref, idempotencyKey: `clawback:${userId}:${ref}` })
      .onConflictDoNothing()
      .returning({ id: creditLedger.id })
    if (!done) return
    await tx.update(creditBalance).set({ balance: 0, extra: 0, updatedAt: new Date() }).where(eq(creditBalance.userId, userId))
  })
}

/**
 * Takes back the credits ONE top-up granted (its payment was refunded or disputed), never more than is left.
 * Idempotent per `ref`; the person keeps whatever they already spent, and their plan credits are untouched.
 */
export async function clawbackExtra(userId: string, credits: number, ref: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockBalance(tx, userId)
    const take = Math.min(row.extra, Math.max(0, credits))
    const [done] = await tx
      .insert(creditLedger)
      .values({ id: nanoid(), userId, delta: -take, extraDelta: -take, balanceAfter: row.balance + row.extra - take, reason: 'clawback', refType: 'topup', refId: ref, idempotencyKey: `clawback-topup:${userId}:${ref}` })
      .onConflictDoNothing()
      .returning({ id: creditLedger.id })
    if (!done || take === 0) return
    await tx.update(creditBalance).set({ extra: row.extra - take, updatedAt: new Date() }).where(eq(creditBalance.userId, userId))
  })
}
