import { API, EDITOR, expect, launch, suite } from '../lib.mjs'
import { newDeck, person, tsx } from '../kits-lib.mjs'

/**
 * The assistant's newest abilities, in a real browser with the real model, each judged on the SAVED deck: swapping two slides, highlighting the highest figure of a table column, showing a column in rupees,
 * the footer text, an arrow shape, and expanding a deck (asked first with its cost; the saved deck grows only after the button). Makes its own Gold account. Run it alone (real model).
 */
export default async function () {
  const s = suite('93-ai-open-points')
  const b = await launch()
  try {
    const makeAsk = (p) => async (text) => {
      const box = p.getByPlaceholder(/e\.g\./)
      const count = (t) => t.split(text).length - 1
      const had = count(await p.locator('body').innerText())
      await box.fill(text); await box.press('Enter')
      try {
        await p.waitForFunction(([sent, n]) => { const t = document.body.innerText; let at = -1; for (let i = 0; i <= n; i++) { at = t.indexOf(sent, at + 1); if (at < 0) return false } const m = document.querySelector('textarea[aria-label="Message to the AI assistant"]'); return !!m && !m.disabled && t.slice(at + sent.length).replace(/Slide \d+:[\s\S]*$/, '').trim().length > 20 }, [text, had], { timeout: 120000 })
      } catch (e) { throw new Error(`no reply after "${text}": ${(await p.locator('body').innerText()).slice(-300).replace(/\n/g, ' ⏎ ')}`) }
      await p.waitForTimeout(1500)
      const t = await p.locator('body').innerText()
      let at = -1
      for (let i = 0; i <= had; i++) at = t.indexOf(text, at + 1)
      return t.slice(at + text.length)
    }
    const A = await person(b, 'open93', 'gold')
    const made = await newDeck(A, 'Open points check')
    const id = made?.id ?? made?.data?.id ?? made
    expect(!!id, `no deck: ${JSON.stringify(made).slice(0, 200)}`)
    const H = { origin: EDITOR }
    const get = async () => (await (await A.ctx.request.get(`${API}/api/v1/presentations/${id}`, { headers: H })).json()).data
    const cur = await get()
    const doc = structuredClone(cur.document); doc.slides = JSON.parse(tsx(`scripts/qa-seed-flows.ts ${cur.document.theme.id}`))
    expect((await A.ctx.request.put(`${API}/api/v1/presentations/${id}`, { headers: H, data: { baseRevision: cur.revision, document: doc, snapshot: false } })).ok(), 'seed save')
    const p = A.p
    await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' })
    await p.locator('[data-testid="stage"]').waitFor({ timeout: 30000 })
    await p.getByRole('button', { name: /Edit with AI/ }).click()
    const ask = makeAsk(p)
    const slides = async () => (await get()).document.slides
    const waitFor = async (test) => { for (let i = 0; i < 30; i++) { const d = (await get()).document; if (test(d)) return d; await new Promise((r) => setTimeout(r, 1000)) } return (await get()).document }
    const tableOf = (d) => d.slides.flatMap((x) => x.elements ?? []).find((e) => e.type === 'table')

    await s.check('text colour: "update the text color to red" turns the TEXT red on the saved slides and leaves the deck colours and backgrounds alone', p, async () => {
      const before = (await get()).document
      const log = await ask('update the text color to red')
      expect(/Done —/.test(log), `no Done: ${log.slice(0, 300)}`)
      expect(!/Custom colours design/i.test(log), `it changed the colour scheme instead of the text: ${log.slice(0, 300)}`)
      const d = await waitFor((x) => x.slides.flatMap((sl) => sl.elements ?? []).filter((e) => e.type === 'text' && /^#ff0000$/i.test(e.color ?? '')).length >= 4)
      const red = d.slides.flatMap((sl) => sl.elements ?? []).filter((e) => e.type === 'text' && /^#ff0000$/i.test(e.color ?? '')).length
      expect(red >= 4, `only ${red} text boxes are red`)
      expect(JSON.stringify(d.theme.colors) === JSON.stringify(before.theme.colors), 'the deck colour scheme changed')
      expect(JSON.stringify(d.slides.map((sl) => sl.background)) === JSON.stringify(before.slides.map((sl) => sl.background)), 'a slide background changed')
    })
    await s.check('swap two slides: the SAVED order has slides 2 and 4 exchanged', p, async () => {
      const before = (await slides()).map((x) => x.id)
      const log = await ask('swap slides 2 and 4')
      expect(/Done —|Moved/.test(log), `no Done: ${log.slice(0, 300)}`)
      const want = [before[0], before[3], before[2], before[1], before[4]]
      const d = await waitFor((x) => x.slides.map((sl) => sl.id).join() === want.join())
      expect(d.slides.map((sl) => sl.id).join() === want.join(), `order ${d.slides.map((sl) => sl.id).join()} wanted ${want.join()}`)
    })
    await s.check('table: the highest price is highlighted in the SAVED table, and the figures are untouched', p, async () => {
      const before = JSON.stringify(tableOf((await get()).document).rows)
      const log = await ask('highlight the highest price in the table')
      expect(/Done —|Highlighted/.test(log), `no Done: ${log.slice(0, 300)}`)
      const d = await waitFor((x) => (tableOf(x)?.highlights ?? []).length > 0)
      const t = tableOf(d)
      expect((t.highlights ?? []).length === 1, `highlights ${JSON.stringify(t.highlights)}`)
      const h = t.highlights[0]
      expect(t.rows[h.row][h.column].includes('60'), `the highlight is on "${t.rows[h.row]?.[h.column]}", not the highest price`)
      expect(JSON.stringify(t.rows) === before, 'the table figures changed')
    })
    await s.check('table: the prices shown in rupees are rupee figures with the SAME numbers', p, async () => {
      const log = await ask('show the prices in the table in rupees')
      expect(/Done —|Put rupee/.test(log), `no Done: ${log.slice(0, 300)}`)
      const d = await waitFor((x) => tableOf(x).rows.every((r) => /₹/.test(r[1] ?? '')))
      const rows = tableOf(d).rows
      expect(JSON.stringify(rows.map((r) => r[1])) === JSON.stringify(['₹10', '₹30', '₹60']), `prices ${JSON.stringify(rows.map((r) => r[1]))}`)
    })
    await s.check('footer text: the SAVED deck shows the person\'s words at the bottom left', p, async () => {
      const log = await ask('put Confidential draft in the footer')
      expect(/Done —/.test(log), `no Done: ${log.slice(0, 300)}`)
      const d = await waitFor((x) => x.theme.style?.footerText === 'Confidential draft')
      expect(d.theme.style?.footerText === 'Confidential draft' && d.theme.style?.footer === 'brand', `style ${JSON.stringify(d.theme.style)}`)
    })
    await s.check('arrow: a right arrow shape is on the SAVED slide', p, async () => {
      const log = await ask('add an arrow pointing right at the bottom of slide 4')
      expect(/Done —|Added/.test(log), `no Done: ${log.slice(0, 300)}`)
      const d = await waitFor((x) => x.slides.some((sl) => (sl.elements ?? []).some((e) => e.type === 'shape' && e.shape === 'arrowRight')))
      expect(d.slides.some((sl) => (sl.elements ?? []).some((e) => e.type === 'shape' && e.shape === 'arrowRight')), 'no arrow shape saved')
    })
    await s.check('expand the deck: asked first with the cost (deck unchanged), and the button then grows the SAVED deck', p, async () => {
      const n0 = (await slides()).length
      const log = await ask(`expand the deck to ${n0 + 5} slides with more detail on the plans and the offices`)
      expect(/counts as two edits/.test(log) && /Go ahead\?/.test(log), `no cost question: ${log.slice(0, 400)}`)
      expect((await slides()).length === n0, 'the deck changed before the person confirmed')
      await p.getByRole('button', { name: /^Yes, add \d+ slides$/ }).click()
      const d = await waitFor((x) => x.slides.length >= n0 + 4)
      expect(d.slides.length >= n0 + 4, `slides ${n0} → ${d.slides.length}`)
    })
  } finally { await b.close() }
  return s.done()
}
