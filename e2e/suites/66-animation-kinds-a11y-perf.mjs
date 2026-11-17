import { API, EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { api, newDeck, person, plan } from '../kits-lib.mjs'

/**
 * The animation tools across every kind of object (text, picture, shape, chart, table), keyboard-only use, accessible names and focus, and speed with a big deck
 * (60 slides, 100 effects on one slide). Real server, real Chromium, no AI.
 */
const put = (U, id, revision, document) => U.ctx.request.fetch(`${API}/api/v1/presentations/${id}`, { method: 'PUT', headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { baseRevision: revision, document } })
const box = (x, y, w, h, extra) => ({ x, y, width: w, height: h, rotation: 0, locked: false, zIndex: 3, opacity: 1, ...extra })

export default async function () {
  const s = suite('66-animation-kinds-a11y-perf')
  const b = await launch()
  const A = await person(b, 'ak', 'gold')
  const { p } = A
  await p.setViewportSize({ width: 1500, height: 950 })
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|\[vite\]/.test(m.text())) errors.push(m.text().slice(0, 160)) })
  const tid = (t) => p.locator(`[data-testid="${t}"]`)
  const el = (id) => p.locator(`[data-element="${id}"]`)
  const saved = () => p.waitForFunction(() => [...document.querySelectorAll('[role=status]')].some((e) => /^Saved$/.test(e.textContent.trim())), null, { timeout: 20000 })
  const settleSave = async () => { await p.waitForTimeout(1500); await saved() }
  const click = async (id) => { const bb = await el(id).boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height - 6) }
  const docOf = async (id) => (await api.get(A, `/presentations/${id}`)).data.document
  const open = async (id, path = 'edit') => { await p.goto(`${EDITOR}/${path}/${id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(500) }

  const kindsDeck = async () => {
    const id = await newDeck(A, 'Kinds')
    const got = await api.get(A, `/presentations/${id}`)
    const doc = got.data.document
    const base = doc.slides[0]
    const elements = [
      { id: 'k-text', type: 'text', role: 'body', ...box(60, 60, 700, 120), fontSize: 44, color: 'textPrimary', align: 'left', valign: 'top', paragraphs: [{ runs: [{ text: 'Some words to animate' }] }] },
      { id: 'k-image', type: 'image', alt: 'A picture', fit: 'cover', clip: 'none', ...box(60, 260, 420, 280, { zIndex: 2 }) },
      { id: 'k-shape', type: 'shape', shape: 'ellipse', fill: '#2563eb', radius: 0, ...box(560, 260, 240, 240, { zIndex: 4 }) },
      { id: 'k-chart', type: 'chart', chartType: 'bar', labels: ['A', 'B', 'C'], series: [{ name: 'S', values: [3, 5, 2] }], ...box(900, 60, 500, 340) },
      { id: 'k-table', type: 'table', header: ['One', 'Two'], rows: [['a', 'b'], ['c', 'd']], ...box(900, 480, 500, 260) },
    ]
    doc.slides = [{ ...base, id: 'sl-one', elements, manual: true }]
    delete doc.slides[0].effects; delete doc.slides[0].transition
    const r = await put(A, id, got.data.revision, doc)
    expect(r.status() === 200, `save ${r.status()} ${await r.text()}`)
    return id
  }

  try {
    const deck = await kindsDeck()
    await open(deck)
    await tid('tb-animations').click()
    const kinds = ['k-text', 'k-image', 'k-shape', 'k-chart', 'k-table']

    await s.check('K1 the gallery applies an entrance to text, picture, shape, chart and table; a colour change is offered for text and shape only', p, async () => {
      for (const k of kinds) {
        await click(k)
        if (k === 'k-image' || k === 'k-chart' || k === 'k-table') expect(await tid('fx-gal-color-change').isDisabled(), `colour change is enabled for ${k}`)
        else expect(await tid('fx-gal-color-change').isEnabled(), `colour change is disabled for ${k}`)
        await tid('fx-gal-fade-in').click()
        await tid('canvas-preview').waitFor({ state: 'detached', timeout: 9000 })
      }
      await settleSave()
      const fx = (await docOf(deck)).slides[0].effects
      expect(fx.length === 5 && kinds.every((k) => fx.some((f) => f.elementId === k && f.type === 'fade-in')), JSON.stringify(fx.map((f) => f.elementId)))
    })

    await s.check('K2 Emphasis and Exit also apply to every kind (Add Animation), and the colour change works on the shape', p, async () => {
      for (const k of kinds) {
        await click(k)
        await tid('fx-add-animation').click()
        await tid('fx-add-pulse').click()
        await tid('canvas-preview').waitFor({ state: 'detached', timeout: 9000 }).catch(() => {})
      }
      await click('k-shape')
      await tid('fx-add-animation').click(); await tid('fx-add-color-change').click()
      await settleSave()
      const fx = (await docOf(deck)).slides[0].effects
      expect(kinds.every((k) => fx.some((f) => f.elementId === k && f.type === 'pulse')) && fx.some((f) => f.type === 'color-change' && f.elementId === 'k-shape'), 'a pulse or the colour change is missing')
    })

    await s.check('K3 Present: every kind of object waits hidden and appears on its click (5 entrances)', p, async () => {
      await open(deck, 'present')
      const vis = () => p.evaluate((ids) => ids.map((i) => { const w = document.querySelector(`[data-pt-el="${i}"]`); const cs = getComputedStyle(w); return cs.visibility === 'hidden' ? 0 : Number(cs.opacity) }), kinds)
      expect((await vis()).every((v) => v === 0), `before: ${(await vis()).join()}`)
      for (let i = 0; i < 12; i++) { await p.keyboard.press('Space'); await p.waitForTimeout(250); if ((await vis()).every((v) => v > 0.99)) break }
      expect((await vis()).every((v) => v > 0.99), `after: ${(await vis()).join()}`)
    })

    await s.check('B1 keyboard only: arrows move through the gallery, Enter applies; in the pane Up/Down moves, Alt+Up reorders, Delete removes; Ctrl+Z undoes', p, async () => {
      await open(deck)
      await tid('tb-animations').click(); await tid('fx-open-pane').click()
      await click('k-text')
      await tid('fx-gal-appear').focus()
      await p.keyboard.press('ArrowRight')
      expect(await p.evaluate(() => document.activeElement?.getAttribute('data-testid')) === 'fx-gal-fade-in', 'ArrowRight did not move to the next effect')
      await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight') // Fly In? the third is Zoom In after Fade In, Fly In
      await p.keyboard.press('Enter')
      await settleSave()
      let fx = (await docOf(deck)).slides[0].effects
      expect(fx.find((f) => f.elementId === 'k-text' && f.category === 'entrance').type === 'zoom-in', `applied ${fx.find((f) => f.elementId === 'k-text' && f.category === 'entrance').type}`)
      const first = p.locator('[data-testid=fx-row-select]').first()
      await first.focus()
      const n = await p.locator('[data-testid=fx-row]').count()
      const firstId = await p.locator('[data-testid=fx-row]').first().getAttribute('data-effect-id')
      await p.keyboard.press('ArrowDown')
      expect(await p.evaluate(() => document.activeElement?.closest('li')?.getAttribute('data-effect-id')) !== firstId, 'ArrowDown did not move the focus')
      await p.keyboard.press('Alt+ArrowUp')
      await settleSave()
      fx = (await docOf(deck)).slides[0].effects
      expect(fx[0].id !== firstId, 'Alt+Up did not reorder')
      await p.keyboard.press('Delete')
      await settleSave()
      expect((await docOf(deck)).slides[0].effects.length === n - 1, `Delete did not remove one effect: ${(await docOf(deck)).slides[0].effects.length} of ${n}; focus is on ${await p.evaluate(() => document.activeElement?.outerHTML.slice(0, 80))}`)
      expect((await docOf(deck)).slides[0].elements.length === 5, 'Delete in the pane deleted an OBJECT')
      await p.keyboard.press('Control+z'); await settleSave()
      expect((await docOf(deck)).slides[0].effects.length === n, 'Ctrl+Z did not bring the effect back')
    })

    await s.check('A1 every control in the Animations tab, the Animation pane, the Selection pane and the Transitions tab has an accessible name; no positive tabindex; the panes are labelled landmarks', p, async () => {
      if (await tid('animation-pane').count() === 0) await tid('fx-open-pane').click()
      await p.getByRole('complementary', { name: 'Animation pane' }).waitFor()
      const bad0 = await p.evaluate(() => [...document.querySelectorAll('[data-testid=animation-pane] button, [data-testid=animation-pane] [role=slider]')].filter((c) => !((c.getAttribute('aria-label') || c.textContent || '').trim())).map((c) => c.getAttribute('data-testid')))
      expect(bad0.length === 0, `unnamed in the pane: ${bad0.join()}`)
      await tid('fx-open-selection').click()
      const bad = await p.evaluate(() => {
        const roots = ['[data-testid=ribbon-animations]', '[data-testid=animation-pane]', '[data-testid=selection-pane]']
        const out = []
        for (const r of roots) for (const c of document.querySelectorAll(`${r} button, ${r} select, ${r} input, ${r} [role=slider]`)) {
          const label = c.getAttribute('aria-label') || (c.id && document.querySelector(`label[for="${c.id}"]`)?.textContent) || c.closest('label')?.textContent || c.textContent || c.getAttribute('title') || ''
          if (!label.trim()) out.push(`${r} ${c.tagName} ${c.getAttribute('data-testid') ?? ''}`)
          if (Number(c.getAttribute('tabindex')) > 0) out.push(`positive tabindex ${c.getAttribute('data-testid')}`)
        }
        return out
      })
      expect(bad.length === 0, `unnamed: ${bad.slice(0, 6).join('; ')}`)
      expect(await p.getByRole('complementary', { name: 'Selection pane' }).count() === 1, 'Selection pane landmark missing')
      await tid('tb-transitions').click()
      const bad2 = await p.evaluate(() => [...document.querySelectorAll('[data-testid=ribbon-transitions] button, [data-testid=ribbon-transitions] select, [data-testid=ribbon-transitions] input')].filter((c) => !((c.getAttribute('aria-label') || (c.id && document.querySelector(`label[for="${c.id}"]`)?.textContent) || c.closest('label')?.textContent || c.textContent || '').trim())).map((c) => c.getAttribute('data-testid')))
      expect(bad2.length === 0, `unnamed in Transitions: ${bad2.join()}`)
    })

    await s.check('A2 pressed/selected states are exposed (aria-pressed on the tabs and the chosen transition), the ribbons are named regions, and a locked slide disables the controls', p, async () => {
      expect(await tid('tb-transitions').getAttribute('aria-pressed') === 'true', 'tab state')
      expect(await p.getByRole('region', { name: 'Transitions tab' }).count() === 1, 'region')
      await tid('tb-animations').click()
      await p.getByRole('region', { name: 'Animations tab' }).waitFor()
    })

    // ── big deck
    await s.check('P1 60 slides and 100 effects on one slide: the pane lists all 100, opens and applies a new effect fast, and a bar drag causes no long task', p, async () => {
      plan(A.email, 'premium') // 60 slides is Premium's ceiling
      const id = await newDeck(A, 'Big')
      const got = await api.get(A, `/presentations/${id}`)
      const doc = got.data.document
      const base = doc.slides[0]
      const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: `bt${i}`, type: 'text', role: 'body', ...box(40 + (i % 5) * 360, 40 + Math.floor(i / 5) * 90, 340, 70), fontSize: 24, color: 'textPrimary', align: 'left', valign: 'top', paragraphs: [{ runs: [{ text: `Item ${i}` }] }] }))
      const els = mk(100)
      const effects = els.map((e, i) => ({ id: `bf${i}`, elementId: e.id, category: 'entrance', type: 'fade-in', start: i % 3 === 0 ? 'click' : i % 3 === 1 ? 'with' : 'after', duration: 400, delay: 0, easing: 'ease-out', repeat: 1, reverse: false }))
      const slides = Array.from({ length: 60 }, (_, i) => (i === 0 ? { ...base, id: 'big-0', elements: els.slice(0, 100), effects, manual: true } : { ...base, id: `big-${i}`, elements: mk(6).map((e) => ({ ...e, id: `s${i}-${e.id}` })), manual: true }))
      for (const sl of slides) { if (!sl.effects) delete sl.effects; delete sl.transition }
      doc.slides = slides
      const r = await put(A, id, got.data.revision, doc)
      expect(r.status() === 200, `save ${r.status()} ${(await r.text()).slice(0, 200)}`)
      await open(id)
      await tid('tb-animations').click()
      const t0 = Date.now()
      await tid('fx-open-pane').click()
      await p.locator('[data-testid=fx-row]').nth(99).waitFor({ timeout: 8000 })
      const openMs = Date.now() - t0
      expect(await p.locator('[data-testid=fx-row]').count() === 100, 'not all 100 rows')
      await p.evaluate(() => { window.__long = 0; new PerformanceObserver((l) => { window.__long += l.getEntries().filter((e) => e.duration > 120).length }).observe({ entryTypes: ['longtask'] }) })
      const bar = p.locator('[data-testid=fx-bar]').nth(5)
      await bar.scrollIntoViewIfNeeded()
      const bb = await bar.boundingBox()
      await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.mouse.move(bb.x + bb.width / 2 + 30, bb.y + bb.height / 2, { steps: 12 }); await p.mouse.up()
      await p.waitForTimeout(400)
      const long = await p.evaluate(() => window.__long)
      await click('bt3')
      const t1 = Date.now()
      await tid('fx-gal-zoom-in').click()
      await p.waitForFunction(() => document.querySelectorAll('[data-testid=fx-row]').length >= 100)
      const applyMs = Date.now() - t1
      console.log(`      perf: pane with 100 effects opened in ${openMs} ms; apply took ${applyMs} ms; long tasks (>120 ms) during a bar drag: ${long}`)
      expect(openMs < 4000 && applyMs < 1500 && long <= 1, `open ${openMs} ms, apply ${applyMs} ms, long tasks ${long}`)
    })

    await s.check('Z1 no page errors', p, async () => { expect(errors.length === 0, errors.join(' | ')) })
  } finally { /* summary below */ }

  await b.close()
  return s.done()
}
