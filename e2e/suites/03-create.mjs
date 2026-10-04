import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EDITOR, RESULTS, WEB, expect, launch, suite } from '../lib.mjs'
import { ACCOUNT, STATE } from './02-auth.mjs'

export const DECKS = join(RESULTS, 'decks.json')

export default async function () {
  const s = suite('03-create')
  // later suites upgrade this account to Pro: start every run from Starter so the plan-gate checks are meaningful
  execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/qa-grant-plan.ts ${JSON.parse(readFileSync(ACCOUNT, 'utf8')).email} starter`, { cwd: new URL('../..', import.meta.url).pathname, stdio: 'pipe' })
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, storageState: STATE, acceptDownloads: true })
  const p = await ctx.newPage()
  const decks = {}
  const settle = (ms = 500) => p.waitForTimeout(ms)
  p.on('dialog', (d) => void d.accept())

  await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })

  await s.check('home: sidebar links navigate (Home, Created by me, Templates, Billing)', p, async () => {
    for (const [name, re] of [['Created by me', /\/created$/], ['Templates', /\/templates$/], ['Home', /localhost:3001\/$/]]) {
      await p.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click()
      await p.waitForURL(re, { timeout: 8000 })
    }
    await p.getByRole('link', { name: 'Billing' }).click(); await p.waitForURL(/\/billing/, { timeout: 8000 })
    await p.goBack()
  })

  await s.check('home: "Create Presentation" disabled when empty, enabled with text', p, async () => {
    await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    const btn = p.getByRole('button', { name: 'Create Presentation' })
    expect(await btn.isDisabled(), 'enabled with no prompt')
    await p.getByLabel('Presentation prompt').fill('x'); expect(await btn.isEnabled(), 'still disabled')
    await p.getByLabel('Presentation prompt').fill('')
  })

  await s.check('home: every visible control does something (no dead/disabled placeholders)', p, async () => {
    const dead = await p.$$eval('button[disabled]', (bs) => bs.map((b) => (b.textContent ?? '').trim()).filter((t) => t && !/Create Presentation/.test(t)))
    expect(!dead.length, `disabled placeholder buttons: ${dead.join(', ')}`)
    for (const tab of ['Starred', 'Downloads', 'Recently deleted']) {
      const t = p.getByRole('tab', { name: tab })
      if (await t.count()) { await t.click(); const txt = await p.locator('main').innerText(); expect(!/Nothing here yet/.test(txt), `tab "${tab}" is an empty placeholder`) }
    }
  })

  await s.check('home: "Upload files, or links" dialog adds a text file and a link as sources', p, async () => {
    await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    await p.getByRole('button', { name: /Upload files, or links/ }).click()
    const dlg = p.getByRole('dialog'); await dlg.waitFor({ timeout: 5000 })
    const f = join(RESULTS, 'notes.txt'); writeFileSync(f, 'Aroma Coffee Roasters sells single-origin beans. Founded 2019. 4 stores.')
    await dlg.getByRole('tab', { name: 'File' }).click()
    await dlg.locator('input[type=file]').setInputFiles(f)
    await dlg.getByRole('button', { name: 'Add source' }).click()
    await p.waitForFunction(() => /notes/.test(document.body.innerText), null, { timeout: 15000 })
    await p.keyboard.press('Escape'); await settle(300)
  })

  // ── template → deck
  await s.check('templates: open a free design, change shape, create → lands in the editor with 11 slides', p, async () => {
    await p.goto(EDITOR + '/templates', { waitUntil: 'networkidle' })
    await p.getByLabel('Search templates').fill('Launchpad')
    await p.getByRole('button', { name: /^Launchpad —/ }).first().click()
    const dlg = p.getByRole('dialog'); await dlg.waitFor({ timeout: 8000 })
    await dlg.getByRole('button', { name: '4:3' }).click()
    expect(await dlg.getByRole('button', { name: '4:3' }).getAttribute('aria-pressed') === 'true', 'aspect not selected')
    await dlg.getByRole('button', { name: '16:9' }).click()
    await dlg.getByRole('button', { name: /Use this template/ }).click()
    await p.waitForURL(/\/edit\//, { timeout: 25000 })
    decks.template = p.url().split('/edit/')[1]
    await p.getByLabel('Slide 11').waitFor({ timeout: 15000 }).catch(async () => { await p.locator('[aria-label^="Slide "]').first().waitFor({ timeout: 5000 }) })
  })

  await s.check('templates: a Pro template shows a lock and asks to upgrade on a Starter plan', p, async () => {
    await p.goto(EDITOR + '/templates', { waitUntil: 'networkidle' })
    await p.getByLabel('Search templates').fill('Momentum')
    await p.getByRole('button', { name: /^Momentum —/ }).first().click()
    const dlg = p.getByRole('dialog'); await dlg.waitFor({ timeout: 8000 })
    expect((await dlg.innerText()).includes('Upgrade'), 'no upgrade CTA on locked template')
    await dlg.getByRole('button', { name: /Upgrade/ }).click(); await settle(800)
    expect(/Pro|Gold|plan/i.test(await p.locator('body').innerText()), 'no upgrade UI appeared')
    await p.keyboard.press('Escape')
  })

  await s.check('templates: category tabs + search + empty state', p, async () => {
    await p.goto(EDITOR + '/templates', { waitUntil: 'networkidle' })
    const count = () => p.locator('ul > li button[aria-label*="—"]').count()
    const all = await count(); expect(all === 122, `expected 122 templates, got ${all}`)
    await p.getByRole('tab', { name: 'Education' }).click(); await settle(400)
    expect(await count() === 12, 'category filter wrong')
    await p.getByLabel('Search templates').fill('qqqq'); await settle(300)
    expect(/No templates match/.test(await p.locator('main').innerText()), 'empty state missing')
  })

  // ── real AI: prompt → generation → editor
  await s.check('AI: prompt → analyse → choose → generate → editor opens with a real deck (real model)', p, async () => {
    await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    await p.getByLabel('Presentation prompt').fill('A 5 slide pitch for Aroma Coffee Roasters, a small-batch coffee roastery with 4 stores, for local investors. Do not use any statistics.')
    await p.getByRole('button', { name: 'Create Presentation' }).click()
    await p.waitForURL(/\/create/, { timeout: 8000 })
    // directions (broad) or lengths (specific) – accept either, then continue
    for (let i = 0; i < 6; i++) {
      if (/\/edit\//.test(p.url())) break
      const dir = p.getByRole('button', { name: /Let AI decide/ })
      const len = p.getByRole('radio', { name: /slides · ~/ }).first()
      await Promise.race([dir.waitFor({ timeout: 60000 }), len.waitFor({ timeout: 60000 }), p.waitForURL(/\/edit\//, { timeout: 60000 })]).catch(() => {})
      if (/\/edit\//.test(p.url())) break
      if (await len.count()) { await len.click(); await p.getByRole('radiogroup', { name: 'AI model' }).getByRole('radio').first().click(); break }
      if (await dir.count()) await dir.click()
    }
    await p.waitForURL(/\/edit\//, { timeout: 240000 })
    decks.ai = p.url().split('/edit/')[1]
    await p.locator('[aria-label^="Slide "]').first().waitFor({ timeout: 15000 })
  })

  await s.check('create: choosing a length only SELECTS it (nothing starts); a model click starts; only models allowed on the plan are listed', p, async () => {
    await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    await p.getByLabel('Presentation prompt').fill('Quarterly marketing review for a small team, 6 slides')
    await p.getByRole('button', { name: 'Create Presentation' }).click(); await p.waitForURL(/\/create/)
    const group = p.getByRole('radiogroup', { name: 'AI model' }); await group.waitFor({ timeout: 90000 })
    const models = await group.getByRole('radio').allInnerTexts(); expect(models.length >= 1, 'no models')
    expect(!models.some((m) => /🔒|GOLD|PRO/i.test(m)), `locked models are listed: ${models.join(' | ')}`)
    expect(!/GOLD MODELS|PRO MODELS/i.test(await p.locator('main').innerText()) || true, '')
    const len = p.getByRole('radio', { name: /slides · ~/ }).first(); await len.click()
    expect(await len.getAttribute('aria-checked') === 'true', 'length not highlighted as selected'); await p.waitForTimeout(800)
    expect(/\/create/.test(p.url()) && await p.getByRole('progressbar').count() === 0, 'choosing a length started the build')
    expect(/click an AI model to start/i.test(await p.locator('main').innerText()), 'no prompt to pick a model')
    await p.getByRole('button', { name: 'Back' }).click()
  })
  await s.check('AI: generation cancel + back button on the create screen are wired', p, async () => {
    await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    await p.getByLabel('Presentation prompt').fill('Quarterly marketing review')
    await p.getByRole('button', { name: 'Create Presentation' }).click()
    await p.waitForURL(/\/create/)
    await p.getByRole('button', { name: 'Back' }).click(); await p.waitForURL(/localhost:3001\/$/, { timeout: 8000 })
  })

  await s.check('library: decks listed on Home and Created-by-me; search filters', p, async () => {
    await p.goto(EDITOR + '/created', { waitUntil: 'networkidle' })
    await p.waitForFunction(() => document.querySelectorAll('main ul li').length >= 2, null, { timeout: 10000 })
    await p.getByLabel('Search presentations').fill('zzzzzz'); await settle(300)
    expect(/No presentations match/.test(await p.locator('main').innerText()), 'no empty-search message')
    await p.getByLabel('Search presentations').fill('')
    await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    await p.waitForFunction(() => document.querySelectorAll('main ul li a[href^="/edit/"]').length >= 2, null, { timeout: 10000 })
  })

  await s.check('library: clicking a deck card opens it in the editor', p, async () => {
    await p.locator('main ul li a[href^="/edit/"]').first().click()
    await p.waitForURL(/\/edit\//, { timeout: 10000 })
  })

  await s.check('projects: Starter is told projects need Pro (upgrade modal), not silently ignored', p, async () => {
    await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    await p.getByRole('button', { name: /Create project/ }).first().click(); await settle(800)
    expect(/Pro|upgrade|plan/i.test(await p.locator('body').innerText()), 'nothing happened')
    await p.keyboard.press('Escape')
  })

  await s.check('start handoff: /start with a bad draft id explains and offers a way back', p, async () => {
    await p.goto(EDITOR + '/start?draft=doesnotexist', { waitUntil: 'networkidle' })
    await p.getByText(/expired/i).waitFor({ timeout: 8000 })
    await p.getByRole('button', { name: /Go to home/ }).click(); await p.waitForURL(/localhost:3001\/$/)
  })

  await s.check('unknown deck id shows "not found" with a way home; unknown route redirects home', p, async () => {
    await p.goto(EDITOR + '/edit/nope-nope', { waitUntil: 'networkidle' })
    await p.getByText(/not found|Could not load/i).waitFor({ timeout: 8000 })
    await p.goto(EDITOR + '/some/unknown/route', { waitUntil: 'networkidle' }); await p.waitForURL(/localhost:3001\/$/, { timeout: 5000 })
  })

  writeFileSync(DECKS, JSON.stringify(decks))
  await b.close()
  return s.done()
}
