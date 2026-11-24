import { API, EDITOR, PASSWORD, WEB, expect, launch, suite } from '../lib.mjs'
import { tsx } from '../kits-lib.mjs'

/**
 * The WHOLE chain with nothing faked, in a real browser: the real model (a few cheap calls) → the server's request record and credit reservation → the editor applies and verifies on the live deck →
 * the report → the server re-checks the SAVED deck and settles. Checked together: what the chat says, what the deck holds, the request record, and the credit balance.
 * Costs a handful of real AI calls. Needs a verified Gold account: E2E_EMAIL=… E2E_PASSWORD=… (the server must run the real model, not the mock).
 */
export default async function () {
  const s = suite('87-ai-live-chain')
  const email = process.env['E2E_EMAIL']
  if (!email) { console.log('  (skipped: set E2E_EMAIL / E2E_PASSWORD, a verified account)'); return s.done() }
  const b = await launch()
  try {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } })
    const r = await ctx.request.post(API + '/api/auth/sign-in/email', { headers: { origin: WEB }, data: { email, password: process.env['E2E_PASSWORD'] ?? PASSWORD } })
    expect(r.ok(), `sign-in ${r.status()}`)
    const H = { origin: EDITOR }
    const madeRes = await ctx.request.post(`${API}/api/v1/presentations`, { headers: H, data: { title: 'Live chain' } })
    const made = await madeRes.json()
    expect(!!made?.data?.id, `could not create the deck: ${madeRes.status()}`)
    const deckId = made.data.id
    const get = async () => (await (await ctx.request.get(`${API}/api/v1/presentations/${deckId}`, { headers: H })).json()).data
    const balance = async () => (await (await ctx.request.get(`${API}/api/v1/me/entitlements`, { headers: H })).json()).data.credits.balance
    const doc0 = (await get()).document
    const slides = ['Alpha', 'Beta', 'Gamma'].map((t, i) => { const c = structuredClone(doc0.slides[0]); c.id = `sl${i + 1}`; c.content.title = t; c.locked = false; return c })
    slides[1].manual = true // (a slide built from its content is rebuilt from it: a hand-added table lives on a hand-edited slide, as in the editor)
    slides[1].elements.push({ id: 'tbl', type: 'table', x: 200, y: 520, width: 1200, height: 360, rotation: 0, locked: false, zIndex: 9, opacity: 1, header: ['Plan', 'Price', 'Seats'], rows: [['Basic', '$1,150', '5'], ['Pro', '$2,340', '20'], ['Team', '$1,875', '10']] })
    const cur = await get()
    const doc = structuredClone(cur.document); doc.slides = slides
    expect((await ctx.request.put(`${API}/api/v1/presentations/${deckId}`, { headers: H, data: { baseRevision: cur.revision, document: doc, snapshot: false } })).ok(), 'seed save')

    const p = await ctx.newPage()
    const errors = []
    p.on('pageerror', (e) => errors.push(String(e).slice(0, 160)))
    await p.goto(`${EDITOR}/edit/${deckId}`, { waitUntil: 'networkidle' })
    await p.locator('[data-testid="stage"]').waitFor({ timeout: 30000 })
    await p.getByRole('button', { name: /Edit with AI/ }).click()
    const box = p.getByPlaceholder(/e\.g\./)
    const ask = async (text) => {
      // my message is the n-th time this sentence is on the page (a reply may quote it again): the reply is what comes after THAT one
      const count = (t) => t.split(text).length - 1
      const had = count(await p.locator('body').innerText())
      await box.fill(text); await box.press('Enter')
      try {
        await p.waitForFunction(([sent, n]) => { const t = document.body.innerText; let at = -1; for (let i = 0; i <= n; i++) { at = t.indexOf(sent, at + 1); if (at < 0) return false } return /Done —|Partly done|nothing was changed|couldn.t|could not|can.t do that|Nothing needed|Delete (this slide|these slides)\\?|Apply this order\\?/i.test(t.slice(at + sent.length)) }, [text, had], { timeout: 120000 })
      } catch (e) { throw new Error(`no reply after "${text}": ${(await p.locator('body').innerText()).slice(-300).replace(/\n/g, ' ⏎ ')}`) }
      await p.waitForTimeout(1500)
      const t = await p.locator('body').innerText()
      let at = -1
      for (let i = 0; i <= had; i++) at = t.indexOf(text, at + 1)
      return t.slice(at + text.length) // exactly the reply (and what follows it)
    }
    const requests = () => JSON.parse(tsx(`scripts/qa-assist-requests.ts ${deckId}`))
    const settledBy = async (n) => { for (let i = 0; i < 40; i++) { const rs = requests(); if (rs.length >= n && rs.slice(0, n).every((x) => x.status === 'settled')) return rs; await new Promise((r) => setTimeout(r, 1000)) } return requests() }

    await s.check('a real change: chat says what the deck holds, the deck has it, the request is settled as kept, credits were spent', p, async () => {
      const before = await balance()
      const log = await ask('make the theme dark')
      expect(/Done —/.test(log), `no "Done": ${log.slice(-300)}`)
      const rs = await settledBy(1)
      expect(rs[0]?.status === 'settled' && (rs[0].refundedRefs ?? []).length === 0, `request: ${JSON.stringify(rs[0])}`)
      expect(rs[0].results.some((x) => x.endsWith(':done')), `server checks: ${rs[0].results}`)
      const after = await balance()
      expect(after < before, `credits not spent (${before} → ${after})`)
      const bg = (await get()).document.theme.colors.background
      const lum = (h) => { const n = parseInt(h.replace('#', ''), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 }
      expect(lum(bg) < 110, `the deck's background is not dark: ${bg}`)
    })
    await s.check('a real shape: the chat says it, the SAVED deck has a circle on slide 1, the request is settled as kept', p, async () => {
      const before = await balance(), n0 = requests().length
      const log = await ask('add a circle in the centre of slide 1')
      expect(/Done —.*circle/s.test(log), `no "Done — … circle": ${log.slice(-300)}`)
      let found = false
      for (let i = 0; i < 20 && !found; i++) { found = (await get()).document.slides[0].elements.some((e) => e.type === 'shape' && e.shape === 'ellipse'); if (!found) await new Promise((r) => setTimeout(r, 1000)) }
      expect(found, 'the saved deck has no circle on slide 1')
      const rs = await settledBy(n0 + 1)
      expect(rs[0].status === 'settled' && (rs[0].refundedRefs ?? []).length === 0, `request: ${JSON.stringify(rs[0])}`)
      expect((await balance()) < before, 'credits not spent')
    })
    await s.check('a real table sort: the SAVED table is re-ordered with the same rows and nothing invented, the request is settled as kept', p, async () => {
      const before = await balance(), n0 = requests().length
      await p.locator('[data-testid="stage"]').waitFor()
      const log = await ask('sort the table on slide 2 by price, highest first')
      if (!/Done —.*Sorted/s.test(log)) {
        const chat = (await (await ctx.request.get(`${API}/api/v1/presentations/${deckId}/chat`, { headers: H })).json()).data
        const rowsNow = (await get()).document.slides[1].elements.find((e) => e.id === 'tbl')?.rows
        throw new Error(`no "Done — Sorted". server chat tail: ${JSON.stringify(chat.slice(-2)).slice(0, 380)} | rows now: ${JSON.stringify(rowsNow)}`)
      }
      let rows = null
      for (let i = 0; i < 20; i++) { rows = (await get()).document.slides[1].elements.find((e) => e.id === 'tbl')?.rows; if (rows?.[0]?.[0] === 'Pro') break; await new Promise((r) => setTimeout(r, 1000)) }
      expect(JSON.stringify(rows) === JSON.stringify([['Pro', '$2,340', '20'], ['Team', '$1,875', '10'], ['Basic', '$1,150', '5']]), `saved rows: ${JSON.stringify(rows)}`)
      const rs = await settledBy(n0 + 1)
      expect(rs[0].status === 'settled' && (rs[0].refundedRefs ?? []).length === 0, `request: ${JSON.stringify(rs[0])}`)
      expect((await balance()) < before, 'credits not spent')
    })
    await s.check('a real transition change: the SAVED deck has the zoom on every slide, the request is settled as kept, credits spent', p, async () => {
      const before = await balance(), n0 = requests().length
      const log = await ask('add a zoom transition between all the slides')
      expect(/Done —.*zoom/is.test(log), `no "Done — … zoom": ${log.slice(-300)}`)
      let types = []
      for (let i = 0; i < 20; i++) { types = (await get()).document.slides.map((x) => x.transition?.type); if (types.every((t) => t === 'zoom')) break; await new Promise((r) => setTimeout(r, 1000)) }
      expect(types.length === 3 && types.every((t) => t === 'zoom'), `saved transitions: ${JSON.stringify(types)}`)
      const rs = await settledBy(n0 + 1)
      expect(rs[0].status === 'settled' && (rs[0].refundedRefs ?? []).length === 0, `request: ${JSON.stringify(rs[0])}`)
      expect((await balance()) < before, 'credits not spent')
    })
    await s.check('a real object animation: the SAVED slide has a fly-in from the left on its title, the request is settled as kept, credits spent', p, async () => {
      const before = await balance(), n0 = requests().length
      const log = await ask('make the title on slide 1 fly in from the left')
      expect(/Done —.*Fly In/is.test(log), `no "Done — … Fly In": ${log.slice(-300)}`)
      let fx = null, titleId = null
      for (let i = 0; i < 20 && !fx; i++) {
        const sl = (await get()).document.slides[0]
        titleId = sl.elements.find((e) => e.type === 'text' && e.role === 'title')?.id
        fx = (sl.effects ?? []).find((e) => e.elementId === titleId && e.type === 'fly-in' && e.direction === 'left')
        if (!fx) await new Promise((r) => setTimeout(r, 1000))
      }
      expect(!!fx, 'the saved slide has no fly-in from the left on its title')
      const rs = await settledBy(n0 + 1)
      expect(rs[0].status === 'settled' && (rs[0].refundedRefs ?? []).length === 0, `request: ${JSON.stringify(rs[0])}`)
      expect((await balance()) < before, 'credits not spent')
    })
    await s.check('real exact timing: the SAVED slide has a fade-in with a 2-second DELAY (not a 2-second length) on its title, settled as kept', p, async () => {
      const before = await balance(), n0 = requests().length
      const log = await ask('make the title on slide 3 fade in after 2 seconds')
      expect(/Done —.*Fade In/is.test(log), `no "Done — … Fade In": ${log.slice(0, 300)}`)
      let fx = null
      for (let i = 0; i < 20 && !fx; i++) {
        const sl = (await get()).document.slides[2]
        const tid = sl.elements.find((e) => e.type === 'text' && e.role === 'title')?.id
        fx = (sl.effects ?? []).find((e) => e.elementId === tid && e.type === 'fade-in' && e.delay === 2000)
        if (!fx) await new Promise((r) => setTimeout(r, 1000))
      }
      expect(!!fx, 'the saved slide has no fade-in with a 2000 ms delay on its title')
      const rs = await settledBy(n0 + 1)
      expect(rs[0].status === 'settled' && (rs[0].refundedRefs ?? []).length === 0, `request: ${JSON.stringify(rs[0])}`)
      expect((await balance()) < before, 'credits not spent')
    })
    await s.check('a real website brand: the assistant READS stripe.com, the SAVED deck takes its colours, fonts and logo, the request is settled as kept', p, async () => {
      const before = await balance(), n0 = requests().length
      const t0 = (await get()).document.theme
      const log = await ask('match the brand of stripe.com')
      expect(/Done —/.test(log), `no "Done —": ${log.slice(-400)}`)
      let t = null
      for (let i = 0; i < 20; i++) { t = (await get()).document.theme; if (t.brand?.logo) break; await new Promise((r) => setTimeout(r, 1000)) }
      expect(!!t.brand?.logo?.src, 'the saved theme has no logo from the site')
      expect(t.colors.primary !== t0.colors.primary, `the primary colour did not change (${t.colors.primary})`)
      const rs = await settledBy(n0 + 1)
      expect(rs[0].status === 'settled' && (rs[0].refundedRefs ?? []).length === 0, `request: ${JSON.stringify(rs[0])}`)
      expect((await balance()) < before, 'credits not spent')
    })
    await s.check('a website with no brand on its page: nothing is changed, the chat says what it could not find, the credits come back', p, async () => {
      const before = await balance(), n0 = requests().length, themeBefore = JSON.stringify((await get()).document.theme)
      const log = await ask('match the brand of example.com')
      const tail = log
      expect(/could not find brand colours/i.test(tail), `no "could not find brand colours": ${tail.slice(-400)}`)
      expect(!/Done —/.test(tail), 'said Done for a site with no brand')
      await settledBy(n0 + 1)
      expect((await balance()) === before, 'credits were kept for a change that did not happen')
      expect(JSON.stringify((await get()).document.theme) === themeBefore, 'the theme changed')
    })
    await s.check('a real cell edit: ONE saved cell takes the figure the person typed, the other cells are untouched, the request is settled as kept', p, async () => {
      const before = await balance(), n0 = requests().length
      const rows0 = (await get()).document.slides[1].elements.find((e) => e.id === 'tbl').rows
      const log = await ask('in the table on slide 2, set the price of Basic to $1,200')
      expect(/Done —/.test(log), `no "Done —": ${log.slice(0, 300)}`)
      let rows = rows0
      for (let i = 0; i < 20; i++) { rows = (await get()).document.slides[1].elements.find((e) => e.id === 'tbl').rows; if (rows.some((r) => r[0] === 'Basic' && r[1] === '$1,200')) break; await new Promise((r) => setTimeout(r, 1000)) }
      const want = rows0.map((r) => (r[0] === 'Basic' ? [r[0], '$1,200', r[2]] : r))
      expect(JSON.stringify(rows) === JSON.stringify(want), `saved rows: ${JSON.stringify(rows)}`)
      const rs = await settledBy(n0 + 1)
      expect(rs[0].status === 'settled' && (rs[0].refundedRefs ?? []).length === 0, `request: ${JSON.stringify(rs[0])}`)
      expect((await balance()) < before, 'credits not spent')
    })
    await s.check('a real copy: the table of slide 2 appears on slide 3 with the same rows, the original stays, the request is settled as kept', p, async () => {
      const before = await balance(), n0 = requests().length
      const src = (await get()).document.slides[1].elements.find((e) => e.id === 'tbl')
      const log = await ask('copy the table from slide 2 to slide 3')
      expect(/Done —/.test(log), `no "Done —": ${log.slice(0, 300)}`)
      let copy = null
      for (let i = 0; i < 20 && !copy; i++) { const d = (await get()).document; copy = d.slides[2].elements.find((e) => e.type === 'table'); if (!copy) await new Promise((r) => setTimeout(r, 1000)) }
      expect(!!copy && JSON.stringify(copy.rows) === JSON.stringify(src.rows) && JSON.stringify(copy.header) === JSON.stringify(src.header), `copy: ${JSON.stringify(copy?.rows)}`)
      expect(!!(await get()).document.slides[1].elements.find((e) => e.id === 'tbl'), 'the original is gone')
      const rs = await settledBy(n0 + 1)
      expect(rs[0].status === 'settled' && (rs[0].refundedRefs ?? []).length === 0, `request: ${JSON.stringify(rs[0])}`)
      expect((await balance()) < before, 'credits not spent')
    })
    await s.check('a real deck review: a report built from the deck (slide numbers, what was not judged), nothing changed, no credits kept', p, async () => {
      const before = await balance(), deckBefore = JSON.stringify((await get()).document), n0 = requests().length
      const log = await ask('review my deck')
      expect(/I checked all 3 slides for:/.test(log), `no report: ${log.slice(0, 300)}`)
      expect(/I did not look at whether the facts are right/.test(log), 'the report does not say what it did not judge')
      expect(/nothing was changed|found nothing wrong/.test(log), 'the report does not say nothing was changed')
      expect(!/Done —/.test(log), 'a review said Done')
      await new Promise((r) => setTimeout(r, 2500))
      expect(JSON.stringify((await get()).document) === deckBefore, 'the deck changed during a review')
      expect((await balance()) === before, `credits were kept for a review (${before} -> ${await balance()})`)
      expect(requests().length === n0, 'a review left a change record')
    })
    await s.check('a real restructure: the PLAN comes first (deck unchanged, nothing charged), the button applies it, the SAVED deck has fewer slides, the request is settled as kept', p, async () => {
      const before = await balance(), n0 = requests().length
      const slides0 = (await get()).document.slides.length
      const log = await ask('reduce the deck to 2 slides')
      expect(new RegExp(`from ${slides0} to 2 slides`).test(log), `no plan: ${log.slice(0, 400)}`)
      expect(/Delete this slide\?/.test(log), 'the plan does not ask for confirmation')
      expect((await get()).document.slides.length === slides0, 'the deck changed before the person confirmed')
      expect((await balance()) === before, 'credits were kept for a plan that was only shown')
      expect(requests().length === n0, 'a plan left a change record')
      await p.getByRole('button', { name: /^Yes, delete/ }).click()
      await p.waitForFunction(() => /Done — deleted slide/i.test(document.body.innerText), null, { timeout: 60000 })
      let n = slides0
      for (let i = 0; i < 20; i++) { n = (await get()).document.slides.length; if (n === 2) break; await new Promise((r) => setTimeout(r, 1000)) }
      expect(n === 2, `the saved deck has ${n} slides`)
      const rs = await settledBy(n0 + 1)
      expect(rs[0].status === 'settled' && (rs[0].refundedRefs ?? []).length === 0, `request: ${JSON.stringify(rs[0])}`)
      expect((await balance()) < before, 'credits not spent')
    })
    await s.check('an unsupported request: nothing changes, the chat says so, and the credits come back', p, async () => {
      const before = await balance(), deckBefore = JSON.stringify((await get()).document.slides)
      const log = await ask('group the title and the picture on slide 1 together')
      expect(!/Done —/.test(log), 'said Done for something not supported')
      const rs = await settledBy(12)
      const after = await balance()
      expect(after === before, `credits changed (${before} → ${after}); request: ${JSON.stringify(rs[0])}`)
      expect(JSON.stringify((await get()).document.slides) === deckBefore, 'the deck changed')
    })
    await s.check('no errors in the page', p, async () => { expect(errors.length === 0, errors.join(' | ')) })
  } finally { await b.close() }
  return s.done()
}
