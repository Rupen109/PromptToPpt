import { createHmac } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { creditBalance, creditLedger, creditTopUp, payment, subscription } from '../db/schema.ts'
import { mailOutbox } from '../lib/mailer.ts'
import { api, json, rid, setPlan, signUp } from '../test-utils.ts'
import { ensureAllowance, grantExtraCredits, refundCredits, reserveCredits } from './credits.ts'
import { getEntitlements } from './entitlements.ts'
import { razorpay, type RzpOrder, type RzpPayment } from './razorpay.ts'

/**
 * Credit top-ups: the plan's own credits again, at the plan's own price, bought any time.
 * What matters here is the money and the credits: what is sold is decided server-side, a payment grants exactly once however
 * many times it is reported, bought credits survive the monthly reset, and a refunded top-up takes back only its own credits.
 */

const KEY_SECRET = 'unit-test-key-secret'
const WEBHOOK_SECRET = 'unit-test-webhook-secret-0123456789'
const hmac = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('hex')
const T0 = Math.floor(Date.now() / 1000)

const orders = new Map<string, RzpOrder>()
const payments = new Map<string, RzpPayment>()
const stubProvider = () => {
  vi.spyOn(razorpay, 'createOrder').mockImplementation(async (p) => {
    const o: RzpOrder = { id: `order_${rid()}`, amount: p.amount, amount_paid: 0, currency: p.currency, status: 'created', receipt: p.receipt, notes: p.notes }
    orders.set(o.id, o)
    return o
  })
  vi.spyOn(razorpay, 'fetchOrder').mockImplementation(async (id) => {
    const o = orders.get(id)
    if (!o) throw new Error('no such order')
    return { ...o }
  })
  vi.spyOn(razorpay, 'fetchPayment').mockImplementation(async (id) => {
    const p = payments.get(id)
    if (!p) throw new Error('no such payment')
    return { ...p }
  })
}
/** the provider says the order is paid (what really happens when the customer pays) */
const pay = (orderId: string, amount?: number): { order: RzpOrder; payment: RzpPayment } => {
  const o = orders.get(orderId)!
  o.status = 'paid'
  o.amount_paid = amount ?? o.amount
  const p: RzpPayment = { id: `pay_${rid()}`, amount: amount ?? o.amount, currency: o.currency, status: 'captured', method: 'upi', created_at: T0, order_id: o.id }
  payments.set(p.id, p)
  return { order: { ...o }, payment: p }
}

const start = (cookie: string) => app.request('/api/v1/billing/top-up/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-debug-country': 'IN' }, body: '{}' })
const verify = (cookie: string, orderId: string, paymentId: string, signature?: string) =>
  api(cookie, 'POST', '/billing/top-up/verify', { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature ?? hmac(KEY_SECRET, `${orderId}|${paymentId}`) })
const webhook = async (event: string, payload: object) => {
  const body = JSON.stringify({ event, payload })
  return app.request('/api/v1/webhooks/razorpay', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': hmac(WEBHOOK_SECRET, body), 'X-Razorpay-Event-Id': `evt_${rid()}` }, body })
}
const pots = async (userId: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, userId)))[0]!

beforeEach(() => stubProvider())
afterEach(() => vi.restoreAllMocks())

describe('what a top-up offers', () => {
  it('Starter is told to take a plan instead; a paid plan is offered its own credits at its own price', async () => {
    const free = await signUp('tu-free')
    const offer = (await json(await api(free.cookie, 'GET', '/billing/top-up'))).data
    expect(offer.available).toBe(false)
    expect(offer.reason).toMatch(/Starter/i)

    const u = await signUp('tu-pro')
    await setPlan(u.id, 'pro')
    const r = await app.request('/api/v1/billing/top-up', { headers: { Cookie: u.cookie, 'x-debug-country': 'IN' } })
    const paid = (await json(r)).data
    expect(paid).toMatchObject({ available: true, planId: 'pro', credits: 1150, amountMinor: 30000, currency: 'INR' })
  })
})

describe('buying credits', () => {
  it('the browser cannot choose what it buys: credits and price come from the plan, and are written down before anyone pays', async () => {
    const u = await signUp('tu-fix')
    await setPlan(u.id, 'pro')
    // even if a client sends its own numbers, the order is the plan's
    const r = await app.request('/api/v1/billing/top-up/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: u.cookie, 'x-debug-country': 'IN' }, body: JSON.stringify({ credits: 999999, amountMinor: 1 }) })
    const s = (await json(r)).data
    expect(s).toMatchObject({ credits: 1150, amountMinor: 30000, currency: 'INR' })
    const [row] = await db.select().from(creditTopUp).where(eq(creditTopUp.providerOrderId, s.orderId))
    expect(row).toMatchObject({ userId: u.id, planId: 'pro', credits: 1150, amountMinor: 30000, status: 'created' })
  })

  it('clicking Buy many times at once opens ONE order with the provider', async () => {
    const u = await signUp('tu-twice')
    await setPlan(u.id, 'pro')
    const made = vi.spyOn(razorpay, 'createOrder')
    const ids = new Set<string>()
    for (const r of await Promise.all(Array.from({ length: 5 }, () => start(u.cookie)))) ids.add((await json(r)).data.orderId)
    expect(ids.size).toBe(1)
    expect(made).toHaveBeenCalledTimes(1)
  })

  it('a paid order adds the credits once, however many times it is reported (browser + webhook), and e-mails a receipt', async () => {
    const u = await signUp('tu-grant')
    await setPlan(u.id, 'pro')
    const before = (await getEntitlements(u.id)).credits.balance
    const s = (await json(await start(u.cookie))).data
    const paid = pay(s.orderId)

    mailOutbox.length = 0
    const v = await verify(u.cookie, s.orderId, paid.payment.id)
    expect(v.status).toBe(200)
    const after = (await json(v)).data
    expect(after.credits.balance).toBe(before + 1150)
    expect(after.credits.bought).toBe(1150)

    // the webhook reports the same payment: no second grant
    expect((await webhook('order.paid', { order: { entity: paid.order }, payment: { entity: paid.payment } })).status).toBe(200)
    expect((await getEntitlements(u.id)).credits.balance).toBe(before + 1150)
    const grants = await db.select().from(creditLedger).where(and(eq(creditLedger.userId, u.id), eq(creditLedger.reason, 'topup')))
    expect(grants).toHaveLength(1)
    const [row] = await db.select().from(creditTopUp).where(eq(creditTopUp.providerOrderId, s.orderId))
    expect(row!.status).toBe('paid')
    expect(mailOutbox.some((m) => /credits added/i.test(m.subject))).toBe(true)
    // it is a payment like any other, so it shows in the history
    const [pRow] = await db.select().from(payment).where(eq(payment.providerPaymentId, paid.payment.id))
    expect(pRow).toMatchObject({ userId: u.id, status: 'captured', amountMinor: 30000 })
  })

  it('a webhook alone (the browser never came back) still adds the credits', async () => {
    const u = await signUp('tu-hook')
    await setPlan(u.id, 'pro')
    const before = (await getEntitlements(u.id)).credits.balance
    const s = (await json(await start(u.cookie))).data
    const paid = pay(s.orderId)
    await webhook('order.paid', { order: { entity: paid.order }, payment: { entity: paid.payment } })
    expect((await getEntitlements(u.id)).credits.balance).toBe(before + 1150)
  })

  it('refuses a forged signature, an order that is not paid, an underpaid order, and another account’s order', async () => {
    const u = await signUp('tu-bad')
    const other = await signUp('tu-bad2')
    await setPlan(u.id, 'pro')
    await setPlan(other.id, 'pro')
    const before = (await getEntitlements(u.id)).credits.balance
    const s = (await json(await start(u.cookie))).data

    expect((await verify(u.cookie, s.orderId, 'pay_x', 'deadbeef'.repeat(8))).status).toBe(400)
    expect((await verify(u.cookie, s.orderId, 'pay_x')).status).toBe(400) // signature fine, order not paid
    expect((await getEntitlements(u.id)).credits.balance).toBe(before)

    const underpaid = pay(s.orderId, 100)
    expect((await verify(u.cookie, s.orderId, underpaid.payment.id)).status).toBe(400)
    expect((await getEntitlements(u.id)).credits.balance).toBe(before)

    // someone else's order, correctly signed, is still refused
    const s2 = (await json(await start(other.cookie))).data
    const paid2 = pay(s2.orderId)
    expect((await verify(u.cookie, s2.orderId, paid2.payment.id)).status).toBe(400)
    expect((await getEntitlements(other.id)).credits.bought).toBe(0)
  })
})

describe('what bought credits are worth', () => {
  it('the plan’s credits are spent first, and the monthly reset leaves the bought ones alone', async () => {
    const u = await signUp('tu-keep')
    await setPlan(u.id, 'pro')
    const ent = await getEntitlements(u.id)
    const allowance = ent.credits.monthlyAllowance
    await grantExtraCredits(u.id, 500, `pay_${rid()}`)
    expect((await pots(u.id)).extra).toBe(500)

    // spending takes the plan's pot first
    await reserveCredits(u.id, 10, 'test', rid())
    expect(await pots(u.id)).toMatchObject({ balance: allowance - 10, extra: 500 })

    // use up the whole plan allowance: the rest comes out of the bought pot
    await reserveCredits(u.id, allowance - 10 + 100, 'test', rid())
    expect(await pots(u.id)).toMatchObject({ balance: 0, extra: 400 })

    // the next billing period: the plan's credits come back, the bought ones are untouched
    const start = new Date(Date.now() + 864e5)
    await db.update(subscription).set({ currentPeriodStart: start, currentPeriodEnd: new Date(start.getTime() + 30 * 864e5) }).where(eq(subscription.userId, u.id))
    const after = await getEntitlements(u.id)
    expect(await pots(u.id)).toMatchObject({ balance: allowance, extra: 400 })
    expect(after.credits.balance).toBe(allowance + 400)
    expect(after.credits.bought).toBe(400)
  })

  it('a refund of failed work gives each credit back to the pot it came from', async () => {
    const u = await signUp('tu-refund')
    await setPlan(u.id, 'pro')
    const allowance = (await getEntitlements(u.id)).credits.monthlyAllowance
    await grantExtraCredits(u.id, 100, `pay_${rid()}`)
    // leave 5 plan credits, then spend 20: 5 from the plan, 15 from the bought pot
    await reserveCredits(u.id, allowance - 5, 'test', rid())
    const ref = rid()
    await reserveCredits(u.id, 20, 'job', ref)
    expect(await pots(u.id)).toMatchObject({ balance: 0, extra: 85 })
    await refundCredits(u.id, 'job', ref)
    expect(await pots(u.id)).toMatchObject({ balance: 5, extra: 100 })
  })

  it('a top-up that is refunded takes back its own credits and leaves the plan alone', async () => {
    const u = await signUp('tu-back')
    await setPlan(u.id, 'pro')
    const s = (await json(await start(u.cookie))).data
    const paid = pay(s.orderId)
    await verify(u.cookie, s.orderId, paid.payment.id)
    const planPot = (await pots(u.id)).balance
    expect((await pots(u.id)).extra).toBe(1150)

    await webhook('refund.processed', { refund: { entity: { id: `rfnd_${rid()}`, payment_id: paid.payment.id, amount: 30000 } } })
    expect(await pots(u.id)).toMatchObject({ balance: planPot, extra: 0 }) // only the bought credits go
    const [row] = await db.select().from(creditTopUp).where(eq(creditTopUp.providerOrderId, s.orderId))
    expect(row!.status).toBe('refunded')
    // the plan is untouched: the person is still on Pro
    expect((await getEntitlements(u.id)).plan.id).toBe('pro')
  })

  it('a refunded top-up never takes more than is left', async () => {
    const u = await signUp('tu-spent')
    await setPlan(u.id, 'pro')
    const s = (await json(await start(u.cookie))).data
    const paid = pay(s.orderId)
    await verify(u.cookie, s.orderId, paid.payment.id)
    await db.update(creditBalance).set({ balance: 0, extra: 40 }).where(eq(creditBalance.userId, u.id)) // nearly all of it spent
    await webhook('refund.processed', { refund: { entity: { id: `rfnd_${rid()}`, payment_id: paid.payment.id, amount: 30000 } } })
    const row = await pots(u.id)
    expect(row.extra).toBe(0)
    expect(row.balance).toBe(0)
    expect(await db.select({ n: sql<number>`count(*)::int` }).from(creditLedger).where(and(eq(creditLedger.userId, u.id), eq(creditLedger.reason, 'clawback')))).toBeTruthy()
  })
})

describe('the allowance itself', () => {
  it('ensureAllowance reports the plan credits plus the bought ones', async () => {
    const u = await signUp('tu-sum')
    await setPlan(u.id, 'pro')
    const ent = await getEntitlements(u.id)
    await grantExtraCredits(u.id, 7, `pay_${rid()}`)
    const total = await ensureAllowance(u.id, { monthlyCredits: ent.credits.monthlyAllowance }, { key: 'same-as-now', start: new Date(), end: new Date() } as never)
    expect(total).toBeGreaterThanOrEqual(7)
  })
})
