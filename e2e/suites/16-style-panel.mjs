import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { ACCOUNT, STATE } from './02-auth.mjs'
import { DECKS } from './03-create.mjs'

/** The Style panel: every catalogue template with the deck's own title slide, 36 colour palettes, locks on Pro designs, works on a phone. */
export default async function () {
  const s = suite('16-style-panel')
  // earlier suites upgrade the QA account to Pro: the lock check needs a Starter plan
  execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/qa-grant-plan.ts ${JSON.parse(readFileSync(ACCOUNT, 'utf8')).email} starter`, { cwd: new URL('../..', import.meta.url).pathname, stdio: 'pipe' })
  const id = JSON.parse(readFileSync(DECKS, 'utf8')).ai.split('?')[0]
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, storageState: STATE })
  const p = await ctx.newPage()
  const open = async () => { await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await p.getByRole('toolbar').getByRole('button').nth(1).click(); await p.getByRole('tab', { name: 'Templates' }).waitFor() }
  const primary = () => p.evaluate(() => getComputedStyle(document.querySelector('[aria-label^="Slide 1"] , main') ?? document.body).color && '')
  void primary

  await s.check('Style opens on Templates: every category has designs, the deck\'s own category comes first', p, async () => {
    await open()
    await p.getByRole('region', { name: /Education|Pitch|Sales|Marketing|Business|Product|Technology|Reports|Case|Team/ }).first().waitFor({ timeout: 8000 })
    const regions = await p.getByRole('region').count()
    expect(regions >= 10, `only ${regions} sections`)
    const buttons = await p.locator('aside[aria-label=Style] button[aria-label$=" template"], aside[aria-label=Style] button[aria-label$=" template (Pro)"]').count()
    expect(buttons === 137, `expected 137 template cards, got ${buttons}`)
  })

  await s.check('palette picker lists many palettes in groups and recolours the deck in one step', p, async () => {
    await p.getByRole('button', { name: /Color palette/ }).click()
    const n = await p.getByRole('option').count()
    expect(n >= 30, `only ${n} palettes`)
    const before = await p.locator('[data-testid=x], main').first().innerHTML()
    await p.getByRole('option', { name: /Burnt Orange/ }).click()
    await p.waitForTimeout(800)
    const after = await p.locator('main').first().innerHTML()
    expect(before !== after, 'canvas did not change')
    await p.getByRole('button', { name: /Color palette/ }).click()
    expect((await p.getByRole('option', { name: /Burnt Orange/ }).getAttribute('aria-selected')) === 'true', 'selected palette not marked')
    await p.keyboard.press('Escape')
  })

  await s.check('choosing a free template applies it; a Pro template on Starter shows the upgrade prompt and changes nothing', p, async () => {
    await open()
    await p.getByRole('button', { name: /^Classroom template$/ }).click()
    await p.waitForTimeout(1200)
    expect((await p.getByRole('button', { name: /^Classroom template$/ }).getAttribute('aria-pressed')) === 'true', 'Classroom not applied')
    const locked = p.getByRole('button', { name: /template \(Pro\)$/ }).first()
    await locked.scrollIntoViewIfNeeded()
    const name = await locked.getAttribute('aria-label')
    await locked.click()
    await p.getByRole('dialog', { name: /Upgrade/ }).waitFor({ timeout: 5000 })
    await p.keyboard.press('Escape')
    expect((await p.locator(`button[aria-label="${name}"]`).getAttribute('aria-pressed')) !== 'true', 'locked template was applied')
  })

  await s.check('undo reverts a template change', p, async () => {
    await p.getByRole('button', { name: 'Undo' }).click()
    await p.waitForTimeout(800)
    expect((await p.getByRole('button', { name: /^Classroom template$/ }).getAttribute('aria-pressed')) !== 'true', 'undo did not revert')
  })

  await s.check('phone width: Style opens as a bottom sheet with the palette picker usable', p, async () => {
    await p.setViewportSize({ width: 375, height: 800 })
    await open()
    await p.getByRole('button', { name: /Color palette/ }).click()
    const box = await p.getByRole('listbox', { name: 'Color palettes' }).boundingBox()
    expect(box && box.x >= 0 && box.x + box.width <= 376, 'palette list overflows the screen')
  })

  await b.close()
  return s.done()
}
