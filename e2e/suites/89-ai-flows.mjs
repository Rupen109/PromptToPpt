import { API, EDITOR, PASSWORD, WEB, expect, launch, suite } from '../lib.mjs'
import { tsx } from '../kits-lib.mjs'

/**
 * Two whole flows, in a real browser with the real model. SECTIONS: the plan is shown first (nothing changed, nothing charged), the button adds the divider slides, the SAVED deck has them.
 * REVIEW → FIX: the review reports a hard-to-read slide and an empty slide, "fix the problems" repairs the text in the SAVED deck and lists the empty slide as needing a decision (never guessed).
 * Needs a verified Gold account: E2E_EMAIL=… E2E_PASSWORD=…
 */
export default async function () {
  const s = suite('89-ai-flows')
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
    const words = [['Welcome', 'A short hello for the team'], ['The problem', 'Planning is slow and scattered'], ['Our idea', 'One calm place for every plan'], ['How it works', 'Three simple steps from idea to plan'], ['The team', 'People who care about calm work'], ['Thank you', 'Questions are welcome']]
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

    await s.check('sections: the PLAN comes first (deck unchanged, nothing charged), the button adds the dividers, the SAVED deck has them, settled as kept', p, async () => {
      const before = await balance(), n0 = requests().length
      const log = await ask('group the slides into sections')
      expect(/I would add \d+ section divider slides/.test(log) && /Add these dividers\?/.test(log), `no plan: ${log.slice(0, 400)}`)
      expect((await get()).document.slides.length === 6, 'the deck changed before the person confirmed')
      expect((await balance()) === before, 'credits were kept for a plan that was only shown')
      expect(requests().length === n0, 'a plan left a change record')
      await p.getByRole('button', { name: /^Yes, add the dividers/ }).click()
      await p.waitForFunction(() => /Done —/.test(document.body.innerText) && /section divider|Added \d+ slides?/.test(document.body.innerText), null, { timeout: 60000 })
      let slides = []
      for (let i = 0; i < 20; i++) { slides = (await get()).document.slides; if (slides.length > 6) break; await new Promise((r) => setTimeout(r, 1000)) }
      const dividers = slides.filter((x) => x.layoutId === 'section-divider')
      expect(dividers.length >= 2 && slides.length === 6 + dividers.length, `saved: ${slides.length} slides, ${dividers.length} dividers`)
      expect(slides[0].id === 'sl1', 'the first slide moved')
      const rs = await settledBy(n0 + 1)
      expect(rs[0].status === 'settled' && (rs[0].refundedRefs ?? []).length === 0, `request: ${JSON.stringify(rs[0])}`)
      expect((await balance()) < before, 'credits not spent')
    })
    await s.check('review then fix: the report finds the hard-to-read slide and the empty one; "fix the problems" repairs the text in the SAVED deck and LISTS the empty slide', p, async () => {
      const cur2 = await get(); const d2 = structuredClone(cur2.document)
      const hard = d2.slides.find((x) => x.id === 'sl3'), empty = d2.slides.find((x) => x.id === 'sl4')
      hard.manual = true; hard.background = { type: 'color', value: '#101010' }
      hard.elements = [{ id: 'hardtext', type: 'text', role: 'body', x: 200, y: 300, width: 1200, height: 200, rotation: 0, locked: false, zIndex: 3, opacity: 1, fontSize: 48, align: 'left', color: '#202020', valign: 'top', paragraphs: [{ runs: [{ text: 'You cannot read this on a dark background' }] }] }]
      empty.manual = true; empty.elements = []
      expect((await ctx.request.put(`${API}/api/v1/presentations/${deckId}`, { headers: H, data: { baseRevision: cur2.revision, document: d2, snapshot: false } })).ok(), 'seed problems')
      await p.reload({ waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor({ timeout: 30000 })
      await p.getByRole('button', { name: /Edit with AI/ }).click()
      const rep = await ask('review my deck')
      expect(/hard to read/.test(rep) && /nothing on the slide/.test(rep), `report: ${rep.slice(0, 500)}`)
      const before = await balance(), n0 = requests().length
      const fix = await ask('fix the problems you found')
      expect(/Done —/.test(fix) && /readable/i.test(fix), `fix: ${fix.slice(0, 500)}`)
      expect(/Not fixed \(it needs your decision\)[^\n]*nothing on the slide/.test(fix), `the empty slide is not listed: ${fix.slice(0, 600)}`)
      let color = '#202020'
      for (let i = 0; i < 20; i++) { color = (await get()).document.slides.find((x) => x.id === 'sl3').elements.find((e) => e.id === 'hardtext')?.color; if (color !== '#202020') break; await new Promise((r) => setTimeout(r, 1000)) }
      expect(color !== '#202020', `the saved text colour is still ${color}`)
      expect((await get()).document.slides.find((x) => x.id === 'sl4'), 'the empty slide was deleted without being asked')
      const rs = await settledBy(n0 + 1)
      expect(rs[0].status === 'settled' && (rs[0].refundedRefs ?? []).length === 0, `request: ${JSON.stringify(rs[0])}`)
      expect((await balance()) < before, 'credits not spent')
    })
  } finally { await b.close() }
  return s.done()
}
