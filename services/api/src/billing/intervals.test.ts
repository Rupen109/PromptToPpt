import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../db/index.ts'
import { creditBalance, generationJob, planPrice, subscription } from '../db/schema.ts'
import { rid, signUp } from '../test-utils.ts'
import { reserveCredits } from './credits.ts'
import { addMonthsUtc, getEntitlements, periodFor } from './entitlements.ts'
import { applySubscription } from './subscriptions.ts'
import type { RzpSubscription } from './razorpay.ts'

/**
 * Monthly and annual plans, end to end through the same code the Razorpay webhook uses: what a customer gets (credits, limits, features, access dates) must be the same
 * every month for both intervals; only the price and the billing date differ. An annual customer paid for 12 months and must get 12 monthly allowances.
 */
const DAY = 86400
const PLAN_IDS: Record<string, string> = { 'pro-INR-month': 'plan_iv_pro_m', 'pro-INR-year': 'plan_iv_pro_y', 'gold-INR-month': 'plan_iv_gold_m', 'gold-INR-year': 'plan_iv_gold_y', 'premium-INR-month': 'plan_iv_prem_m', 'premium-INR-year': 'plan_iv_prem_y' }
const CREDITS = { pro: 900, gold: 2000, premium: 3700 } as const
type P = keyof typeof CREDITS

beforeAll(async () => { for (const [id, pid] of Object.entries(PLAN_IDS)) await db.update(planPrice).set({ providerPriceId: pid, providerAmountMinor: sql`amount_minor` }).where(eq(planPrice.id, id)) })
afterAll(async () => { await db.update(planPrice).set({ providerPriceId: null }) })

const rzp = (userId: string, planId: P, interval: 'month' | 'year', start: Date, end: Date, o: Partial<RzpSubscription> = {}): RzpSubscription => ({
  id: `sub_${rid()}`, plan_id: PLAN_IDS[`${planId}-INR-${interval}`]!, status: 'active', current_start: Math.floor(start.getTime() / 1000), current_end: Math.floor(end.getTime() / 1000),
  notes: { userId, planId, interval, currency: 'INR' }, ...o,
})
/** Razorpay sends whole seconds: a start time with milliseconds would never match what the webhook stores. */
const whole = () => new Date(Math.floor(Date.now() / 1000) * 1000)
const at = (base: Date, days: number) => new Date(base.getTime() + days * DAY * 1000)
const bal = async (userId: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, userId)))[0]!.balance

describe('periodFor: the window credits and monthly limits are measured over', () => {
  const start = new Date('2026-01-31T10:00:00Z')
  const year = { currentPeriodStart: start, currentPeriodEnd: new Date('2027-01-31T10:00:00Z'), interval: 'year' }

  it('a yearly subscription gets one window per month, the first starting when the year starts; keys are stable inside a window and new in the next', () => {
    const w0 = periodFor(year, new Date('2026-02-10T00:00:00Z'))
    const w0b = periodFor(year, new Date('2026-02-27T23:59:59Z'))
    const w1 = periodFor(year, new Date('2026-02-28T10:00:00Z'))
    expect(w0.key).toBe(start.toISOString()); expect(w0b.key).toBe(w0.key); expect(w0.start).toEqual(start)
    expect(w1.key).toBe(`${start.toISOString()}#1`); expect(w1.start.toISOString()).toBe('2026-02-28T10:00:00.000Z') // Jan 31 + 1 month = the last day of February
    expect(w0.end).toEqual(w1.start)
    expect(periodFor(year, new Date('2026-03-31T10:00:00Z')).key).toBe(`${start.toISOString()}#2`) // March has 31 days: back on the 31st (anchored on the start day, not drifting to the 28th)
  })

  it('twelve windows in a year, the last one ends exactly when the year ends, and no thirteenth', () => {
    const keys = new Set<string>()
    for (let m = 0; m < 12; m++) keys.add(periodFor(year, addMonthsUtc(start, m)).key)
    expect(keys.size).toBe(12)
    const last = periodFor(year, new Date('2027-01-30T00:00:00Z'))
    expect(last.key).toBe(`${start.toISOString()}#11`); expect(last.end).toEqual(year.currentPeriodEnd)
  })

  it('a monthly subscription is its billing period, Starter is the calendar month — both unchanged', () => {
    const m = { currentPeriodStart: start, currentPeriodEnd: new Date('2026-03-03T10:00:00Z'), interval: 'month' }
    expect(periodFor(m, new Date('2026-02-20T00:00:00Z'))).toEqual({ key: start.toISOString(), start, end: m.currentPeriodEnd })
    expect(periodFor(null, new Date('2026-02-20T00:00:00Z')).key).toBe('2026-02')
  })
})

describe.each(['pro', 'gold', 'premium'] as const)('%s: monthly and annual give the customer the same thing every month', (planId) => {
  it('MONTHLY: credits on day 1; no top-up mid-period; the renewal resets to the allowance (no roll-over); access ends with the period when not renewed', async () => {
    const u = await signUp('iv'); const t0 = whole()
    await applySubscription(rzp(u.id, planId, 'month', t0, at(t0, 30)), { paidConfirmed: true, now: t0 })
    const e0 = await getEntitlements(u.id, t0)
    expect(e0.plan.id).toBe(planId); expect(e0.credits.balance).toBe(CREDITS[planId]); expect(e0.features.watermark).toBe(false)
    await reserveCredits(u.id, 300, 'job', `a-${rid()}`)
    expect((await getEntitlements(u.id, at(t0, 15))).credits.balance).toBe(CREDITS[planId] - 300) // nothing is added in the middle
    // Razorpay charges again: the same subscription moves to the next period
    await applySubscription(rzp(u.id, planId, 'month', at(t0, 30), at(t0, 60), { id: (await db.select().from(subscription).where(eq(subscription.userId, u.id)))[0]!.providerRef! }), { paidConfirmed: true, now: at(t0, 30) })
    const e1 = await getEntitlements(u.id, at(t0, 31))
    expect(e1.credits.balance).toBe(CREDITS[planId]) // reset, not 300 + allowance
    expect(e1.credits.resetsAt).toBe(at(t0, 60).toISOString().replace(/\.\d+Z$/, '.000Z'))
    expect((await getEntitlements(u.id, at(t0, 61))).plan.id).toBe('starter') // not renewed: access ends with the period
  })

  it('ANNUAL: the same allowance EVERY month of the paid year (not one allowance for 12 months), the same features, access until the year ends', async () => {
    const u = await signUp('iv'); const t0 = whole(); const end = addMonthsUtc(t0, 12)
    await applySubscription(rzp(u.id, planId, 'year', t0, end), { paidConfirmed: true, now: t0 })
    const first = await getEntitlements(u.id, t0)
    expect(first.credits.balance).toBe(CREDITS[planId])
    const monthly = await signUp('iv'); await applySubscription(rzp(monthly.id, planId, 'month', t0, at(t0, 30)), { paidConfirmed: true, now: t0 })
    const m0 = await getEntitlements(monthly.id, t0)
    expect(first.features).toEqual(m0.features); expect(first.limits).toEqual(m0.limits); expect(first.plan).toEqual(m0.plan) // an annual plan is the same plan

    await reserveCredits(u.id, 500, 'job', `b-${rid()}`)
    expect((await getEntitlements(u.id, at(t0, 20))).credits.balance).toBe(CREDITS[planId] - 500) // inside month 1: nothing added
    for (const months of [1, 2, 5, 11]) {
      const now = at(addMonthsUtc(t0, months), 0.01) // just after month `months` begins
      const e = await getEntitlements(u.id, now)
      expect(e.plan.id).toBe(planId) // still on the plan
      expect(e.credits.balance, `credits in month ${months + 1}`).toBe(CREDITS[planId]) // a fresh allowance
      expect(e.credits.resetsAt).toBe(addMonthsUtc(t0, months + 1) < end ? addMonthsUtc(t0, months + 1).toISOString() : end.toISOString())
      await reserveCredits(u.id, 100, 'job', `c-${months}-${rid()}`) // spend a little so the next month's reset is visible
    }
    expect((await getEntitlements(u.id, at(end, 1))).plan.id).toBe('starter') // the paid year is over
  })

  it('ANNUAL: "per month" limits (presentations, Morph decks) count inside the current month, so they reset every month too', async () => {
    const u = await signUp('iv'); const t0 = whole(); const end = addMonthsUtc(t0, 12)
    await applySubscription(rzp(u.id, planId, 'year', t0, end), { paidConfirmed: true, now: t0 })
    await getEntitlements(u.id, t0)
    const when = at(t0, 5)
    await db.insert(generationJob).values(Array.from({ length: 3 }, () => ({ id: `iv-${rid()}-${rid()}`, userId: u.id, prompt: 'x', options: { morph: true }, idempotencyKey: `iv-${rid()}-${rid()}`, lane: 1, status: 'completed', createdAt: when })) as never)
    const inMonth1 = await getEntitlements(u.id, at(t0, 10))
    expect(inMonth1.usage.morphDecksThisPeriod).toBe(3)
    const inMonth2 = await getEntitlements(u.id, at(addMonthsUtc(t0, 1), 1))
    expect(inMonth2.usage.morphDecksThisPeriod).toBe(0) // last month's decks do not use up this month's allowance
  })

  it('cancelling keeps the plan until the end of what was paid for, for both intervals', async () => {
    for (const interval of ['month', 'year'] as const) {
      const u = await signUp('iv'); const t0 = whole(); const end = interval === 'year' ? addMonthsUtc(t0, 12) : at(t0, 30)
      await applySubscription(rzp(u.id, planId, interval, t0, end), { paidConfirmed: true, now: t0 })
      await db.update(subscription).set({ cancelAtPeriodEnd: true }).where(eq(subscription.userId, u.id))
      expect((await getEntitlements(u.id, at(end, -1))).plan.id, interval).toBe(planId)
      expect((await getEntitlements(u.id, at(end, 1))).plan.id, interval).toBe('starter')
    }
  })
})

describe('prices: annual is 20% under twelve monthly payments, for every plan and both currencies', () => {
  it('amounts in the catalogue', async () => {
    const rows = await db.select().from(planPrice).where(and(sql`${planPrice.planId} <> 'starter'`))
    for (const planId of ['pro', 'gold', 'premium']) for (const cur of ['INR', 'USD']) {
      const m = rows.find((r) => r.planId === planId && r.currency === cur && r.interval === 'month')!.amountMinor
      const y = rows.find((r) => r.planId === planId && r.currency === cur && r.interval === 'year')!.amountMinor
      expect(y, `${planId} ${cur}`).toBe(Math.round(m * 12 * 0.8))
    }
  })
})
