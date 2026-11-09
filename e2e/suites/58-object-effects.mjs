import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, newDeck, person } from '../kits-lib.mjs'

/**
 * Object effects in present mode, in a real browser against the real server (no AI, no credits): a Gold deck with effects is saved through the API, then played with the keyboard.
 *   - the elements that start with an entrance are hidden, the effects play on Space / click in the order set (On Click, After Previous, With Previous), a click while
 *     something moves finishes it, Back takes one step back, and only when a slide has nothing more does the slide change
 *   - coming back to a slide from the next one shows it finished
 *   - a deck without effects behaves as before; rapid keys never leave a mess; Starter and Pro cannot add effects (server)
 */
const eff = (id, elementId, extra = {}) => ({ id, elementId, category: 'entrance', type: 'fade-in', start: 'click', duration: 400, delay: 0, easing: 'ease-out', repeat: 1, reverse: false, ...extra })

export default async function () {
  const s = suite('58-object-effects')
  const b = await launch()
  const A = await person(b, 'fx', 'gold')
  const { p } = A
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))

  /** a deck of two slides: the first has three elements with effects; ids are chosen here so the test knows which is which */
  const makeDeck = async (withEffects) => {
    const id = await newDeck(A, 'Effects deck')
    const got = await api.get(A, `/presentations/${id}`)
    const doc = got.data.document
    const first = doc.slides[0]
    const texts = first.elements.filter((e) => e.type === 'text').slice(0, 3)
    expect(texts.length >= 2, `the scratch deck has only ${texts.length} text elements`)
    const [a, bb, c] = texts
    const second = JSON.parse(JSON.stringify(first)); second.id = 'slide-two'; second.elements = second.elements.map((e) => ({ ...e, id: `two-${e.id}` })); delete second.effects
    doc.slides = [{ ...first, ...(withEffects ? { manual: true, effects: [eff('f1', a.id), eff('f2', bb.id, { start: 'after', type: 'zoom-in' }), ...(c ? [eff('f3', c.id, { start: 'with', type: 'appear' })] : [])] } : {}) }, second]
    const r = await A.ctx.request.fetch(`${process.env.E2E_API ?? 'http://localhost:4000'}/api/v1/presentations/${id}`, { method: 'PUT', headers: { Origin: process.env.E2E_WEB ?? 'http://localhost:3000', 'Content-Type': 'application/json' }, data: { baseRevision: got.data.revision, document: doc } })
    return { id, ids: texts.map((t) => t.id), status: r.status() }
  }
  const wrapper = (id) => p.locator(`[data-pt-el="${id}"]`)
  const visible = (id) => wrapper(id).evaluate((el) => { const cs = getComputedStyle(el); return cs.visibility === 'visible' && Number(cs.opacity) > 0.99 })
  const hidden = (id) => wrapper(id).evaluate((el) => { const cs = getComputedStyle(el); return cs.visibility === 'hidden' || Number(cs.opacity) < 0.01 })
  const idle = () => p.waitForFunction(() => document.getAnimations().filter((a) => a.playState === 'running').length === 0, null, { timeout: 8000 })
  const counter = () => p.locator('[aria-live=polite]').first().innerText().then((t) => t.split('·')[0].trim())
  const open = async (id) => { await p.goto(`${EDITOR}/present/${id}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid=present]').waitFor() }

  try {
    const deck = await makeDeck(true)
    await s.check('B0 a Gold deck with effects is saved and kept (not stripped)', p, async () => {
      expect(deck.status === 200, `save answered ${deck.status}`)
      const back = (await api.get(A, `/presentations/${deck.id}`)).data.document
      expect((back.slides[0].effects ?? []).length >= 2, 'the effects were not stored')
    })

    await s.check('B1 an element that starts with an entrance is hidden; nothing is automatic, so nothing moves until the first click', p, async () => {
      await open(deck.id)
      const [a, bb] = deck.ids
      await p.waitForTimeout(600)
      expect(await hidden(a) && await hidden(bb), 'the animated elements were visible before their effects played')
      expect((await counter()).startsWith('1 /'), `on slide ${await counter()}`)
    })

    await s.check('B2 Space plays the effects in order: first (On Click), then the second After Previous, the third With Previous; the slide does not change', p, async () => {
      const [a, bb, c] = deck.ids
      await p.keyboard.press('Space')
      await idle()
      expect(await visible(a), 'the first element did not appear after the click')
      await p.waitForTimeout(150)
      expect((await counter()).startsWith('1 /'), 'the slide changed while effects were still to play')
      // after previous: the second element is still hidden until the first is done; wait for the whole step
      await idle()
      expect(await visible(bb), 'the second element (After Previous) never appeared')
      if (c) expect(await visible(c), 'the third element (With Previous) never appeared')
    })

    await s.check('B3 a click while an effect moves finishes it at once (the step is not skipped, the slide does not change)', p, async () => {
      const d2 = await makeDeck(true)
      await open(d2.id)
      const [a] = d2.ids
      await p.keyboard.press('Space')
      await p.keyboard.press('Space') // while the first is still moving
      expect(await visible(a), 'the moving effect was not finished by the second click')
      expect((await counter()).startsWith('1 /'), 'the second click changed the slide')
    })

    await s.check('B4 with every effect played, the next press changes the slide; Back from the next slide shows the first one finished', p, async () => {
      const d3 = await makeDeck(true)
      await open(d3.id)
      for (let i = 0; i < 6; i++) { await p.keyboard.press('Space'); await p.waitForTimeout(50) }
      await idle()
      expect((await counter()).startsWith('2 /'), `still on ${await counter()} after all effects played`)
      await p.keyboard.press('ArrowLeft')
      await p.waitForTimeout(300)
      expect((await counter()).startsWith('1 /'), 'Back did not return to slide 1')
      for (const id of d3.ids) expect(await visible(id), 'a slide you come back to must be shown finished')
    })

    await s.check('B5 Back inside a slide takes one effect back, at once, and shows what was there before', p, async () => {
      const d4 = await makeDeck(true)
      await open(d4.id)
      const [a] = d4.ids
      await p.keyboard.press('Space'); await idle()
      expect(await visible(a), 'the first effect did not play')
      await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(150)
      expect((await counter()).startsWith('1 /'), 'Back left the slide although an effect could be taken back')
      expect(await hidden(a), 'Back did not hide the element again')
    })

    await s.check('B6 rapid key presses never break a deck: no page error, and the end state is complete', p, async () => {
      const d5 = await makeDeck(true)
      await open(d5.id)
      for (let i = 0; i < 40; i++) await p.keyboard.press(i % 7 === 6 ? 'ArrowLeft' : 'Space')
      for (let i = 0; i < 10; i++) await p.keyboard.press('Space')
      await idle()
      expect(errors.length === 0, `page errors: ${errors.join(' | ')}`)
      expect((await counter()).startsWith('2 /'), `ended on ${await counter()}`)
      await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(300)
      for (const id of d5.ids) expect(await visible(id), 'an element is missing after rapid navigation')
    })

    await s.check('B7 a deck without effects is unchanged: no wrapper, the first press goes to the next slide', p, async () => {
      const plain = await makeDeck(false)
      await open(plain.id)
      expect(await p.locator('[data-pt-el]').count() === 0, 'a deck without effects got effect wrappers')
      await p.keyboard.press('Space'); await p.waitForTimeout(400)
      expect((await counter()).startsWith('2 /'), 'the first press did not change the slide')
    })

    await s.check('B8 the plan gate holds on the real server: Starter and Pro cannot save effects', p, async () => {
      for (const planId of ['starter', 'pro']) {
        const U = await person(b, 'fxp', planId === 'starter' ? undefined : planId)
        const id = await newDeck(U, 'Gate deck')
        const got = await api.get(U, `/presentations/${id}`)
        const doc = got.data.document; const el = doc.slides[0].elements[0]
        doc.slides[0].effects = [eff('g1', el.id)]
        const r = await U.ctx.request.fetch(`${process.env.E2E_API ?? 'http://localhost:4000'}/api/v1/presentations/${id}`, { method: 'PUT', headers: { Origin: process.env.E2E_WEB ?? 'http://localhost:3000', 'Content-Type': 'application/json' }, data: { baseRevision: got.data.revision, document: doc } })
        expect(r.status() === 403, `${planId} saved effects (${r.status()})`)
        await U.ctx.close()
      }
    })
  } finally { await b.close() }
  return s.done()
}
