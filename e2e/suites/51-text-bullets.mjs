/**
 * Editing bulleted text in the real editor (no AI). A customer clicked into a bullet list: the bullets disappeared while editing, Enter made a bare line, and there was
 * no way to add a bullet. Now: bullets stay visible while editing, Enter makes the next bullet, Enter on an empty bullet and Backspace at the start of a bullet leave the list,
 * "- " / "1. " at the start of a line start a list, Ctrl/Cmd+Shift+8 / 7 toggle bullets / numbers, and everything is stored as real paragraphs with their list kind.
 */
import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

export default async function () {
  const s = suite('51-text-bullets')
  const b = await launch()
  const A = await person(b, 'bul', 'pro')
  await api.get(A, '/me/entitlements')
  let id, doc, idx
  for (const t of ['strategy-boardroom', 'sales-closer', 'pitch-seed-round', 'education-lecture-notes']) {
    id = (await api.post(A, '/presentations', { templateId: t })).data.id
    doc = (await api.get(A, `/presentations/${id}`)).data.document
    idx = doc.slides.findIndex((x) => x.elements.some((e) => e.type === 'text' && e.role === 'body' && e.paragraphs.length >= 3 && e.paragraphs.every((q) => q.list === 'bullet')))
    if (idx >= 0) break
  }
  expect(idx >= 0, 'no slide with a bullet list in the templates')
  const p = await A.ctx.newPage()
  const settle = (ms = 400) => p.waitForTimeout(ms)
  await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor(); await settle(800)
  await p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]').nth(idx).click(); await settle(600)
  const body0 = doc.slides[idx].elements.find((e) => e.type === 'text' && e.role === 'body' && e.paragraphs.length >= 3 && e.paragraphs.every((q) => q.list === 'bullet'))
  const editor = () => p.getByRole('textbox', { name: 'Edit text' })
  const stored = async () => { await settle(3500); const d = (await api.get(A, `/presentations/${id}`)).data.document; return d.slides[idx].elements.find((e) => e.id === body0.id).paragraphs }
  const open = async () => { if (await editor().count()) { await p.keyboard.press('Escape'); await settle(400) }
    await p.locator(`[data-element="${body0.id}"]`).first().dblclick({ timeout: 8000 }).catch(async () => { await p.getByText(body0.paragraphs[0].runs[0].text.slice(0, 20)).first().dblclick() }); await editor().waitFor({ timeout: 8000 }) }
  const n0 = body0.paragraphs.length

  await s.check('click into a bullet list: the bullets are still there while editing (one marker per bullet), text does not jump', p, async () => {
    await open()
    const rows = await editor().locator('> div').count()
    expect(rows === n0, `${rows} paragraphs while editing, ${n0} in the slide`)
    expect(await editor().locator('> div[data-list="bullet"]').count() === n0, 'bullets missing while editing')
    const marker = await editor().locator('> div[data-list="bullet"]').first().evaluate((el) => getComputedStyle(el, '::before').content)
    expect(marker && marker !== 'none' && marker !== 'normal', `no bullet marker drawn (${marker})`)
  })

  await s.check('Enter at the end makes the NEXT bullet (not a bare line); typing fills it; Escape saves 1 more bullet', p, async () => {
    await p.keyboard.press('Control+End'); await p.keyboard.press('End')
    await p.keyboard.press('Enter'); await p.keyboard.type('A brand new point')
    expect(await editor().locator('> div[data-list="bullet"]').count() === n0 + 1, 'the new line is not a bullet')
    await p.keyboard.press('Escape'); await settle(300)
    const ps = await stored()
    expect(ps.length === n0 + 1 && ps.every((q) => q.list === 'bullet'), `stored ${ps.length} paragraphs, lists: ${ps.map((q) => q.list).join(',')}`)
    expect(ps[n0].runs.map((r) => r.text).join('') === 'A brand new point', 'new point text')
  })

  await s.check('Enter in the middle of a bullet splits it into two bullets', p, async () => {
    await open()
    await p.keyboard.press('Control+End'); await p.keyboard.press('End')
    for (let i = 0; i < 5; i++) await p.keyboard.press('ArrowLeft')
    await p.keyboard.press('Enter'); await settle(150)
    expect(await editor().locator('> div[data-list="bullet"]').count() === n0 + 2, 'did not split into two bullets')
    await p.keyboard.press('Escape'); await settle(300)
    const ps = await stored(); expect(ps.length === n0 + 2 && ps.every((q) => q.list === 'bullet'), `stored ${ps.length}`)
  })

  await s.check('Enter on an EMPTY bullet leaves the list (a plain line), like a word processor; Backspace at the start of a bullet turns it into plain text', p, async () => {
    await open()
    await p.keyboard.press('Control+End'); await p.keyboard.press('End')
    await p.keyboard.press('Enter'); await p.keyboard.press('Enter'); await settle(150)
    const plain = await editor().locator('> div:not([data-list])').count()
    expect(plain === 1, `after Enter on an empty bullet: ${plain} plain lines`)
    await p.keyboard.type('Closing line without a bullet')
    await p.keyboard.press('Home'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('Home'); await p.keyboard.press('Backspace'); await settle(150)
    expect(await editor().locator('> div:not([data-list])').count() === 2, 'Backspace at the start of a bullet did not turn it into plain text')
    await p.keyboard.press('Escape'); await settle(300)
    const ps = await stored()
    expect(ps.filter((q) => !q.list).length === 2, `stored plain paragraphs: ${ps.filter((q) => !q.list).length}`)
  })

  await s.check('"- " at the start of a plain line starts a bullet list; Ctrl/Cmd+Shift+8 toggles bullets, +7 numbers', p, async () => {
    await open()
    await p.keyboard.press('Control+End'); await p.keyboard.press('Enter'); await p.keyboard.type('- typed with a dash'); await settle(150)
    const last = editor().locator('> div').last()
    expect(await last.getAttribute('data-list') === 'bullet', 'a leading "- " did not start a bullet')
    expect(!/^-/.test(await last.innerText()), 'the dash stayed in the text')
    await p.keyboard.press('ControlOrMeta+Shift+7'); await settle(150)
    expect(await last.getAttribute('data-list') === 'number', 'Ctrl+Shift+7 did not make it a numbered item')
    await p.keyboard.press('ControlOrMeta+Shift+7'); await settle(150)
    expect(await last.getAttribute('data-list') === null, 'toggling again did not remove the list')
    await p.keyboard.press('ControlOrMeta+Shift+8'); await settle(150)
    expect(await last.getAttribute('data-list') === 'bullet', 'Ctrl+Shift+8 did not make it a bullet')
    await p.keyboard.press('Escape'); await settle(300)
    const ps = await stored(); expect(ps[ps.length - 1].list === 'bullet' && ps[ps.length - 1].runs.map((r) => r.text).join('') === 'typed with a dash', 'stored last paragraph')
  })

  await s.check('Cmd/Ctrl+A then typing replaces everything with one plain line without errors; undo brings the bullets back', p, async () => {
    await open()
    await p.keyboard.press('ControlOrMeta+a'); await p.keyboard.type('Only line'); await p.keyboard.press('Escape'); await settle(300)
    const ps = await stored(); expect(ps.length === 1 && ps[0].runs.map((r) => r.text).join('') === 'Only line', `stored ${JSON.stringify(ps).slice(0, 120)}`)
    await p.keyboard.press('ControlOrMeta+z'); await settle(3500)
    const back = await stored(); expect(back.length > 1 && back.every((q) => q.list === 'bullet' || !q.list), 'undo did not bring the text back')
  })

  await b.close()
  return s.done()
}
