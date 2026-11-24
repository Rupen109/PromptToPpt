import { expect, launch, suite } from '../lib.mjs'
import { api, openDeck, person } from '../kits-lib.mjs'

/**
 * A different background per SECTION (packages/validation sections.ts: a section runs from a section-divider slide to the next), in a real browser, judged on the SAVED deck:
 * section headers are added through the New slide gallery; Background → a gradient on one slide, then "Use on this section" puts that exact background on the other slides of
 * its section only; one Ctrl+Z takes it back off; "Use on all slides" puts it everywhere. A slide alone in its section is not offered the section row. No AI is used.
 */
export default async function () {
  const s = suite('100-section-background')
  const b = await launch()
  try {
    const A = await person(b, 'b100', 'pro')
    const p = A.p
    const id = (await api.post(A, '/presentations', { blank: true })).data.id
    const deck = async () => (await api.get(A, `/presentations/${id}`)).data.document
    const thumb = (i) => p.locator('[data-testid^="thumb-"]').nth(i)
    const canon = (v) => JSON.stringify(v ?? null, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [c]) => a.localeCompare(c))) : x))
    const add = async (kind) => { await p.getByRole('button', { name: 'Choose a layout' }).click(); await p.getByTestId(`layout-${kind}`).click(); await p.waitForTimeout(300) }
    const bgMenu = async () => { await p.getByTestId('tb-background').click(); await p.getByTestId('bg-remove').waitFor({ timeout: 5000 }) }

    await s.check('two section headers from the New slide gallery make two sections: slides 2-4 and 5-6', p, async () => {
      await openDeck(p, id)
      for (const k of ['section', 'content', 'content', 'section', 'content']) await add(k)
      await p.waitForTimeout(2500)
      const d = await deck()
      expect(d.slides.length === 6 && d.slides[1].layoutId === 'section-divider' && d.slides[4].layoutId === 'section-divider', `layouts: ${d.slides.map((x) => x.layoutId).join(', ')}`)
    })

    await s.check('a slide alone in its section (slide 1) is not offered "Use on this section"; "Use on all slides" is', p, async () => {
      await thumb(0).click(); await p.waitForTimeout(300)
      await bgMenu()
      expect(await p.getByTestId('bg-section').count() === 0, 'the section row is offered for a section of one slide')
      expect(await p.getByTestId('bg-all').count() === 1, '"Use on all slides" is missing')
      await p.keyboard.press('Escape')
    })

    await s.check('a gradient on slide 3, then "Use on this section": slides 2-4 have exactly that background, slides 1, 5 and 6 keep theirs', p, async () => {
      const before = await deck()
      await thumb(2).click(); await p.waitForTimeout(300)
      await bgMenu(); await p.getByTestId('bg-grad-ocean').click(); await p.waitForTimeout(300)
      await bgMenu()
      const row = p.getByTestId('bg-section')
      expect(/2.*4/.test(await row.innerText()), `the row does not name slides 2-4: ${await row.innerText()}`)
      await row.click(); await p.waitForTimeout(2500)
      const d = await deck()
      const src = canon(d.slides[2].background)
      expect(d.slides[2].background?.type === 'gradient', `slide 3: ${canon(d.slides[2].background)}`)
      expect(canon(d.slides[1].background) === src && canon(d.slides[3].background) === src, `section: ${[1, 3].map((i) => canon(d.slides[i].background)).join(' | ')}`)
      for (const i of [0, 4, 5]) expect(canon(d.slides[i].background) === canon(before.slides[i].background), `slide ${i + 1} changed: ${canon(d.slides[i].background)}`)
    })

    await s.check('one Ctrl+Z takes the copies back off (slide 3 keeps its gradient)', p, async () => {
      await p.locator('[data-testid="stage"]').click({ position: { x: 5, y: 5 } })
      await p.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await p.waitForTimeout(2500)
      const d = await deck()
      expect(d.slides[2].background?.type === 'gradient', 'the gradient of slide 3 was undone too')
      expect(d.slides[1].background?.type !== 'gradient' && d.slides[3].background?.type !== 'gradient', `still copied: ${[1, 3].map((i) => canon(d.slides[i].background)).join(' | ')}`)
    })

    await s.check('"Use on all slides" puts it on every slide', p, async () => {
      await thumb(2).click(); await p.waitForTimeout(300)
      await bgMenu(); await p.getByTestId('bg-all').click(); await p.waitForTimeout(2500)
      const d = await deck()
      const src = canon(d.slides[2].background)
      expect(d.slides.every((x) => canon(x.background) === src), `backgrounds: ${d.slides.map((x) => x.background?.type).join(', ')}`)
    })
  } finally {
    await b.close()
  }
  return s.done()
}
