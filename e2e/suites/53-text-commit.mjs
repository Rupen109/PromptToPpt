/**
 * Typed text must never be lost when you leave the text box. A customer typed into a text box, clicked on the slide, and the words vanished (only Escape saved them).
 * The box is closed by the editor itself on any click elsewhere, and a removed box sends no blur event, so it now saves when it goes away.
 * Covers: click the slide background, click the grey area, click another object, click a button elsewhere, then a reload.
 */
import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

export default async function () {
  const s = suite('53-text-commit')
  const b = await launch()
  const A = await person(b, 'commit', 'pro')
  await api.get(A, '/me/entitlements')
  const id = (await api.post(A, '/presentations', { blank: true })).data.id
  const p = await A.ctx.newPage()
  const settle = (ms = 500) => p.waitForTimeout(ms)
  const SELECT_ALL = process.platform === 'darwin' ? 'Meta+A' : 'Control+A'
  await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await p.getByTestId('stage').waitFor(); await settle(800)
  const stage = async () => (await p.getByTestId('stage').innerText()).replace(/\n+/g, ' | ')
  const savedTexts = async () => { await settle(3500); const d = (await api.get(A, `/presentations/${id}`)).data.document; return d.slides.flatMap((sl) => sl.elements.filter((e) => e.type === 'text').map((e) => e.paragraphs.map((q) => q.runs.map((r) => r.text).join('')).join('/'))) }
  const addAndType = async (text) => { await p.getByTestId('tb-text').click(); await p.getByRole('textbox', { name: 'Edit text' }).waitFor(); await p.keyboard.press(SELECT_ALL); await p.keyboard.type(text) }

  await s.check('new text, then a click on the slide background: the text stays', p, async () => {
    await addAndType('First heading')
    await p.getByTestId('stage').click({ position: { x: 20, y: 20 } }); await settle()
    expect((await stage()) === 'First heading', `stage shows: ${await stage()}`)
  })
  await s.check('new text, then a click on the grey area around the slide: the text stays', p, async () => {
    await addAndType('Second text')
    await p.mouse.click(1350, 760); await settle()
    expect((await stage()).includes('Second text'), `stage shows: ${await stage()}`)
    const bb = await p.locator('[data-testid="el-text"]').nth(1).boundingBox(); const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2
    await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx, cy + 150, { steps: 8 }); await p.mouse.up(); await p.mouse.click(1350, 760); await settle()
  })
  await s.check('edit existing text, then click ANOTHER object: the edit stays', p, async () => {
    await p.locator('[data-testid="el-text"]').first().dblclick(); await p.getByRole('textbox', { name: 'Edit text' }).waitFor()
    await p.keyboard.press(SELECT_ALL); await p.keyboard.type('First heading EDITED')
    await p.locator('[data-testid="el-text"]').first().click(); await settle()
    expect((await stage()).includes('First heading EDITED'), `stage shows: ${await stage()}`)
  })
  await s.check('edit text, then press a button elsewhere (New slide): the edit is saved on the server and survives a reload', p, async () => {
    await p.locator('[data-testid="el-text"]').first().dblclick(); await p.getByRole('textbox', { name: 'Edit text' }).waitFor()
    await p.keyboard.press(SELECT_ALL); await p.keyboard.type('Rail test')
    await p.getByRole('button', { name: /New slide/ }).click(); await settle(800)
    const saved = await savedTexts(); expect(saved.includes('Rail test') && saved.includes('Second text'), `saved: ${JSON.stringify(saved)}`)
    await p.reload({ waitUntil: 'networkidle' }); await p.getByTestId('stage').waitFor(); await settle(800)
    await p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]').first().click(); await settle(600)
    expect((await stage()).includes('Rail test'), `after reload: ${await stage()}`)
  })
  await s.check('Escape still saves, and an untouched box closes without recording an edit', p, async () => {
    const before = (await api.get(A, `/presentations/${id}`)).data.revision
    await p.locator('[data-testid="el-text"]').first().dblclick(); await p.getByRole('textbox', { name: 'Edit text' }).waitFor()
    await p.mouse.click(1350, 760); await settle(3800)
    const after = (await api.get(A, `/presentations/${id}`)).data.revision
    expect(after === before, `an unchanged box changed the deck (revision ${before} -> ${after})`)
    await p.locator('[data-testid="el-text"]').first().dblclick(); await p.getByRole('textbox', { name: 'Edit text' }).waitFor()
    await p.keyboard.press(SELECT_ALL); await p.keyboard.type('Escape works'); await p.keyboard.press('Escape'); await settle()
    expect((await stage()).includes('Escape works'), `stage shows: ${await stage()}`)
  })
  await b.close()
  return s.done()
}
