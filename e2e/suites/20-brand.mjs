import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { API, EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { ACCOUNT, STATE } from './02-auth.mjs'
import { DECKS } from './03-create.mjs'

/** Brand kits in the Style panel: Pro/Gold only, one saved set of logo + colours + fonts + pictures, applied to a deck in one undoable step, offered when creating a new deck. */
export default async function () {
  const s = suite('20-brand')
  const root = new URL('../..', import.meta.url).pathname
  const email = JSON.parse(readFileSync(ACCOUNT, 'utf8')).email
  const plan = (p) => execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/qa-grant-plan.ts ${email} ${p}`, { cwd: root, stdio: 'pipe' })
  let id = JSON.parse(readFileSync(DECKS, 'utf8')).ai.split('?')[0]
  const PNG = new URL('../../apps/web/public/apple-touch-icon.png', import.meta.url).pathname // a real 180×180 PNG
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, storageState: STATE })
  const p = await ctx.newPage()
  const openBrand = async () => { await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await p.getByRole('toolbar').getByRole('button').nth(1).click(); await p.getByRole('tab', { name: 'Brand' }).click() }
  const logos = () => p.locator('[data-testid="stage"] img[alt$="logo"]').count()
  const details = () => p.getByLabel('Brand kit details')
  const profile = { sourceUrl: 'https://acme.example/', name: 'Acme Roasters', colors: { primary: '#E4572E', accent: '#17BEBB', accentDerived: false, palette: ['#E4572E', '#17BEBB'] }, fonts: { heading: { family: 'Playfair Display', original: 'Playfair Display', exact: true }, body: { family: 'Inter', original: 'Proxima Nova', exact: false }, detected: [] }, logo: null, confidence: 'high' }

  try {
    plan('starter')
    await s.check('Starter: the Brand tab explains brand kits and offers the upgrade (nothing can be saved)', p, async () => {
      await openBrand()
      await p.getByText(/Available on Pro and Gold/).waitFor({ timeout: 8000 })
      expect(await p.getByRole('button', { name: 'New brand kit' }).count() === 0, 'a Starter user can create a kit')
      await p.getByRole('button', { name: 'See plans' }).click()
      await p.getByText(/Pro and Gold/).first().waitFor({ timeout: 5000 })
    })

    plan('pro')
    // start from a clean account: another suite (22-remix-journey) leaves a kit behind
    const mine = await ctx.request.get(`${API}/api/v1/brand/kits`)
    for (const k of (await mine.json()).data?.kits ?? []) await ctx.request.delete(`${API}/api/v1/brand/kits/${k.id}`, { headers: { Origin: WEB } })
    // ...and from a fresh copy of the deck: earlier suites may have left a brand logo on the shared one
    const copy = await ctx.request.post(`${API}/api/v1/presentations/${id}/duplicate`, { headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: {} })
    expect(copy.ok(), `duplicate ${copy.status()}`)
    id = (await copy.json()).data.id
    await s.check('Pro: make a kit — colours, fonts, logo and a picture upload; saved; the plan\'s limit (1) is explained', p, async () => {
      await openBrand()
      await p.getByText('No brand kit yet').waitFor({ timeout: 8000 })
      await p.getByRole('button', { name: 'New brand kit' }).click(); await details().waitFor({ timeout: 8000 })
      await details().getByLabel('Kit name').fill('Acme')
      await details().getByLabel('Main colour').fill('#e4572e'); await details().getByLabel('Accent colour').fill('#17bebb')
      await details().getByLabel('Heading font in kit').selectOption('Playfair Display'); await details().getByLabel('Body font in kit').selectOption('Inter')
      await details().getByLabel('Upload logo').setInputFiles(PNG)
      await details().getByRole('img', { name: 'Brand logo' }).waitFor({ timeout: 10000 })
      await details().getByLabel('Add picture').setInputFiles(PNG)
      await details().getByRole('button', { name: /^Insert .* on this slide$/ }).waitFor({ timeout: 10000 })
      await details().getByRole('button', { name: 'Save kit' }).click(); await p.getByText('Saved.').waitFor({ timeout: 8000 })
      expect(await p.getByRole('button', { name: 'New brand kit' }).isDisabled(), 'Pro can add a second kit')
      expect(await details().getByLabel('Default kit for new presentations, ').count() >= 0, 'x')
    })

    await s.check('the kit survives a reload, applies to every slide in one undo step, and its picture can be dropped on a slide', p, async () => {
      await openBrand()
      await details().waitFor({ timeout: 8000 })
      expect(await details().getByLabel('Kit name').inputValue() === 'Acme', 'the kit was not saved')
      if (await logos() > 0) { await p.getByRole('button', { name: /Remove logo from every slide/ }).click(); await p.waitForTimeout(800) } // the copy carries the shared deck's old logo
      expect(await logos() === 0, 'logo before applying')
      await p.getByLabel('Apply this kit').getByRole('button', { name: 'Apply to this presentation' }).click()
      await p.waitForFunction(() => document.querySelectorAll('[data-testid="stage"] img[alt$="logo"]').length >= 1, null, { timeout: 8000 })
      expect(await p.locator('[data-testid^="thumb-"] img[alt$="logo"]').count() >= 2, 'the logo is not on the other slides')
      await p.keyboard.press('Escape'); await p.locator('[data-testid="stage"]').click({ position: { x: 5, y: 5 } }); await p.keyboard.press('Meta+z'); await p.waitForTimeout(600)
      expect(await logos() === 0, 'undo did not remove the logo')
      const before = await p.locator('[data-testid="stage"] img').count()
      await details().getByRole('button', { name: /^Insert .* on this slide$/ }).click(); await p.waitForTimeout(600)
      expect(await p.locator('[data-testid="stage"] img').count() === before + 1, 'the picture was not placed on the slide')
    })

    await s.check('a slide edited by hand still gets the logo when a brand is applied, and keeps its own text', p, async () => {
      await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor({ timeout: 15000 })
      const marker = `hand ${Date.now() % 100000}`
      await p.locator('[data-testid="stage"] [data-testid="el-text"]').first().dblclick(); await p.getByLabel('Edit text').waitFor({ timeout: 5000 })
      await p.keyboard.press('Meta+a'); await p.keyboard.press('Control+a'); await p.keyboard.type(marker); await p.keyboard.press('Escape'); await p.mouse.click(5, 500)
      await p.getByRole('button', { name: /Style/ }).click(); await p.getByRole('tab', { name: 'Brand' }).click(); await details().waitFor({ timeout: 8000 })
      const before = await logos()
      await p.getByLabel('Apply this kit').getByRole('button', { name: 'Apply to this presentation' }).click()
      await p.waitForFunction((n) => document.querySelectorAll('[data-testid="stage"] img[alt$="logo"]').length >= 1 && n >= 0, before, { timeout: 8000 })
      expect(await logos() === 1, `expected exactly one logo on the hand-edited slide, got ${await logos()}`)
      expect((await p.locator('[data-testid="stage"]').innerText()).includes(marker), 'the hand-edited text was lost')
      await p.getByLabel('Apply this kit').getByRole('button', { name: 'Apply to this presentation' }).click(); await p.waitForTimeout(600)
      expect(await logos() === 1, 'applying twice doubled the logo')
    })

    await s.check('a website lookup fills the kit ("Update my kit" on a one-kit plan); the kit can be made default and deleted', p, async () => {
      await p.route('**/api/v1/brand/extract', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: profile }) }))
      await openBrand(); await details().waitFor({ timeout: 8000 })
      await p.getByText('Get brand from a website').click()
      await p.getByLabel('Your company website').fill('acme.example'); await p.getByRole('button', { name: 'Find brand' }).click()
      const found = p.getByLabel('What we found'); await found.waitFor({ timeout: 8000 })
      expect(/closest to Proxima Nova/.test(await found.innerText()), 'font mapping not shown')
      await found.getByRole('button', { name: 'Update my kit' }).click()
      await p.getByText(/Saved to your brand kit "Acme Roasters"/).waitFor({ timeout: 8000 })
      expect(await details().getByLabel('Kit name').inputValue() === 'Acme Roasters', 'the kit was not updated')
      expect(await details().getByLabel('Main colour').inputValue() === '#e4572e', 'colour not kept')
      p.once('dialog', (d) => void d.accept())
      await details().getByRole('button', { name: 'Delete kit' }).click()
      await p.getByText('No brand kit yet').waitFor({ timeout: 8000 })
    })

    await s.check('the create screen offers "Build it in my brand" with the default kit and sends it with the job; turning it off sends nothing', p, async () => {
      // make a kit first (real API), then walk the create flow with the job request intercepted so no deck is generated
      await openBrand(); await p.getByRole('button', { name: 'New brand kit' }).click(); await details().waitFor()
      await details().getByLabel('Kit name').fill('Acme'); await details().getByLabel('Main colour').fill('#e4572e'); await details().getByLabel('Accent colour').fill('#17bebb')
      await details().getByRole('button', { name: 'Save kit' }).click(); await p.getByText('Saved.').waitFor({ timeout: 8000 })
      const sent = []
      await p.route('**/api/v1/generation/jobs', async (r) => { sent.push(JSON.parse(r.request().postData() ?? '{}')); await r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'TEST_STOP', message: 'stopped by the test' } }) }) })
      const run = async (useKit) => {
        await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
        await p.getByLabel('Presentation prompt').fill('A 5 slide pitch for Aroma Coffee Roasters, a small-batch coffee roastery with 4 stores, for local investors.')
        await p.getByRole('button', { name: 'Create Presentation' }).click(); await p.waitForURL(/\/create/)
        const box = p.getByLabel('Build it in my brand'); await box.waitFor({ timeout: 90000 })
        expect(await box.isChecked(), 'not on by default')
        if (!useKit) await box.uncheck()
        await p.getByRole('radiogroup', { name: 'AI model' }).getByRole('radio').first().click()
        await p.waitForTimeout(1500)
      }
      await run(true); await run(false)
      expect(sent.length === 2, `expected 2 job requests, got ${sent.length}`)
      expect(typeof sent[0].brandKitId === 'string' && sent[0].brandKitId.length > 4, 'the kit was not sent')
      expect(sent[1].brandKitId === undefined, 'the kit was sent although it was turned off')
      await p.unroute('**/api/v1/generation/jobs')
      await openBrand(); await details().waitFor()
      p.once('dialog', (d) => void d.accept()); await details().getByRole('button', { name: 'Delete kit' }).click(); await p.getByText('No brand kit yet').waitFor({ timeout: 8000 })
    })
  } finally {
    plan('starter') // the next suites expect the QA account as it was left by 16-style-panel
    await b.close()
  }
  return s.done()
}
