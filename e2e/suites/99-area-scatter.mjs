import { expect, launch, suite } from '../lib.mjs'
import { api, openDeck, person } from '../kits-lib.mjs'

/**
 * Area and scatter charts (packages/validation chart-style.ts) in a real browser, judged on the SAVED deck and on screen: Chart → Area / Scatter add them; the chart dialog's
 * Type switches a chart where its data allows it, and refuses a scatter for words as labels (its x values must be numbers). No AI is used.
 */
export default async function () {
  const s = suite('99-area-scatter')
  const b = await launch()
  try {
    const A = await person(b, 'b99', 'pro')
    const p = A.p
    const id = (await api.post(A, '/presentations', { blank: true })).data.id
    const charts = async () => (await api.get(A, `/presentations/${id}`)).data.document.slides[0].elements.filter((e) => e.type === 'chart')
    const stage = () => p.locator('[data-testid="stage"]')

    await s.check('Chart → Area chart: an area chart is added, saved, and drawn with a filled area', p, async () => {
      await openDeck(p, id)
      await p.getByTestId('tb-chart').click(); await p.getByTestId('chart-area').click(); await p.waitForTimeout(2500)
      const c = await charts()
      expect(c.length === 1 && c[0].chartType === 'area', `charts: ${JSON.stringify(c.map((x) => x.chartType))}`)
      expect(await stage().locator('polygon[data-area]').count() >= 1, 'no filled area on the slide')
    })

    await s.check('the chart dialog\'s Type: Scatter is refused for words as labels (its x values must be numbers); Bar is taken and saved', p, async () => {
      const area = (await charts())[0]
      await stage().locator(`[data-element="${area.id}"]`).dblclick({ force: true })
      const dlg = p.getByTestId('chart-dialog'); await dlg.waitFor({ timeout: 5000 })
      expect(await dlg.getByLabel('Chart type').locator('option[value="scatter"]').evaluate((o) => o.disabled), 'Scatter is offered for words as labels')
      await dlg.getByLabel('Chart type').selectOption('bar'); await p.waitForTimeout(2500)
      expect((await charts())[0].chartType === 'bar', 'the type change was not saved')
      await dlg.getByRole('button', { name: 'Close' }).click(); await dlg.waitFor({ state: 'detached', timeout: 5000 })
    })

    await s.check('Chart → Scatter chart: numbers as labels (its x values), drawn as points', p, async () => {
      await stage().click({ position: { x: 5, y: 5 } })
      await p.getByTestId('tb-chart').click(); await p.getByTestId('chart-scatter').click(); await p.waitForTimeout(2500)
      const sc = (await charts()).find((x) => x.chartType === 'scatter')
      expect(!!sc && sc.labels.every((l) => /^\d+$/.test(l)), `scatter: ${JSON.stringify(sc)}`)
      expect(await stage().locator('[data-scatter] circle').count() === sc.labels.length, 'the points are not drawn')
    })
  } finally {
    await b.close()
  }
  return s.done()
}
