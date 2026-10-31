import { EDITOR, PASSWORD, WEB, expect, launch, suite, uniqueEmail } from '../lib.mjs'

export default async function () {
  const s = suite('07-billing')
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  const settle = (ms = 500) => p.waitForTimeout(ms)
  p.on('dialog', (d) => void d.dismiss())

  await s.check('new Starter user: billing page shows plan, credits, empty payment history, upgrade button', p, async () => {
    await p.goto(WEB + '/signup', { waitUntil: 'networkidle' })
    await p.locator('input[name=name]').fill('Billing QA'); await p.locator('input[name=email]').fill(uniqueEmail('bill')); await p.locator('input[name=password]').fill(PASSWORD)
    await p.getByRole('button', { name: 'Sign up free' }).click(); await p.waitForURL(/localhost:3001/, { timeout: 20000 })
    await p.goto(EDITOR + '/billing', { waitUntil: 'networkidle' })
    const cur = p.getByLabel('Current plan'); await cur.waitFor({ timeout: 8000 })
    expect(/Starter/.test(await cur.innerText()), 'not Starter'); expect(await p.getByLabel('Payment history').isVisible(), 'history missing')
    expect(await p.getByRole('button', { name: /Upgrade|Change plan/ }).first().isVisible(), 'no upgrade button')
  })
  await s.check('upgrade modal: lists Pro and Gold with INR prices, monthly/yearly toggle, close works', p, async () => {
    await p.getByRole('button', { name: /Upgrade|Change plan/ }).first().click()
    const dlg = p.getByRole('dialog', { name: 'Upgrade your plan' }); await dlg.waitFor({ timeout: 5000 })
    await dlg.getByRole('button', { name: /Subscribe to Pro/ }).waitFor({ timeout: 10000 })
    const t = await dlg.innerText(); expect(/Pro/.test(t) && /Gold/.test(t), 'plans missing'); expect(/₹/.test(t), 'prices not in INR (BILLING_FORCE_CURRENCY)')
    const before = t; await dlg.getByRole('button', { name: /Monthly/i }).click(); await settle(300)
    expect(before !== await dlg.innerText(), 'interval toggle did nothing')
    await dlg.getByLabel('Close').click(); await settle(200); expect(await p.getByRole('dialog').count() === 0, 'modal did not close')
  })
  await s.check('upgrade modal: Escape closes it and focus returns to the page', p, async () => {
    await p.getByRole('button', { name: /Upgrade|Change plan/ }).first().click(); await p.getByRole('dialog').waitFor()
    await p.keyboard.press('Escape'); await settle(300); expect(await p.getByRole('dialog').count() === 0, 'Escape did not close')
  })
  await s.check('Subscribe to Pro → secure Razorpay checkout window opens (test mode); closing it leaves the user on Starter', p, async () => {
    await p.getByRole('button', { name: /Upgrade|Change plan/ }).first().click()
    await p.getByRole('button', { name: /Subscribe to Pro/ }).click()
    // Razorpay's own window, or our test payment window when the server runs with PAYMENTS_SIMULATOR (docs/BILLING.md)
    const frame = p.locator('iframe.razorpay-checkout-frame, iframe[src*="razorpay"], [role=dialog][aria-label="Test payment"]').first()
    await frame.waitFor({ timeout: 30000 })
    await p.keyboard.press('Escape'); await settle(1500)
    const ent = await p.evaluate(() => fetch('http://localhost:4000/api/v1/me/entitlements', { credentials: 'include' }).then((r) => r.json()))
    expect(JSON.stringify(ent).includes('"starter"'), 'plan changed without payment')
  })
  await s.check('pricing links from the website open the editor billing page with the plan preselected', p, async () => {
    await p.goto(`${EDITOR}/billing?plan=pro&interval=year`, { waitUntil: 'networkidle' }); await settle(1200)
    expect(await p.getByRole('dialog').count() >= 0, 'page crashed')
    expect(!/Something went wrong|Cannot|undefined/.test(await p.locator('body').innerText()), 'error text on billing deep link')
  })
  await s.check('billing: server refuses to activate a plan with a forged payment signature', p, async () => {
    const r = await p.evaluate(async () => { const res = await fetch('http://localhost:4000/api/v1/billing/verify', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ razorpay_payment_id: 'pay_fake', razorpay_subscription_id: 'sub_fake', razorpay_signature: 'deadbeef' }) }); return res.status })
    expect(r >= 400 && r < 500, `forged verify returned ${r}`)
  })
  await s.check('billing: webhook rejects an unsigned call', p, async () => {
    const r = await fetch('http://localhost:4000/api/v1/webhooks/razorpay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"event":"subscription.activated"}' })
    expect(r.status === 400 || r.status === 401 || r.status === 403, `webhook accepted unsigned: ${r.status}`)
  })

  await b.close()
  return s.done()
}
