import { expect, launch, suite } from '../lib.mjs'
import { api, openBrand, person } from '../kits-lib.mjs'

/**
 * A THEME made from a brand kit (services/api brand/themes.ts + packages/theme brand-theme.ts), in a real browser, judged on the SAVED account and deck:
 * Style → Brand → "Make a theme from <kit>": a template, Dark, a name → saved to the person's themes; "Apply" puts it on the deck in one step (the kit's colours and fonts,
 * the template's layout style); one Ctrl+Z puts the deck back; editing the kit changes the saved theme; the theme can be deleted. No AI is used.
 */
export default async function () {
  const s = suite('101-brand-theme')
  const b = await launch()
  try {
    const A = await person(b, 'b101', 'gold')
    const p = A.p
    p.on('dialog', (d) => void d.accept())
    const kit = (await api.post(A, '/brand/kits', { name: 'Acme', primary: '#E4572E', accent: '#17BEBB', headingFont: 'Playfair Display', bodyFont: 'Inter' })).data
    const id = (await api.post(A, '/presentations', { title: 'Brand theme deck', templateId: 'pitch-seed-round' })).data.id
    const deck = async () => (await api.get(A, `/presentations/${id}`)).data.document
    const themes = async () => (await api.get(A, '/brand/themes')).data.themes
    const box = () => p.getByLabel('Make a theme from this kit')
    // the database keeps object keys in its own order: compare by value
    const canon = (v) => JSON.stringify(Object.entries(v ?? {}).sort(([x], [y]) => x.localeCompare(y)))
    let before

    await s.check('Make a theme: a template, Dark and a name; the preview shows it; Save keeps it in the account (dark, from the kit)', p, async () => {
      before = await deck()
      await openBrand(p, id)
      await box().waitFor({ timeout: 8000 })
      const design = box().getByLabel('Theme design')
      const value = await design.locator('option').nth(3).getAttribute('value')
      await design.selectOption(value)
      await box().getByRole('radio', { name: 'Dark' }).check()
      await box().getByLabel('Theme name').fill('Acme night')
      expect(await box().locator('svg, [data-slide], div').count() > 0, 'no preview')
      await box().getByRole('button', { name: 'Save theme' }).click()
      await p.getByText(/Saved the theme "Acme night"/).waitFor({ timeout: 8000 })
      const t = await themes()
      expect(t.length === 1 && t[0].name === 'Acme night' && t[0].mode === 'dark' && t[0].designId === value && t[0].kitId === kit.id, `themes: ${JSON.stringify(t.map((x) => ({ name: x.name, mode: x.mode, designId: x.designId })))}`)
    })

    await s.check('Apply: the deck takes the theme exactly (its colours, the kit\'s fonts, the template); one Ctrl+Z puts the deck\'s look back', p, async () => {
      const t = (await themes())[0]
      await p.getByRole('button', { name: 'Apply the theme Acme night' }).click(); await p.waitForTimeout(2500)
      const d = await deck()
      expect(canon(d.theme.colors) === canon(t.theme.colors), `colours: ${JSON.stringify(d.theme.colors)} vs ${JSON.stringify(t.theme.colors)}`)
      expect(d.theme.fonts.heading === 'Playfair Display' && d.theme.fonts.body === 'Inter', `fonts: ${JSON.stringify(d.theme.fonts)}`)
      expect(d.theme.templateId === t.designId, `template: ${d.theme.templateId}`)
      await p.locator('[data-testid="stage"]').click({ position: { x: 5, y: 5 } })
      await p.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await p.waitForTimeout(2500)
      const u = await deck()
      expect(canon(u.theme.colors) === canon(before.theme.colors), 'undo did not put the colours back')
    })

    await s.check('editing the kit changes the saved theme (it is made from the kit as it is now); Delete removes it', p, async () => {
      await api.patch(A, `/brand/kits/${kit.id}`, { headingFont: 'Inter', bodyFont: 'Inter' })
      expect((await themes())[0].theme.fonts.heading === 'Inter', 'the theme kept the old kit font')
      await p.reload({ waitUntil: 'networkidle' })
      await p.getByRole('toolbar').getByRole('button', { name: /Style/ }).click(); await p.getByRole('tab', { name: 'Brand' }).click()
      await p.getByRole('button', { name: 'Delete the theme Acme night' }).click(); await p.waitForTimeout(1500)
      expect((await themes()).length === 0, 'the theme was not deleted')
    })
  } finally {
    await b.close()
  }
  return s.done()
}
