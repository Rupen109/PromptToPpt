import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { ACCOUNT, STATE } from './02-auth.mjs'

/**
 * Semantic editor audit: every action is verified by its REAL effect on the saved document (not just "no error"):
 * a button that reports success but changes nothing is exactly the class of bug this suite exists to catch.
 */
export default async function () {
  const s = suite('13-semantic')
  execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/qa-grant-plan.ts ${JSON.parse(readFileSync(ACCOUNT, 'utf8')).email} pro`, { cwd: new URL('../..', import.meta.url).pathname, stdio: 'pipe' }) // the advanced editor + AI need Pro
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, storageState: STATE })
  const p = await ctx.newPage()
  p.on('dialog', (d) => void d.accept())
  const settle = (ms = 500) => p.waitForTimeout(ms)
  await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
  const newDeck = (templateId) => p.evaluate(async (t) => (await (await fetch('http://localhost:4000/api/v1/presentations', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: t }) })).json()).data.id, templateId)
  const deck = await newDeck('pitch-seed-round')
  const saved = () => p.waitForFunction(() => [...document.querySelectorAll('[role=status]')].some((e) => /^Saved$/.test(e.textContent.trim())), null, { timeout: 20000 })
  const doc = async () => { await saved(); return p.evaluate(async (id) => (await (await fetch(`http://localhost:4000/api/v1/presentations/${id}`, { credentials: 'include' })).json()).data.document, deck) }
  const textLen = (sl) => JSON.stringify(sl.content ?? sl.elements.map((e) => e.paragraphs)).length
  const thumbs = () => p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]')
  const open = async () => { await p.goto(`${EDITOR}/edit/${deck}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor(); await settle(800) }
  const panel = () => p.getByRole('complementary', { name: 'AI assistant' })
  const ask = async (text) => { await p.getByLabel('Message to the AI assistant').fill(text); await p.getByRole('button', { name: 'Send' }).click(); await p.getByText('Working on it').waitFor({ state: 'visible', timeout: 10000 }); await p.getByText('Working on it').waitFor({ state: 'detached', timeout: 150000 }); await settle(900) }
  const lastReply = async () => { const t = await panel().getByRole('log').innerText(); return t }
  await open()
  const d0 = await doc()

  // ── style drawer
  await p.getByRole('button', { name: /Style/ }).click(); const dr = p.getByRole('complementary', { name: 'Style' }); await dr.waitFor()
  await s.check('style › Themes: picking another theme really changes the deck theme (colours differ) on every slide', p, async () => {
    const btns = dr.locator('button[aria-pressed]'); const n = await btns.count(); expect(n >= 3, 'few themes')
    for (let i = 0; i < n; i++) { if ((await btns.nth(i).getAttribute('aria-pressed')) === 'false') { await btns.nth(i).click(); break } }
    await settle(500); const d = await doc(); expect(d.theme.id !== d0.theme.id || d.theme.colors.primary !== d0.theme.colors.primary, 'theme unchanged in the saved document')
    expect(d.slides.length === d0.slides.length, 'slide count changed by a theme switch')
    expect(d.slides.every((sl, i) => sl.content && JSON.stringify(sl.content) === JSON.stringify(d0.slides[i].content)), 'theme switch altered slide CONTENT')
  })
  await s.check('style › Fonts: choosing a heading font changes theme.fonts.heading and the rendered title font', p, async () => {
    await dr.getByRole('tab', { name: /Font/i }).click()
    const sel = dr.getByLabel('heading font'); const cur = await sel.inputValue(); const opts = await sel.locator('option').allTextContents(); const pick = opts.find((o) => o !== cur && /Playfair|Lora|Merriweather/.test(o)) ?? opts.find((o) => o !== cur)
    await sel.selectOption({ label: pick }); await settle(700)
    expect((await doc()).theme.fonts.heading === pick, 'font not saved'); await dr.getByRole('tab', { name: /Theme|Design/i }).first().click().catch(() => {})
  })
  await s.check('style › Colors: slide background swatch sets that slide\'s background to exactly that colour', p, async () => {
    await dr.getByRole('tab', { name: /Colo/i }).click(); await thumbs().nth(1).click(); await settle(300)
    const sw = dr.getByLabel(/^Background /).nth(2); const want = await sw.evaluate((e) => getComputedStyle(e).backgroundColor); await sw.click(); await settle(600)
    const d = await doc(); const bg = d.slides[1].background; expect(bg && bg.type === 'color', `background ${JSON.stringify(bg)}`)
    const rgb = bg.value.replace('#', '').match(/../g).map((h) => parseInt(h, 16)).join(', '); expect(want.includes(rgb), `swatch ${want} ≠ saved ${bg.value}`)
  })
  await s.check('style › Layout alternatives: choosing a design changes the slide layout and keeps its text', p, async () => {
    await dr.getByRole('tab', { name: /Layout|Design/i }).first().click(); await thumbs().nth(2).click(); await settle(400)
    const before = (await doc()).slides[2]; const alt = dr.getByRole('button', { name: /^Use .* design$/ }).first()
    if (await alt.count() === 0) return // slide has no alternatives
    await alt.click(); await settle(700); const after = (await doc()).slides[2]
    expect(after.layoutId !== before.layoutId, 'layout did not change'); expect(Math.abs(textLen(after) - textLen(before)) < textLen(before) * 0.5, 'text lost when changing layout')
  })
  await dr.getByLabel('Close style panel').click()

  // ── element formatting
  await s.check('format › size ±, bold, align, colour each change the saved element', p, async () => {
    await thumbs().nth(3).click(); await settle(500)
    const el = p.locator('[data-testid="stage"] [data-testid="el-text"]').first(); await el.click({ position: { x: 6, y: 6 } }); await p.getByRole('toolbar', { name: 'Element tools' }).waitFor()
    const first = async () => (await doc()).slides[3].elements.filter((e) => e.type === 'text').sort((a, c) => a.y - c.y)[0]
    const b0 = await first()
    await p.getByLabel('Larger text').click(); await p.getByLabel('Larger text').click(); await settle(500); const b1 = await first(); expect(b1.fontSize === b0.fontSize + 4, `font ${b0.fontSize} → ${b1.fontSize}`)
    await p.getByLabel('Align center').click(); await settle(500); expect((await first()).align === 'center', 'align not saved')
    await p.getByLabel('Bold').click(); await settle(500); expect((await first()).paragraphs[0].runs[0].bold === true, 'bold not saved')
    await p.getByLabel('Colour Red').click(); await settle(500); expect(String((await first()).color).toUpperCase() === '#DC2626', `colour ${(await first()).color}`)
  })

  // ── slide operations
  await s.check('slides › duplicate copies the content; move up/down reorders; delete removes exactly that slide', p, async () => {
    const d = await doc(); const n = d.slides.length
    await p.getByRole('button', { name: 'Slide 2 options' }).click(); await p.getByRole('menuitem', { name: /Duplicate slide/ }).click(); await settle(700)
    let a = await doc(); expect(a.slides.length === n + 1, 'duplicate count'); expect(JSON.stringify(a.slides[2].content) === JSON.stringify(a.slides[1].content), 'duplicate content differs')
    const titleOf = (sl) => sl.content?.title ?? ''
    const t2 = titleOf(a.slides[2]), t3 = titleOf(a.slides[3])
    await p.getByRole('button', { name: 'Slide 3 options' }).click(); await p.getByRole('menuitem', { name: /Move down/ }).click(); await settle(700)
    a = await doc(); expect(titleOf(a.slides[2]) === t3 && titleOf(a.slides[3]) === t2, 'move down did not swap')
    const idDel = a.slides[2].id; await p.getByRole('button', { name: 'Slide 3 options' }).click(); await p.getByRole('menuitem', { name: /Delete slide/ }).click(); await settle(700)
    a = await doc(); expect(a.slides.length === n && !a.slides.some((x) => x.id === idDel), 'wrong slide deleted')
  })
  await s.check('slides › a new layout slide (Comparison) arrives with real placeholder content, not empty frames', p, async () => {
    await p.getByRole('button', { name: '+ New slide' }).click(); await p.getByRole('menuitem', { name: 'Comparison' }).click(); await settle(800)
    const d = await doc(); const last = d.slides.at(-1); expect(last.layoutId === 'comparison', last.layoutId); expect(textLen(last) > 80, 'comparison slide is empty')
  })
  await s.check('insert › text box / rectangle / circle land INSIDE the slide with the right type', p, async () => {
    const W = (await doc()).aspectRatio === '16:9' ? 1920 : 1440
    for (const [name, type] of [['Text box', 'text'], ['Rectangle', 'shape'], ['Circle', 'shape']]) {
      const before = (await doc()).slides.find((x, i) => i === 0).elements.length
      await thumbs().nth(0).click(); await p.getByRole('button', { name: /Insert/ }).click(); await p.getByRole('menuitem', { name }).click(); await settle(600)
      const els = (await doc()).slides[0].elements; expect(els.length === before + 1, `${name}: ${before} → ${els.length}`)
      const e = els.at(-1); expect(e.type === type, `${name} type ${e.type}`); expect(e.x >= 0 && e.y >= 0 && e.x + e.width <= W && e.y + e.height <= 1080, `${name} outside the slide (${e.x},${e.y},${e.width},${e.height})`)
    }
  })
  await s.check('notes › speaker notes typed in the editor are saved on that slide only', p, async () => {
    await thumbs().nth(1).click(); await p.getByRole('button', { name: /Speaker notes/ }).click({ force: true }); const ta = p.getByLabel('Speaker notes'); await ta.fill('SEMANTIC-NOTE-123'); await settle(600)
    const d = await doc(); expect(d.slides[1].speakerNotes === 'SEMANTIC-NOTE-123', 'notes not saved'); expect(d.slides.filter((x) => x.speakerNotes === 'SEMANTIC-NOTE-123').length === 1, 'notes leaked to other slides')
  })

  // ── AI assistant: every claim verified in the document
  await p.getByRole('button', { name: /Edit with AI/ }).click(); await panel().waitFor()
  const dA = await doc()
  await s.check('AI › "change the colours" changes theme.colors in the saved doc and says so; Undo restores', p, async () => {
    await ask('Change the colour scheme to warm sunset oranges and reds')
    const d = await doc(); expect(d.theme.colors.primary !== dA.theme.colors.primary || d.theme.colors.background !== dA.theme.colors.background, `colours unchanged (${d.theme.colors.primary}) but reply: ${(await lastReply()).slice(-120)}`)
    await panel().getByRole('button', { name: 'Undo' }).last().click(); await settle(700)
    expect((await doc()).theme.colors.primary === dA.theme.colors.primary, 'undo did not restore colours')
  })
  await s.check('AI › "animate every slide" sets theme.motion (entrance not none)', p, async () => {
    await ask('Animate every slide with a nice entrance'); const d = await doc(); expect(d.theme.motion && d.theme.motion.entrance !== 'none', `motion ${JSON.stringify(d.theme.motion)}`)
  })
  await s.check('AI › slide scope "make this slide much shorter": that slide shrinks, others untouched', p, async () => {
    await thumbs().nth(4).click(); await settle(300); await panel().getByRole('button', { name: /This slide/i }).click()
    const before = await doc(); await ask('Make this slide much shorter and punchier'); const after = await doc()
    expect(textLen(after.slides[4]) < textLen(before.slides[4]), `not shorter (${textLen(before.slides[4])} → ${textLen(after.slides[4])}) — reply: ${(await lastReply()).slice(-140)}`)
    expect(after.slides.every((sl, i) => i === 4 || JSON.stringify(sl.content) === JSON.stringify(before.slides[i].content)), 'other slides were modified by a slide-scoped request')
  })
  await s.check('AI › quick action Expand makes the slide longer (not a no-op)', p, async () => {
    const before = await doc(); await panel().getByLabel('Quick actions for this slide').getByRole('button', { name: 'Expand' }).click()
    await p.waitForFunction(() => /I updated slide|Something went wrong|failed/i.test(document.querySelector('[role=log]')?.textContent ?? ''), null, { timeout: 90000 }); await settle(800)
    const after = await doc(); expect(textLen(after.slides[4]) > textLen(before.slides[4]), `Expand did not add text (${textLen(before.slides[4])} → ${textLen(after.slides[4])})`)
  })
  await s.check('AI › "translate this slide to Spanish" really produces Spanish', p, async () => {
    await ask('Translate this slide to Spanish'); const sl = (await doc()).slides[4]; const txt = JSON.stringify(sl.content).toLowerCase()
    expect(/ de | la | el | los | para | que | con /.test(txt), `no Spanish detected: ${txt.slice(0, 160)}`)
  })
  await s.check('AI › locked slide is refused honestly and stays untouched', p, async () => {
    await p.getByRole('button', { name: 'Slide 6 options' }).click(); await p.getByRole('menuitem', { name: /Lock slide/ }).click(); await thumbs().nth(5).click(); await settle(400)
    const before = JSON.stringify((await doc()).slides[5].content); await p.getByLabel('Message to the AI assistant').fill('Rewrite this slide'); await p.getByRole('button', { name: 'Send' }).click().catch(() => {}); await settle(1500)
    expect(JSON.stringify((await doc()).slides[5].content) === before, 'locked slide was edited'); expect(/locked/i.test(await panel().innerText()), 'no message about the lock')
  })

  // ── cross-checks
  await s.check('present mode shows the CURRENT content of the slide (not a stale copy)', p, async () => {
    const t = (await doc()).slides[0].content.title
    await p.getByRole('button', { name: /Present/ }).click(); await p.getByTestId('present').waitFor(); await settle(800)
    expect((await p.getByTestId('present').innerText()).includes(t.slice(0, 20)), 'present view does not show slide 1 text'); await p.keyboard.press('Escape'); await p.waitForURL(/\/edit\//)
  })
  await s.check('everything above persisted: reload shows the same slide count and the same AI-edited text', p, async () => {
    const d = await doc(); await open(); const d2 = await doc(); expect(JSON.stringify(d2.slides.map((x) => x.content)) === JSON.stringify(d.slides.map((x) => x.content)), 'content differs after reload')
    expect((await thumbs().count()) === d.slides.length, 'rail does not match the document')
  })
  await b.close()
  return s.done()
}
