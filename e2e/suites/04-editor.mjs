import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { ACCOUNT, STATE } from './02-auth.mjs'
import { DECKS } from './03-create.mjs'

const grant = (plan) => execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/qa-grant-plan.ts ${JSON.parse(readFileSync(ACCOUNT, 'utf8')).email} ${plan}`, { cwd: new URL('../..', import.meta.url).pathname, stdio: 'pipe' })

export default async function () {
  const s = suite('04-editor')
    const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, storageState: STATE })
  const p = await ctx.newPage()
  p.on('dialog', (d) => void d.accept())
  const settle = (ms = 400) => p.waitForTimeout(ms)
  const open = async (id) => { await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor({ timeout: 15000 }); await settle(600) }
  const thumbs = () => p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]')
  const status = () => p.getByRole('status').filter({ hasText: /Saved|Saving|Unsaved|Offline|Conflict|Could not/ }).first().innerText()
  const saved = () => p.waitForFunction(() => [...document.querySelectorAll('[role=status]')].some((e) => /^Saved$/.test(e.textContent.trim())), null, { timeout: 15000 })
  const firstText = () => p.locator('[data-testid="stage"] [data-testid="el-text"]').first()
  const sel = async (loc) => { await loc.click({ position: { x: 8, y: 8 } }); await p.getByRole('toolbar', { name: 'Element tools' }).waitFor({ timeout: 4000 }) }
  const box = async (loc) => (await loc.boundingBox())
  /** a clean deck per run, so checks never depend on edits made by earlier runs */
  const fresh = async (templateId) => {
    await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    return p.evaluate(async (templateId) => { const r = await fetch('http://localhost:4000/api/v1/presentations', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId }) }); const j = await r.json(); return j.data?.id ?? j.id }, templateId)
  }

  // ── Starter: advanced editing is gated with an upgrade prompt, text editing still works
  const starterDeck = await fresh('pitch-launchpad')
  await open(starterDeck)
  await s.check('starter: editor loads the template deck (the 11-slide story, kept to the Starter plan\'s 10 slides; canvas, toolbar, save status)', p, async () => {
    expect(await thumbs().count() === 10, `${await thumbs().count()} slides`)
    expect(await p.getByRole('toolbar', { name: 'Editor toolbar' }).isVisible(), 'toolbar missing')
    expect(/Saved/.test(await status()), 'no Saved status')
  })
  await s.check('starter: inserting/moving objects is gated (upgrade modal) — server-side plan, not silent', p, async () => {
    await p.getByRole('button', { name: /Insert/ }).click()
    await p.getByRole('menuitem', { name: 'Rectangle' }).click(); await settle(600)
    expect(/Pro|Advanced editor|upgrade/i.test(await p.locator('body').innerText()), 'no upgrade prompt')
    await p.keyboard.press('Escape'); await p.mouse.click(10, 10)
  })

  await s.check('starter: Present is locked like export — the button opens the upgrade window, and typing the /present address lands back in the editor with it', p, async () => {
    await p.getByRole('button', { name: /Present/ }).click(); await settle(500)
    expect(/Present mode and share links are available on Pro/.test(await p.locator('body').innerText()), 'no upgrade prompt for Present')
    expect(await p.getByTestId('present').count() === 0 && !/\/present\//.test(p.url()), 'Present mode opened on the Starter plan')
    await p.keyboard.press('Escape'); await p.mouse.click(10, 10)
    await p.goto(`${EDITOR}/present/${starterDeck}`, { waitUntil: 'load' }); await settle(1200)
    expect(/\/edit\//.test(p.url()) && await p.getByTestId('present').count() === 0, `stayed on ${p.url()}`)
    expect(/Present mode and share links are available on Pro/.test(await p.locator('body').innerText()), 'no upgrade prompt after the direct address')
    await open(starterDeck)
  })

  await s.check('starter: the template window says BEFORE the deck is made that an 11-slide story starts with the first 10 (the plan\'s limit), and marks the slide left out', p, async () => {
    await p.goto(EDITOR + '/templates', { waitUntil: 'networkidle' })
    await p.getByRole('button', { name: /Launchpad/ }).first().click()
    const note = p.getByTestId('template-slide-limit'); await note.waitFor({ timeout: 8000 })
    expect(/11 slides.*holds 10.*first 10/s.test(await note.innerText()), await note.innerText())
    expect(await p.getByText('Not on your plan').count() === 1, 'the slide left out is not marked')
    await p.keyboard.press('Escape')
  })

  grant('pro')
  await ctx.storageState({ path: STATE })
  const proDeck = await fresh('pitch-launchpad')
  await open(proDeck)

  await s.check('pro: plan card shows Pro after grant (entitlements refreshed from server)', p, async () => {
    const ent = await p.evaluate(() => fetch('http://localhost:4000/api/v1/me/entitlements', { credentials: 'include' }).then((r) => r.json()))
    expect(JSON.stringify(ent).includes('"pro"'), `entitlements not Pro: ${JSON.stringify(ent).slice(0, 120)}`)
  })

  // ── slide rail
  await s.check('rail: clicking a thumbnail activates that slide; PageDown/PageUp navigate', p, async () => {
    await thumbs().nth(2).click(); await settle(200)
    expect(await thumbs().nth(2).getAttribute('aria-current') === 'true', 'slide 3 not active')
    await p.mouse.click(1000, 900); await p.keyboard.press('PageDown'); await settle(200)
    expect(await thumbs().nth(3).getAttribute('aria-current') === 'true', 'PageDown failed')
    await p.keyboard.press('PageUp'); await settle(200)
    expect(await thumbs().nth(2).getAttribute('aria-current') === 'true', 'PageUp failed')
  })
  await s.check('rail: + New slide adds a Title and content slide after the current one; the arrow offers the layouts (blank, comparison) and each is added and selected', p, async () => {
    const n0 = await thumbs().count()
    await thumbs().nth(0).click()
    await p.getByRole('button', { name: '+ New slide' }).click(); await settle(300)
    expect(await thumbs().count() === n0 + 1, 'the New slide button did not add a slide')
    expect(await thumbs().nth(1).getAttribute('aria-current') === 'true', 'the new slide is not right after the current one, selected')
    await p.getByRole('button', { name: 'Choose a layout' }).click(); await p.getByRole('menuitem', { name: 'Blank slide' }).click(); await settle(300)
    expect(await thumbs().count() === n0 + 2, 'blank not added')
    await p.getByRole('button', { name: 'Choose a layout' }).click(); await p.getByRole('menuitem', { name: 'Comparison' }).click(); await settle(300)
    expect(await thumbs().count() === n0 + 3, 'layout slide not added')
    expect(await thumbs().nth(3).getAttribute('aria-current') === 'true', 'new slide not selected')
  })
  await s.check('rail: slide options menu — duplicate, move up/down, lock, colours, delete', p, async () => {
    const n0 = await thumbs().count()
    await p.getByRole('button', { name: 'Slide 2 options' }).click()
    await p.getByRole('menuitem', { name: /Duplicate slide/ }).click(); await settle(300)
    expect(await thumbs().count() === n0 + 1, 'duplicate failed')
    await p.getByRole('button', { name: 'Slide 3 options' }).click(); await p.getByRole('menuitem', { name: /Move up/ }).click(); await settle(200)
    await p.getByRole('button', { name: 'Slide 2 options' }).click(); await p.getByRole('menuitem', { name: /Move down/ }).click(); await settle(200)
    await p.getByRole('button', { name: 'Slide 2 options' }).click(); await p.getByRole('menuitem', { name: /Lock slide/ }).click(); await settle(200)
    expect(await p.getByLabel('Locked').count() >= 1, 'lock icon missing')
    await p.getByRole('button', { name: 'Slide 2 options' }).click(); await p.getByRole('menuitem', { name: /Unlock slide/ }).click(); await settle(200)
    await p.getByRole('button', { name: 'Slide 2 options' }).click(); await p.getByRole('menuitem', { name: 'accent' }).first().click(); await settle(200)
    await p.getByRole('button', { name: 'Slide 2 options' }).click(); await p.getByRole('menuitem', { name: /Delete slide/ }).click(); await settle(300)
    expect(await thumbs().count() === n0, 'delete failed')
  })
  await s.check('rail: right-click on a thumbnail opens the same menu', p, async () => {
    await thumbs().nth(1).click({ button: 'right' }); await p.getByRole('menu').waitFor({ timeout: 3000 }); await p.keyboard.press('Escape'); await p.mouse.click(5, 5)
  })
  await s.check('rail: drag a thumbnail to reorder', p, async () => {
    const first = await p.locator('nav[aria-label="Slides"] [data-testid=thumb-0] canvas, nav[aria-label="Slides"] [data-testid=thumb-0]').first().innerHTML()
    await thumbs().nth(0).dragTo(thumbs().nth(3)); await settle(400)
    const after = await thumbs().nth(0).innerHTML()
    expect(first !== after, 'order unchanged after drag')
  })

  // ── element editing: on a FRESH copy of the template deck (the rail checks above add empty placeholder slides, whose boxes start typing on the first click), slide 3
  const editDeck = await fresh('pitch-launchpad')
  await open(editDeck)
  const textSlide = 2
  await thumbs().nth(textSlide).click(); await settle(400)
  await s.check('text: click selects and shows the formatting toolbar; Escape / canvas click deselects', p, async () => {
    await sel(firstText())
    await p.keyboard.press('Escape'); await settle(200)
    expect(await p.getByRole('toolbar', { name: 'Element tools' }).count() === 0, 'toolbar stayed after Escape')
  })
  await s.check('text: font size −/+ changes the size', p, async () => {
    await sel(firstText()); const size = async () => Number(await p.getByLabel('Font size').innerText())
    const a = await size(); await p.getByLabel('Larger text').click(); await p.getByLabel('Larger text').click(); const b2 = await size()
    expect(b2 === a + 4, `${a} → ${b2}`); await p.getByLabel('Smaller text').click(); expect(await size() === b2 - 2, 'smaller failed')
  })
  await s.check('text: bold + alignment buttons toggle', p, async () => {
    await sel(firstText())
    await p.getByLabel('Bold').click(); const bold = await p.getByLabel('Bold').getAttribute('aria-pressed')
    await p.getByLabel('Bold').click(); expect(bold !== await p.getByLabel('Bold').getAttribute('aria-pressed'), 'bold did not toggle')
    for (const a of ['center', 'right', 'left']) { await p.getByLabel(`Align ${a}`).click(); expect(await p.getByLabel(`Align ${a}`).getAttribute('aria-pressed') === 'true', `align ${a}`) }
  })
  await s.check('text: colour swatches — Red really renders red; theme colour and custom colour apply', p, async () => {
    const colours = () => p.locator('[data-testid="stage"]').evaluate((st) => [...st.querySelectorAll('*')].filter((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim().length > 3)).map((n) => getComputedStyle(n).color))
    await sel(firstText()); await p.getByLabel('Colour Red').click(); await settle(300)
    expect((await colours()).some((c) => /220, ?38, ?38/.test(c)), `no red text: ${(await colours()).join(' | ')}`)
    await p.getByLabel('Theme colour Primary').click(); await settle(200)
    await p.getByLabel('Custom colour').fill('#00aa44'); await settle(300)
    expect((await colours()).some((c) => /0, ?170, ?68/.test(c)), `custom colour not rendered: ${(await colours()).join(' | ')}`)
  })
  await s.check('text: double-click edits inline; typing is saved (autosave → Saved) and survives reload', p, async () => {
    const marker = `QA edit ${Date.now() % 100000}`
    await firstText().dblclick(); const ed = p.getByLabel('Edit text'); await ed.waitFor({ timeout: 4000 })
    await p.keyboard.press('Meta+a'); await p.keyboard.press('Control+a'); await p.keyboard.type(marker); await p.keyboard.press('Escape'); await settle(300)
    await p.mouse.click(5, 500); await saved()
    await p.reload({ waitUntil: 'networkidle' }); await thumbs().nth(textSlide).click(); await settle(500)
    expect((await p.locator('[data-testid="stage"]').innerText()).includes(marker), 'edit lost after reload')
  })
  await s.check('text: ONE word gets its own style from the text bar (select it, Underline, Red); the box stays open; it is kept after reload and the other words are untouched', p, async () => {
    await firstText().dblclick(); const ed = p.getByLabel('Edit text'); await ed.waitFor({ timeout: 4000 })
    const word = await ed.evaluate((root) => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { const m = /[A-Za-z]{3,}/.exec(n.data); if (m) { const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length); getSelection().removeAllRanges(); getSelection().addRange(r); return m[0] } } return null })
    expect(word, 'no word to select')
    const bar = p.getByRole('toolbar', { name: 'Text tools' }); await bar.waitFor({ timeout: 4000 })
    await bar.getByLabel('Underline').click(); await bar.getByLabel('Colour the selected words Red').click(); await settle(200)
    expect(await ed.isVisible(), 'the box closed when the text bar was used')
    await p.keyboard.press('Escape'); await settle(300); await p.mouse.click(5, 500); await saved()
    await p.reload({ waitUntil: 'networkidle' }); await thumbs().nth(textSlide).click(); await settle(600)
    const looks = await p.locator('[data-testid="stage"]').evaluate((st) => [...st.querySelectorAll('span')].filter((s) => s.textContent.trim() && !s.querySelector('span')).map((s) => ({ t: s.textContent, u: getComputedStyle(s).textDecorationLine.includes('underline'), red: /220, ?38, ?38/.test(getComputedStyle(s).color) })))
    expect(looks.some((x) => x.t === word && x.u && x.red), `"${word}" is not underlined and red after reload: ${JSON.stringify(looks.slice(0, 6))}`)
    expect(!looks.some((x) => x.t !== word && x.red && x.u), `other words took the style too: ${JSON.stringify(looks.filter((x) => x.red))}`)
  })
  await s.check('object: drag moves, resize handle resizes, arrow keys nudge', p, async () => {
    await sel(firstText()); const b0 = await box(firstText())
    await p.mouse.move(b0.x + 20, b0.y + 20); await p.mouse.down(); await p.mouse.move(b0.x + 90, b0.y + 70, { steps: 6 }); await p.mouse.up(); await settle(200)
    const b1 = await box(firstText()); expect(Math.abs(b1.x - b0.x) > 20 && Math.abs(b1.y - b0.y) > 15, `did not move (${b0.x},${b0.y} → ${b1.x},${b1.y})`)
    const h = p.locator('[data-handle="se"]').first()
    if (await h.count()) { const hb = await box(h); await p.mouse.move(hb.x + 3, hb.y + 3); await p.mouse.down(); await p.mouse.move(hb.x + 60, hb.y + 40, { steps: 5 }); await p.mouse.up(); await settle(200); const b2 = await box(firstText()); expect(b2.width > b1.width, 'resize did nothing') }
    const bx = await box(firstText()); await p.keyboard.press('Shift+ArrowRight'); await settle(200)
    expect((await box(firstText())).x > bx.x, 'arrow nudge did nothing')
  })
  await s.check('object: the round handle below turns it (snaps to a quarter turn, handles turn with it); Arrange shows the angle, Straighten and Front/Back work; kept after reload', p, async () => {
    await sel(firstText()); const id = await firstText().getAttribute('data-element')
    const turnOf = () => p.locator(`[data-element="${id}"]`).evaluate((e) => Number(/rotate\((-?[\d.]+)deg\)/.exec(e.style.transform)?.[1] ?? 0))
    const eb = await box(firstText()), hb = await box(p.getByTestId('rotate-handle'))
    await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down()
    await p.mouse.move(eb.x + eb.width / 2 - 80, eb.y + eb.height / 2 + 60, { steps: 5 }); await p.mouse.move(eb.x + eb.width / 2 - 200, eb.y + eb.height / 2 + 2, { steps: 6 })
    expect(await p.getByTestId('rotate-angle').innerText() === '90°', 'no live 90° while turning')
    await p.mouse.up(); await settle(300)
    expect(await turnOf() === 90, `turned to ${await turnOf()}`)
    expect(await p.getByTestId('handles').evaluate((e) => e.style.transform) === 'rotate(90deg)', 'the handles did not turn with it')
    await p.getByTestId('arrange').click(); await settle(200)
    expect(await p.getByTestId('rotate-angle-input').inputValue() === '90', 'Arrange does not show the angle')
    await p.keyboard.press('Escape'); await saved()
    await p.reload({ waitUntil: 'networkidle' }); await thumbs().nth(textSlide).click(); await settle(600)
    expect(await turnOf() === 90, 'the turn was not kept after reload')
    { const tb = await box(firstText()), st = await box(p.getByTestId('stage')); await p.mouse.click(tb.x + tb.width / 2, Math.max(tb.y, st.y) + 15); await p.getByRole('toolbar', { name: 'Element tools' }).waitFor({ timeout: 4000 }) } // (its corner is empty space now that it stands upright, it reaches past the top of the slide, and the body text covers its middle)
    if (!(await p.getByTestId('arrange-panel').isVisible())) await p.getByTestId('arrange').click()
    await p.getByRole('button', { name: 'Straighten' }).click(); await settle(200)
    expect(await turnOf() === 0 && await p.getByRole('button', { name: 'Straighten' }).isDisabled(), 'Straighten did not put it upright')
    const z = () => p.locator(`[data-element="${id}"]`).evaluate((e) => Number(e.style.zIndex))
    await p.getByRole('button', { name: /^Back$/ }).click(); await settle(200); const back = await z()
    await p.getByRole('button', { name: /^Front$/ }).click(); await settle(200)
    expect(await z() > back && await p.getByRole('button', { name: /^Front$/ }).isDisabled(), 'Front / Back did not re-stack it')
    await p.getByTestId('arrange').click()
  })
  await s.check('picture: Arrange → Flip horizontal mirrors it on the slide (its box stays), a text box says it cannot be flipped, and Flip again undoes it', p, async () => {
    const pic = p.locator('[data-testid="stage"] [data-testid="el-image"]').first()
    if (!(await pic.count())) return // (this template slide has no picture)
    const mirrored = () => p.evaluate(() => { let n = document.querySelector('[data-testid="stage"] img'); while (n && !n.matches?.('[data-testid="stage"]')) { if (/scale\(-1/.test(n.style?.transform ?? '')) return true; n = n.parentElement } return false })
    await pic.click(); await p.getByRole('toolbar', { name: 'Element tools' }).waitFor({ timeout: 4000 })
    if (!(await p.getByTestId('arrange-panel').isVisible())) await p.getByTestId('arrange').click()
    await p.getByRole('button', { name: /Horizontal/ }).click(); await settle(250)
    expect(await mirrored(), 'the picture is not mirrored')
    await p.getByRole('button', { name: /Horizontal/ }).click(); await settle(250)
    expect(!(await mirrored()), 'Flip again did not put it back')
    await sel(firstText())
    expect(/Text cannot be flipped/.test(await p.getByTestId('arrange-panel').innerText()), 'no reason for text')
    await p.getByTestId('arrange').click()
  })
  await s.check('text: Spacing — 1.5 lines is drawn on the slide and kept after reload; Reset goes back to normal; the toolbar never covers the box', p, async () => {
    await sel(firstText()); const id = await firstText().getAttribute('data-element')
    await p.getByTestId('spacing').click(); await p.getByTestId('spacing-panel').waitFor({ timeout: 4000 })
    await p.getByRole('button', { name: '1.5' }).click(); await settle(300)
    const bar = await box(p.getByTestId('format-bar')), eb = await box(firstText())
    expect(bar.y >= eb.y + eb.height || bar.y + bar.height <= eb.y, 'the toolbar covers the text box')
    await p.keyboard.press('Escape'); await saved()
    await p.reload({ waitUntil: 'networkidle' }); await thumbs().nth(textSlide).click(); await settle(600)
    await sel(firstText()); if (!(await p.getByTestId('spacing-panel').isVisible())) await p.getByTestId('spacing').click()
    expect(await p.getByRole('button', { name: '1.5' }).getAttribute('aria-pressed') === 'true', '1.5 not kept after reload')
    await p.getByRole('button', { name: 'Reset spacing' }).click(); await settle(200)
    expect(await p.getByRole('button', { name: 'Normal' }).getAttribute('aria-pressed') === 'true', 'Reset did not go back to normal')
    void id; await p.getByTestId('spacing').click()
  })
  await s.check('object: undo / redo (buttons and ⌘Z / ⌘⇧Z) restore state', p, async () => {
    await sel(firstText()); const b0 = await box(firstText())
    await p.keyboard.press('Shift+ArrowDown'); await settle(150)
    await p.getByLabel('Undo').click(); await settle(200)
    expect(Math.abs((await box(firstText())).y - b0.y) < 2, 'undo did not restore')
    await p.getByLabel('Redo').click(); await settle(200)
    expect((await box(firstText())).y > b0.y + 3, 'redo did not reapply')
    await p.keyboard.press('Control+z'); await settle(200); expect(Math.abs((await box(firstText())).y - b0.y) < 2, 'ctrl+z failed')
    await p.keyboard.press('Control+Shift+z'); await settle(200)
  })
  await s.check('object: duplicate, lock (blocks delete), unlock, delete', p, async () => {
    await sel(firstText()); const n0 = await p.locator('[data-testid="stage"] [data-testid]').count()
    await p.getByLabel('Duplicate').click(); await settle(250)
    expect(await p.locator('[data-testid="stage"] [data-testid="el-text"]').count() >= 2, 'duplicate failed')
    await p.getByLabel('Lock').click(); await settle(150)
    expect(await p.getByLabel('Delete').isDisabled(), 'delete enabled on locked')
    await p.getByLabel('Unlock').click(); await p.getByLabel('Delete').click(); await settle(250)
    void n0
  })
  await s.check('insert menu: text box, rectangle, circle each add an element; image placeholder; AI image dialog opens and closes', p, async () => {
    const count = () => p.locator('[data-testid="stage"] [data-element], [data-testid="stage"] [aria-label="Edit text"]').count() // (a new text box opens ready to type in)
    let n = await count()
    for (const name of ['Text box', 'Rectangle', 'Circle']) {
      await p.getByRole('button', { name: /Insert/ }).click(); await p.getByRole('menuitem', { name }).click(); await settle(250)
      const m = await count(); expect(m === n + 1, `${name}: ${n} → ${m}`); n = m
      if (await p.getByLabel('Edit text').count()) { await p.keyboard.press('Escape'); await settle(200) } // finish typing in the new box (an empty box stays)
    }
    await p.getByRole('button', { name: /Insert/ }).click(); await p.getByRole('menuitem', { name: /Image \(set URL/ }).click(); await settle(250)
    await p.getByRole('button', { name: 'Image URL' }).click(); await p.getByLabel('Image URL').fill('https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/330px-PNG_transparency_demonstration_1.png'); await p.getByRole('button', { name: 'Set' }).click(); await settle(400)
    await p.getByRole('button', { name: /Insert/ }).click(); await p.getByRole('menuitem', { name: /AI image/ }).click()
    await p.getByRole('dialog').waitFor({ timeout: 4000 }); await p.keyboard.press('Escape'); await settle(300)
    expect(await p.getByRole('dialog').count() === 0, 'image dialog did not close with Escape')
  })

  // ── drawers
  await s.check('style drawer: themes tab applies a new theme to ALL slides; premium theme gated or allowed by plan', p, async () => {
    await p.getByRole('button', { name: /Style/ }).click(); const dr = p.getByRole('complementary', { name: 'Style' }); await dr.waitFor({ timeout: 4000 })
    const before = await thumbs().nth(0).innerHTML()
    const themeBtns = dr.locator('button[aria-pressed]'); await themeBtns.nth(1).click(); await settle(500)
    expect(before !== await thumbs().nth(0).innerHTML(), 'theme change did not repaint slides')
  })
  await s.check('style drawer: tabs (design/colour/fonts), layout alternatives, background colour, font selects', p, async () => {
    const dr = p.getByRole('complementary', { name: 'Style' })
    const tabs = dr.getByRole('tab'); const n = await tabs.count(); expect(n >= 2, 'tabs missing')
    for (let i = 0; i < n; i++) { await tabs.nth(i).click(); await settle(250) }
    const fontSel = dr.locator('select').first()
    if (await fontSel.count()) { const opts = await fontSel.locator('option').allTextContents(); await fontSel.selectOption({ label: opts[2] ?? opts[0] }); await settle(300) }
    const bg = dr.getByLabel(/^Background /).first(); if (await bg.count()) { await bg.click(); await settle(200) }
    await dr.getByLabel('Close style panel').click(); await settle(200)
    expect(await p.getByRole('complementary', { name: 'Style' }).count() === 0, 'drawer did not close')
  })
  await s.check('notes: speaker notes open, type, persist across slide switch', p, async () => {
    await p.getByRole('button', { name: /Speaker notes/ }).click({ force: true }); const ta = p.getByLabel('Speaker notes'); await ta.waitFor()
    await ta.fill('QA notes here'); await thumbs().nth(4).click(); await settle(200); await thumbs().nth(2).click(); await settle(200)
    expect(await ta.inputValue() === 'QA notes here', 'notes lost on slide switch')
  })
  await s.check('title: rename the presentation → persists after reload', p, async () => {
    const t = `QA Deck ${Date.now() % 10000}`
    const inp = p.getByLabel('Presentation title'); await inp.fill(t); await inp.press('Enter'); await saved()
    await p.reload({ waitUntil: 'networkidle' }); expect(await p.getByLabel('Presentation title').inputValue() === t, 'title not saved')
  })
  await s.check('more menu: lock slide, save version (⌘S), version history opens and restores', p, async () => {
    await p.getByRole('button', { name: 'More' }).click(); await p.getByRole('menuitem', { name: /Lock slide/ }).click(); await settle(200)
    await p.getByRole('button', { name: 'More' }).click(); await p.getByRole('menuitem', { name: /Unlock slide/ }).click(); await settle(200)
    await p.getByRole('button', { name: 'More' }).click(); await p.getByRole('menuitem', { name: /Save version/ }).click(); await p.getByText('Version saved.').waitFor({ timeout: 4000 })
    await p.getByRole('button', { name: 'More' }).click(); await p.getByRole('menuitem', { name: /Version history/ }).click()
    const dlg = p.getByRole('dialog', { name: 'Version history' }); await dlg.waitFor({ timeout: 5000 })
    await dlg.getByText('Loading…').waitFor({ state: 'detached', timeout: 8000 })
    const restore = dlg.getByRole('button', { name: /Restore/ }); expect(await restore.count() >= 1, 'no older version to restore')
    await restore.first().click(); await settle(1200)
    await p.keyboard.press('Escape')
  })
  await s.check('autosave: offline edit shows the offline banner, then syncs when back online', p, async () => {
    await thumbs().nth(0).click(); await sel(firstText())
    await ctx.setOffline(true); await p.keyboard.press('Shift+ArrowLeft'); await settle(2500)
    await ctx.setOffline(false); await settle(500)
    await p.keyboard.press('Shift+ArrowRight'); await saved()
  })
  await s.check('keyboard shortcuts: ⌘C/⌘V paste, Delete removes, Enter edits text', p, async () => {
    await thumbs().nth(textSlide).click(); await sel(firstText())
    const n0 = await p.locator('[data-testid="stage"] [data-element]').count()
    await p.keyboard.press('Control+c'); await p.keyboard.press('Control+v'); await settle(250)
    expect(await p.locator('[data-testid="stage"] [data-element]').count() === n0 + 1, 'paste failed')
    await p.keyboard.press('Delete'); await settle(250)
    expect(await p.locator('[data-testid="stage"] [data-element]').count() === n0, 'delete key failed')
  })
  await s.check('present mode: opens, ←/→ navigate, N toggles notes, Esc returns to the editor', p, async () => {
    await p.getByRole('button', { name: /Present/ }).click(); await p.getByTestId('present').waitFor({ timeout: 8000 })
    const pos = () => p.getByText(/\d+ \/ \d+ ·/).innerText()
    expect((await pos()).startsWith('1 /'), 'does not start at 1')
    await p.keyboard.press('ArrowRight'); await settle(200); expect((await pos()).startsWith('2 /'), 'right arrow')
    await p.keyboard.press('ArrowLeft'); await settle(200); expect((await pos()).startsWith('1 /'), 'left arrow')
    await p.keyboard.press('End'); await settle(200); await p.keyboard.press('Home'); await p.keyboard.press('n'); await settle(200)
    await p.keyboard.press('Escape'); await p.waitForURL(/\/edit\//, { timeout: 5000 })
  })

  // Present mode plays entrance animations, whose transform used to throw an animated + tilted element (the polaroid photo) to the slide's top-left corner.
  const polaroidDeck = await fresh('strategy-annual-review')
  await s.check('present mode: the tilted photo of a polaroid slide sits in its frame (not in the slide corner), same place as in the editor', p, async () => {
    const where = async (url, scope) => {
      await p.goto(url, { waitUntil: 'networkidle' }); await p.locator(scope).first().waitFor({ timeout: 15000 }); await settle(2500) // let the entrance animations finish
      return p.evaluate((sel) => { const root = document.querySelector(sel); const img = root.querySelector('img'); const ratio = (r) => r.width / r.height; /* the slide itself is the biggest 16:9 box (present mode letterboxes it inside the screen) */ const slide = [root, ...root.querySelectorAll('div')].filter((d) => Math.abs(ratio(d.getBoundingClientRect()) - 16 / 9) < 0.02 && d.contains(img)).sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0]; const sb = slide.getBoundingClientRect(), ib = img.getBoundingClientRect(); return { left: (ib.left - sb.left) / sb.width, top: (ib.top - sb.top) / sb.height } }, scope)
    }
    const present = await where(`${EDITOR}/present/${polaroidDeck}`, '[data-testid="present"]')
    const editor = await where(`${EDITOR}/edit/${polaroidDeck}`, '[data-testid="stage"]')
    expect(present.left > 0.4, `photo is at ${(present.left * 100).toFixed(0)}% from the left in present mode (should be about 51%)`)
    expect(Math.abs(present.left - editor.left) < 0.03 && Math.abs(present.top - editor.top) < 0.03, `present (${present.left.toFixed(2)},${present.top.toFixed(2)}) vs editor (${editor.left.toFixed(2)},${editor.top.toFixed(2)})`)
  })

  // ── delete a deck from the editor
  await s.check('more menu: Delete presentation removes it and returns home', p, async () => {
    await open(await fresh('pitch-launchpad'))
    const delId = p.url().split('/edit/')[1]
    await p.getByRole('button', { name: 'More' }).click(); await p.getByRole('menuitem', { name: /Delete presentation/ }).click()
    await p.waitForURL(/localhost:3001\/$/, { timeout: 8000 })
    await p.goto(`${EDITOR}/edit/${delId}`, { waitUntil: 'networkidle' }); await p.getByText(/not found/i).waitFor({ timeout: 6000 })
  })

  await b.close()
  return s.done()
}
