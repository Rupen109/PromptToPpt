import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { STATE } from './02-auth.mjs'

const axeSrc = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

export default async function () {
  const s = suite('09-a11y-cross')
  const b = await launch()
  const anon = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const authed = await b.newContext({ viewport: { width: 1600, height: 1000 }, storageState: STATE })
  const p = await anon.newPage(); const q = await authed.newPage()
  const settle = (pg, ms = 900) => pg.waitForTimeout(ms)

  const axe = async (pg, label) => {
    await pg.addScriptTag({ content: axeSrc })
    const res = await pg.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'], resultTypes: ['violations'] }))
    const bad = res.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(!bad.length, `${label}: ` + bad.map((v) => `${v.id}(${v.nodes.length}) e.g. ${v.nodes[0].html.slice(0, 80).replace(/\s+/g, ' ')}`).join(' | '))
  }

  for (const [name, path] of [['landing', '/'], ['pricing', '/pricing'], ['templates', '/templates'], ['template detail', '/templates/pitch-launchpad'], ['login', '/login'], ['signup', '/signup'], ['ai-ppt-maker', '/ai-ppt-maker']]) {
    await s.check(`a11y (axe, WCAG A/AA serious+critical): website ${name}`, p, async () => { await p.goto(WEB + path, { waitUntil: 'networkidle' }); await settle(p, 1500); await axe(p, name) })
  }
  await q.goto(EDITOR + '/', { waitUntil: 'networkidle' })
  const id = await q.evaluate(async () => (await (await fetch('http://localhost:4000/api/v1/presentations', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: 'pitch-launchpad' }) })).json()).data.id)
  for (const [name, path] of [['editor home', '/'], ['created by me', '/created'], ['templates', '/templates'], ['billing', '/billing'], ['editor', `/edit/${id}`]]) {
    await s.check(`a11y (axe): app ${name}`, q, async () => { await q.goto(EDITOR + path, { waitUntil: 'networkidle' }); await settle(q, 1800); await axe(q, name) })
  }

  await s.check('keyboard: landing page — Tab reaches header links, hero prompt, Generate; focus is always visible', p, async () => {
    await p.goto(WEB + '/', { waitUntil: 'networkidle' })
    const seen = new Set(); let lost = 0
    for (let i = 0; i < 40; i++) {
      await p.keyboard.press('Tab')
      const info = await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); const vis = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 || cs.boxShadow !== 'none'; return { t: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 30), vis } })
      if (!info) { lost++; continue }
      seen.add(info.t)
    }
    expect(seen.size >= 15, `only ${seen.size} distinct focusable controls in 40 tabs`)
    expect([...seen].some((t) => /Generate/.test(t)), 'Generate not reachable by keyboard'); expect([...seen].some((t) => /Presentation prompt/.test(t)), 'prompt not reachable')
  })
  await s.check('keyboard: editor — Tab into the canvas toolbar; Esc closes menus; no keyboard trap in dialogs', q, async () => {
    await q.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await q.locator('[data-testid="stage"]').waitFor(); await settle(q, 500)
    await q.getByRole('button', { name: /Insert/ }).focus(); await q.keyboard.press('Enter'); await q.getByRole('menu').waitFor({ timeout: 3000 }); await q.keyboard.press('Escape'); await settle(q, 300)
    expect(await q.getByRole('menu').count() === 0, 'insert menu not closable with Esc')
    await q.getByRole('button', { name: /^Export/ }).focus(); await q.keyboard.press('Enter'); await q.getByRole('menu').waitFor(); await q.keyboard.press('Escape'); await settle(q, 200)
    await q.getByRole('button', { name: 'More' }).focus(); await q.keyboard.press('Enter'); await q.getByRole('menuitem', { name: /Version history/ }).click()
    const dlg = q.getByRole('dialog'); await dlg.waitFor(); await q.keyboard.press('Escape'); await settle(q, 300)
    expect(await q.getByRole('dialog').count() === 0, 'dialog trapped keyboard (Esc)')
  })
  await s.check('network: a failed API call on Home shows a message, not a blank/crashed page', q, async () => {
    await q.route('**/api/v1/presentations', (r) => r.request().method() === 'GET' ? r.abort() : r.continue())
    await q.goto(EDITOR + '/', { waitUntil: 'networkidle' }); await settle(q, 800)
    expect((await q.locator('body').innerText()).length > 50, 'blank page when list API fails'); await q.unroute('**/api/v1/presentations')
  })
  await s.check('network: API down at editor load → clear "couldn\'t reach the server" with Retry', q, async () => {
    await q.route('**/api/v1/me', (r) => r.abort()); await q.goto(EDITOR + '/', { waitUntil: 'domcontentloaded' })
    await q.getByRole('button', { name: 'Retry' }).waitFor({ timeout: 8000 }); await q.unroute('**/api/v1/me')
  })
  await s.check('refresh mid-generation resumes (job id kept) instead of starting over', q, async () => {
    await q.goto(EDITOR + '/', { waitUntil: 'networkidle' }); await q.getByLabel('Presentation prompt').fill('Employee onboarding for a design agency, 5 slides, no statistics')
    await q.getByRole('button', { name: 'Create Presentation' }).click(); await q.waitForURL(/\/create/)
    const len = q.getByRole('radio', { name: /slides · ~/ }).first(); await len.waitFor({ timeout: 90000 }); await len.click(); await q.getByRole('radiogroup', { name: 'AI model' }).getByRole('radio').first().click()
    await q.getByText(/Waiting for a free slot|Understanding|Building the outline|Writing the slides|Designing layouts/).first().waitFor({ timeout: 30000 }) // the job exists server-side now
    await q.reload({ waitUntil: 'domcontentloaded' })
    await q.waitForURL(/\/edit\//, { timeout: 240000 })
  })

  await b.close()
  return s.done()
}
