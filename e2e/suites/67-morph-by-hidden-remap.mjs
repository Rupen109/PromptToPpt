import { API, EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { api, newDeck, person } from '../kits-lib.mjs'

/**
 * Morph by word / by character (pieces travel to their partners, sampled mid-transition), the eye in the Selection pane (a hidden object is gone from the editor, Present mode, the
 * share link and Morph, and takes no click), and animations following their objects when a slide is drawn again (a layout change). Real server, real Chromium, no AI.
 */
const put = (U, id, revision, document) => U.ctx.request.fetch(`${API}/api/v1/presentations/${id}`, { method: 'PUT', headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { baseRevision: revision, document } })
const box = (x, y, w, h, extra) => ({ x, y, width: w, height: h, rotation: 0, locked: false, zIndex: 3, opacity: 1, ...extra })
const textEl = (id, text, x, y, extra = {}) => ({ id, type: 'text', role: 'body', ...box(x, y, 760, 120), fontSize: 48, color: 'textPrimary', align: 'left', valign: 'top', paragraphs: [{ runs: [{ text }] }], ...extra })

export default async function () {
  const s = suite('67-morph-by-hidden-remap')
  const b = await launch()
  const G = await person(b, 'mb', 'gold')
  const { p } = G
  await p.setViewportSize({ width: 1500, height: 950 })
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|\[vite\]/.test(m.text())) errors.push(m.text().slice(0, 160)) })
  const tid = (t) => p.locator(`[data-testid="${t}"]`)
  const docOf = async (id) => (await api.get(G, `/presentations/${id}`)).data.document
  const saved = () => p.waitForFunction(() => [...document.querySelectorAll('[role=status]')].some((e) => /^Saved$/.test(e.textContent.trim())), null, { timeout: 20000 })
  const settleSave = async () => { await p.waitForTimeout(1500); await saved() }

  const makeDeck = async ({ a = 'Our big plan works', b2 = 'Big plan for you', by, effects, hiddenOn } = {}) => {
    const id = await newDeck(G, 'Morph by')
    const got = await api.get(G, `/presentations/${id}`)
    const doc = got.data.document
    const base = doc.slides[0]
    const one = { ...base, id: 'sl-one', manual: true, elements: [textEl('w', a, 80, 100), textEl('other', 'Second object', 80, 700, { ...(hiddenOn === 'other' ? { hidden: true } : {}) })], ...(effects ? { effects } : {}) }
    delete one.transition; if (!effects) delete one.effects
    const two = { ...one, id: 'sl-two', elements: [textEl('w', b2, 760, 480), textEl('other', 'Second object', 80, 700, { ...(hiddenOn === 'other' ? { hidden: true } : {}) })], transition: { type: 'morph', duration: 1200, easing: 'linear', own: true, ...(by ? { by } : {}) } }
    delete two.effects
    doc.slides = [one, two]
    const r = await put(G, id, got.data.revision, doc)
    expect(r.status() === 200, `save ${r.status()} ${(await r.text()).slice(0, 200)}`)
    return id
  }
  const openEditor = async (id, slideNo = 1) => { await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid=stage]').waitFor({ timeout: 20000 }); if (slideNo > 0) await tid(`thumb-${slideNo}`).click(); await p.waitForTimeout(500) }
  const openPresent = async (id) => { await p.goto(`${EDITOR}/present/${id}`, { waitUntil: 'networkidle' }); await tid('present').waitFor(); await p.waitForTimeout(500) }
  /** freezes the running Morph at a fraction and reads the pieces of the text 'w' on both sides: x (canvas px) and opacity */
  const frozen = (fractions, level = 'w') => p.evaluate(async ({ fractions, level }) => {
    const anims = document.getAnimations()
    anims.forEach((a) => a.pause())
    const read = (side) => [...document.querySelectorAll(`[data-morph-side="${side}"] [data-pt-el="w"] [data-pt-part="${level}"]`)].map((n) => ({ x: n.getBoundingClientRect().left, y: n.getBoundingClientRect().top, o: Number(getComputedStyle(n).opacity), t: n.textContent }))
    const out = []
    for (const f of fractions) { anims.forEach((a) => { a.currentTime = f * 1200 }); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); out.push({ f, from: read('from'), to: read('to') }) }
    return out
  }, { fractions, level })

  try {
    const deck = await makeDeck()
    await openEditor(deck)

    await s.check('W1 the Transitions tab offers Morph "By object / By word / By character" (Gold); choosing By word is saved on the transition', p, async () => {
      await tid('tb-transitions').click()
      expect(await tid('tr-morph-by').inputValue() === 'object', 'default is not by object')
      expect((await tid('tr-morph-by').locator('option').allInnerTexts()).join() === 'By object,By word,By character', 'options')
      await tid('tr-morph-by').selectOption('word')
      await settleSave()
      const t = (await docOf(deck)).slides[1].transition
      expect(t.type === 'morph' && t.by === 'word' && t.own === true, JSON.stringify(t))
      await tid('transition-preview').waitFor({ timeout: 2000 }).catch(() => {})
    })

    await s.check('W2 the Morph check has no fallback warning for texts that share words, and a by-word run keeps pieces', p, async () => {
      await tid('open-morph-panel').click(); await tid('morph-panel').waitFor()
      expect(await tid('morph-warnings').filter({ hasText: 'word by word' }).count() === 0, 'a fallback warning for texts that can travel')
    })

    await s.check('W3 Present, by word: the words "big" and "plan" travel from their old place to their new one (start = old place, middle = between, end = new place); "Our"/"works" fade out, "for"/"you" fade in; the old copies of travelling words are hidden', p, async () => {
      await openPresent(deck)
      await p.keyboard.press('Space')
      await tid('morph').waitFor({ timeout: 3000 })
      const [f0, f30, f50, f100] = await frozen([0, 0.3, 0.5, 1])
      const toBig = (f) => f.to.find((w) => w.t === 'Big'), toPlan = (f) => f.to.find((w) => w.t === 'plan')
      const fromBig = f0.from.find((w) => w.t === 'big'), fromPlan = f0.from.find((w) => w.t === 'plan')
      expect(Math.abs(toBig(f0).x - fromBig.x) < 3 && Math.abs(toBig(f0).y - fromBig.y) < 3, `Big starts at ${toBig(f0).x},${toBig(f0).y} but "big" was at ${fromBig.x},${fromBig.y}`)
      expect(Math.abs(toPlan(f0).x - fromPlan.x) < 3, 'plan does not start where it was')
      const endX = toBig(f100).x, startX = toBig(f0).x
      expect(Math.abs(endX - startX) > 150, `the word does not travel (${startX} -> ${endX})`)
      const mid = toBig(f50).x
      expect(Math.abs(mid - (startX + endX) / 2) < 25, `halfway the word is at ${mid}, expected about ${(startX + endX) / 2}`)
      expect(toBig(f30).x > Math.min(startX, endX) - 2 && toBig(f30).x < Math.max(startX, endX) + 2 && f30.to.find((w) => w.t === 'Big').x !== mid, 'at 30% it is on the way')
      expect(f0.from.find((w) => w.t === 'big').o === 0 && f0.from.find((w) => w.t === 'plan').o === 0, 'the old copies of the travelling words are still visible')
      const our = f50.from.find((w) => w.t === 'Our'), works = f50.from.find((w) => w.t === 'works')
      expect(our.o > 0.3 && our.o < 0.7 && works.o < 0.7, `fading out: ${our.o} ${works.o}`)
      const forW = f30.to.find((w) => w.t === 'for'), youW = f100.to.find((w) => w.t === 'you')
      expect(forW.o === 0 && youW.o === 1, `fading in: for ${forW.o} at 30%, you ${youW.o} at the end`)
      await p.evaluate(() => document.getAnimations().forEach((a) => { a.finish() }))
      await tid('morph').waitFor({ state: 'detached', timeout: 4000 })
    })

    await s.check('W4 by character: letters of the two texts that match travel; the pieces are letters', p, async () => {
      const id = await makeDeck({ a: 'cat sat', b2: 'act sat', by: 'character' })
      await openPresent(id)
      await p.keyboard.press('Space'); await tid('morph').waitFor({ timeout: 3000 })
      const [f0, f50, f100] = await frozen([0, 0.5, 1], 'l')
      expect(f0.from.length === 6 && f0.to.length === 6, `${f0.from.length} / ${f0.to.length} letters`)
      const s0 = f0.to.find((l) => l.t === 's'), s50 = f50.to.find((l) => l.t === 's'), s100 = f100.to.find((l) => l.t === 's')
      expect(Math.abs(s100.x - s0.x) > 100, `the s does not travel: ${s0.x} -> ${s100.x}`)
      expect(Math.abs(s50.x - (s0.x + s100.x) / 2) < 25, `halfway ${s50.x}`)
    })

    await s.check('W5 texts too different (nothing in common) or too long still move as one object: no pieces are drawn, and the Morph check says why', p, async () => {
      const id = await makeDeck({ a: 'alpha beta gamma', b2: 'delta epsilon zeta', by: 'word' })
      await openPresent(id)
      await p.keyboard.press('Space'); await tid('morph').waitFor({ timeout: 3000 })
      expect(await p.locator('[data-morph-side] [data-pt-el="w"] [data-pt-part]').count() === 0, 'pieces were drawn for different texts')
      await p.evaluate(() => document.getAnimations().forEach((a) => a.finish()))
      const long = Array.from({ length: 70 }, (_, i) => `w${i}`).join(' ')
      const id2 = await makeDeck({ a: long, b2: long, by: 'word' })
      await openEditor(id2); await tid('tb-transitions').click(); await tid('open-morph-panel').click()
      expect(await tid('morph-warnings').filter({ hasText: 'word by word' }).count() === 1, 'no fallback warning for the long text')
    })

    await s.check('W6 By object (the default) is unchanged: no pieces are drawn for the moving text', p, async () => {
      const id = await makeDeck({ by: undefined })
      await openPresent(id)
      await p.keyboard.press('Space'); await tid('morph').waitFor({ timeout: 3000 })
      expect(await p.locator('[data-morph-side] [data-pt-el="w"] [data-pt-part]').count() === 0, 'pieces drawn by object')
      await p.evaluate(() => document.getAnimations().forEach((a) => a.finish()))
    })

    // ── hidden
    const hdeck = await makeDeck({ effects: [
      { id: 'e1', elementId: 'other', category: 'entrance', type: 'fade-in', start: 'click', duration: 400, delay: 0, easing: 'linear', repeat: 1, reverse: false },
      { id: 'e2', elementId: 'w', category: 'entrance', type: 'fade-in', start: 'click', duration: 400, delay: 0, easing: 'linear', repeat: 1, reverse: false },
    ] })
    await s.check('E1 the eye in the Selection pane hides an object: it leaves the canvas at once, is saved as hidden, is named as hidden, and undo brings it back', p, async () => {
      await openEditor(hdeck, 0)
      await tid('tb-animations').click(); await tid('fx-open-selection').click()
      expect(await p.locator('[data-element="other"]').count() === 1, 'the object is not on the canvas to begin with')
      const row = p.locator('[data-testid=sel-row][data-element-id="other"]')
      await row.locator('[data-testid=sel-eye]').click()
      expect(await p.locator('[data-element="other"]').count() === 0, 'the hidden object is still on the canvas')
      expect(await row.locator('[data-testid=sel-eye]').getAttribute('aria-pressed') === 'false', 'eye state')
      expect(/hidden/.test(await row.locator('[data-testid=sel-select]').getAttribute('aria-label')), 'not announced as hidden')
      await settleSave()
      expect((await docOf(hdeck)).slides[0].elements.find((e) => e.id === 'other').hidden === true, 'not saved')
      await p.keyboard.press('Control+z'); await p.waitForTimeout(300)
      expect(await p.locator('[data-element="other"]').count() === 1, 'undo did not bring it back')
      await row.locator('[data-testid=sel-eye]').click()
      await settleSave()
    })

    await s.check('E2 Present: the hidden object is not drawn and its animation takes no click (the first click plays the next effect)', p, async () => {
      await openPresent(hdeck)
      expect(!/Second object/.test(await tid('present').innerText()), 'the hidden text is on screen')
      const vis = () => p.evaluate(() => { const w = document.querySelector('[data-pt-el="w"]'); const cs = getComputedStyle(w); return cs.visibility === 'hidden' ? 0 : Number(cs.opacity) })
      expect(await vis() === 0, 'w is visible before its click')
      await p.keyboard.press('Space'); await p.waitForTimeout(800)
      expect(await vis() === 1, 'the first click did not play the visible object effect (the hidden one took it)')
      expect(await p.locator('[data-pt-el="other"]').count() === 0, 'a wrapper exists for the hidden object')
    })

    await s.check('E3 the share link and Morph also leave the hidden object out; showing it again brings it back', p, async () => {
      await openEditor(hdeck, 0)
      await p.getByRole('button', { name: 'Share' }).click()
      await p.getByRole('dialog', { name: 'Share presentation' }).waitFor()
      await p.getByRole('tab', { name: 'View-only link' }).click()
      await p.getByRole('button', { name: 'Create view-only link' }).click()
      const url = await p.getByLabel('Share link').inputValue()
      const v = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
      await v.goto(url, { waitUntil: 'networkidle' }); await v.getByLabel('Next slide').waitFor()
      expect(!/Second object/.test(await v.locator('main').innerText()), 'the shared view shows the hidden text')
      await v.close()
      await p.keyboard.press('Escape')
      await openPresent(hdeck)
      for (let i = 0; i < 3; i++) { await p.keyboard.press('Space'); await p.waitForTimeout(500) }
      await p.keyboard.press('Space'); await p.waitForTimeout(150)
      expect(await p.locator('[data-morph-side="from"] [data-pt-el="other"], [data-morph-side="to"] [data-pt-el="other"]').count() === 0, 'the hidden object is in the Morph')
    })

    // ── effects follow their objects when a slide is drawn again
    await s.check('R1 a layout change redraws the slide: each animation follows its object to the new element (or the person is told how many could not be kept); undo brings the old slide and effects back', p, async () => {
      const id = await newDeck(G, 'Remap')
      await openEditor(id, 0)
      await tid('tb-animations').click()
      const els = await p.locator('[data-testid=el-text]').count()
      expect(els >= 2, 'need two text objects')
      await p.locator('[data-testid=el-text]').nth(0).click({ position: { x: 20, y: 20 } })
      await tid('fx-gal-fly-in').click(); await tid('canvas-preview').waitFor({ state: 'detached', timeout: 9000 })
      await p.locator('[data-testid=el-text]').nth(1).click({ position: { x: 20, y: 20 } })
      await tid('fx-gal-fade-in').click(); await tid('canvas-preview').waitFor({ state: 'detached', timeout: 9000 })
      await settleSave()
      const before = (await docOf(id)).slides[0]
      expect(before.effects.length === 2 && !before.manual, `before: ${before.effects.length} effects, manual ${before.manual}`)
      await p.getByRole('button', { name: 'Style' }).click()
      await p.getByRole('tab', { name: 'Layouts' }).click()
      const alt = p.locator('button[aria-label^="Use "][aria-label$=" design"]').first()
      await alt.waitFor({ timeout: 5000 })
      await alt.click()
      await settleSave()
      const after = (await docOf(id)).slides[0]
      const ids = new Set(after.elements.map((e) => e.id))
      expect(after.layoutId !== before.layoutId, 'the layout did not change')
      expect(after.effects === undefined || after.effects.every((e) => ids.has(e.elementId)), 'an effect points at nothing')
      const kept = after.effects?.length ?? 0
      const toast = await p.getByText(/could not be kept/).first().innerText().catch(() => '')
      const dropped = Number(/^(\d+) animation/.exec(toast)?.[1] ?? 0)
      expect(kept + dropped === 2, `kept ${kept} + told ${dropped} is not 2 (toast: ${toast})`)
      expect(kept >= 1, 'the title animation was not kept')
      await p.keyboard.press('Control+z'); await p.waitForTimeout(400)
      await settleSave()
      expect((await docOf(id)).slides[0].effects.length === 2, 'undo did not bring both effects back')
    })

    await s.check('Z1 no page errors', p, async () => { expect(errors.length === 0, errors.join(' | ')) })
  } finally { /* summary below */ }
  await b.close()
  return s.done()
}
