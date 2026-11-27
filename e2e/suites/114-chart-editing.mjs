import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

/**
 * Editing a chart: the data dialog (add a category where the categories are, add a series where the series are, a live preview of the chart as the slide draws it),
 * and the chart's DESIGN asked for in words ("show the figures", "put the legend at the bottom", "match the deck's colours"). The AI part uses the real model.
 */
export default async function () {
  const s = suite('114-chart-editing')
  const b = await launch()
  try {
    const A = await person(b, 'chartedit', 'pro')
    const { p } = A
    const id = (await api.post(A, '/presentations', { templateId: 'pitch-launchpad' })).data.id
    const doc0 = (await api.get(A, `/presentations/${id}`)).data.document
    const at = doc0.slides.findIndex((sl) => sl.elements.some((e) => e.type === 'chart'))
    expect(at >= 0, 'the template has no chart')
    const chart = async () => (await api.get(A, `/presentations/${id}`)).data.document.slides[at].elements.find((e) => e.type === 'chart')
    const dialog = p.getByTestId('chart-dialog')
    const openDialog = async () => { await p.locator('[data-testid="stage"] [data-testid="el-chart"]').first().dblclick(); await dialog.waitFor({ timeout: 10000 }) }
    await p.setViewportSize({ width: 1500, height: 950 })
    await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' })
    await p.getByRole('button', { name: new RegExp(`^Slide ${at + 1}\\b`) }).first().click()
    await p.waitForTimeout(500)

    await s.check('the dialog explains the grid, shows the chart as the slide draws it, and the add buttons sit with the data (not at the far bottom)', p, async () => {
      await openDialog()
      expect(/Each row is a category/.test(await dialog.innerText()), 'no explanation of the grid')
      await p.getByTestId('chart-preview').waitFor({ timeout: 5000 })
      expect(await p.getByTestId('chart-preview').locator('svg').count() >= 1, 'the preview draws no chart')
      // the add-category button is above the category cells, not under the Style section
      const addCat = dialog.getByRole('button', { name: 'Add category' }).first()
      const firstCell = dialog.getByRole('textbox', { name: 'Category 1', exact: true })
      const [a, c] = [await addCat.boundingBox(), await firstCell.boundingBox()]
      expect(a.y < c.y, `the add-category button is not above the categories (${a.y} vs ${c.y})`)
      expect(await dialog.getByRole('button', { name: 'Add series' }).count() === 1, 'no add-series button by the series')
    })
    await s.check('adding a category adds a row with a figure of its own, and the preview follows', p, async () => {
      const was = (await chart()).labels.length
      await dialog.getByRole('button', { name: 'Add category' }).first().click()
      await p.waitForTimeout(400)
      const cell = dialog.getByRole('textbox', { name: `Category ${was + 1}`, exact: true })
      expect(await cell.count() === 1, 'no new category row')
      await cell.fill('2027')
      await dialog.getByRole('textbox', { name: `Series 1 value ${was + 1}`, exact: true }).fill('52')
      await dialog.getByTestId('chart-dialog-done').click()
      await dialog.waitFor({ state: 'detached', timeout: 8000 })
      await p.waitForTimeout(2500)
      const c = await chart()
      expect(c.labels.length === was + 1 && c.labels[was] === '2027', `labels: ${c.labels.join(',')}`)
      expect(c.series[0].values[was] === 52, `values: ${c.series[0].values.join(',')}`)
    })
    await s.check('the chart DESIGN asked for in words: the legend moves and the figures are hidden, the data untouched', p, async () => {
      if (await dialog.count()) { await p.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {}) }
      const before = await chart()
      await p.getByRole('button', { name: 'Edit with AI' }).click()
      const box = p.getByPlaceholder(/make slide/)
      await box.fill('on this chart, put the legend at the bottom and hide the figures on the bars')
      await box.press('Enter')
      await p.waitForFunction(() => document.querySelector('textarea[aria-label="Message to the AI assistant"]')?.disabled === true, null, { timeout: 20000 }).catch(() => {})
      await p.waitForFunction(() => document.querySelector('textarea[aria-label="Message to the AI assistant"]')?.disabled === false, null, { timeout: 180000 })
      await p.waitForFunction(() => [...document.querySelectorAll('[role=status]')].some((e) => /^Saved$/.test(e.textContent?.trim() ?? '')), null, { timeout: 25000 }).catch(() => {})
      const after = await chart()
      const said = (await p.getByRole('log', { name: 'Conversation' }).innerText()).slice(-400)
      expect(after.legend === 'bottom' && after.dataLabels === false, `legend ${after.legend}, figures ${after.dataLabels}; the assistant said: ${said}`)
      expect(JSON.stringify(after.series) === JSON.stringify(before.series) && JSON.stringify(after.labels) === JSON.stringify(before.labels), 'the figures changed')
    })
    await A.ctx.close()
  } finally { await b.close() }
  return s.done()
}
