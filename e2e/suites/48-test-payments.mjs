/**
 * TEST PAYMENTS in a real browser (server flag PAYMENTS_SIMULATOR=true, see docs/BILLING.md): the purchase from the first click to the plan, credits and history,
 * a declined payment, closing the window, renewal, refund and cancelling. No Razorpay account, card or internet is involved; everything behind the test window is the
 * real activation code. Skips (passes) with a note when the server is not in test-payment mode.
 */
import { API, EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

export default async function () {
  const s = suite('48-test-payments')
  const b = await launch()
  const A = await person(b, 'tpay')
  const p = await A.ctx.newPage()
  const mode = (await (await A.ctx.request.get(`${API}/api/v1/billing/subscription`)).json()).data
  if (!mode?.simulator) { console.log('  (server is not in test-payment mode: PAYMENTS_SIMULATOR is off, nothing to check)'); await b.close(); return 0 }
  p.on('dialog', (d) => void d.accept())
  const settle = (ms = 600) => p.waitForTimeout(ms)
  const entitlements = async () => (await api.get(A, '/me/entitlements')).data
  const test = () => p.getByRole('dialog', { name: 'Test payment' })
  /** opens the plan list and presses Subscribe to Pro (the list closes with Escape, so each step opens it again when needed) */
  const subscribePro = async () => {
    if (await p.getByRole('button', { name: /Subscribe to Pro/ }).count() === 0) await p.getByRole('button', { name: /Upgrade|Change plan/ }).first().click()
    await p.getByRole('button', { name: /Subscribe to Pro/ }).first().click()
    await test().waitFor({ timeout: 15000 })
  }

  await s.check('the billing page says test payments are on, and offers no real card form', p, async () => {
    await p.goto(EDITOR + '/billing', { waitUntil: 'networkidle' }); await settle(800)
    const t = await p.locator('body').innerText()
    expect(/Test payments are on: no real money, no card/.test(t), 'no test-payment notice')
    expect(await p.getByRole('region', { name: 'Test payment tools' }).count() === 1, 'test tools missing')
  })

  await s.check('Subscribe opens OUR test payment window with the plan and its price; Escape closes it and the plan stays Starter', p, async () => {
    await subscribePro()
    const t = await test().innerText()
    expect(/test payment: no real money/i.test(t) && /Pro/.test(t) && /₹/.test(t), `window text: ${t.slice(0, 120)}`)
    await p.keyboard.press('Escape'); await settle(500)
    expect(await test().count() === 0, 'window did not close')
    expect((await entitlements()).plan.id === 'starter', 'plan changed without a payment')
  })

  await s.check('"Make this payment fail" shows the reason in the window, records a failed payment, and the plan is still Starter', p, async () => {
    await subscribePro()
    await test().getByRole('button', { name: /fail/i }).click()
    await test().getByRole('alert').waitFor({ timeout: 10000 })
    expect(/declined/i.test(await test().getByRole('alert').innerText()), 'no failure reason')
    expect((await entitlements()).plan.id === 'starter', 'plan changed after a failed payment')
    const h = (await api.get(A, '/billing/subscription')).data
    expect(h.payments.some((x) => x.status === 'failed'), 'failed payment not in history')
  })

  await s.check('Pay (test) activates Pro: success message, Pro plan, credits, a captured payment in the history', p, async () => {
    await test().getByRole('button', { name: /^Pay \(test\)/ }).click()
    await p.getByText(/You're on Pro now/).waitFor({ timeout: 15000 })
    const ent = await entitlements()
    expect(ent.plan.id === 'pro', `plan ${ent.plan.id}`)
    expect(ent.credits.monthlyAllowance > 100 && ent.credits.balance >= ent.credits.monthlyAllowance * 0.9, `credits ${ent.credits.balance} of ${ent.credits.monthlyAllowance} (a Pro allowance, not the Starter 100)`)
    const h = (await api.get(A, '/billing/subscription')).data
    expect(h.subscription?.planId === 'pro' && h.payments.some((x) => x.status === 'captured'), 'subscription or payment missing')
    await p.keyboard.press('Escape'); await settle(300)
  })

  await s.check('billing page afterwards: Pro is shown with the payment in the history', p, async () => {
    await p.goto(EDITOR + '/billing', { waitUntil: 'networkidle' }); await settle(800)
    const cur = await p.getByLabel('Current plan').innerText()
    expect(/Pro/.test(cur), `current plan: ${cur.slice(0, 80)}`)
    expect(/captured|Paid|₹499/i.test(await p.getByLabel('Payment history').innerText()), 'payment not listed')
  })

  await s.check('"Simulate next renewal": the period moves forward and a second payment appears', p, async () => {
    const before = (await api.get(A, '/billing/subscription')).data.subscription.currentPeriodEnd
    await p.getByRole('button', { name: 'Simulate next renewal' }).click()
    await p.getByText(/Renewal simulated/).waitFor({ timeout: 15000 })
    const d = (await api.get(A, '/billing/subscription')).data
    expect(new Date(d.subscription.currentPeriodEnd) > new Date(before), 'period did not move')
    expect(d.payments.filter((x) => x.status === 'captured').length === 2, 'second payment missing')
  })

  await s.check('cancelling renewal works on a test subscription, and the page says it will not renew', p, async () => {
    await p.getByRole('button', { name: 'Cancel subscription' }).click()
    await p.getByText(/not renewing/).waitFor({ timeout: 15000 })
  })

  await s.check('"Simulate full refund" ends the plan: back to Starter', p, async () => {
    await p.getByRole('button', { name: 'Simulate full refund' }).click()
    await p.getByText(/Full refund simulated/).waitFor({ timeout: 15000 })
    expect((await entitlements()).plan.id === 'starter', 'still on a paid plan after the refund')
  })

  await s.check('the website pricing deep link (/billing?plan=pro&interval=year) opens the test payment window straight away', p, async () => {
    await p.goto(`${EDITOR}/billing?plan=pro&interval=year`, { waitUntil: 'networkidle' })
    await test().waitFor({ timeout: 15000 })
    await p.keyboard.press('Escape')
  })

  void WEB
  await b.close()
  return s.done()
}
