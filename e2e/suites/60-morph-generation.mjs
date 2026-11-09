import { EDITOR, expect, launch, suite, choicesReady, startBuild } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

/**
 * A Morph deck made from the create page (REAL AI, one planning call: a few cents) as a Gold person, and the locked option for Starter.
 *   - the Morph option is on the length step; with it on, the deck comes out with Morph slides: one layout, the same cards on every slide, stable element ids, a Morph transition
 *     on every slide, a cover first and a closing last, and the scenes vary from slide to slide
 *   - Starter sees the option locked; clicking it opens the upgrade prompt and nothing is started
 */
const PROMPT = 'A 8 slide pitch for Aroma Coffee Roasters, a small-batch coffee roastery with 4 stores, for local investors. Do not use any statistics.'

export default async function () {
  const s = suite('60-morph-generation')
  const b = await launch()
  const errors = []

  /** from the home prompt to the create screen's choices */
  const toChoices = async (p) => {
    await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    await p.getByLabel('Presentation prompt').fill(PROMPT)
    await p.getByRole('button', { name: 'Create Presentation' }).click(); await p.waitForURL(/\/create/, { timeout: 10000 })
    await choicesReady(p)
  }

  try {
    const A = await person(b, 'mg', 'gold')
    A.p.on('pageerror', (e) => errors.push(e.message))
    let deckId = null

    await s.check('G1 on Gold the Morph option is on the length step and can be switched on; the build finishes and opens the editor', A.p, async () => {
      await toChoices(A.p)
      const box = A.p.getByLabel('Morph animation')
      await box.waitFor({ timeout: 5000 })
      await box.check()
      expect(await box.isChecked(), 'the Morph option did not switch on')
      await startBuild(A.p)
      await A.p.waitForURL(/\/edit\//, { timeout: 240000 })
      deckId = A.p.url().match(/\/edit\/([^/?#]+)/)[1]
    })

    await s.check('G2 the deck is a Morph deck: one layout, a Morph on every slide, the same cards everywhere, stable ids, cover first and closing last, scenes that vary', A.p, async () => {
      const doc = (await api.get(A, `/presentations/${deckId}`)).data.document
      const slides = doc.slides
      expect(slides.length === 8, `${slides.length} slides`)
      expect(slides.every((x) => x.layoutId === 'morph'), 'not every slide is a Morph slide')
      expect(slides.every((x) => x.transition?.type === 'morph' && x.transition.own === true), 'a slide has no Morph transition')
      const scenes = slides.map((x) => x.content.scene)
      expect(scenes[0] === 'cover' && scenes[7] === 'closing', `scenes: ${scenes.join(', ')}`)
      expect(new Set(scenes).size >= 4, `too little variety: ${scenes.join(', ')}`)
      for (let i = 2; i < 8; i++) expect(!(scenes[i] === scenes[i - 1] && scenes[i] === scenes[i - 2]), `three in a row: ${scenes.join(', ')}`)
      const heads = (x) => JSON.stringify(x.content.items.map((c) => c.heading))
      expect(new Set(slides.map(heads)).size === 1 && slides[0].content.items.length >= 3, 'the cards differ between slides')
      const kinds = new Map()
      for (const x of slides) for (const e of x.elements) { expect(e.id.startsWith('m-'), `element id ${e.id}`); expect((kinds.get(e.id) ?? e.type) === e.type, `${e.id} changes kind`); kinds.set(e.id, e.type) }
      expect(slides.every((x) => x.validation.status !== 'failed'), 'a slide failed validation')
      expect(slides.every((x) => (x.speakerNotes ?? '').length > 20), 'a slide has no speaker notes')
    })

    await s.check('G3 the cards are written to say something (not placeholders), and nothing invented: no figures, no quote', A.p, async () => {
      const doc = (await api.get(A, `/presentations/${deckId}`)).data.document
      const items = doc.slides[0].content.items
      for (const it of items) expect(it.heading.length >= 3 && it.text.length >= 15 && !/lorem|placeholder|click to edit/i.test(it.heading + it.text), `weak card: ${JSON.stringify(it)}`)
      const all = JSON.stringify(doc.slides.map((x) => [x.content.title, x.content.subtitle, x.content.kicker, x.content.items]))
      expect(!/\d{3,}|\d+\s?%|\$\s?\d/.test(all), `a figure the user never gave: ${(all.match(/\d{3,}|\d+\s?%|\$\s?\d/) ?? [])[0]}`)
      expect(!doc.slides.some((x) => x.content.scene === 'quote' || x.content.scene === 'big-stat'), 'a quote or a big stat without anything to put in it')
    })

    await s.check('G4 the deck plays as a Morph in present mode: pressing next shows the overlay with matched elements', A.p, async () => {
      await A.p.goto(`${EDITOR}/present/${deckId}`, { waitUntil: 'networkidle' })
      await A.p.locator('[data-testid=present]').waitFor()
      await A.p.keyboard.press('ArrowRight')
      await A.p.locator('[data-testid=morph]').waitFor({ timeout: 4000 })
      const m = await A.p.evaluate(() => { const ids = (side) => [...document.querySelectorAll(`[data-morph-side="${side}"] [data-pt-el]`)].map((e) => e.getAttribute('data-pt-el')); const a = ids('from'), c = ids('to'); return { matched: a.filter((x) => c.includes(x)).length } })
      expect(m.matched >= 3, `only ${m.matched} elements matched between the first two slides`)
      await A.p.waitForFunction(() => !document.querySelector('[data-testid=morph]'), null, { timeout: 8000 })
      expect(errors.length === 0, `page errors: ${errors.join(' | ')}`)
    })

    const S = await person(b, 'ms')
    await s.check('G5 on Starter the Morph option is shown locked, opens the upgrade prompt, and no deck is started', S.p, async () => {
      await toChoices(S.p)
      const locked = S.p.getByRole('button', { name: /Morph animation/ })
      await locked.waitFor({ timeout: 5000 })
      expect(await S.p.getByLabel('Morph animation', { exact: true }).count() === 0, 'a Starter person got a working checkbox')
      await locked.click()
      await S.p.getByRole('dialog').waitFor({ timeout: 4000 })
      expect(/Gold/.test(await S.p.getByRole('dialog').innerText()), 'the upgrade prompt does not name Gold')
      expect(/\/create/.test(S.p.url()), 'the page left the create screen')
    })
  } finally { await b.close() }
  return s.done()
}
