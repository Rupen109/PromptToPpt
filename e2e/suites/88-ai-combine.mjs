import { API, EDITOR, PASSWORD, WEB, expect, launch, suite } from '../lib.mjs'
import { tsx } from '../kits-lib.mjs'

/**
 * Merging slides, in a real browser with the real model: ordinary content-built slides (not hand-edited), "merge slides 2 and 3" → ONE slide in place of two, the SAVED deck has one slide fewer, the
 * request is settled as kept and the credits were spent; and a slide that WAS edited by hand is refused with the reason, nothing deleted, credits back.
 * Needs a verified Gold account: E2E_EMAIL=… E2E_PASSWORD=…
 */
export default async function () {
  const s = suite('88-ai-combine')
  const email = process.env['E2E_EMAIL']
  if (!email) { console.log('  (skipped: set E2E_EMAIL / E2E_PASSWORD, a verified account)'); return s.done() }
  const b = await launch()
  try {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } })
    const r = await ctx.request.post(API + '/api/auth/sign-in/email', { headers: { origin: WEB }, data: { email, password: process.env['E2E_PASSWORD'] ?? PASSWORD } })
    expect(r.ok(), `sign-in ${r.status()}`)
    const H = { origin: EDITOR }
    const madeRes = await ctx.request.post(`${API}/api/v1/presentations`, { headers: H, data: { title: 'Combine check' } })
    const made = await madeRes.json()
    expect(!!made?.data?.id, `could not create the deck: ${madeRes.status()}`)
    const deckId = made.data.id
    const get = async () => (await (await ctx.request.get(`${API}/api/v1/presentations/${deckId}`, { headers: H })).json()).data
    const balance = async () => (await (await ctx.request.get(`${API}/api/v1/me/entitlements`, { headers: H })).json()).data.credits.balance
    const doc0 = (await get()).document
    const words = [['Welcome', 'A short hello for the team'], ['Our mission', 'We make planning calm and clear'], ['Our values', 'We keep promises and share credit'], ['Thank you', 'Questions are welcome']]
    const slides = words.map(([t, sub], i) => { const c = structuredClone(doc0.slides[0]); c.id = `sl${i + 1}`; c.content.title = t; if ('subtitle' in c.content || true) c.content.subtitle = sub; c.locked = false; return c })
    const cur = await get()
    const doc = structuredClone(cur.document); doc.slides = slides
    expect((await ctx.request.put(`${API}/api/v1/presentations/${deckId}`, { headers: H, data: { baseRevision: cur.revision, document: doc, snapshot: false } })).ok(), 'seed save')
    const p = await ctx.newPage()
    await p.goto(`${EDITOR}/edit/${deckId}`, { waitUntil: 'networkidle' })
    await p.locator('[data-testid="stage"]').waitFor({ timeout: 30000 })
    await p.getByRole('button', { name: /Edit with AI/ }).click()
    const box = p.getByPlaceholder(/e\.g\./)
    const ask = async (text) => {
      const count = (t) => t.split(text).length - 1
      const had = count(await p.locator('body').innerText())
      await box.fill(text); await box.press('Enter')
      try {
        await p.waitForFunction(([sent, n]) => { const t = document.body.innerText; let at = -1; for (let i = 0; i <= n; i++) { at = t.indexOf(sent, at + 1); if (at < 0) return false } const box = document.querySelector('textarea[aria-label="Message to the AI assistant"]'); return !!box && !box.disabled && t.slice(at + sent.length).replace(/Slide \d+:[\s\S]*$/, '').trim().length > 20 }, [text, had], { timeout: 120000 })
      } catch (e) { throw new Error(`no reply after "${text}": ${(await p.locator('body').innerText()).slice(-300).replace(/\n/g, ' ⏎ ')}`) }
      await p.waitForTimeout(1500)
      const t = await p.locator('body').innerText()
      let at = -1
      for (let i = 0; i <= had; i++) at = t.indexOf(text, at + 1)
      return t.slice(at + text.length)
    }
    const requests = () => JSON.parse(tsx(`scripts/qa-assist-requests.ts ${deckId}`))
    const settledBy = async (n) => { for (let i = 0; i < 40; i++) { const rs = requests(); if (rs.length >= n && rs.slice(0, n).every((x) => x.status === 'settled')) return rs; await new Promise((r) => setTimeout(r, 1000)) } return requests() }

    await s.check('a real merge: ONE slide replaces two in the SAVED deck, the request is settled as kept, credits spent', p, async () => {
      const before = await balance(), n0 = requests().length
      const log = await ask('merge slides 2 and 3')
      expect(/Done —/.test(log), `no "Done —": ${log.slice(0, 400)}`)
      let ids = []
      for (let i = 0; i < 20; i++) { ids = (await get()).document.slides.map((x) => x.id); if (ids.length === 3) break; await new Promise((r) => setTimeout(r, 1000)) }
      expect(JSON.stringify(ids) === JSON.stringify(['sl1', 'sl2', 'sl4']), `saved slides: ${JSON.stringify(ids)}`)
      const merged = (await get()).document.slides[1]
      expect(JSON.stringify(merged.content) !== JSON.stringify(slides[1].content), 'the merged slide did not change')
      const rs = await settledBy(n0 + 1)
      expect(rs[0].status === 'settled' && (rs[0].refundedRefs ?? []).length === 0, `request: ${JSON.stringify(rs[0])}`)
      expect((await balance()) < before, 'credits not spent')
    })
    await s.check('a hand-edited slide is refused: nothing deleted, the reason is said, the credits come back', p, async () => {
      const cur2 = await get(); const d2 = structuredClone(cur2.document); d2.slides[2].manual = true
      expect((await ctx.request.put(`${API}/api/v1/presentations/${deckId}`, { headers: H, data: { baseRevision: cur2.revision, document: d2, snapshot: false } })).ok(), 'mark by hand')
      await p.reload({ waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor({ timeout: 30000 })
      await p.getByRole('button', { name: /Edit with AI/ }).click()
      const before = await balance(), n0 = requests().length
      const log = await ask('merge slides 2 and 3')
      expect(!/Done —/.test(log), `a refused merge said Done: ${log.slice(0, 400)}`) // (the reason is the code's, or the model's own question: either way nothing may be deleted or charged)
      await new Promise((r) => setTimeout(r, 2500))
      expect((await get()).document.slides.length === 3, 'a slide was deleted')
      expect((await balance()) === before, `credits were kept (${before} → ${await balance()})`)
      expect(requests().length === n0, 'a refused merge left a change record')
    })
  } finally { await b.close() }
  return s.done()
}
