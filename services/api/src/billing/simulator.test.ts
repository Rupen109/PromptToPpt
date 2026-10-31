import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { payment, planPrice, subscription, user } from '../db/schema.ts'
import { env } from '../env.ts'
import { mailOutbox } from '../lib/mailer.ts'
import { api, json, signUp } from '../test-utils.ts'
import { getEntitlements } from './entitlements.ts'

/** TEST PAYMENTS (PAYMENTS_SIMULATOR): the whole purchase through our own stand-in provider, with the REAL activation, credit, receipt and refund code behind it. */
const saved = { sim: env.PAYMENTS_SIMULATOR }
beforeAll(async () => { env.PAYMENTS_SIMULATOR = true; await db.update(planPrice).set({ providerPriceId: null }) })
afterAll(async () => { env.PAYMENTS_SIMULATOR = saved.sim; await db.update(planPrice).set({ providerPriceId: null }) })

const checkout = (cookie: string, planId = 'pro', interval = 'month') =>
  app.request('/api/v1/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-debug-country': 'IN' }, body: JSON.stringify({ planId, interval }) })
const emailOf = async (id: string) => (await db.select({ e: user.email }).from(user).where(eq(user.id, id)))[0]!.e
const pay = async (cookie: string, subscriptionId: string, outcome: 'success' | 'failure') => json(await api(cookie, 'POST', '/billing/simulator/pay', { subscriptionId, outcome }))

describe('test payments: the checkout', () => {
  it('opens a simulated payment session (no Razorpay account, key or internet involved)', async () => {
    const u = await signUp('sim')
    const r = await checkout(u.cookie)
    expect(r.status).toBe(200)
    const d = (await json(r)).data
    expect(d).toMatchObject({ simulated: true, testMode: true, currency: 'INR', amountMinor: 49900, keyId: 'rzp_test_simulator' })
    expect(d.subscriptionId).toMatch(/^sub_sim_/)
  })

  it('pay → verify: the plan, credits, payment history and receipt e-mail come from the real code', async () => {
    const u = await signUp('simok')
    const d = (await json(await checkout(u.cookie))).data
    const paid = (await pay(u.cookie, d.subscriptionId, 'success')).data
    expect(paid).toMatchObject({ outcome: 'paid', razorpay_subscription_id: d.subscriptionId })
    expect(paid.razorpay_payment_id).toMatch(/^pay_sim_/)
    const v = await api(u.cookie, 'POST', '/billing/verify', { razorpay_payment_id: paid.razorpay_payment_id, razorpay_subscription_id: paid.razorpay_subscription_id, razorpay_signature: paid.razorpay_signature })
    expect(v.status).toBe(200)
    expect((await getEntitlements(u.id)).plan.id).toBe('pro')
    const [row] = await db.select().from(subscription).where(eq(subscription.userId, u.id))
    expect(row).toMatchObject({ planId: 'pro', status: 'active', provider: 'razorpay' })
    const [p] = await db.select().from(payment).where(eq(payment.userId, u.id))
    expect(p).toMatchObject({ status: 'captured', amountMinor: 49900, currency: 'INR' })
    const to = await emailOf(u.id)
    expect(mailOutbox.some((m) => m.to === to && /payment|receipt/i.test(m.subject))).toBe(true)
  })

  it('a forged or tampered signature is still refused (the simulator does not weaken the check)', async () => {
    const u = await signUp('simbad')
    const d = (await json(await checkout(u.cookie))).data
    const paid = (await pay(u.cookie, d.subscriptionId, 'success')).data
    const v = await api(u.cookie, 'POST', '/billing/verify', { razorpay_payment_id: paid.razorpay_payment_id, razorpay_subscription_id: paid.razorpay_subscription_id, razorpay_signature: 'a'.repeat(64) })
    expect(v.status).toBe(400)
    expect((await getEntitlements(u.id)).plan.id).toBe('starter')
  })

  it('"fail" records a failed payment and the failure e-mail, and the plan stays Starter', async () => {
    const u = await signUp('simfail')
    const d = (await json(await checkout(u.cookie))).data
    const r = (await pay(u.cookie, d.subscriptionId, 'failure')).data
    expect(r.outcome).toBe('failed')
    const [p] = await db.select().from(payment).where(eq(payment.userId, u.id))
    expect(p).toMatchObject({ status: 'failed' })
    expect((await getEntitlements(u.id)).plan.id).toBe('starter')
    const to = await emailOf(u.id)
    expect(mailOutbox.some((m) => m.to === to && /could not process your SlidesDone payment/i.test(m.subject))).toBe(true)
  })

  it("nobody can complete another person's test payment", async () => {
    const a = await signUp('simA'), b = await signUp('simB')
    const d = (await json(await checkout(a.cookie))).data
    const r = await api(b.cookie, 'POST', '/billing/simulator/pay', { subscriptionId: d.subscriptionId, outcome: 'success' })
    expect(r.status).toBe(400)
  })
})

describe('test payments: renewal, refund, cancel', () => {
  const buy = async (prefix: string) => {
    const u = await signUp(prefix)
    const d = (await json(await checkout(u.cookie))).data
    const paid = (await pay(u.cookie, d.subscriptionId, 'success')).data
    await api(u.cookie, 'POST', '/billing/verify', { razorpay_payment_id: paid.razorpay_payment_id, razorpay_subscription_id: paid.razorpay_subscription_id, razorpay_signature: paid.razorpay_signature })
    return u
  }

  it('renewal moves the period forward and records a second payment', async () => {
    const u = await buy('simren')
    const [before] = await db.select().from(subscription).where(eq(subscription.userId, u.id))
    expect((await api(u.cookie, 'POST', '/billing/simulator/renew')).status).toBe(200)
    const [after] = await db.select().from(subscription).where(eq(subscription.userId, u.id))
    expect(after!.currentPeriodEnd.getTime()).toBeGreaterThan(before!.currentPeriodEnd.getTime())
    expect((await db.select().from(payment).where(eq(payment.userId, u.id))).filter((p) => p.status === 'captured')).toHaveLength(2)
  })

  it('a full refund ends the plan (same path as a real refund)', async () => {
    const u = await buy('simref')
    expect((await getEntitlements(u.id)).plan.id).toBe('pro')
    expect((await api(u.cookie, 'POST', '/billing/simulator/refund')).status).toBe(200)
    expect((await getEntitlements(u.id)).plan.id).toBe('starter')
  })

  it('cancelling renewal works on a test subscription (no provider call)', async () => {
    const u = await buy('simcan')
    expect((await api(u.cookie, 'POST', '/billing/cancel')).status).toBe(200)
    const [row] = await db.select().from(subscription).where(eq(subscription.userId, u.id))
    expect(row!.cancelAtPeriodEnd).toBe(true)
  })

  it('renew / refund without a test purchase say so', async () => {
    const u = await signUp('simnone')
    expect((await api(u.cookie, 'POST', '/billing/simulator/renew')).status).toBe(404)
    expect((await api(u.cookie, 'POST', '/billing/simulator/refund')).status).toBe(404)
  })
})

describe('test payments are OFF by default and can never be reached then', () => {
  it('with the flag off every simulator route answers 404', async () => {
    env.PAYMENTS_SIMULATOR = false
    try {
      const u = await signUp('simoff')
      for (const path of ['/billing/simulator/pay', '/billing/simulator/renew', '/billing/simulator/refund']) {
        const r = await api(u.cookie, 'POST', path, { subscriptionId: 'sub_sim_x', outcome: 'success' })
        expect(r.status, path).toBe(404)
      }
    } finally { env.PAYMENTS_SIMULATOR = true }
  })
})
