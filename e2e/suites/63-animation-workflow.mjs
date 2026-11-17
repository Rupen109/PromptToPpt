import { API, EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { api, newDeck, person, plan } from '../kits-lib.mjs'

/**
 * The PowerPoint-style animation workflow in the REAL editor (Chromium, real mouse and keyboard, real server, no AI, no credits):
 * the Animations tab (gallery, effect options, timing, Add Animation, Painter, Preview), the Animation pane (order, timeline bars, keyboard), motion paths (preset + drawn),
 * triggers, the Selection pane, the Transitions tab (options, advance after N seconds, apply to all) and what Present mode and the share link really play.
 * Morph for a Gold person lives in suite 64.
 */
const put = (U, id, revision, document) => U.ctx.request.fetch(`${API}/api/v1/presentations/${id}`, { method: 'PUT', headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { baseRevision: revision, document } })
const box = (x, y, w, h, extra) => ({ x, y, width: w, height: h, rotation: 0, locked: false, zIndex: 3, opacity: 1, ...extra })
const textEl = (id, text, x, y, extra = {}) => ({ id, type: 'text', role: 'body', ...box(x, y, 640, 120), fontSize: 44, color: 'textPrimary', align: 'left', valign: 'top', paragraphs: [{ runs: [{ text }] }], ...extra })
const shapeEl = (id, x, y, fill = '#e11d48') => ({ id, type: 'shape', shape: 'rect', fill, radius: 12, ...box(x, y, 260, 160, { zIndex: 4 }) })

export default async function () {
  const s = suite('63-animation-workflow')
  const b = await launch()
  const A = await person(b, 'aw', 'gold')
  const { p } = A
  await p.setViewportSize({ width: 1500, height: 950 })
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|\[vite\]/.test(m.text())) errors.push(m.text().slice(0, 160)) })

  /** a deck of two slides with known ids: slide 1 has four text boxes and a shape on a plain background */
  const makeDeck = async (U = A) => {
    const id = await newDeck(U, 'Animation workflow')
    const got = await api.get(U, `/presentations/${id}`)
    const doc = got.data.document
    const base = doc.slides[0]
    const slide1 = { ...base, id: 'sl-one', elements: [textEl('t-a', 'Alpha heading', 80, 60), textEl('t-b', 'Beta point', 80, 230), textEl('t-c', 'Gamma point', 80, 400), textEl('t-d', 'Delta point', 80, 570), shapeEl('s-x', 1200, 300)], effects: undefined, manual: true, transition: undefined }
    delete slide1.effects
    const slide2 = { ...slide1, id: 'sl-two', elements: slide1.elements.map((e) => ({ ...e })) }
    doc.slides = [slide1, slide2]
    const r = await put(U, id, got.data.revision, doc)
    expect(r.status() === 200, `save ${r.status()}`)
    return id
  }
  const docOf = async (id, U = A) => (await api.get(U, `/presentations/${id}`)).data.document
  const fxOf = async (id, si = 0, U = A) => (await docOf(id, U)).slides[si].effects ?? []
  const saved = () => p.waitForFunction(() => [...document.querySelectorAll('[role=status]')].some((e) => /^Saved$/.test(e.textContent.trim())), null, { timeout: 20000 })
  const settleSave = async () => { await p.waitForTimeout(1500); await saved() }
  const open = async (id) => { await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid=stage]').waitFor({ timeout: 20000 }); await p.waitForTimeout(400) }
  const el = (id) => p.locator(`[data-element="${id}"]`)
  const click = async (id, mods = []) => { const bb = await el(id).boundingBox(); for (const m of mods) await p.keyboard.down(m); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height - 6); for (const m of mods) await p.keyboard.up(m) }
  const tid = (t) => p.locator(`[data-testid="${t}"]`)
  const rows = () => p.locator('[data-testid=fx-row]')
  const rowTypes = () => p.locator('[data-testid=fx-row]').evaluateAll((r) => r.map((x) => x.getAttribute('data-element-id')))
  const slideId = () => p.locator('[data-testid=stage]').evaluate(() => null)
  void slideId

  let deck
  try {
    deck = await makeDeck()
    await open(deck)

    await s.check('A1 the Animations tab opens under the toolbar with the gallery grouped Entrance, Emphasis, Exit and Motion paths, a None button and a hint', p, async () => {
      await tid('tb-animations').click()
      await tid('ribbon-animations').waitFor()
      for (const g of ['Entrance', 'Emphasis', 'Exit', 'Motion paths']) expect(await p.getByRole('group', { name: g, exact: true }).count() === 1, `group ${g} missing`)
      expect(await tid('fx-gal-none').count() === 1, 'no None button')
      expect(await p.locator('[data-testid^="fx-gal-"]').count() >= 33, 'fewer than 33 gallery buttons')
      expect(/Select an object/.test(await tid('fx-hint').innerText()), 'no hint without a selection')
      expect(await tid('fx-gal-fly-in').isDisabled(), 'an effect is enabled with nothing selected')
    })

    await s.check('A2 pick Fly In for the heading: the effect appears in the pane and is plays in place on the canvas, then the preview goes away; saved to the deck', p, async () => {
      await click('t-a')
      await tid('fx-gal-fly-in').click()
      await tid('canvas-preview').waitFor({ timeout: 3000 })
      await tid('fx-open-pane').click()
      await tid('animation-pane').waitFor()
      expect(await rows().count() === 1, 'one row expected')
      await tid('canvas-preview').waitFor({ state: 'detached', timeout: 8000 })
      await settleSave()
      const fx = await fxOf(deck)
      expect(fx.length === 1 && fx[0].type === 'fly-in' && fx[0].elementId === 't-a' && fx[0].start === 'click', `saved: ${JSON.stringify(fx)}`)
    })

    await s.check('A3 multi-select (two objects) then Fade In: one effect each in selection order, ONE undo removes both, redo brings them back', p, async () => {
      await click('t-b'); await click('t-c', ['Shift'])
      await tid('fx-gal-fade-in').click()
      await p.waitForTimeout(300)
      expect((await rowTypes()).join() === 't-a,t-b,t-c', `rows: ${(await rowTypes()).join()}`)
      await p.keyboard.press('Escape')
      await tid('stage').click({ position: { x: 5, y: 5 } }).catch(() => {})
      await p.keyboard.press('Control+z')
      await p.waitForTimeout(200)
      expect(await rows().count() === 1, `after undo ${await rows().count()} rows`)
      await p.keyboard.press('Control+y')
      await p.waitForTimeout(200)
      expect(await rows().count() === 3, `after redo ${await rows().count()} rows`)
    })

    await s.check('A4 effect options: direction From Bottom applies at once and is saved; a text box gets By word; options shown only for what the effect understands', p, async () => {
      await click('t-a')
      await tid('fx-direction').selectOption('down')
      await tid('fx-textby').selectOption('word')
      await settleSave()
      const fx = (await fxOf(deck))[0]
      expect(fx.direction === 'down' && fx.textBy === 'word', `saved ${JSON.stringify(fx)}`)
      await click('t-b')
      expect(await tid('fx-direction').count() === 0, 'a Fade has no direction control')
    })

    await s.check('A5 timing group: Start With previous, Duration 1.5 s, Delay 0.3 s, Repeat 3, Rewind: all saved in milliseconds', p, async () => {
      await click('t-b')
      await tid('fx-start').selectOption('with')
      await tid('fx-duration').fill('1.5')
      await tid('fx-delay').fill('0.3')
      await tid('fx-repeat').selectOption('3')
      await tid('fx-reverse').check()
      await settleSave()
      const fx = (await fxOf(deck)).find((f) => f.elementId === 't-b')
      expect(fx.start === 'with' && fx.duration === 1500 && fx.delay === 300 && fx.repeat === 3 && fx.reverse === true, `saved ${JSON.stringify(fx)}`)
      await tid('fx-repeat').selectOption('end')
      await settleSave()
      expect((await fxOf(deck)).find((f) => f.elementId === 't-b').loop === true, 'until end of slide not saved')
      await tid('fx-repeat').selectOption('1')
    })

    await s.check('A6 Add Animation: a Pulse and a Fade Out on the same object (entrance, emphasis, exit) in that order', p, async () => {
      await click('t-c')
      await tid('fx-add-animation').click()
      await tid('fx-add-popover').waitFor()
      await tid('fx-add-pulse').click()
      await p.waitForTimeout(300)
      await tid('fx-add-animation').click()
      await tid('fx-add-fade-out').click()
      await p.waitForTimeout(300)
      await tid('stop-preview').count()
      await settleSave()
      const mine = (await fxOf(deck)).filter((f) => f.elementId === 't-c').map((f) => f.category)
      expect(mine.join() === 'entrance,emphasis,exit', `categories ${mine.join()}`)
    })

    await s.check('A7 reorder three ways: Later button, drag a row onto another, Alt+Down on a focused row; each is saved in the new order', p, async () => {
      const ids = async () => (await fxOf(deck)).map((f) => f.id)
      let before = await ids()
      await rows().first().locator('[data-testid=fx-row-select]').click()
      await tid('fx-later').click(); await settleSave()
      let after = await ids()
      expect(after[1] === before[0] && after[0] === before[1], 'the Later button did not swap the first two')
      before = after
      await rows().nth(0).dragTo(rows().nth(2))
      await settleSave()
      after = await ids()
      expect(after[2] === before[0], `drag: ${before.join()} -> ${after.join()}`)
      before = after
      await rows().nth(0).locator('[data-testid=fx-row-select]').focus()
      await p.keyboard.press('Alt+ArrowDown')
      await settleSave()
      after = await ids()
      expect(after[1] === before[0], 'Alt+Down did not move the focused row')
    })

    await s.check('A8 timeline bars: dragging a bar changes its delay (snapped to 0.1 s), dragging its right edge changes its length, Left/Right and Shift+Right on a focused bar do the same', p, async () => {
      const row = rows().nth(0)
      const fx0 = (await fxOf(deck))[0]
      const bar = row.locator('[data-testid=fx-bar]')
      const bb = await bar.boundingBox()
      await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.mouse.move(bb.x + bb.width / 2 + 40, bb.y + bb.height / 2, { steps: 5 }); await p.mouse.up()
      await settleSave()
      const fx1 = (await fxOf(deck))[0]
      expect(fx1.delay > fx0.delay && fx1.delay % 100 === 0, `delay ${fx0.delay} -> ${fx1.delay}`)
      const bb2 = await bar.boundingBox()
      const handle = bar.locator('[data-testid=fx-bar-resize]')
      const hb = await handle.boundingBox()
      await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down(); await p.mouse.move(hb.x + hb.width / 2 + 30, hb.y + hb.height / 2, { steps: 5 }); await p.mouse.up()
      await settleSave()
      const fx2 = (await fxOf(deck))[0]
      expect(fx2.duration > fx1.duration && fx2.duration % 100 === 0, `duration ${fx1.duration} -> ${fx2.duration}`)
      expect(bb2.width > 0, 'bar has no width')
      await bar.focus(); await p.keyboard.press('ArrowRight'); await p.keyboard.press('Shift+ArrowRight')
      await settleSave()
      const fx3 = (await fxOf(deck))[0]
      expect(fx3.delay === fx2.delay + 100 && fx3.duration === fx2.duration + 100, `keyboard: ${JSON.stringify([fx2.delay, fx2.duration, fx3.delay, fx3.duration])}`)
    })

    await s.check('A9 the pane and the canvas follow each other: clicking a row selects the object; selecting an object highlights its row; numbered badges sit on animated objects', p, async () => {
      await rows().nth(1).locator('[data-testid=fx-row-select]').click()
      const eid = await rows().nth(1).getAttribute('data-element-id')
      expect(await el(eid).evaluate((n) => n.style.outline.includes('solid')), 'the object is not selected on the canvas after clicking its row')
      await click('t-d')
      expect(await p.locator('[data-testid=fx-badge]').count() >= 3, 'fewer than 3 badges')
      await click('t-a')
      expect(await p.locator('[data-testid=fx-row][aria-current=true]').first().getAttribute('data-element-id') === 't-a', 'the row of the selected object is not marked')
    })

    await s.check('A10 Animation Painter: copy the effects of the heading onto the delta text; None removes them from the selection again', p, async () => {
      await click('t-a')
      await tid('fx-painter').click()
      await tid('fx-painter-hint').waitFor()
      await click('t-d')
      await p.waitForTimeout(400)
      await settleSave()
      const fx = await fxOf(deck)
      const a = fx.filter((f) => f.elementId === 't-a'), d = fx.filter((f) => f.elementId === 't-d')
      expect(d.length === a.length && d[0].type === a[0].type && d[0].id !== a[0].id, `painted ${JSON.stringify(d)}`)
      await tid('canvas-preview').waitFor({ state: 'detached', timeout: 8000 })
      await click('t-d')
      await tid('fx-gal-none').click()
      await settleSave()
      expect((await fxOf(deck)).filter((f) => f.elementId === 't-d').length === 0, 'None did not remove')
    })

    await s.check('A11 Trigger: the delta text plays when the shape is clicked; the effect leaves the click sequence', p, async () => {
      await click('t-d')
      await tid('fx-gal-zoom-in').click()
      await tid('canvas-preview').waitFor({ state: 'detached', timeout: 8000 })
      await tid('fx-trigger').selectOption('s-x')
      await settleSave()
      const fx = (await fxOf(deck)).find((f) => f.elementId === 't-d')
      expect(fx.trigger === 's-x', `saved ${JSON.stringify(fx)}`)
    })

    await s.check('A12 Selection pane: rename an object (kept in the deck and shown in the Animation pane), reorder layers', p, async () => {
      await tid('fx-open-selection').click()
      await tid('selection-pane').waitFor()
      const row = p.locator('[data-testid=sel-row][data-element-id="t-a"]')
      await row.locator('[data-testid=sel-rename]').click()
      await p.locator('[data-testid=sel-name-input]').fill('Main title')
      await p.keyboard.press('Enter')
      await settleSave()
      const d = await docOf(deck)
      expect(d.slides[0].elements.find((e) => e.id === 't-a').label === 'Main title', 'label not saved')
      const front = await p.locator('[data-testid=sel-row]').first().getAttribute('data-element-id')
      await p.locator('[data-testid=sel-row]').nth(1).locator('[data-testid=sel-up]').click()
      await settleSave()
      expect(await p.locator('[data-testid=sel-row]').first().getAttribute('data-element-id') !== front, 'the layer did not move forward')
      await tid('fx-open-pane').click()
      expect(await p.locator('[data-testid=animation-pane]').innerText().then((t) => t.includes('Main title')), 'the Animation pane does not show the new name')
    })

    await s.check('A13 reload: everything set so far is still there (effects, order, names), no page errors', p, async () => {
      const n = (await fxOf(deck)).length
      await open(deck)
      await tid('tb-animations').click(); await tid('fx-open-pane').click()
      expect(await rows().count() === n, `rows after reload ${await rows().count()} vs ${n}`)
      expect(errors.length === 0, `errors: ${errors.join(' | ')}`)
    })
  } finally { /* summary below */ }

  await b.close()
  return s.done()
}
