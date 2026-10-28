import { createHmac } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { payment, planPrice, subscription, webhookEvent } from '../db/schema.ts'
import { api, json, rid, signUp } from '../test-utils.ts'
import { getEntitlements } from './entitlements.ts'
import { razorpay, verifyCheckoutSignature, verifyWebhookSignature, type RzpPayment, type RzpSubscription } from './razorpay.ts'

const KEY_SECRET = 'unit-test-key-secret'
const WEBHOOK_SECRET = 'unit-test-webhook-secret-0123456789'
const hmac = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('hex')
const PLAN_IDS: Record<string, string> = { 'pro-INR-month': 'plan_pro_m', 'pro-INR-year': 'plan_pro_y', 'gold-INR-month': 'plan_gold_m', 'gold-INR-year': 'plan_gold_y' }

const T0 = Math.floor(Date.now() / 1000)
const DAY = 86400
const rzpSub = (o: Partial<RzpSubscription> & { userId: string; planId?: 'pro' | 'gold'; interval?: 'month' | 'year' }): RzpSubscription => {
  const planId = o.planId ?? 'pro'
  const interval = o.interval ?? 'month'
  return {
    id: o.id ?? `sub_${rid()}`, plan_id: PLAN_IDS[`${planId}-INR-${interval}`]!, status: o.status ?? 'active',
    current_start: o.current_start === undefined ? T0 : o.current_start, current_end: o.current_end === undefined ? T0 + 30 * DAY : o.current_end,
    notes: { userId: o.userId, planId, interval, currency: 'INR' },
  }
}
const rzpPay = (o: Partial<RzpPayment> = {}): RzpPayment => ({ id: `pay_${rid()}`, amount: 49900, currency: 'INR', status: 'captured', method: 'card', created_at: T0, ...o })

let eventN = 0
const webhook = async (event: string, payload: object, opts: { secret?: string; eventId?: string | null } = {}) => {
  const body = JSON.stringify({ event, payload })
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Razorpay-Signature': hmac(opts.secret ?? WEBHOOK_SECRET, body) }
  if (opts.eventId !== null) headers['X-Razorpay-Event-Id'] = opts.eventId ?? `evt_${rid()}_${eventN++}`
  return app.request('/api/v1/webhooks/razorpay', { method: 'POST', headers, body })
}
const subEvent = (event: string, s: RzpSubscription, p?: RzpPayment, opts?: Parameters<typeof webhook>[2]) => webhook(event, { subscription: { entity: s }, ...(p ? { payment: { entity: p } } : {}) }, opts)
const subRow = async (userId: string) => (await db.select().from(subscription).where(eq(subscription.userId, userId)))[0]

beforeAll(async () => {
  for (const [id, pid] of Object.entries(PLAN_IDS)) await db.update(planPrice).set({ providerPriceId: pid }).where(eq(planPrice.id, id))
})
afterAll(async () => {
  await db.update(planPrice).set({ providerPriceId: null })
})
afterEach(() => vi.restoreAllMocks())

describe('signature verification', () => {
  it('accepts only the exact HMAC and rejects tampering / wrong secret / empty', () => {
    const good = hmac(KEY_SECRET, 'pay_1|sub_1')
    expect(verifyCheckoutSignature('pay_1', 'sub_1', good)).toBe(true)
    expect(verifyCheckoutSignature('pay_2', 'sub_1', good)).toBe(false) // different payment
    expect(verifyCheckoutSignature('pay_1', 'sub_2', good)).toBe(false) // different subscription
    expect(verifyCheckoutSignature('pay_1', 'sub_1', hmac('other', 'pay_1|sub_1'))).toBe(false)
    expect(verifyCheckoutSignature('pay_1', 'sub_1', '')).toBe(false)
    expect(verifyCheckoutSignature('pay_1', 'sub_1', 'zz')).toBe(false)
    expect(verifyWebhookSignature('{"a":1}', hmac(WEBHOOK_SECRET, '{"a":1}'))).toBe(true)
    expect(verifyWebhookSignature('{"a":2}', hmac(WEBHOOK_SECRET, '{"a":1}'))).toBe(false)
  })
})

describe('POST /billing/checkout', () => {
  beforeEach(() => {
    vi.spyOn(razorpay, 'createSubscription').mockImplementation(async (p) => ({ id: 'sub_new', plan_id: p.planId, status: 'created', current_start: null, current_end: null, notes: p.notes }))
    vi.spyOn(razorpay, 'fetchSubscription').mockImplementation(async (id) => ({ id, plan_id: 'plan_pro_m', status: 'created', current_start: null, current_end: null, notes: {} }))
  })

  it('clicking Upgrade many times (even at once) opens ONE payment session; after it is paid, or for other terms, a new one opens', async () => {
    const u = await signUp('co')
    let n = 0
    const create = vi.spyOn(razorpay, 'createSubscription').mockImplementation(async (p) => ({ id: `sub_click_${rid()}_${n++}`, plan_id: p.planId, status: 'created', current_start: null, current_end: null, notes: p.notes }))
    const go = (planId = 'pro', interval = 'month') => app.request('/api/v1/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: u.cookie, 'x-debug-country': 'IN' }, body: JSON.stringify({ planId, interval }) })
    const ids = new Set<string>()
    for (const r of await Promise.all(Array.from({ length: 6 }, () => go()))) { expect(r.status).toBe(200); ids.add((await json(r)).data.subscriptionId) }
    expect(ids.size).toBe(1)
    expect(create).toHaveBeenCalledTimes(1)
    expect((await json(await go())).data.subscriptionId).toBe([...ids][0]) // a later click: the same unpaid session
    expect(create).toHaveBeenCalledTimes(1)
    await go('pro', 'year') // other terms: its own session
    expect(create).toHaveBeenCalledTimes(2)
    // the first session gets paid: the provider no longer calls it "created", so the next click opens a fresh one
    vi.spyOn(razorpay, 'fetchSubscription').mockImplementation(async (id) => ({ id, plan_id: 'plan_pro_m', status: 'active', current_start: null, current_end: null, notes: {} }))
    await go()
    expect(create).toHaveBeenCalledTimes(3)
  })

  it('requires login', async () => {
    const res = await app.request('/api/v1/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: 'pro', interval: 'month' }) })
    expect(res.status).toBe(401)
  })

  it('USD is refused until international payments are enabled — never silently charged in INR', async () => {
    const u = await signUp('co')
    const res = await api(u.cookie, 'POST', '/billing/checkout', { planId: 'pro', interval: 'month' }) // no country → USD
    expect(res.status).toBe(400)
    expect((await json(res)).error.code).toBe('CURRENCY_UNAVAILABLE')
  })

  it('INR: creates the provider subscription from SERVER-side price + notes, never trusting client price/currency', async () => {
    const u = await signUp('co')
    const res = await app.request('/api/v1/billing/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: u.cookie, 'x-debug-country': 'IN' },
      body: JSON.stringify({ planId: 'gold', interval: 'year', amount: 1, currency: 'USD' }), // extra fields are ignored
    })
    const body = await json(res)
    expect(res.status).toBe(200)
    expect(body.data).toMatchObject({ keyId: 'rzp_test_unitkey00000', subscriptionId: 'sub_new', currency: 'INR', amountMinor: 1152000, interval: 'year', testMode: true })
    expect(body.data).not.toHaveProperty('keySecret')
    expect(razorpay.createSubscription).toHaveBeenCalledWith({ planId: 'plan_gold_y', totalCount: 10, notes: { userId: u.id, planId: 'gold', interval: 'year', currency: 'INR' } })
  })

  it('rejects Starter / unknown plans and an already-active identical plan', async () => {
    const u = await signUp('co')
    const bad = await api(u.cookie, 'POST', '/billing/checkout', { planId: 'starter', interval: 'month' })
    expect(bad.status).toBe(400)
    await db.insert(subscription).values({ id: `s_${rid()}`, userId: u.id, planId: 'pro', status: 'active', currency: 'INR', interval: 'month', currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 20 * DAY * 1000), provider: 'razorpay', providerRef: 'sub_x' })
    const dup = await app.request('/api/v1/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: u.cookie, 'x-debug-country': 'IN' }, body: JSON.stringify({ planId: 'pro', interval: 'month' }) })
    expect(dup.status).toBe(409)
    expect((await json(dup)).error.code).toBe('ALREADY_SUBSCRIBED')
  })

  it('creates the provider plan lazily, exactly once, and caches its id', async () => {
    await db.update(planPrice).set({ providerPriceId: null }).where(eq(planPrice.id, 'pro-INR-month'))
    const create = vi.spyOn(razorpay, 'createPlan').mockResolvedValue({ id: 'plan_lazy_1' })
    const u = await signUp('co')
    const go = () => app.request('/api/v1/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: u.cookie, 'x-debug-country': 'IN' }, body: JSON.stringify({ planId: 'pro', interval: 'month' }) })
    expect((await go()).status).toBe(200)
    expect((await go()).status).toBe(200)
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]![0]).toMatchObject({ period: 'monthly', amount: 49900, currency: 'INR' })
    expect((await db.select().from(planPrice).where(eq(planPrice.id, 'pro-INR-month')))[0]!.providerPriceId).toBe('plan_lazy_1')
    await db.update(planPrice).set({ providerPriceId: 'plan_pro_m' }).where(eq(planPrice.id, 'pro-INR-month'))
  })
})

describe('POST /billing/verify (browser callback)', () => {
  const call = (cookie: string, sub: string, pay: string, sig: string) => api(cookie, 'POST', '/billing/verify', { razorpay_payment_id: pay, razorpay_subscription_id: sub, razorpay_signature: sig })

  it('rejects a forged signature and changes nothing', async () => {
    const u = await signUp('vf')
    const res = await call(u.cookie, 'sub_forged', 'pay_forged_1', 'a'.repeat(64))
    expect(res.status).toBe(400)
    expect(await subRow(u.id)).toBeUndefined()
  })

  it("rejects a valid payment that belongs to someone else's account", async () => {
    const victim = await signUp('vf')
    const attacker = await signUp('vf')
    const s = rzpSub({ userId: victim.id })
    vi.spyOn(razorpay, 'fetchSubscription').mockResolvedValue(s)
    const res = await call(attacker.cookie, s.id, 'pay_stolen_1', hmac(KEY_SECRET, `pay_stolen_1|${s.id}`))
    expect(res.status).toBe(400)
    expect(await subRow(attacker.id)).toBeUndefined()
    expect(await subRow(victim.id)).toBeUndefined()
  })

  it('valid payment activates Pro, grants its credits and records the payment (idempotently)', async () => {
    const u = await signUp('vf')
    const s = rzpSub({ userId: u.id, status: 'authenticated', current_start: null, current_end: null }) // right after checkout, before first charge event
    vi.spyOn(razorpay, 'fetchSubscription').mockResolvedValue(s)
    const p = rzpPay({ id: `pay_verify_${rid()}` })
    vi.spyOn(razorpay, 'fetchPayment').mockResolvedValue(p)
    const sig = hmac(KEY_SECRET, `${p.id}|${s.id}`)
    const res = await call(u.cookie, s.id, p.id, sig)
    const body = await json(res)
    expect(res.status).toBe(200)
    expect(body.data.plan.id).toBe('pro')
    expect(body.data.credits.balance).toBe(3000)
    expect(body.data.features.watermark).toBe(false)
    expect((await call(u.cookie, s.id, p.id, sig)).status).toBe(200) // user double-clicks / retries
    const pays = await db.select().from(payment).where(eq(payment.userId, u.id))
    expect(pays).toHaveLength(1)
    expect(pays[0]).toMatchObject({ amountMinor: 49900, currency: 'INR', status: 'captured', planId: 'pro', interval: 'month' })
  })

  it('an unpaid (created) subscription cannot be confirmed even with a valid-looking signature flow', async () => {
    const u = await signUp('vf')
    const s = rzpSub({ userId: u.id, status: 'created', current_start: null, current_end: null })
    vi.spyOn(razorpay, 'fetchSubscription').mockResolvedValue(s)
    const res = await call(u.cookie, s.id, 'pay_x_00001', hmac(KEY_SECRET, `pay_x_00001|${s.id}`))
    expect(res.status).toBe(400)
    expect((await getEntitlements(u.id)).plan.id).toBe('starter')
  })
})

describe('POST /webhooks/razorpay', () => {
  it('rejects bad / missing signatures', async () => {
    const u = await signUp('wh')
    const s = rzpSub({ userId: u.id })
    expect((await subEvent('subscription.activated', s, undefined, { secret: 'wrong-secret-wrong-secret-1234' })).status).toBe(401)
    const noSig = await app.request('/api/v1/webhooks/razorpay', { method: 'POST', body: JSON.stringify({ event: 'subscription.activated', payload: { subscription: { entity: s } } }) })
    expect(noSig.status).toBe(401)
    expect(await subRow(u.id)).toBeUndefined()
  })

  it('activated → plan active with that period; charged → payment row; renewal grants a fresh allowance', async () => {
    const u = await signUp('wh')
    const s = rzpSub({ userId: u.id, planId: 'gold' })
    const pay = rzpPay({ amount: 120000 })
    expect((await subEvent('subscription.activated', s)).status).toBe(200)
    expect((await subEvent('subscription.charged', s, pay)).status).toBe(200)
    const row = (await subRow(u.id))!
    expect(row).toMatchObject({ planId: 'gold', status: 'active', provider: 'razorpay', providerRef: s.id, currency: 'INR', interval: 'month', cancelAtPeriodEnd: false })
    expect(row.currentPeriodEnd.getTime()).toBe((T0 + 30 * DAY) * 1000)
    const ent = await getEntitlements(u.id)
    expect(ent).toMatchObject({ plan: { id: 'gold' }, credits: { balance: 10000 }, features: { watermark: false, modelTiers: ['starter', 'premium', 'frontier'] } })
    expect(await db.select().from(payment).where(eq(payment.userId, u.id))).toHaveLength(1)

    // next month: Razorpay charges again and moves the period → lazily grants a new allowance (no rollover)
    await db.update(subscription).set({ currentPeriodStart: new Date((T0 - 29 * DAY) * 1000), currentPeriodEnd: new Date((T0 + DAY) * 1000) }).where(eq(subscription.userId, u.id))
    await subEvent('subscription.charged', { ...s, current_start: T0 + DAY, current_end: T0 + 31 * DAY }, rzpPay({ amount: 120000 }))
    expect((await subRow(u.id))!.currentPeriodEnd.getTime()).toBe((T0 + 31 * DAY) * 1000)
    expect(await db.select().from(payment).where(eq(payment.userId, u.id))).toHaveLength(2)
  })

  it('is idempotent: the same event id (or the same bytes) is processed once', async () => {
    const u = await signUp('wh')
    const s = rzpSub({ userId: u.id })
    const pay = rzpPay()
    const eventId = `evt_dup_${rid()}`
    const first = await subEvent('subscription.charged', s, pay, { eventId })
    const again = await subEvent('subscription.charged', s, pay, { eventId })
    expect((await json(again)).duplicate).toBe(true)
    expect(first.status).toBe(200)
    expect(await db.select().from(payment).where(eq(payment.userId, u.id))).toHaveLength(1)
    expect((await db.select().from(webhookEvent).where(eq(webhookEvent.id, eventId)))).toHaveLength(1)
    // no event-id header: dedupe on content hash
    const a = await subEvent('subscription.charged', s, pay, { eventId: null })
    const b = await subEvent('subscription.charged', s, pay, { eventId: null })
    expect(a.status).toBe(200)
    expect((await json(b)).duplicate).toBe(true)
  })

  it('out-of-order delivery never moves a running period backwards', async () => {
    const u = await signUp('wh')
    const s = rzpSub({ userId: u.id })
    await subEvent('subscription.charged', { ...s, current_start: T0 + 30 * DAY, current_end: T0 + 60 * DAY }, rzpPay()) // newer first
    await subEvent('subscription.activated', s) // stale older event arrives late
    expect((await subRow(u.id))!.currentPeriodEnd.getTime()).toBe((T0 + 60 * DAY) * 1000)
  })

  it('cancellation keeps access until the paid period ends (and lapses after)', async () => {
    const u = await signUp('wh')
    const s = rzpSub({ userId: u.id })
    await subEvent('subscription.activated', s)
    await subEvent('subscription.cancelled', { ...s, status: 'cancelled' })
    let row = (await subRow(u.id))!
    expect(row).toMatchObject({ status: 'active', cancelAtPeriodEnd: true })
    expect((await getEntitlements(u.id)).plan.id).toBe('pro') // paid-for time is honoured
    await db.update(subscription).set({ currentPeriodEnd: new Date(Date.now() - 1000) }).where(eq(subscription.userId, u.id))
    expect((await getEntitlements(u.id)).plan.id).toBe('starter') // lapsed
    row = (await subRow(u.id))!
    expect(row.status).toBe('active')
  })

  it('halted (renewal payments kept failing) ends access immediately; pending keeps it as past_due', async () => {
    const u = await signUp('wh')
    const s = rzpSub({ userId: u.id })
    await subEvent('subscription.activated', s)
    await subEvent('subscription.pending', { ...s, status: 'pending' })
    expect((await subRow(u.id))!.status).toBe('past_due')
    expect((await getEntitlements(u.id)).plan.id).toBe('pro')
    await subEvent('subscription.halted', { ...s, status: 'halted' })
    expect((await subRow(u.id))!.status).toBe('cancelled')
    expect((await getEntitlements(u.id)).plan.id).toBe('starter')
  })

  it('switching plans: the new subscription replaces the old and the old one is cancelled at the provider; its late cancel event is ignored', async () => {
    const cancel = vi.spyOn(razorpay, 'cancelSubscription').mockResolvedValue({} as RzpSubscription)
    const u = await signUp('wh')
    const oldSub = rzpSub({ userId: u.id, planId: 'pro' })
    const newSub = rzpSub({ userId: u.id, planId: 'gold', interval: 'year', current_end: T0 + 365 * DAY })
    await subEvent('subscription.activated', oldSub)
    await subEvent('subscription.activated', newSub)
    expect(cancel).toHaveBeenCalledWith(oldSub.id, false)
    await subEvent('subscription.cancelled', { ...oldSub, status: 'cancelled' }) // arrives after the switch
    const row = (await subRow(u.id))!
    expect(row).toMatchObject({ planId: 'gold', interval: 'year', providerRef: newSub.id, status: 'active', cancelAtPeriodEnd: false })
  })

  it('ignores subscriptions whose provider plan does not match our price table (forged-notes defence), and unknown users', async () => {
    const u = await signUp('wh')
    await subEvent('subscription.activated', { ...rzpSub({ userId: u.id, planId: 'gold' }), plan_id: PLAN_IDS['pro-INR-month']! }) // notes say gold, paid plan is pro
    expect(await subRow(u.id)).toBeUndefined()
    const ghost = await subEvent('subscription.activated', rzpSub({ userId: 'no-such-user' }))
    expect(ghost.status).toBe(200)
  })

  it('payment.failed is recorded against the subscription owner', async () => {
    const u = await signUp('wh')
    const s = rzpSub({ userId: u.id })
    await subEvent('subscription.activated', s)
    const failed = rzpPay({ status: 'failed', error_description: 'Card declined', subscription_id: s.id })
    const res = await webhook('payment.failed', { payment: { entity: failed } })
    expect(res.status).toBe(200)
    const [row] = await db.select().from(payment).where(and(eq(payment.userId, u.id), eq(payment.status, 'failed')))
    expect(row).toMatchObject({ failureReason: 'Card declined', planId: 'pro' })
  })
})

describe('cancel + summary', () => {
  it('cancel asks the provider to stop at cycle end, keeps the plan, and the summary reflects it', async () => {
    const cancel = vi.spyOn(razorpay, 'cancelSubscription').mockResolvedValue({} as RzpSubscription)
    const u = await signUp('cn')
    const s = rzpSub({ userId: u.id })
    await subEvent('subscription.activated', s)
    const before = await json(await api(u.cookie, 'GET', '/billing/subscription'))
    expect(before.data.subscription).toMatchObject({ planId: 'pro', cancelAtPeriodEnd: false })
    const res = await api(u.cookie, 'POST', '/billing/cancel')
    expect(res.status).toBe(200)
    expect(cancel).toHaveBeenCalledWith(s.id, true)
    expect((await json(res)).data.subscription).toMatchObject({ planId: 'pro', cancelAtPeriodEnd: true })
    expect((await getEntitlements(u.id)).plan.id).toBe('pro')
  })

  it('a Starter user has nothing to cancel', async () => {
    const u = await signUp('cn')
    const res = await api(u.cookie, 'POST', '/billing/cancel')
    expect(res.status).toBe(404)
    expect((await json(await api(u.cookie, 'GET', '/billing/subscription'))).data.subscription).toBeNull()
  })
})

describe('money going back revokes access (security S28/S29)', () => {
  const activate = async (userId: string) => {
    const sub = rzpSub({ userId })
    const pay = rzpPay({ subscription_id: sub.id } as Partial<RzpPayment>)
    await subEvent('subscription.activated', sub, pay)
    return { sub, pay }
  }

  it('a full refund ends the plan and claws the credits back; a partial refund does not', async () => {
    const u = await signUp('rf')
    const { pay } = await activate(u.id)
    expect((await getEntitlements(u.id)).plan.id).toBe('pro')
    expect((await getEntitlements(u.id)).credits.balance).toBeGreaterThan(0)

    await webhook('refund.processed', { refund: { entity: { id: `rfnd_${rid()}`, payment_id: pay.id, amount: 1000 } } }) // partial
    expect((await getEntitlements(u.id)).plan.id).toBe('pro')

    await webhook('refund.processed', { refund: { entity: { id: `rfnd_${rid()}`, payment_id: pay.id, amount: pay.amount } } }) // full
    const ent = await getEntitlements(u.id)
    expect(ent.plan.id).toBe('starter')
    expect((await db.select().from(payment).where(eq(payment.providerPaymentId, pay.id)))[0]!.status).toBe('refunded')
  })

  it('events that arrive after a refund (the provider\'s own "cancelled", a late "activated", a repeated confirm) cannot bring the access back', async () => {
    const u = await signUp('rf')
    const { sub, pay } = await activate(u.id)
    await webhook('refund.processed', { refund: { entity: { id: `rfnd_${rid()}`, payment_id: pay.id, amount: pay.amount } } })
    expect((await getEntitlements(u.id)).plan.id).toBe('starter')
    // the provider still reports the paid period it was never told to shorten
    await subEvent('subscription.cancelled', { ...sub, status: 'cancelled' })
    expect((await getEntitlements(u.id)).plan.id).toBe('starter')
    await subEvent('subscription.activated', sub, pay)
    await subEvent('subscription.charged', sub, pay)
    expect((await getEntitlements(u.id)).plan.id).toBe('starter')
    expect((await subRow(u.id))!.status).toBe('cancelled')
  })

  it('a dispute (chargeback) revokes immediately, and replaying the event changes nothing', async () => {
    const u = await signUp('rf')
    const { pay } = await activate(u.id)
    const evt = `evt_${rid()}`
    const body = { dispute: { entity: { id: `disp_${rid()}`, payment_id: pay.id } } }
    expect((await webhook('payment.dispute.created', body, { eventId: evt })).status).toBe(200)
    expect((await getEntitlements(u.id)).plan.id).toBe('starter')
    expect((await webhook('payment.dispute.created', body, { eventId: evt })).status).toBe(200)
    expect((await subRow(u.id))!.status).toBe('cancelled')
  })

  it('a cancelled/completed subscription we never saw paid grants nothing', async () => {
    const u = await signUp('rf')
    await subEvent('subscription.cancelled', rzpSub({ userId: u.id, status: 'cancelled', current_end: null }))
    expect(await subRow(u.id)).toBeUndefined()
    expect((await getEntitlements(u.id)).plan.id).toBe('starter')
    await subEvent('subscription.completed', rzpSub({ userId: u.id, status: 'completed', current_end: null }))
    expect(await subRow(u.id)).toBeUndefined()
  })

  it('an oversized or unsigned webhook body is rejected before any processing', async () => {
    const big = JSON.stringify({ event: 'x', pad: 'a'.repeat(300_000) })
    const r = await app.request('/api/v1/webhooks/razorpay', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': 'x' }, body: big })
    expect(r.status).toBe(413)
  })
})
