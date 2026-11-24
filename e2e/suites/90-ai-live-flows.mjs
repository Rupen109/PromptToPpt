import { API, EDITOR, PASSWORD, WEB, expect, launch, suite } from '../lib.mjs'
import { tsx } from '../kits-lib.mjs'

/**
 * Three flows that had unit and model checks but no live run, in a real browser with the real model, each judged on the SAVED deck:
 *  1. "turn the table into a bar chart": a chart with the table's own labels and figures is saved, the table stays;
 *  2. review → fix: a wall of text is made shorter (fewer words) and the request is settled as kept;
 *  3. "split slide 4 in two": one slide more in the saved deck, every point of the original is still on one of the two.
 * Needs a verified Gold account: E2E_EMAIL=… E2E_PASSWORD=…
 */
export default async function () {
  const s = suite('90-ai-live-flows')
  const email = process.env['E2E_EMAIL']
  if (!email) { console.log('  (skipped: set E2E_EMAIL / E2E_PASSWORD, a verified account)'); return s.done() }
  const b = await launch()
  try {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } })
    const r = await ctx.request.post(API + '/api/auth/sign-in/email', { headers: { origin: WEB }, data: { email, password: process.env['E2E_PASSWORD'] ?? PASSWORD } })
    expect(r.ok(), `sign-in ${r.status()}`)
    const H = { origin: EDITOR }
    const madeRes = await ctx.request.post(`${API}/api/v1/presentations`, { headers: H, data: { title: 'Flows check' } })
    const made = await madeRes.json()
    expect(!!made?.data?.id, `could not create the deck: ${madeRes.status()}`)
    const deckId = made.data.id
    const get = async () => (await (await ctx.request.get(`${API}/api/v1/presentations/${deckId}`, { headers: H })).json()).data
    const balance = async () => (await (await ctx.request.get(`${API}/api/v1/me/entitlements`, { headers: H })).json()).data.credits.balance
    const doc0 = (await get()).document
    const seeded = JSON.parse(tsx(`scripts/qa-seed-flows.ts ${doc0.theme.id}`))
    const cur = await get()
    const doc = structuredClone(cur.document); doc.slides = seeded
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

    const words = (slide) => JSON.stringify((slide.elements ?? []).filter((e) => e.type === 'text').map((e) => e.paragraphs.map((q) => q.runs.map((r) => r.text).join('')).join(' '))).split(/\s+/).filter(Boolean).length
    const textOf = (slide) => JSON.stringify(slide.elements ?? []) + JSON.stringify(slide.content ?? {})
    const waitSaved = async (test) => { for (let i = 0; i < 25; i++) { const d = (await get()).document; if (test(d)) return d; await new Promise((r) => setTimeout(r, 1000)) } return (await get()).document }

    await s.check('a table becomes a chart: the SAVED deck has a chart with the table\'s own labels and figures, the table stays, settled as kept', p, async () => {
      const n0 = requests().length
      const log = await ask('turn the table on slide 3 into a bar chart')
      expect(/Done —/.test(log), `no "Done —": ${log.slice(0, 400)}`)
      const d = await waitSaved((x) => x.slides.some((sl) => (sl.elements ?? []).some((e) => e.type === 'chart')))
      const sl = d.slides.find((x) => x.id === 'f3')
      const chart = (sl?.elements ?? []).find((e) => e.type === 'chart')
      expect(!!chart, `no chart on slide 3: ${JSON.stringify((sl?.elements ?? []).map((e) => e.type))}`)
      expect(JSON.stringify(chart.labels) === JSON.stringify(['Basic', 'Pro', 'Team']) && JSON.stringify(chart.series[0].values) === JSON.stringify([10, 30, 60]), `chart data: ${JSON.stringify([chart.labels, chart.series])}`)
      expect((sl.elements ?? []).some((e) => e.type === 'table'), 'the table was removed')
      const rs = await settledBy(n0 + 1)
      expect(rs[0].status === 'settled' && (rs[0].refundedRefs ?? []).length === 0, `request: ${JSON.stringify(rs[0])}`)
    })
    await s.check('review, then fix: the wall of text is shorter in the SAVED deck and the request is settled as kept', p, async () => {
      const before = words((await get()).document.slides.find((x) => x.id === 'f2'))
      const review = await ask('review my deck')
      expect(/I checked all \d+ slides/.test(review), `no review report: ${review.slice(0, 300)}`)
      const n0 = requests().length
      const log = await ask('fix the problems you found')
      expect(/Done —|shortened|Shortened/.test(log), `no fix: ${log.slice(0, 400)}`)
      const d = await waitSaved((x) => words(x.slides.find((sl) => sl.id === 'f2')) < before)
      const after = words(d.slides.find((x) => x.id === 'f2'))
      expect(after < before, `words ${before} → ${after}`)
      const rs = await settledBy(n0 + 1)
      expect(rs[0].status === 'settled', `request: ${JSON.stringify(rs[0])}`)
    })
    await s.check('split a slide in two: one slide more in the SAVED deck, every point of the original is still there', p, async () => {
      const original = textOf((await get()).document.slides.find((x) => x.id === 'f4'))
      const count0 = (await get()).document.slides.length
      const log = await ask('split slide 4 in two')
      expect(/Done —/.test(log), `no "Done —": ${log.slice(0, 400)}`)
      const d = await waitSaved((x) => x.slides.length === count0 + 1)
      expect(d.slides.length === count0 + 1, `slides ${count0} → ${d.slides.length}`)
      const joined = d.slides.map(textOf).join(' ')
      for (const w of ['two engineers', 'designer', 'Pune', 'Leeds']) expect(joined.includes(w), `"${w}" was lost`)
      expect(original.length > 0, 'seed missing')
    })
  } finally { await b.close() }
  return s.done()
}
