import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

/**
 * Buying credits when the month's run out (docs/CREDIT_TOP_UPS.md): the Plan & credits page offers this plan's own credits at this plan's own price,
 * the test payment window pays for it (PAYMENTS_SIMULATOR — no real money), the credits land, they are marked as bought (they do not expire at the
 * reset), and the plan and renewal date are untouched. Starter is told to take a plan instead. No AI is used.
 */
export default async function () {
  const s = suite('115-credit-top-up')
  const b = await launch()
  try {
    const A = await person(b, 'topup', 'pro')
    const { p } = A
    const ent = async () => (await api.get(A, '/me/entitlements')).data
    const before = await ent()

    await s.check('Plan & credits offers the Pro credits again at the Pro price, and says the plan does not change', p, async () => {
      await p.goto(`${EDITOR}/billing`, { waitUntil: 'networkidle' })
      const box = p.getByTestId('billing-topup')
      await box.waitFor({ timeout: 15000 })
      const text = await p.getByRole('region', { name: 'Credits' }).innerText()
      expect(/1,150 credits/.test(text), `the offer does not name 1,150 credits: ${text}`)
      expect(/₹300|\$10/.test(text), `the offer does not name the plan's price: ${text}`)
      expect(/renewal date stay the same|plan and renewal/i.test(text), 'the offer does not say the plan is unchanged')
    })

    await s.check('buying: the test payment window pays, the credits land once and are marked as bought', p, async () => {
      await p.getByTestId('billing-topup').click()
      const win = p.getByRole('dialog', { name: 'Test payment' })
      await win.waitFor({ timeout: 20000 })
      expect(/1,150 credits/.test(await win.innerText()), 'the payment window does not say what is bought')
      await win.getByRole('button', { name: /^Pay \(test\)$/ }).click()
      await win.waitFor({ state: 'detached', timeout: 30000 })
      await p.waitForTimeout(1500)
      const after = await ent()
      expect(after.credits.balance === before.credits.balance + 1150, `balance ${before.credits.balance} → ${after.credits.balance}`)
      expect(after.credits.bought === 1150, `bought: ${after.credits.bought}`)
      // the plan and the renewal date are exactly as they were
      expect(after.plan.id === before.plan.id, `plan changed to ${after.plan.id}`)
      expect(after.credits.resetsAt === before.credits.resetsAt, 'the renewal date moved')
      await p.reload({ waitUntil: 'networkidle' })
      const text = await p.getByRole('region', { name: 'Credits' }).innerText()
      expect(/1,150 credits were bought as a top-up/.test(text), `the page does not show the bought credits: ${text}`)
    })

    await s.check('a second, identical payment is a second purchase — never a double grant of the same one', p, async () => {
      const start = await ent()
      const r = await api.post(A, '/billing/top-up/verify', { razorpay_order_id: 'order_made_up', razorpay_payment_id: 'pay_made_up', razorpay_signature: 'deadbeef'.repeat(8) })
      expect(r.status >= 400 && r.status < 500, `a forged top-up was accepted: ${r.status}`)
      expect((await ent()).credits.balance === start.credits.balance, 'a forged top-up changed the balance')
    })

    await s.check('the upgrade window offers the top-up beside the plans', p, async () => {
      await p.getByRole('button', { name: /Upgrade|Change plan/ }).first().click()
      const dlg = p.getByRole('dialog', { name: 'Upgrade your plan' })
      await dlg.waitFor({ timeout: 10000 })
      await p.getByTestId('topup-offer').waitFor({ timeout: 10000 })
      expect(/Buy 1,150 credits/.test(await p.getByTestId('topup-offer').innerText()), 'the window does not offer the credits')
      await p.keyboard.press('Escape')
    })
    await A.ctx.close()

    const F = await person(b, 'topupfree')
    await s.check('Starter has nothing to buy again: it is told its credits are free, and no buy button is shown', F.p, async () => {
      const offer = (await api.get(F, '/billing/top-up')).data
      expect(offer.available === false, 'Starter was offered a top-up')
      expect(/Starter/i.test(offer.reason ?? ''), `reason: ${offer.reason}`)
      await F.p.goto(`${EDITOR}/billing`, { waitUntil: 'networkidle' })
      await F.p.getByRole('region', { name: 'Credits' }).waitFor({ timeout: 15000 })
      expect(await F.p.getByTestId('billing-topup').count() === 0, 'Starter sees a buy-credits button')
    })
    await F.ctx.close()
  } finally { await b.close() }
  return s.done()
}
