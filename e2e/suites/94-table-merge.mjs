import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { API, EDITOR, expect, launch, signUpAndEnter, suite, uniqueEmail } from '../lib.mjs'

/**
 * Merged table cells in a real browser (packages/validation table-merge.ts), judged on the SAVED deck, the slide on screen and the downloaded PowerPoint file:
 * select cells in the table dialog (click, Shift+click), Merge; a block over two rows; the merge follows when a row is deleted; Unmerge; undo; the .pptx carries
 * PowerPoint's own merges. No AI is used (the assistant's table_merge is covered by the scenario suite and the live AI cases).
 */
export default async function () {
  const s = suite('94-table-merge')
  const b = await launch()
  const dir = mkdtempSync(join(tmpdir(), 'tm-'))
  try {
    const p = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
    const email = uniqueEmail('merge')
    await signUpAndEnter(p, { email })
    // Pro: the file download is a paid feature
    execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/qa-grant-plan.ts ${email} pro`, { cwd: new URL('../..', import.meta.url).pathname, stdio: 'pipe' })
    const api = (path, init = {}) => p.evaluate(async ([u, i]) => { const r = await fetch(u, { credentials: 'include', ...i, headers: { 'Content-Type': 'application/json', ...(i.headers ?? {}) } }); return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : null } }, [API + path, init])
    const made = await api('/api/v1/presentations', { method: 'POST', body: JSON.stringify({ title: 'Merge check' }) })
    const deckId = made.body.data.id
    const get = async () => (await api(`/api/v1/presentations/${deckId}`)).body.data
    const d0 = await get()
    const doc = d0.document
    doc.slides[0].elements = [{ type: 'table', id: 'tbl', x: 120, y: 160, width: 1400, height: 480, rotation: 0, locked: false, zIndex: 1, opacity: 1, header: ['Plan', 'Q1', 'Q2', 'Q3'], rows: [['Basic', '10', '12', '14'], ['Pro', '20', '22', '24'], ['Team', '30', '32', '34']] }]
    const put = await api(`/api/v1/presentations/${deckId}`, { method: 'PUT', body: JSON.stringify({ baseRevision: d0.revision, document: doc }) })
    expect(put.status === 200, `save ${put.status}`)
    const table = async () => (await get()).document.slides[0].elements.find((e) => e.type === 'table')
    const stage = () => p.locator('[data-testid="stage"]')
    // the database stores objects with their keys in its own order: compare merges by value
    const areas = (m) => JSON.stringify((m ?? []).map((a) => [a.row, a.column, a.rows, a.columns]))
    const HEADER = [[-1, 1, 1, 3]]
    let dlg

    await s.check('select the Q1 to Q3 headers (click, Shift+click) and Merge: one header cell with the three words, saved and drawn across three columns', p, async () => {
      await p.goto(`${EDITOR}/edit/${deckId}`, { waitUntil: 'networkidle' }); await stage().waitFor()
      await p.locator('[data-testid="el-table"]').dblclick()
      dlg = p.getByRole('dialog', { name: 'Edit table' }); await dlg.waitFor({ timeout: 5000 })
      expect(await dlg.getByRole('button', { name: 'Merge cells' }).isDisabled(), 'Merge must wait for two cells')
      await dlg.getByLabel('Header 2').click(); await dlg.getByLabel('Header 4').click({ modifiers: ['Shift'] })
      await dlg.getByRole('button', { name: 'Merge cells' }).click()
      await p.waitForTimeout(2500) // autosave
      const t = await table()
      expect(areas(t.merges) === JSON.stringify(HEADER), `merges: ${JSON.stringify(t.merges)}`)
      expect(t.header[1] === 'Q1 Q2 Q3' && t.header[2] === '' && t.header[3] === '', `header: ${JSON.stringify(t.header)}`)
      expect(await stage().locator('th[colspan="3"]').count() === 1, 'the slide does not draw one header cell over three columns')
      expect(/Merged/.test(await dlg.innerText()), 'no note after merging')
    })

    await s.check('a block over two rows (Shift+Alt+Down from the keyboard) merges too; the dialog shows it as one cell', p, async () => {
      await dlg.getByLabel(/^Row 1 column 1/).click(); await p.keyboard.press('Shift+Alt+ArrowDown')
      await dlg.getByRole('button', { name: 'Merge cells' }).click(); await p.waitForTimeout(2500)
      const t = await table()
      expect(t.merges.some((m) => m.row === 0 && m.column === 0 && m.rows === 2 && m.columns === 1), `merges: ${JSON.stringify(t.merges)}`)
      expect(t.rows[0][0] === 'Basic Pro' && t.rows[1][0] === '', `rows: ${JSON.stringify(t.rows)}`)
      expect(await dlg.getByLabel(/merged 2 rows/).count() === 1, 'the dialog does not show the merged cell')
      expect(await stage().locator('td[rowspan="2"]').count() === 1, 'the slide does not draw the cell over two rows')
    })

    await s.check('a header cell cannot merge with the rows below it: the button is off and says why', p, async () => {
      await dlg.getByLabel(/^Header 1/).click(); await dlg.getByLabel(/^Row 3 column 1/).click({ modifiers: ['Shift'] })
      const btn = dlg.getByRole('button', { name: 'Merge cells' })
      expect(await btn.isDisabled(), 'Merge should be off across the header and the body')
      expect(/header row only merges across/.test(await btn.getAttribute('title') ?? ''), `reason: ${await btn.getAttribute('title')}`)
    })

    await s.check('deleting the first row keeps the two-row block as far as it can (one row left = no merge) and keeps the words', p, async () => {
      await dlg.getByRole('button', { name: 'Delete row 1' }).click(); await p.waitForTimeout(2500)
      const t = await table()
      expect(t.rows.length === 2 && t.rows[0][0] === 'Basic Pro', `rows: ${JSON.stringify(t.rows)}`)
      expect(areas(t.merges) === JSON.stringify(HEADER), `merges: ${JSON.stringify(t.merges)}`)
    })

    await s.check('the PowerPoint file has PowerPoint\'s own merge: gridSpan on the header cell, hMerge on the two it covers', p, async () => {
      const bytes = await p.evaluate(async ([u, id]) => { const r = await fetch(u, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presentationId: id, format: 'pptx' }) }); return r.ok ? Array.from(new Uint8Array(await r.arrayBuffer())) : r.status }, [API + '/api/v1/exports', deckId])
      expect(Array.isArray(bytes), `export answered ${bytes}`)
      const file = join(dir, 'm.pptx'); writeFileSync(file, Buffer.from(bytes))
      const xml = execSync(`unzip -p "${file}" ppt/slides/slide1.xml`).toString()
      const first = xml.match(/<a:tr\b[\s\S]*?<\/a:tr>/)[0]
      expect(/gridSpan="3"/.test(first) && (first.match(/hMerge="1"/g) ?? []).length === 2, `header row: ${first.slice(0, 300)}`)
    })

    await s.check('Unmerge splits the header back; Ctrl+Z brings the merge back', p, async () => {
      await dlg.getByLabel(/^Header 2/).click()
      await dlg.getByRole('button', { name: 'Unmerge' }).click(); await p.waitForTimeout(2500)
      expect(!(await table()).merges, 'still merged')
      expect(await stage().locator('th').count() === 4, 'the slide does not show four header cells again')
      await dlg.getByRole('button', { name: 'Done' }).click()
      await stage().click({ position: { x: 5, y: 5 } })
      await p.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await p.waitForTimeout(2500)
      expect(areas((await table()).merges) === JSON.stringify(HEADER), `after undo: ${JSON.stringify((await table()).merges)}`)
      await p.screenshot({ path: join(process.env['E2E_OUT'] ?? dir, '94-table-merge.png') })
    })
    await s.check('alignment: select a column\'s cells, Align right and Bottom; saved, drawn on the slide, written to the PowerPoint file', p, async () => {
      await p.locator('[data-testid="el-table"]').dblclick()
      dlg = p.getByRole('dialog', { name: 'Edit table' }); await dlg.waitFor({ timeout: 5000 })
      await dlg.getByLabel(/^Row 1 column 3/).click(); await dlg.getByLabel(/^Row 2 column 3/).click({ modifiers: ['Shift'] })
      await dlg.getByRole('button', { name: 'Align right' }).click()
      await dlg.getByRole('button', { name: 'Bottom of the cell' }).click(); await p.waitForTimeout(2500)
      const t = await table()
      const al = (r, c) => (t.aligns ?? []).find((x) => x.row === r && x.column === c)
      expect(al(0, 2)?.h === 'right' && al(1, 2)?.h === 'right' && al(1, 2)?.v === 'bottom', `aligns: ${JSON.stringify(t.aligns)}`)
      expect(await dlg.getByRole('button', { name: 'Align right' }).getAttribute('aria-pressed') === 'true', 'the button does not show the cell\'s alignment')
      await dlg.getByRole('button', { name: 'Done' }).click()
      const css = await p.locator('[data-testid="stage"] tbody tr').first().locator('td').nth(2).evaluate((e) => [getComputedStyle(e).textAlign, getComputedStyle(e).verticalAlign])
      expect(css[0] === 'right' && css[1] === 'bottom', `on the slide: ${css}`)
      const bytes = await p.evaluate(async ([u, id]) => { const r = await fetch(u, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presentationId: id, format: 'pptx' }) }); return Array.from(new Uint8Array(await r.arrayBuffer())) }, [API + '/api/v1/exports', deckId])
      const file = join(dir, 'a.pptx'); writeFileSync(file, Buffer.from(bytes))
      const xml = execSync(`unzip -p "${file}" ppt/slides/slide1.xml`).toString()
      expect(/algn="r"/.test(xml) && /anchor="b"/.test(xml), 'the file does not carry the alignment')
    })
  } finally {
    await b.close()
    rmSync(dir, { recursive: true, force: true })
  }
  return s.done()
}
