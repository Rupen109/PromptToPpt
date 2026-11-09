import { API, EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { api, newDeck, person } from '../kits-lib.mjs'

/**
 * Morph in present mode, in a real browser against the real server (no AI, no credits). Two slides share their elements (same ids); the second moves and resizes some,
 * changes the words of one, drops one and adds one, and has a Morph transition. Checked while it plays (the animations are paused halfway and the pictures measured),
 * when it ends, when a key is pressed during it, backwards, under rapid keys; and the plan gate on the real server.
 */
const CANVAS_W = 1920

export default async function () {
  const s = suite('59-morph')
  const b = await launch()
  const A = await person(b, 'mo', 'gold')
  const { p } = A
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))

  const put = (U, id, revision, document) => U.ctx.request.fetch(`${API}/api/v1/presentations/${id}`, { method: 'PUT', headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { baseRevision: revision, document } })

  /** two slides from one scratch deck: slide 2 = slide 1 rearranged (same element ids) */
  const makeDeck = async (U, transition) => {
    const id = await newDeck(U, 'Morph deck')
    const got = await api.get(U, `/presentations/${id}`)
    const doc = got.data.document
    const first = doc.slides[0]
    // a scratch deck has two text elements; slide 1 gets a third, which slide 2 will not have
    first.elements.push({ id: 'extra-text', type: 'text', role: 'body', x: 120, y: 760, width: 700, height: 120, rotation: 0, locked: false, zIndex: 8, opacity: 1, fontSize: 36, color: 'textPrimary', align: 'left', valign: 'top', paragraphs: [{ runs: [{ text: 'This goes away on the next slide' }] }] })
    const texts = first.elements.filter((e) => e.type === 'text')
    expect(texts.length >= 3, `the scratch deck has only ${texts.length} text elements`)
    const [t1, t2, t3] = texts
    const second = JSON.parse(JSON.stringify(first)); second.id = 'slide-two'
    delete second.effects
    second.elements = second.elements.filter((e) => e.id !== t3.id) // t3 goes out
    const el = (x) => second.elements.find((e) => e.id === x.id)
    Object.assign(el(t1), { x: 960, y: 640, width: 840, height: 220, ...(el(t1).fontSize ? { fontSize: Math.round(el(t1).fontSize * 1.4) } : {}) })
    el(t2).paragraphs = [{ runs: [{ text: 'Completely different words on the second slide' }] }]
    Object.assign(el(t2), { x: 120, y: 120 })
    second.elements.push({ id: 'new-shape', type: 'shape', shape: 'rect', fill: '#e11d48', radius: 0, x: 100, y: 900, width: 300, height: 80, rotation: 0, locked: false, zIndex: 9, opacity: 1 })
    second.background = { type: 'color', value: '#101828' }
    if (transition) second.transition = transition
    doc.slides = [first, second]
    const r = await put(U, id, got.data.revision, doc)
    return { id, ids: { moved: t1.id, reworded: t2.id, gone: t3.id, added: 'new-shape' }, status: r.status(), first, second }
  }
  const MORPH = { type: 'morph', duration: 1200, own: true }
  const open = async (id) => { await p.goto(`${EDITOR}/present/${id}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid=present]').waitFor() }
  const counter = () => p.locator('[aria-live=polite]').first().innerText().then((t) => t.split('·')[0].trim())
  const overlay = () => p.locator('[data-testid=morph]')
  /** the on-screen centre of an element's wrapper on one side of the overlay (or on the plain slide), in canvas units */
  const centre = (sel) => p.evaluate(([sel, W]) => {
    const node = document.querySelector(sel); if (!node) return null
    const stage = (node.closest('[data-testid=morph]') ?? node.parentElement?.closest('div[style*="scale"]'))
    const root = document.querySelector('[data-testid=morph]') ?? stage
    const rr = (root.closest('div[style*="overflow"]') ?? root).getBoundingClientRect()
    const r = node.getBoundingClientRect(); const k = W / rr.width
    return { x: ((r.left + r.width / 2) - rr.left) * k, y: ((r.top + r.height / 2) - rr.top) * k, w: r.width * k, h: r.height * k }
  }, [sel, CANVAS_W])
  const sideSel = (side, id) => `[data-morph-side="${side}"] [data-pt-el="${id}"]`
  const settle = () => p.waitForFunction(() => !document.querySelector('[data-testid=morph]'), null, { timeout: 8000 })
  const pauseAt = (ms) => p.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms }), ms)

  try {
    const deck = await makeDeck(A, MORPH)
    const mid = (a, c) => (a + c) / 2
    const centreOf = (e) => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 })
    const ofA = deck.first.elements.find((e) => e.id === deck.ids.moved), ofB = deck.second.elements.find((e) => e.id === deck.ids.moved)

    await s.check('M0 a Gold deck with a Morph transition is saved and kept', p, async () => {
      expect(deck.status === 200, `save answered ${deck.status}`)
      const back = (await api.get(A, `/presentations/${deck.id}`)).data.document
      expect(back.slides[1].transition?.type === 'morph' && back.slides[1].transition.own === true, 'the Morph transition was not stored')
    })

    await s.check('M1 the next slide arrives by a Morph: both slides are on one canvas, matched elements exist as two copies, and animations run', p, async () => {
      await open(deck.id)
      await p.keyboard.press('Space')
      await overlay().waitFor({ timeout: 3000 })
      for (const k of ['moved', 'reworded']) {
        expect(await p.locator(sideSel('from', deck.ids[k])).count() === 1 && await p.locator(sideSel('to', deck.ids[k])).count() === 1, `${k}: not drawn as two copies`)
      }
      expect(await p.locator(sideSel('from', deck.ids.gone)).count() === 1 && await p.locator(sideSel('to', deck.ids.gone)).count() === 0, 'the removed element is not on the old side only')
      expect(await p.locator(sideSel('to', deck.ids.added)).count() === 1 && await p.locator(sideSel('from', deck.ids.added)).count() === 0, 'the added element is not on the new side only')
      expect(await p.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length) > 4, 'the animations are not running')
    })

    await s.check('M2 halfway, a matched element is between where it was and where it is going (position, and size by the change of font size)', p, async () => {
      await pauseAt(600) // the transition is 1200 ms and eases in and out: the middle is the middle
      await p.waitForTimeout(100)
      const mover = await centre(sideSel('to', deck.ids.moved))
      const a = centreOf(ofA), c = centreOf(ofB)
      expect(mover, 'the moving element could not be measured')
      expect(Math.abs(mover.x - mid(a.x, c.x)) < 60 && Math.abs(mover.y - mid(a.y, c.y)) < 60, `the element is at ${Math.round(mover.x)},${Math.round(mover.y)}, expected about ${Math.round(mid(a.x, c.x))},${Math.round(mid(a.y, c.y))}`)
      const old = await centre(sideSel('from', deck.ids.moved))
      expect(Math.abs(old.x - mover.x) < 80 && Math.abs(old.y - mover.y) < 80, 'the old copy and the new copy are not travelling together')
      await p.evaluate(() => document.getAnimations().forEach((a) => a.play()))
    })

    await s.check('M3 when it ends the overlay is gone, the second slide is shown with its own words, and there are no page errors', p, async () => {
      await settle()
      expect((await counter()).startsWith('2 /'), `on ${await counter()}`)
      await p.waitForTimeout(200)
      const text = await p.locator('[data-testid=present]').innerText()
      expect(text.includes('Completely different words'), 'the second slide does not show its own words')
      expect(await overlay().count() === 0, 'the overlay is still there')
      expect(errors.length === 0, `page errors: ${errors.join(' | ')}`)
    })

    await s.check('M4 a key pressed during a Morph finishes it at once (the slide changes, the press is not lost or doubled)', p, async () => {
      await open(deck.id)
      await p.keyboard.press('Space'); await overlay().waitFor({ timeout: 3000 })
      await p.keyboard.press('Space')
      await settle()
      expect((await counter()).startsWith('2 /'), `on ${await counter()} after pressing during the Morph`)
      expect(await overlay().count() === 0, 'the overlay is still there')
    })

    await s.check('M5 going back plays the Morph in reverse and the first slide is shown complete (the element that went out is back)', p, async () => {
      await p.keyboard.press('ArrowLeft')
      await overlay().waitFor({ timeout: 3000 })
      expect(await p.locator(sideSel('to', deck.ids.gone)).count() === 1, 'going back does not bring the removed element back')
      await settle()
      expect((await counter()).startsWith('1 /'), `on ${await counter()}`)
      expect(errors.length === 0, `page errors: ${errors.join(' | ')}`)
    })

    await s.check('M6 rapid keys never break it: no page error, no overlay left behind, and the deck ends on a real slide', p, async () => {
      await open(deck.id)
      for (let i = 0; i < 40; i++) await p.keyboard.press(i % 3 === 2 ? 'ArrowLeft' : 'Space')
      await p.waitForTimeout(300)
      for (let i = 0; i < 6; i++) { await p.keyboard.press('Space'); await p.waitForTimeout(40) }
      await settle()
      expect(errors.length === 0, `page errors: ${errors.join(' | ')}`)
      expect(await overlay().count() === 0, 'an overlay was left behind')
    })

    await s.check('M7 a slide with another transition is unchanged: no Morph overlay, the slide just changes', p, async () => {
      const plain = await makeDeck(A, { type: 'fade', duration: 500 })
      await open(plain.id)
      await p.keyboard.press('Space')
      await p.waitForTimeout(150)
      expect(await overlay().count() === 0, 'a Morph overlay appeared for a fade')
      expect((await counter()).startsWith('2 /'), `on ${await counter()}`)
    })

    await s.check('M8 the plan gate on the real server: Starter and Pro cannot save a Morph', p, async () => {
      for (const planId of ['starter', 'pro']) {
        const U = await person(b, 'mop', planId === 'starter' ? undefined : planId)
        const d = await makeDeck(U, MORPH)
        expect(d.status === 403, `${planId} saved a Morph (${d.status})`)
        await U.ctx.close()
      }
    })
  } finally { await b.close() }
  return s.done()
}
