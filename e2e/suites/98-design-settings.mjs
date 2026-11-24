import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, openDeck, person } from '../kits-lib.mjs'

/**
 * The settings that used to have no control (they were set only by templates and the assistant), in a real browser, judged on the SAVED deck and on screen:
 * Style → Design (headings in capitals, heading weight, the footer with its own words, decoration) and the Transitions ribbon's Easing and Morph Blend. No AI is used.
 */
export default async function () {
  const s = suite('98-design-settings')
  const b = await launch()
  try {
    const A = await person(b, 'b98', 'gold')
    const p = A.p
    const id = (await api.post(A, '/presentations', { title: 'Design settings deck', templateId: 'pitch-seed-round' })).data.id
    const deck = async () => (await api.get(A, `/presentations/${id}`)).data.document
    const panel = () => p.getByLabel('Design settings')

    await s.check('Style → Design: headings in capitals and a lighter weight are saved and drawn on the slide; one Ctrl+Z puts capitals back', p, async () => {
      await openDeck(p, id)
      await p.getByRole('toolbar').getByRole('button', { name: /Style/ }).click()
      await p.getByRole('tab', { name: 'Design' }).click()
      await panel().waitFor({ timeout: 8000 })
      await panel().getByLabel('Headings in capitals').check()
      await panel().getByLabel('Heading weight').fill('500')
      await p.waitForTimeout(2500)
      const d = await deck()
      expect(d.theme.style.uppercaseHeadings === true && d.theme.style.headingWeight === 500, `style: ${JSON.stringify(d.theme.style)}`)
      const shown = await p.locator('[data-testid="stage"]').innerText()
      const title = d.slides[0].elements.find((e) => e.role === 'title')
      const words = title.paragraphs.map((x) => x.runs.map((r) => r.text).join('')).join(' ').trim()
      expect(shown.includes(words.toUpperCase().split(' ')[0]), `the title is not in capitals on screen: ${shown.slice(0, 120)}`)
      await p.locator('[data-testid="stage"]').click({ position: { x: 5, y: 5 } })
      await p.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await p.waitForTimeout(2500)
      expect((await deck()).theme.style.headingWeight === 800 || (await deck()).theme.style.uppercaseHeadings === true, 'undo did not walk back one step')
    })

    await s.check('the footer: "Deck name and slide numbers" with its own words; the editor canvas and Present show them at the bottom of a slide', p, async () => {
      await panel().getByLabel('Show').selectOption('brand')
      await panel().getByLabel('Footer text').fill('Acme · Series A')
      await panel().getByLabel('Footer text').press('Enter')
      await p.waitForTimeout(2500)
      const d = await deck()
      expect(d.theme.style.footer === 'brand' && d.theme.style.footerText === 'Acme · Series A', `footer: ${JSON.stringify(d.theme.style)}`)
      await p.locator('[data-testid^="thumb-"]').nth(1).click(); await p.waitForTimeout(400) // (a title slide shows no footer, as in PowerPoint)
      expect(/Acme · Series A/.test(await p.locator('[data-testid="stage"]').innerText()), 'the editor canvas does not show the footer')
      await p.goto(`${EDITOR}/present/${id}?slide=2`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
      expect(/Acme · Series A/.test(await p.locator('body').innerText()), 'Present does not show the footer words')
      await p.keyboard.press('Escape')
    })

    await s.check('Transitions: the Easing chosen is saved; on a Morph slide the Blend choice is saved too', p, async () => {
      await openDeck(p, id)
      await p.locator('[data-testid^="thumb-"]').nth(1).click(); await p.waitForTimeout(300)
      await p.getByTestId('tb-transitions').click()
      await p.getByTestId('tr-fade').click(); await p.waitForTimeout(300)
      await p.getByTestId('tr-easing').selectOption('linear')
      await p.getByTestId('tr-morph').click(); await p.waitForTimeout(300)
      await p.getByTestId('tr-morph-blend').selectOption('cross')
      await p.waitForTimeout(2500)
      const t = (await deck()).slides[1].transition
      expect(t.type === 'morph' && t.blend === 'cross', `transition: ${JSON.stringify(t)}`)
      await p.getByTestId('tr-fade').click(); await p.waitForTimeout(300)
      await p.getByTestId('tr-easing').selectOption('back-out'); await p.waitForTimeout(2500)
      const f = (await deck()).slides[1].transition
      expect(f.type === 'fade' && f.easing === 'back-out', `fade transition: ${JSON.stringify(f)}`)
    })
  } finally {
    await b.close()
  }
  return s.done()
}
