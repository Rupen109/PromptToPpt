import { eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../db/index.ts'
import { aiUsageEvent, creditLedger, payment, planPrice, subscription, user } from '../db/schema.ts'
import { env } from '../env.ts'
import { api, json, signUp } from '../test-utils.ts'

/**
 * The test DB persists between runs and holds other tests' rows, so every figure is asserted inside a private
 * one-day window in the year 2000+ (random per run). Nothing else writes there, so sums are exact.
 */
const DAY = 864e5
const base = Date.UTC(2000, 0, 1) + Math.floor(Math.random() * 8000) * DAY
const from = new Date(base), to = new Date(base + DAY)
const at = (h: number) => new Date(base + h * 3600e3)
const q = (extra = '') => `from=${from.toISOString()}&to=${to.toISOString()}${extra}`
const EMPTY = `from=${new Date(Date.UTC(1990, 0, 1)).toISOString()}&to=${new Date(Date.UTC(1990, 0, 2)).toISOString()}`

type Who = { id: string; cookie: string }
let admin: Who, normal: Who, uA: Who, uB: Who, uC: Who, uD: Who
let emailA = ''
const get = async (path: string, c = admin.cookie) => json(await api(c, 'GET', path))
const created: string[] = []

const pay = (userId: string, o: Partial<typeof payment.$inferInsert>): typeof payment.$inferInsert => ({
  id: nanoid(), userId, provider: 'razorpay', providerPaymentId: `pay_${nanoid()}`, planId: 'pro', interval: 'month', currency: 'USD', amountMinor: 1000, status: 'captured', method: 'card', paidAt: at(1), ...o,
})
const ev = (userId: string | null, cost: string, o: Partial<typeof aiUsageEvent.$inferInsert> = {}): typeof aiUsageEvent.$inferInsert => ({
  id: nanoid(), userId, provider: 'openrouter', model: 'm', requestType: 'slide_content', latencyMs: 100, status: 'success', providerCostUsd: cost, environment: 'development', createdAt: at(2), ...o,
})
const sub = (userId: string, planId: string, o: Partial<typeof subscription.$inferInsert> = {}): typeof subscription.$inferInsert => ({
  id: nanoid(), userId, planId, status: 'active', currency: 'USD', interval: 'month', currentPeriodStart: at(0), currentPeriodEnd: new Date(Date.now() + 40 * DAY), provider: 'manual', createdAt: at(3), updatedAt: at(3), ...o,
})

async function mrrOf(currency: string) {
  const d = (await get('/admin/sales/summary')).data
  return (d.mrr as { currency: string; mrrMinor: number; activeSubscriptions: number }[]).find((m) => m.currency === currency) ?? { mrrMinor: 0, activeSubscriptions: 0 }
}
async function renewals() {
  const d = (await get('/admin/subscriptions/summary')).data
  return (d.renewals as { currency: string; next7: number; next30: number }[]).find((m) => m.currency === 'USD') ?? { next7: 0, next30: 0 }
}

beforeAll(async () => {
  const us = await Promise.all(['fin-adm', 'fin-usr', 'fin-a', 'fin-b', 'fin-c', 'fin-d'].map((p) => signUp(p)))
  ;[admin, normal, uA, uB, uC, uD] = us as [Who, Who, Who, Who, Who, Who]
  created.push(admin.id, normal.id, uA.id, uB.id, uC.id, uD.id)
  await db.update(user).set({ role: 'admin' }).where(eq(user.id, admin.id))
  await db.update(user).set({ createdAt: at(0) }).where(inArray(user.id, [uA.id, uB.id, uC.id, uD.id]))
  emailA = (await db.select({ e: user.email }).from(user).where(eq(user.id, uA.id)))[0]!.e
})
afterAll(async () => {
  await db.delete(user).where(inArray(user.id, created)) // cascades subscriptions; payments/ledgers are keyed by a window nobody else reads
})

describe('seeded fixtures', () => {
  it('seeds', async () => {
    const mrrUsdBefore = (await mrrOf('USD')).mrrMinor, mrrInrBefore = (await mrrOf('INR')).mrrMinor
    const r0 = await renewals()
    await db.insert(subscription).values([
      sub(uA.id, 'pro', { currentPeriodEnd: new Date(Date.now() + 3 * DAY) }), // renews in 3 days
      sub(uB.id, 'gold', { currency: 'INR', interval: 'year', cancelAtPeriodEnd: true, updatedAt: at(5) }), // active but set to cancel
      sub(uD.id, 'pro', { status: 'cancelled', createdAt: new Date(base - 10 * DAY), updatedAt: at(6) }), // existed before the window, cancelled in it
    ])
    await db.insert(payment).values([
      pay(uA.id, { amountMinor: 2000, paidAt: at(1), method: 'card' }),
      pay(uA.id, { amountMinor: 1000, paidAt: at(2), method: 'upi' }),
      pay(uA.id, { amountMinor: 500, status: 'refunded', paidAt: at(3) }),
      pay(uA.id, { amountMinor: 2000, status: 'failed', failureReason: 'card_declined', paidAt: at(4), method: 'card' }),
      pay(uB.id, { planId: 'gold', interval: 'year', currency: 'INR', amountMinor: 840000, paidAt: at(5), method: 'upi' }),
      pay(uC.id, { planId: 'pro', currency: 'INR', amountMinor: 5000, status: 'failed', failureReason: 'insufficient_funds', paidAt: at(6), method: 'upi' }),
    ])
    await db.insert(aiUsageEvent).values([
      ev(uA.id, '0.50'), ev(uA.id, '0.25', { imageCount: 1, requestType: 'image' }), ev(uB.id, '1.00'), ev(uC.id, '0.10'), ev(null, '0.05'),
    ])
    await db.insert(creditLedger).values([
      { id: nanoid(), userId: uA.id, delta: 100, balanceAfter: 100, reason: 'plan_grant', idempotencyKey: `k-${nanoid()}`, createdAt: at(1) },
      { id: nanoid(), userId: uA.id, delta: -30, balanceAfter: 70, reason: 'reserve', idempotencyKey: `k-${nanoid()}`, createdAt: at(2) },
      { id: nanoid(), userId: uA.id, delta: 10, balanceAfter: 80, reason: 'refund', idempotencyKey: `k-${nanoid()}`, createdAt: at(3) },
    ])
    // MRR is global (current state): assert only OUR contribution, using the seeded list prices
    const price = async (plan: string, cur: string, interval: string) => (await db.select().from(planPrice).where(eq(planPrice.planId, plan)).then((r) => r.find((p) => p.currency === cur && p.interval === interval)))?.amountMinor ?? 0
    expect((await mrrOf('USD')).mrrMinor - mrrUsdBefore).toBe(await price('pro', 'USD', 'month'))
    expect((await mrrOf('INR')).mrrMinor - mrrInrBefore).toBe(Math.round((await price('gold', 'INR', 'year')) / 12))
    const r1 = await renewals()
    expect(r1.next7 - r0.next7).toBe(1) // uA only; uB is cancelling, uD is cancelled
    expect(r1.next30 - r0.next30).toBe(1)
  })
})

describe('access control and validation', () => {
  it('anonymous → 401, normal user → 403 on every finance route', async () => {
    for (const p of ['/admin/sales/summary', '/admin/sales/timeseries', '/admin/sales/breakdown?by=plan', '/admin/sales/payments', '/admin/sales/top-customers', '/admin/subscriptions/summary', '/admin/subscriptions/timeseries', '/admin/subscriptions/list', '/admin/margin/summary', '/admin/margin/plans', '/admin/margin/top-users', '/admin/margin/timeseries']) {
      expect((await api(normal.cookie, 'GET', p)).status, p).toBe(403)
      expect((await api('', 'GET', p)).status, p).toBe(401)
    }
  })
  it('rejects out-of-range or unknown inputs', async () => {
    for (const p of ['/admin/sales/payments?limit=1000', '/admin/sales/payments?limit=0', '/admin/sales/payments?offset=-1', '/admin/sales/breakdown?by=password', '/admin/sales/timeseries?bucket=hour', '/admin/sales/summary?from=notadate', '/admin/subscriptions/list?status=zombie', '/admin/subscriptions/list?q=' + 'x'.repeat(101), '/admin/margin/top-users?limit=999', '/admin/sales/top-customers?limit=51']) {
      expect((await api(admin.cookie, 'GET', p)).status, p).toBe(400)
    }
  })
})

describe('sales', () => {
  it('summary: revenue per currency, refunds excluded, failure rate, ARPPU, AOV', async () => {
    const d = (await get(`/admin/sales/summary?${q()}`)).data
    const usd = d.currencies.find((c: any) => c.currency === 'USD'), inr = d.currencies.find((c: any) => c.currency === 'INR')
    expect(d.currencies).toHaveLength(2)
    expect(usd).toMatchObject({ grossMinor: 3000, refundsMinor: 500, netMinor: 2500, paymentCount: 2, failedCount: 1, payingCustomers: 1, arppuMinor: 3000, avgOrderMinor: 1500 })
    expect(usd.failureRate).toBeCloseTo(1 / 3, 6)
    expect(inr).toMatchObject({ grossMinor: 840000, refundsMinor: 0, paymentCount: 1, failedCount: 1, payingCustomers: 1, avgOrderMinor: 840000 })
    expect(inr.failureRate).toBeCloseTo(0.5, 6)
  })
  it('timeseries, breakdowns, payments and top customers', async () => {
    const ts = (await get(`/admin/sales/timeseries?${q()}`)).data
    expect(ts).toHaveLength(2)
    expect(ts.find((p: any) => p.currency === 'USD')).toMatchObject({ revenueMinor: 3000, payments: 2, refundsMinor: 500 })
    expect(ts.find((p: any) => p.currency === 'INR').revenueMinor).toBe(840000)

    const byPlan = (await get(`/admin/sales/breakdown?${q('&by=plan')}`)).data
    expect(byPlan).toContainEqual({ key: 'pro', currency: 'USD', revenueMinor: 3000, payments: 2, customers: 1 })
    expect(byPlan).toContainEqual({ key: 'gold', currency: 'INR', revenueMinor: 840000, payments: 1, customers: 1 })
    const byMethod = (await get(`/admin/sales/breakdown?${q('&by=method')}`)).data
    expect(byMethod.find((r: any) => r.key === 'card' && r.currency === 'USD').revenueMinor).toBe(2000)
    expect(byMethod.find((r: any) => r.key === 'upi' && r.currency === 'USD').revenueMinor).toBe(1000)
    expect((await get(`/admin/sales/breakdown?${q('&by=interval')}`)).data.find((r: any) => r.key === 'year').currency).toBe('INR')

    const page1 = (await get(`/admin/sales/payments?${q('&limit=4')}`)).data
    expect(page1.total).toBe(6)
    expect(page1.rows).toHaveLength(4)
    expect(page1.rows[0].paidAt >= page1.rows[1].paidAt).toBe(true) // newest first
    const page2 = (await get(`/admin/sales/payments?${q('&limit=4&offset=4')}`)).data
    expect(page2.rows).toHaveLength(2)
    const failed = (await get(`/admin/sales/payments?${q('&status=failed')}`)).data
    expect(failed.total).toBe(2)
    expect(failed.rows.map((r: any) => r.failureReason).sort()).toEqual(['card_declined', 'insufficient_funds'])
    expect(failed.rows.find((r: any) => r.userId === uA.id).email).toBe(emailA)

    const top = (await get(`/admin/sales/top-customers?${q()}`)).data
    expect(top).toHaveLength(2)
    expect(top.find((t: any) => t.currency === 'USD')).toMatchObject({ userId: uA.id, revenueMinor: 3000, payments: 2 })
  })
  it('empty range: no rows, nothing NaN', async () => {
    const d = (await get(`/admin/sales/summary?${EMPTY}`)).data
    expect(d.currencies).toEqual([])
    expect((await get(`/admin/sales/payments?${EMPTY}`)).data).toMatchObject({ total: 0, rows: [] })
    expect((await get(`/admin/sales/timeseries?${EMPTY}`)).data).toEqual([])
  })
})

describe('subscriptions', () => {
  it('summary: matrix, period counts, churn, conversion, paid/free', async () => {
    const d = (await get(`/admin/subscriptions/summary?${q()}`)).data
    expect(d.plans.find((p: any) => p.planId === 'pro').counts.active).toBeGreaterThanOrEqual(1)
    expect(d.plans.find((p: any) => p.planId === 'gold').counts.active).toBeGreaterThanOrEqual(1)
    expect(d.newSubscriptions).toBe(2) // uA, uB (uD was created before the window)
    expect(d.cancellations).toBe(2) // uB cancel-at-period-end + uD cancelled
    expect(d.cancelAtPeriodEnd).toBeGreaterThanOrEqual(1)
    expect(d.churn.churned).toBe(1)
    expect(d.churn.openingSubscriptions).toBeGreaterThanOrEqual(1)
    expect(d.churn.rate).toBeCloseTo(1 / d.churn.openingSubscriptions, 8)
    expect(d.conversion).toMatchObject({ signups: 4, converted: 2, rate: 0.5 })
    expect(d.users.paid + d.users.free).toBe(d.users.total)
    expect(d.users.paid).toBeGreaterThanOrEqual(2)
  })
  it('timeseries and searchable paginated list', async () => {
    const ts = (await get(`/admin/subscriptions/timeseries?${q()}`)).data
    expect(ts).toHaveLength(1)
    expect(ts[0]).toMatchObject({ created: 2, cancelled: 2 })

    const one = (await get(`/admin/subscriptions/list?q=${encodeURIComponent(emailA)}`)).data
    expect(one.total).toBe(1)
    expect(one.rows[0]).toMatchObject({ userId: uA.id, planId: 'pro', status: 'active', interval: 'month', currency: 'USD', cancelAtPeriodEnd: false, provider: 'manual' })
    expect((await get('/admin/subscriptions/list?q=%25')).data.total).toBe(0) // '%' is a literal, not a wildcard
    const cancelling = (await get(`/admin/subscriptions/list?q=fin-b&cancelling=true`)).data
    expect(cancelling.rows.some((r: any) => r.userId === uB.id)).toBe(true)
    const cancelled = (await get(`/admin/subscriptions/list?q=fin-d&status=cancelled&plan=pro&limit=1`)).data
    expect(cancelled.rows).toHaveLength(1)
    expect(cancelled.rows[0].userId).toBe(uD.id)
  })
  it('empty range: rates are null, not NaN', async () => {
    const d = (await get(`/admin/subscriptions/summary?${EMPTY}`)).data
    expect(d.conversion).toEqual({ signups: 0, converted: 0, rate: null })
    expect(d.churn.rate).toBeNull()
    expect(d.newSubscriptions).toBe(0)
    expect((await get(`/admin/subscriptions/timeseries?${EMPTY}`)).data).toEqual([])
  })
})

describe('margin', () => {
  const FX = env.INR_PER_USD
  it('summary joins revenue (USD-converted) and AI cost without double counting images', async () => {
    const d = (await get(`/admin/margin/summary?${q()}`)).data
    const revenue = 30 + 8400 / FX
    expect(d.fx.inrPerUsd).toBe(FX)
    expect(d.aiCostUsd).toBeCloseTo(1.9, 6)
    expect(d.aiCalls).toBe(5)
    expect(d.imageCostUsd).toBeCloseTo(0.25, 6) // already inside aiCostUsd
    expect(d.images).toBe(1)
    expect(d.revenueUsd).toBeCloseTo(revenue, 6)
    expect(d.refundsUsd).toBeCloseTo(5, 6)
    expect(d.netRevenueUsd).toBeCloseTo(revenue - 5, 6)
    expect(d.grossMarginUsd).toBeCloseTo(revenue - 5 - 1.9, 6)
    expect(d.grossMarginPct).toBeCloseTo((revenue - 5 - 1.9) / (revenue - 5), 6)
    expect(d.paymentCount).toBe(3)
    expect(d.credits).toMatchObject({ granted: 100, consumed: 20, refunded: 10 })
    expect(d.credits.impliedCostPerCreditUsd).toBeCloseTo(1.9 / 20, 6)
    expect(d.sparse).toEqual({ noPayments: false, noUsage: false })
  })
  it('per plan, per-user cost, top users', async () => {
    const d = (await get(`/admin/margin/plans?${q()}`)).data
    const by = (id: string) => d.plans.find((p: any) => p.planId === id)
    expect(by('pro')).toMatchObject({ paid: true, payers: 1 })
    expect(by('pro').revenueUsd).toBeCloseTo(30, 6)
    expect(by('pro').aiCostUsd).toBeCloseTo(0.75, 6)
    expect(by('pro').marginPct).toBeCloseTo((30 - 0.75) / 30, 6)
    expect(by('gold').revenueUsd).toBeCloseTo(8400 / FX, 6)
    expect(by('gold').aiCostUsd).toBeCloseTo(1, 6)
    expect(by('starter')).toMatchObject({ paid: false, revenueUsd: 0, marginPct: null }) // no revenue: margin % is null, not NaN
    expect(by('starter').aiCostUsd).toBeCloseTo(0.1, 6)
    expect(d.perUser.paying.aiCostUsd).toBeCloseTo(1.75, 6)
    expect(d.perUser.free.aiCostUsd).toBeCloseTo(0.1, 6)
    expect(d.perUser.paying.costPerUserUsd).toBeGreaterThan(0)

    const top = (await get(`/admin/margin/top-users?${q('&limit=2')}`)).data
    expect(top.map((t: any) => t.userId)).toEqual([uB.id, uA.id])
    expect(top[0]).toMatchObject({ planId: 'gold', calls: 1 })
    expect(top[1]).toMatchObject({ planId: 'pro', calls: 2 })
    expect(top[1].revenueUsd).toBeCloseTo(30, 6)
    expect(top[1].marginUsd).toBeCloseTo(29.25, 6)
  })
  it('timeseries merges cost and revenue per bucket', async () => {
    const ts = (await get(`/admin/margin/timeseries?${q()}`)).data
    expect(ts).toHaveLength(1)
    expect(ts[0].aiCostUsd).toBeCloseTo(1.9, 6)
    expect(ts[0].revenueUsd).toBeCloseTo(30 + 8400 / FX, 6)
  })
  it('empty range: zero totals, null ratios, flagged sparse', async () => {
    const d = (await get(`/admin/margin/summary?${EMPTY}`)).data
    expect(d).toMatchObject({ aiCostUsd: 0, revenueUsd: 0, grossMarginUsd: 0, grossMarginPct: null, costShareOfRevenue: null, sparse: { noPayments: true, noUsage: true } })
    expect(d.credits).toMatchObject({ granted: 0, consumed: 0, impliedCostPerCreditUsd: null, consumedShareOfGranted: null })
    const p = (await get(`/admin/margin/plans?${EMPTY}`)).data
    for (const row of p.plans) expect(row.marginPct).toBeNull()
    expect(p.perUser.paying.costPerActiveUserUsd).toBeNull()
    expect((await get(`/admin/margin/top-users?${EMPTY}`)).data).toEqual([])
    expect((await get(`/admin/margin/timeseries?${EMPTY}`)).data).toEqual([])
  })
})

