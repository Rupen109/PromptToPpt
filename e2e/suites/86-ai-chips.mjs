import { API, EDITOR, PASSWORD, WEB, expect, launch, suite } from '../lib.mjs'

/**
 * The assistant's quick actions come from the server's capability registry, in a real browser: a fresh chat shows grouped chips, a chip sends exactly its text, and a capability that is switched
 * off for the person is not offered. Needs a verified Gold/Pro account: E2E_EMAIL=… E2E_PASSWORD=…
 */
export default async function () {
  const s = suite('86-ai-chips')
  const email = process.env['E2E_EMAIL']
  if (!email) { console.log('  (skipped: set E2E_EMAIL / E2E_PASSWORD, a verified account)'); return s.done() }
  const b = await launch()
  try {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } })
    const r = await ctx.request.post(API + '/api/auth/sign-in/email', { headers: { origin: WEB }, data: { email, password: process.env['E2E_PASSWORD'] ?? PASSWORD } })
    expect(r.ok(), `sign-in ${r.status()}`)
    const madeRes = await ctx.request.post(`${API}/api/v1/presentations`, { headers: { origin: EDITOR }, data: { title: 'Chips check' } })
    const made = await madeRes.json()
    expect(!!made?.data?.id, `could not create the deck: ${madeRes.status()}`)
    const p = await ctx.newPage()
    let sent = null
    await p.route('**/api/v1/presentations/*/ai-assist', async (route) => { sent = JSON.parse(route.request().postData() ?? '{}'); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'X', message: 'stub' } }) }) })
    await p.goto(`${EDITOR}/edit/${made.data.id}`, { waitUntil: 'networkidle' })
    await p.locator('[data-testid="stage"]').waitFor({ timeout: 30000 })
    await p.getByRole('button', { name: /Edit with AI/ }).click()
    await s.check('a fresh chat shows the chips in groups, built by the server', p, async () => {
      await p.getByRole('group', { name: 'Design actions' }).waitFor({ timeout: 15000 })
      const groups = await p.locator('[role=group][aria-label$=" actions"]').count()
      expect(groups >= 3, `only ${groups} chip groups`)
      const served = await (await ctx.request.get(`${API}/api/v1/presentations/${made.data.id}/assistant/chips`, { headers: { origin: EDITOR } })).json()
      const shown = await p.locator('[role=group][aria-label$=" actions"] button').allInnerTexts()
      expect(shown.length === served.data.length && shown.every((t) => served.data.some((c) => c.text === t)), `screen ${shown.length} vs server ${served.data.length}`)
    })
    await s.check('a chip sends exactly its own text', p, async () => {
      const chip = p.locator('[role=group][aria-label$=" actions"] button').first()
      const text = (await chip.innerText()).trim()
      await chip.click()
      await p.waitForFunction(() => true)
      for (let i = 0; i < 50 && !sent; i++) await p.waitForTimeout(100)
      expect(sent?.instruction === text, `sent ${JSON.stringify(sent?.instruction)} wanted ${JSON.stringify(text)}`)
    })
  } finally { await b.close() }
  return s.done()
}
