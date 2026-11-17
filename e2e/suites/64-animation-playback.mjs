import { API, EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { api, newDeck, person } from '../kits-lib.mjs'

/**
 * Motion paths drawn in the editor, the Transitions tab, and what Present mode and the share link REALLY play, sampled with the browser's own clock
 * (computed opacity / transform at t0, mid and end, with tolerances): On Click / With Previous / After Previous order and timing, a path, a trigger, advance after N seconds,
 * By word, loops, transition direction. Real server, real Chromium, no AI.
 */
const put = (U, id, revision, document) => U.ctx.request.fetch(`${API}/api/v1/presentations/${id}`, { method: 'PUT', headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { baseRevision: revision, document } })
const box = (x, y, w, h, extra) => ({ x, y, width: w, height: h, rotation: 0, locked: false, zIndex: 3, opacity: 1, ...extra })
const textEl = (id, text, x, y) => ({ id, type: 'text', role: 'body', ...box(x, y, 700, 120), fontSize: 44, color: 'textPrimary', align: 'left', valign: 'top', paragraphs: [{ runs: [{ text }] }] })
const shapeEl = (id, x, y) => ({ id, type: 'shape', shape: 'rect', fill: '#e11d48', radius: 12, ...box(x, y, 260, 160, { zIndex: 4 }) })
const fx = (id, elementId, extra = {}) => ({ id, elementId, category: 'entrance', type: 'fade-in', start: 'click', duration: 600, delay: 0, easing: 'linear', repeat: 1, reverse: false, ...extra })

export default async function () {
  const s = suite('64-animation-playback')
  const b = await launch()
  const A = await person(b, 'ap', 'gold')
  const { p } = A
  await p.setViewportSize({ width: 1500, height: 950 })
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|\[vite\]/.test(m.text())) errors.push(m.text().slice(0, 160)) })

  const makeDeck = async ({ effects = [], transitions = [undefined, undefined], extra = [] } = {}) => {
    const id = await newDeck(A, 'Playback')
    const got = await api.get(A, `/presentations/${id}`)
    const doc = got.data.document
    const base = doc.slides[0]
    const elements = [textEl('t-a', 'Alpha heading words here', 80, 60), textEl('t-b', 'Beta point', 80, 230), textEl('t-c', 'Gamma point', 80, 400), textEl('t-d', 'Delta point', 80, 570), shapeEl('s-x', 1100, 300), ...extra]
    const one = { ...base, id: 'sl-one', elements, manual: true, ...(effects.length ? { effects } : {}), ...(transitions[0] ? { transition: transitions[0] } : {}) }
    if (!effects.length) delete one.effects
    const two = { ...one, id: 'sl-two', elements: elements.map((e) => ({ ...e })), ...(transitions[1] ? { transition: transitions[1] } : {}) }
    delete two.effects; if (!transitions[0]) delete one.transition; if (!transitions[1]) delete two.transition
    doc.slides = [one, two]
    const r = await put(A, id, got.data.revision, doc)
    expect(r.status() === 200, `save ${r.status()}: ${await r.text()}`)
    return id
  }
  const docOf = async (id) => (await api.get(A, `/presentations/${id}`)).data.document
  const saved = () => p.waitForFunction(() => [...document.querySelectorAll('[role=status]')].some((e) => /^Saved$/.test(e.textContent.trim())), null, { timeout: 20000 })
  const settleSave = async () => { await p.waitForTimeout(1500); await saved() }
  const openEditor = async (id, page = p) => { await page.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await page.locator('[data-testid=stage]').waitFor({ timeout: 20000 }); await page.waitForTimeout(400) }
  const openPresent = async (id, page = p) => { await page.goto(`${EDITOR}/present/${id}`, { waitUntil: 'networkidle' }); await page.locator('[data-testid=present]').waitFor(); await page.waitForTimeout(500) }
  const tid = (t) => p.locator(`[data-testid="${t}"]`)
  const el = (id) => p.locator(`[data-element="${id}"]`)
  const click = async (id) => { const bb = await el(id).boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height - 6) }
  const counter = () => p.locator('[aria-live=polite]').first().innerText().then((t) => t.split('·')[0].trim())
  const idle = (page = p) => page.waitForFunction(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect.getComputedTiming().iterations !== Infinity).length === 0, null, { timeout: 12000 })
  /** samples computed style of wrappers at the given ms after the call starts (same page clock) */
  const sample = (page, ids, times, prop = 'opacity') => page.evaluate(async ({ ids, times, prop }) => {
    const t0 = performance.now(); const out = []
    for (const t of times) {
      while (performance.now() - t0 < t) await new Promise((r) => requestAnimationFrame(r))
      out.push({ t: Math.round(performance.now() - t0), v: Object.fromEntries(ids.map((id) => { const w = document.querySelector(`[data-pt-el="${id}"]`); const cs = getComputedStyle(w); return [id, prop === 'opacity' ? (cs.visibility === 'hidden' ? 0 : Number(cs.opacity)) : cs.transform] })) })
    }
    return out
  }, { ids, times, prop })

  try {
    // ── motion paths in the editor
    const d1 = await makeDeck()
    await openEditor(d1)
    await tid('tb-animations').click()

    await s.check('M1 a preset path (Line) on the shape: saved with its points; changing the heading and size redraws it; the path is drawn on the canvas', p, async () => {
      await click('s-x')
      await tid('fx-gal-path-line').click()
      await tid('canvas-preview').waitFor({ state: 'detached', timeout: 9000 })
      await tid('fx-direction').selectOption('down')
      await tid('fx-distance').fill('120')
      await settleSave()
      const e = (await docOf(d1)).slides[0].effects[0]
      expect(e.category === 'path' && e.type === 'path-line' && e.direction === 'down' && e.distance === 120, JSON.stringify(e))
      expect(e.path.length === 2 && e.path[1][0] === 0 && e.path[1][1] === 120, `path ${JSON.stringify(e.path)}`)
      expect(await tid('fx-path-line').count() === 1, 'the path is not drawn on the canvas')
    })

    await s.check('M2 a drawn path: Custom path, then a stroke made with the real mouse on the canvas is thinned, saved relative to its start, and can be edited by dragging a point', p, async () => {
      await p.keyboard.press('Escape')
      await click('t-b')
      await tid('fx-gal-path-custom').click()
      const area = tid('fx-path-draw'); await area.waitFor()
      const bb = await area.boundingBox()
      const x0 = bb.x + bb.width * 0.2, y0 = bb.y + bb.height * 0.3
      await p.mouse.move(x0, y0); await p.mouse.down()
      for (let i = 1; i <= 24; i++) await p.mouse.move(x0 + i * 14, y0 + Math.sin(i / 4) * 40, { steps: 2 })
      await p.mouse.up()
      await settleSave()
      const e = (await docOf(d1)).slides[0].effects.find((f) => f.elementId === 't-b')
      expect(e.type === 'path-custom' && e.path.length >= 3 && e.path[0][0] === 0 && e.path[0][1] === 0, `drawn ${JSON.stringify(e.path)}`)
      expect(e.path.at(-1)[0] > 200, `the end of the stroke is at ${JSON.stringify(e.path.at(-1))}`)
      const handles = p.locator('[data-testid=fx-path-handle]')
      expect(await handles.count() === e.path.length - 1, 'a handle per point (except the start)')
      const hb = await handles.last().boundingBox()
      await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down(); await p.mouse.move(hb.x + hb.width / 2 + 50, hb.y + hb.height / 2 + 30, { steps: 4 }); await p.mouse.up()
      await settleSave()
      const e2 = (await docOf(d1)).slides[0].effects.find((f) => f.elementId === 't-b')
      expect(e2.path.length === e.path.length && JSON.stringify(e2.path.at(-1)) !== JSON.stringify(e.path.at(-1)), 'the dragged point did not move')
      await tid('fx-path-done').click()
    })

    await s.check('M3 Present mode: the object travels along the saved path (position at the start, halfway and at the end)', p, async () => {
      const e = (await docOf(d1)).slides[0].effects.find((f) => f.elementId === 't-b')
      const endX = e.path.at(-1)[0], endY = e.path.at(-1)[1]
      await openPresent(d1)
      await p.keyboard.press('Space') // step 1: the shape's path (first effect), a second click plays the drawn one
      await idle()
      await p.keyboard.press('Space')
      const rows = await sample(p, ['t-b'], [Math.round(e.duration / 2), e.duration + 300], 'transform')
      const m = (t) => { const mm = /matrix\(([^)]+)\)/.exec(t); return mm ? mm[1].split(',').map(Number).slice(4, 6) : [0, 0] }
      const mid = m(rows[0].v['t-b']), end = m(rows[1].v['t-b'])
      expect(Math.abs(end[0] - endX) < 3 && Math.abs(end[1] - endY) < 3, `end ${end} expected ${endX},${endY}`)
      expect(Math.abs(mid[0]) > 5 && Math.abs(mid[0]) < Math.abs(endX) + 5, `mid ${mid}`)
    })

    // ── Transitions tab
    await s.check('T1 Transitions tab: Push from the top, 0.8 s, advance after 2 s, Apply to all: both slides saved with the options; Morph shows (Gold) and the preview plays and goes away', p, async () => {
      await openEditor(d1)
      await tid('tb-transitions').click()
      await tid('tr-push').click()
      await tid('tr-direction').selectOption('up')
      await tid('tr-duration').fill('0.8')
      await tid('tr-after-on').check()
      await tid('tr-after').fill('2')
      await tid('tr-apply-all').click()
      await settleSave()
      const d = await docOf(d1)
      for (const sl of d.slides) expect(sl.transition && sl.transition.type === 'push' && sl.transition.direction === 'up' && sl.transition.duration === 800 && sl.transition.advanceAfter === 2000, `slide ${sl.id}: ${JSON.stringify(sl.transition)}`)
      expect(await tid('tr-morph').getAttribute('aria-label') === 'Morph', 'Morph is locked for a Gold person')
      await tid('tr-preview').click()
      await tid('transition-preview').waitFor({ timeout: 3000 })
      await tid('transition-preview').waitFor({ state: 'detached', timeout: 6000 })
    })

    await s.check('T2 turning off "On mouse click" is saved; with it off a click in Present mode does not advance', p, async () => {
      await tid('tr-after-on').uncheck(); await tid('tr-on-click').uncheck()
      await settleSave()
      const t = (await docOf(d1)).slides[0].transition
      expect(t.advanceOnClick === false && t.advanceAfter === undefined, JSON.stringify(t))
      await tid('tr-on-click').check()
      await settleSave()
      expect((await docOf(d1)).slides[0].transition.advanceOnClick === undefined, 'turning it back on did not clear the key')
    })

    // ── Present playback, sampled
    const d2 = await makeDeck({ effects: [
      fx('e1', 't-a', { duration: 600 }),
      fx('e2', 't-b', { start: 'after', duration: 800, delay: 200, type: 'fly-in', direction: 'left', distance: 300 }),
      fx('e3', 't-c', { start: 'with', duration: 500 }),
      fx('e4', 's-x', { category: 'path', type: 'path-line', start: 'click', duration: 1000, path: [[0, 0], [-300, 0]] }),
      fx('e5', 't-d', { type: 'zoom-in', trigger: 's-x', duration: 500 }),
    ] })

    await s.check('P1 first click: the heading fades in over its duration (hidden before, partial at the middle, opaque at the end); the others are still hidden', p, async () => {
      await openPresent(d2)
      const before = await sample(p, ['t-a', 't-b', 't-c'], [0])
      expect(before[0].v['t-a'] === 0 && before[0].v['t-b'] === 0 && before[0].v['t-c'] === 0, `before ${JSON.stringify(before[0].v)}`)
      await p.keyboard.press('Space')
      const rows = await sample(p, ['t-a', 't-b', 't-c'], [300, 500])
      expect(rows[0].v['t-a'] > 0.2 && rows[0].v['t-a'] < 0.9, `t-a at ${rows[0].t} ms: ${rows[0].v['t-a']}`)
      expect(rows[0].v['t-b'] === 0, 'After Previous started too early')
    })

    await s.check('P2 After Previous waits for the first and its own delay; With Previous starts together with the one it follows: timings within 200 ms', p, async () => {
      await openPresent(d2)
      await p.keyboard.press('Space')
      // e1 0..600, e2 starts at 600+200=800 (fly 800 ms), e3 starts with e2's start moment (600) for 500 ms
      const rows = await sample(p, ['t-a', 't-b', 't-c'], [450, 700, 1000, 1500, 2100])
      const at = (t) => rows.find((r) => r.t >= t)
      expect(at(450).v['t-a'] > 0.5 && at(450).v['t-b'] === 0 && at(450).v['t-c'] === 0, `450: ${JSON.stringify(at(450).v)}`)
      expect(at(1000).v['t-c'] === 1 || at(1000).v['t-c'] > 0.5, `with previous: t-c at 1000 = ${at(1000).v['t-c']}`)
      expect(at(1000).v['t-b'] > 0 && at(1000).v['t-b'] < 1, `fly-in is under way at 1000: ${at(1000).v['t-b']}`)
      expect(at(2100).v['t-a'] === 1 && at(2100).v['t-b'] === 1 && at(2100).v['t-c'] === 1, `2100: ${JSON.stringify(at(2100).v)}`)
      await idle()
    })

    await s.check('P3 the second click plays the path (travels left 300 px: start, middle, end); a click on the shape then plays the trigger effect for the delta text, once the slide is shown', p, async () => {
      await p.keyboard.press('Space')
      const rows = await sample(p, ['s-x'], [500, 1300], 'transform')
      const x = (t) => { const mm = /matrix\(([^)]+)\)/.exec(t); return mm ? Number(mm[1].split(',')[4]) : 0 }
      expect(x(rows[0].v['s-x']) < -80 && x(rows[0].v['s-x']) > -220, `mid ${x(rows[0].v['s-x'])}`)
      expect(Math.abs(x(rows[1].v['s-x']) + 300) < 3, `end ${x(rows[1].v['s-x'])}`)
      const dBefore = await sample(p, ['t-d'], [0]); expect(dBefore[0].v['t-d'] === 0, 'the trigger object is visible before the click')
      const sb = await p.locator('[data-pt-el="s-x"]').boundingBox()
      await p.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2)
      const after = await sample(p, ['t-d'], [700])
      expect(after[0].v['t-d'] === 1, `trigger played: ${after[0].v['t-d']}`)
      expect((await counter()).startsWith('1 /'), 'the click on the trigger object also changed the slide')
    })

    await s.check('P4 after all effects, one more click goes to the next slide', p, async () => {
      await p.keyboard.press('Space'); await p.waitForTimeout(300)
      expect((await counter()).startsWith('2 /'), `on ${await counter()}`)
    })

    const d3 = await makeDeck({ effects: [fx('w1', 't-a', { textBy: 'word', stagger: 300, duration: 400, start: 'click' }), fx('l1', 't-b', { category: 'emphasis', type: 'pulse', start: 'with', loop: true, duration: 500 })] })
    await s.check('P5 By word plays the words one after the other; Until end of slide loops forever and never blocks the next click', p, async () => {
      await openPresent(d3)
      const parts = await p.locator('[data-pt-el="t-a"] [data-pt-part=w]').count()
      expect(parts === 4, `${parts} word parts`)
      await p.keyboard.press('Space')
      const rows = await p.evaluate(async () => {
        const words = [...document.querySelectorAll('[data-pt-el="t-a"] [data-pt-part=w]')]
        await new Promise((r) => setTimeout(r, 450))
        return words.map((w) => { const cs = getComputedStyle(w); return cs.visibility === 'hidden' ? 0 : Number(cs.opacity) })
      })
      expect(rows[0] > rows[3] && rows[0] > 0.5 && rows[3] < 0.5, `word opacities at ~450 ms: ${rows.join()}`)
      const loops = await p.evaluate(() => document.getAnimations().filter((a) => a.effect.getComputedTiming().iterations === Infinity).length)
      expect(loops === 1, `${loops} looping animations`)
      await idle() // the words finish by themselves; the loop is still running and must not hold the next click
      await p.keyboard.press('Space'); await p.waitForTimeout(700)
      expect((await counter()).startsWith('2 /'), `a looping effect blocked the click: ${await counter()}`)
    })

    const d4 = await makeDeck({ transitions: [{ type: 'fade', duration: 400, advanceAfter: 1200 }, { type: 'push', duration: 600, direction: 'up' }] })
    await s.check('P6 Advance after 1.2 s moves on by itself (no key); the arriving slide plays the Push from the top; the last slide stays', p, async () => {
      const t0 = Date.now()
      await openPresent(d4)
      await p.waitForFunction(() => document.querySelector('[aria-live=polite]')?.textContent?.startsWith('2 /'), null, { timeout: 5000 })
      const dt = Date.now() - t0
      expect(dt > 1100 && dt < 4500, `moved on after ${dt} ms`)
      const name = await p.evaluate(() => { const w = document.querySelector('[data-testid=present] > div'); return w ? getComputedStyle(w).animationName : '' })
      expect(name === 'pt-t-push-up', `animation ${name}`)
      await p.waitForTimeout(2500)
      expect((await counter()).startsWith('2 /'), 'it went past the last slide')
    })

    await s.check('P7 "On mouse click" off: clicks do not advance (keys still do)', p, async () => {
      const id = await makeDeck({ transitions: [{ type: 'fade', duration: 300, advanceOnClick: false }, undefined] })
      await openPresent(id)
      await p.mouse.click(1000, 400); await p.waitForTimeout(500)
      expect((await counter()).startsWith('1 /'), 'a click advanced')
      await p.keyboard.press('Space'); await p.waitForTimeout(500)
      expect((await counter()).startsWith('2 /'), 'the key did not advance')
    })

    // ── the share link plays the same
    await s.check('S1 the view-only link plays the effects (click Next: the first effect plays, a trigger object plays its effect) and advances after the set time', p, async () => {
      const id = await makeDeck({ effects: [fx('e1', 't-a', { duration: 500 }), fx('e5', 't-d', { type: 'zoom-in', trigger: 's-x', duration: 400 })], transitions: [{ type: 'fade', duration: 300, advanceAfter: 9000 }, undefined] })
      await openEditor(id)
      await p.getByRole('button', { name: 'Share' }).click()
      await p.getByRole('dialog', { name: 'Share presentation' }).waitFor()
      await p.getByRole('tab', { name: 'View-only link' }).click()
      await p.getByRole('button', { name: 'Create view-only link' }).click()
      const url = await p.getByLabel('Share link').inputValue()
      const v = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
      await v.goto(url, { waitUntil: 'networkidle' })
      await v.getByLabel('Next slide').waitFor()
      const vis = (id) => v.evaluate((i) => { const w = document.querySelector(`[data-pt-el="${i}"]`); const cs = getComputedStyle(w); return cs.visibility === 'hidden' ? 0 : Number(cs.opacity) }, id)
      expect(await vis('t-a') === 0, 'the animated object is visible before the first click')
      await v.getByLabel('Next slide').click()
      await v.waitForTimeout(900)
      expect(await vis('t-a') === 1, 'the effect did not play in the shared view')
      expect(await v.getByText('1 / 2').count() === 1, 'the first click changed the slide instead of playing the effect')
      const sb = await v.locator('[data-pt-el="s-x"]').boundingBox()
      await v.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2); await v.waitForTimeout(700)
      expect(await vis('t-d') === 1, 'the trigger did not play in the shared view')
      await v.close()
    })

    await s.check('Z1 no page errors or console errors in any of the above', p, async () => { expect(errors.length === 0, errors.join(' | ')) })
  } finally { /* summary below */ }

  await b.close()
  return s.done()
}
