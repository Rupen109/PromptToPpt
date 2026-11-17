import { API, EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { api, newDeck, person, plan } from '../kits-lib.mjs'

/**
 * Morph in the editor, for the three kinds of person: Gold (set, check, fix, preview, scrub, apply to all, build), Pro (locked controls, the upgrade window, the server's 403 on a tampered save)
 * and a person who LEFT Gold (the deck still plays; Morph can be removed but not added or changed). Real server, real Chromium, no AI.
 */
const put = (U, id, revision, document) => U.ctx.request.fetch(`${API}/api/v1/presentations/${id}`, { method: 'PUT', headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { baseRevision: revision, document } })
const box = (x, y, w, h, extra) => ({ x, y, width: w, height: h, rotation: 0, locked: false, zIndex: 3, opacity: 1, ...extra })
const textEl = (id, text, x, y, extra = {}) => ({ id, type: 'text', role: 'body', ...box(x, y, 700, 120), fontSize: 44, color: 'textPrimary', align: 'left', valign: 'top', paragraphs: [{ runs: [{ text }] }], ...extra })
const shapeEl = (id, x, y) => ({ id, type: 'shape', shape: 'rect', fill: '#e11d48', radius: 12, ...box(x, y, 260, 160, { zIndex: 4 }) })

export default async function () {
  const s = suite('65-morph-editor')
  const b = await launch()
  const G = await person(b, 'mg', 'gold')
  const { p } = G
  await p.setViewportSize({ width: 1500, height: 950 })
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|\[vite\]|status of 403/.test(m.text())) errors.push(m.text().slice(0, 160)) })

  /** slide 1 and slide 2 share t-a (moved), t-b (other words), the shape (moved); slide 2 has "hero-copy" which is the same text as slide 1's "hero" under another id, and a text with no partner */
  const makeDeck = async (U, { morph = false, morphDuration } = {}) => {
    const id = await newDeck(U, 'Morph editor')
    const got = await api.get(U, `/presentations/${id}`)
    const doc = got.data.document
    const base = doc.slides[0]
    const one = { ...base, id: 'sl-one', manual: true, elements: [textEl('t-a', 'Alpha heading', 80, 60), textEl('t-b', 'Beta point', 80, 260), textEl('hero', 'Hero words', 80, 460, { label: 'Hero' }), shapeEl('s-x', 1200, 300)] }
    delete one.effects; delete one.transition
    const two = { ...one, id: 'sl-two', elements: [textEl('t-a', 'Alpha heading', 600, 120), textEl('t-b', 'Different beta words', 80, 260), textEl('hero-copy', 'Hero words', 80, 520, { label: 'Hero' }), textEl('lonely', 'Nobody before me', 80, 700), shapeEl('s-x', 400, 600)], ...(morph ? { transition: { type: 'morph', duration: morphDuration ?? 1200, easing: 'power2-in-out', own: true } } : {}) }
    doc.slides = [one, two]
    const r = await put(U, id, got.data.revision, doc)
    expect(r.status() === 200, `save ${r.status()}`)
    return id
  }
  const docOf = async (id, U = G) => (await api.get(U, `/presentations/${id}`)).data.document
  const saved = (page = p) => page.waitForFunction(() => [...document.querySelectorAll('[role=status]')].some((e) => /^Saved$/.test(e.textContent.trim())), null, { timeout: 20000 })
  const settleSave = async (page = p) => { await page.waitForTimeout(1500); await saved(page) }
  const open = async (id, page = p, slideNo = 2) => { await page.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await page.locator('[data-testid=stage]').waitFor({ timeout: 20000 }); if (slideNo > 1) await page.locator(`[data-testid=thumb-${slideNo - 1}]`).click(); await page.waitForTimeout(500) }
  const tid = (t, page = p) => page.locator(`[data-testid="${t}"]`)
  const idle = () => p.waitForFunction(() => document.getAnimations().filter((a) => a.playState === 'running').length === 0, null, { timeout: 12000 })

  try {
    const deck = await makeDeck(G)
    await open(deck)

    await s.check('G1 Gold: the Transitions tab offers Morph on the second slide; picking it is saved (own, 0.9 s default pace) and previews in place from the previous slide', p, async () => {
      await tid('tb-transitions').click()
      expect(await tid('tr-morph').isEnabled(), 'Morph is disabled for Gold')
      await tid('tr-morph').click()
      await tid('transition-preview').waitFor({ timeout: 4000 })
      expect(await tid('transition-preview').getAttribute('data-kind') === 'morph', 'the preview is not a Morph')
      await tid('morph').waitFor({ timeout: 2000 })
      await settleSave()
      const t = (await docOf(deck)).slides[1].transition
      expect(t.type === 'morph' && t.own === true && t.duration === 900, JSON.stringify(t))
      await tid('transition-preview').waitFor({ state: 'detached', timeout: 8000 })
    })

    await s.check('G2 the first slide has no Morph (nothing to morph from): the button is disabled with an explanation', p, async () => {
      await tid('thumb-0').click()
      await p.waitForTimeout(400)
      expect(await tid('tr-morph').isDisabled(), 'Morph enabled on the first slide')
      expect(/no slide before/.test(await tid('tr-morph').getAttribute('title')), 'no explanation')
      await tid('thumb-1').click(); await p.waitForTimeout(400)
    })

    await s.check('G3 Morph check: counts what moves, fades in and fades out; warns about the text with no partner; suggests the same-name object and shows the allowance', p, async () => {
      await tid('open-morph-panel').click()
      await tid('morph-panel').waitFor()
      const counts = await tid('morph-counts').innerText()
      expect(/3 move, 2 fade in, 1 fade out/.test(counts), `counts: ${counts}`)
      expect(await tid('morph-suggestion').count() === 1, 'no suggestion for the same-name hero')
      expect(/Nobody before me/.test(await tid('morph-warnings').innerText()), 'no warning for the lonely text')
      expect(/of 10/.test(await tid('morph-allowance').innerText()), `allowance: ${await tid('morph-allowance').innerText()}`)
    })

    await s.check('G4 one-click fix: Match makes it the same object (id taken from the previous slide, saved); the counts update and the suggestion is gone', p, async () => {
      await tid('morph-match').click()
      await settleSave()
      const sl = (await docOf(deck)).slides[1]
      expect(sl.elements.some((e) => e.id === 'hero') && !sl.elements.some((e) => e.id === 'hero-copy'), 'the id was not changed')
      expect(/4 move, 1 fade in, 0 fade out/.test(await tid('morph-counts').innerText()), await tid('morph-counts').innerText())
      expect(await tid('morph-suggestion').count() === 0, 'suggestion still there')
    })

    await s.check('G5 "Match to…" on an object with no suggestion: choose a partner from the previous slide (same kind only)', p, async () => {
      const sel = tid('morph-match-select').first()
      const opts = await sel.locator('option').allInnerTexts()
      expect(opts.length >= 1, 'no options')
      // the lonely text has no partners left: it says so
      expect(await sel.isDisabled() || opts.some((o) => /No partner/.test(o)), 'expected no partners for the lonely text')
    })

    await s.check('G6 undo takes the Match back as one step', p, async () => {
      await p.locator('[data-testid=stage]').click({ position: { x: 3, y: 3 } }).catch(() => {})
      await p.keyboard.press('Control+z'); await p.waitForTimeout(300)
      expect((await docOf(deck)).slides[1].elements.length > 0, 'doc broken')
      expect(await tid('morph-suggestion').count() === 1, 'the suggestion did not come back after undo')
      await p.keyboard.press('Control+y'); await p.waitForTimeout(300)
    })

    await s.check('G7 the scrubber holds the transition halfway: the preview stays, the moving text is between its two places; Replay plays it through', p, async () => {
      await tid('morph-scrub').fill('40')
      await tid('transition-preview').waitFor()
      await p.waitForTimeout(300)
      const mid = await p.evaluate(() => { const n = document.querySelector('[data-morph-side="to"] [data-pt-el="t-a"]'); return n ? n.getBoundingClientRect().x : null })
      expect(mid !== null, 'the moving object is not on the canvas')
      await tid('morph-scrub').fill('0'); await p.waitForTimeout(200)
      const start = await p.evaluate(() => document.querySelector('[data-morph-side="to"] [data-pt-el="t-a"]').getBoundingClientRect().x)
      await tid('morph-scrub').fill('100'); await p.waitForTimeout(200)
      const end = await p.evaluate(() => document.querySelector('[data-morph-side="to"] [data-pt-el="t-a"]').getBoundingClientRect().x)
      expect(end > start + 40 && mid > start + 5 && mid < end - 5, `x at 0 / 50 / 100: ${start} / ${mid} / ${end}`)
      await tid('morph-replay').click()
      await tid('transition-preview').waitFor({ state: 'detached', timeout: 9000 })
    })

    await s.check('G8 Duplicate slide for Morph: a third slide with the same object ids and a Morph transition, selected', p, async () => {
      await tid('morph-duplicate').click()
      await settleSave()
      const d = await docOf(deck)
      expect(d.slides.length === 3, `${d.slides.length} slides`)
      const [two, three] = [d.slides[1], d.slides[2]]
      expect(JSON.stringify(two.elements.map((e) => e.id)) === JSON.stringify(three.elements.map((e) => e.id)) && three.transition?.type === 'morph', 'ids or transition differ')
    })

    await s.check('G9 New slide from a Morph layout (Cards in a row): added after the current slide with its Morph transition, cards made from the same placeholders', p, async () => {
      await tid('morph-scene').selectOption('cards-row')
      await tid('morph-add-scene').click()
      await settleSave()
      const d = await docOf(deck)
      expect(d.slides.length === 4 && d.slides[3].layoutId === 'morph' && d.slides[3].transition?.type === 'morph', `slides ${d.slides.length}, ${d.slides[3]?.layoutId}, ${d.slides[3]?.transition?.type}`)
    })

    await s.check('G10 Morph on all slides: every slide but the first (4 slides: 3 changed); Remove Morph takes them all off', p, async () => {
      await tid('morph-all').click(); await settleSave()
      let d = await docOf(deck)
      expect(d.slides[0].transition === undefined && d.slides.slice(1).every((x) => x.transition?.type === 'morph'), 'not every slide but the first has Morph')
      await tid('tb-transitions').click().catch(() => {})
    })

    await s.check('G11 Present mode: the Morph travels between the two slides (the moving text is between its places halfway)', p, async () => {
      const id = await makeDeck(G, { morph: true, morphDuration: 1200 })
      await p.goto(`${EDITOR}/present/${id}`, { waitUntil: 'networkidle' }); await tid('present').waitFor(); await p.waitForTimeout(500)
      await p.keyboard.press('Space')
      await tid('morph').waitFor({ timeout: 3000 })
      await p.waitForTimeout(600)
      const x = await p.evaluate(() => document.querySelector('[data-morph-side="to"] [data-pt-el="t-a"]').getBoundingClientRect().x)
      await idle()
      await p.waitForTimeout(300)
      const final = await p.evaluate(() => document.querySelector('[data-pt-el], [data-testid=present] span')?.getBoundingClientRect().x ?? 0)
      expect(x > 0, 'no position'); void final
      expect(await tid('morph').count() === 0, 'the overlay is still there')
    })

    await s.check('G12 Selection pane: a renamed object shows its new name in the Morph check', p, async () => {
      const id = await makeDeck(G, { morph: true })
      await open(id)
      await tid('tb-animations').click(); await tid('fx-open-selection').click()
      const row = p.locator('[data-testid=sel-row][data-element-id="lonely"]')
      await row.locator('[data-testid=sel-rename]').click(); await p.locator('[data-testid=sel-name-input]').fill('Second point'); await p.keyboard.press('Enter')
      await tid('tb-transitions').click(); await tid('open-morph-panel').click()
      await tid('morph-panel').waitFor()
      expect(/Second point/.test(await tid('morph-panel').innerText()), 'name not shown')
    })

    // ── Pro
    const P = await person(b, 'mp', 'pro')
    const pp = P.p
    await pp.setViewportSize({ width: 1500, height: 950 })
    const proDeck = await makeDeck(P)
    await s.check('L1 Pro: Morph is shown locked (lock, "Gold plan" in its name); a click opens the upgrade window and changes nothing', pp, async () => {
      await open(proDeck, pp)
      await tid('tb-transitions', pp).click()
      expect(/locked, Gold plan/.test(await tid('tr-morph', pp).getAttribute('aria-label')), 'not labelled as locked')
      await tid('tr-morph', pp).click()
      await pp.getByRole('dialog').waitFor({ timeout: 4000 })
      expect(/Gold/.test(await pp.getByRole('dialog').innerText()), 'the upgrade window does not mention Gold')
      await pp.keyboard.press('Escape')
      await pp.waitForTimeout(1500)
      expect((await docOf(proDeck, P)).slides[1].transition === undefined, 'a Morph was set')
    })
    await s.check('L2 Pro: the Morph panel is locked with the upgrade prompt; the basic transitions still work', pp, async () => {
      await tid('open-morph-panel', pp).click()
      await tid('morph-locked', pp).waitFor()
      await tid('tr-fade', pp).click(); await settleSave(pp)
      expect((await docOf(proDeck, P)).slides[1].transition?.type === 'fade', 'Fade not saved on Pro')
    })
    await s.check('L3 Pro: a tampered save with a Morph transition is refused by the server (403) and nothing is stored', pp, async () => {
      const got = await api.get(P, `/presentations/${proDeck}`)
      const d = got.data.document
      d.slides[1].transition = { type: 'morph', duration: 900, easing: 'power2-in-out', own: true }
      const r = await put(P, proDeck, got.data.revision, d)
      expect(r.status() === 403, `status ${r.status()}`)
      expect((await docOf(proDeck, P)).slides[1].transition?.type !== 'morph', 'stored')
    })

    // ── left Gold
    const D = await person(b, 'md', 'gold')
    const dp = D.p
    await dp.setViewportSize({ width: 1500, height: 950 })
    const downDeck = await makeDeck(D, { morph: true })
    plan(D.email, 'pro')
    await s.check('D1 after leaving Gold: the deck opens with its Morph shown, settings are locked, Remove Morph is allowed and saves; adding again is locked', dp, async () => {
      await open(downDeck, dp)
      await tid('tb-transitions', dp).click()
      expect(await tid('tr-morph', dp).getAttribute('aria-pressed') === 'true', 'Morph is not shown as set')
      expect(await tid('tr-duration', dp).isDisabled(), 'the Morph duration is editable on Pro')
      expect(await tid('tr-morph-by', dp).isDisabled(), 'the Morph By word / character control is editable on Pro')
      expect(await tid('tr-morph-locked-note', dp).count() === 1, 'no explanation')
      await tid('morph-remove', dp).click(); await settleSave(dp)
      expect((await docOf(downDeck, D)).slides[1].transition === undefined, 'Morph not removed')
      await tid('tr-morph', dp).click()
      await dp.getByRole('dialog').waitFor({ timeout: 4000 })
    })
    await s.check('D2 after leaving Gold: changing a Morph that is still stored is refused by the server (403)', dp, async () => {
      const id = await makeDeck(G, { morph: true })
      plan(G.email, 'pro')
      const got = await api.get(G, `/presentations/${id}`)
      const d = got.data.document; d.slides[1].transition.duration = 2000
      const r = await put(G, id, got.data.revision, d)
      expect(r.status() === 403, `status ${r.status()}`)
      const got2 = await api.get(G, `/presentations/${id}`)
      const d2 = got2.data.document; delete d2.slides[1].transition
      expect((await put(G, id, got2.data.revision, d2)).status() === 200, 'removing a Morph was refused')
    })

    await s.check('Z1 no page errors in the Gold and Pro editors', p, async () => { expect(errors.length === 0, errors.join(' | ')) })
  } finally { /* summary below */ }

  await b.close()
  return s.done()
}
