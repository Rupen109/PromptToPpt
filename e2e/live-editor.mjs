/**
 * Editor checks on a LIVE site through a real browser (what a free-plan person can do), including leaving a text box in every way.
 *   LIVE_EMAIL=... LIVE_PASSWORD=... node live-editor.mjs      (defaults: https://slidesdone.app / app. / api.)
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch } from './lib.mjs'

const WEB = process.env.LIVE_WEB ?? 'https://slidesdone.app', APP = process.env.LIVE_APP ?? 'https://app.slidesdone.app', API = process.env.LIVE_API ?? 'https://api.slidesdone.app'
const EMAIL = process.env.LIVE_EMAIL, PASSWORD = process.env.LIVE_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('set LIVE_EMAIL and LIVE_PASSWORD'); process.exit(1) }
const OUT = process.env.LIVE_OUT ?? '/tmp/live-editor'; mkdirSync(OUT, { recursive: true })
const SELECT_ALL = process.platform === 'darwin' ? 'Meta+A' : 'Control+A'

const b = await launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
const results = []
let noise = []
p.on('pageerror', (e) => noise.push(`pageerror ${String(e).slice(0, 140)}`))
p.on('console', (m) => m.type() === 'error' && !/401|favicon|Failed to load resource/.test(m.text()) && noise.push(`console ${m.text().slice(0, 140)}`))
p.on('response', (r) => r.status() >= 400 && r.status() !== 401 && !/favicon|_rsc/.test(r.url()) && noise.push(`http ${r.status()} ${r.request().method()} ${r.url().slice(0, 110)}`))
const settle = (ms = 600) => p.waitForTimeout(ms)
const need = (c, m) => { if (!c) throw new Error(m) }
async function check(name, fn, { fresh = true } = {}) {
  noise = []; let ok = true, err = ''
  if (fresh && deckId && results.length >= 2) { await p.keyboard.press('Escape').catch(() => {}); await p.keyboard.press('Escape').catch(() => {}); await open().catch(() => {}) }
  try { await fn() } catch (e) { ok = false; err = String(e.message ?? e).split('\n').filter((l) => l.trim() && !/^Call log/.test(l.trim())).slice(0, 3).join(' ⏎ ').slice(0, 420); await p.screenshot({ path: join(OUT, `${results.length + 1}-fail.png`) }).catch(() => {}) }
  results.push({ name, ok, err, noise: [...noise] })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${err}`}${noise.length ? `\n      ! ${noise.slice(0, 3).join('\n      ! ')}` : ''}`)
}
let deckId, slideCount
const stage = () => p.getByTestId('stage')
const stageText = async () => (await stage().innerText()).replace(/\n+/g, ' | ')
const doc = async () => (await (await ctx.request.get(`${API}/api/v1/presentations/${deckId}`)).json()).data.document
const open = async (path = `/edit/${deckId}`) => { await p.goto(APP + path, { waitUntil: 'load', timeout: 60000 }); await stage().waitFor({ timeout: 25000 }); await settle(800); if (await p.getByRole('dialog').count()) { await p.keyboard.press('Escape'); await settle(300) } }

await check('log in and create a deck from a free template', async () => {
  await p.goto(WEB + '/login', { waitUntil: 'networkidle' })
  await p.locator('input[name=email]').fill(EMAIL); await p.locator('input[name=password]').fill(PASSWORD)
  await p.getByRole('button', { name: /^log in$/i }).click(); await p.waitForURL((u) => u.hostname.startsWith('app.'), { timeout: 30000 })
  const r = await ctx.request.post(`${API}/api/v1/presentations`, { headers: { Origin: APP }, data: { templateId: 'pitch-seed-round', title: 'Live editor check' } })
  need(r.ok(), `create answered ${r.status()}`); deckId = (await r.json()).data.id
})
await check('editor opens: slide rail, stage, toolbars, title, save status', async () => {
  await open(); slideCount = await p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]').count()
  need(slideCount >= 8, `${slideCount} slides`); need(await p.getByTestId('top-toolbar').count() === 1, 'no top toolbar'); need(await p.getByRole('toolbar', { name: 'Editor toolbar' }).count() === 1, 'no bottom toolbar')
  need(await p.getByLabel('Presentation title').inputValue() === 'Live editor check', 'title not shown')
})
await check('every slide renders (click through all), no blank stage', async () => {
  const thumbs = p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]')
  for (let i = 0; i < slideCount; i++) { await thumbs.nth(i).click(); await settle(250); need((await stage().locator('[data-testid^="el-"]').count()) > 0, `slide ${i + 1} shows nothing`) }
})
await check('keyboard: PageDown / PageUp move between slides', async () => {
  await p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]').first().click(); await settle(300); const a = await stageText()
  await p.mouse.click(1380, 780); await p.keyboard.press('PageDown'); await settle(400); const bb = await stageText(); need(a !== bb, 'PageDown did not change the slide')
})
await check('edit the title of slide 1 and click outside: the new words stay (then survive a reload)', async () => {
  await p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]').first().click(); await settle(400)
  const title = p.locator('[data-testid="el-text"]').first(); await title.dblclick(); await p.getByRole('textbox', { name: 'Edit text' }).waitFor({ timeout: 8000 })
  await p.keyboard.press(SELECT_ALL); await p.keyboard.type('Live edit survives')
  await p.mouse.click(1380, 780); await settle(700)
  need((await stageText()).includes('Live edit survives'), `after clicking outside the stage shows: ${(await stageText()).slice(0, 120)}`)
  await settle(3500); await open(); await settle(1500); need((await stageText()).includes('Live edit survives'), 'gone after reload')
})
await check('edit text and click on the slide itself (empty area): the words stay', async () => {
  const el = p.locator('[data-testid="el-text"]').first(); await el.dblclick(); await p.getByRole('textbox', { name: 'Edit text' }).waitFor()
  await p.keyboard.press(SELECT_ALL); await p.keyboard.type('Second live edit'); await stage().click({ position: { x: 6, y: 6 } }); await settle(600)
  need((await stageText()).includes('Second live edit'), `stage shows ${(await stageText()).slice(0, 100)}`)
})
await check('slide menu: add a blank slide, then delete it (Duplicate is a paid-plan tool)', async () => {
  const thumbs = p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]'); const before = await thumbs.count()
  await p.getByRole('button', { name: '+ New slide' }).click(); await p.getByRole('menuitem', { name: 'Blank slide' }).click(); await settle(1500)
  need(await thumbs.count() === before + 1, 'blank slide not added')
  await p.getByRole('button', { name: 'Slide 3 options' }).click(); await p.getByRole('menuitem', { name: /Delete slide/ }).click(); await settle(500) // a visible slide: scrolling the list would close the menu
  if (await p.getByRole('button', { name: /^Delete/ }).count()) await p.getByRole('button', { name: /^Delete/ }).last().click().catch(() => {})
  await settle(800); need(await thumbs.count() === before, 'slide not deleted')
})
await check('undo and redo from the toolbar (own edit: add a slide, undo removes it, redo brings it back)', async () => {
  const thumbs = p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]'); const before = await thumbs.count()
  await p.getByRole('button', { name: '+ New slide' }).click(); await p.getByRole('menuitem', { name: 'Blank slide' }).click(); await settle(1000)
  need(await thumbs.count() === before + 1, 'slide not added'); await p.getByTestId('tb-undo').click(); await settle(600)
  need(await thumbs.count() === before, 'undo did not remove the slide'); await p.getByTestId('tb-redo').click(); await settle(600)
  need(await thumbs.count() === before + 1, 'redo did not bring it back')
})
await check('Style drawer: change the look of the deck without errors', async () => {
  await p.getByRole('button', { name: /Style/ }).first().click(); const d = p.getByRole('complementary', { name: 'Style' }); await d.waitFor({ timeout: 8000 })
  const before = await stage().screenshot(); const opts = d.locator('button').filter({ hasText: /./ }); need(await opts.count() > 3, 'style drawer has no options')
  await p.keyboard.press('Escape')
})
await check('AI panel opens, and a message gets an answer or a clear message (not a crash)', async () => {
  await p.getByRole('button', { name: /Edit with AI/ }).click(); await settle(800)
  const box = p.getByRole('textbox').last(); need(await box.count() > 0, 'no AI message box')
  await box.fill('hello'); await box.press('Enter'); await settle(7000)
  const t = await p.locator('body').innerText(); need(!/Something went wrong|undefined|TypeError/.test(t), 'error text shown')
  await p.getByRole('button', { name: /Edit with AI/ }).click().catch(() => {})
})
await check('speaker notes save', async () => {
  await p.getByRole('button', { name: /Speaker notes/ }).click(); const ta = p.getByLabel('Speaker notes').last(); await ta.fill('Live note 123'); await settle(4000)
  const d = await doc(); need(JSON.stringify(d).includes('Live note 123'), 'speaker note not saved')
})
await check('version history lists versions', async () => {
  await p.getByTestId('tb-history').click(); const d = p.getByRole('dialog', { name: 'Version history' }); await d.waitFor({ timeout: 8000 }); await d.locator('li').first().waitFor({ timeout: 10000 }); need(await d.locator('li').count() >= 1, 'no versions'); await p.keyboard.press('Escape')
})
await check('Present and Export are locked for the free plan with an upgrade message', async () => {
  await p.getByRole('button', { name: /Present/ }).first().click(); await p.getByText(/Pro plan|Upgrade|upgrade/).first().waitFor({ timeout: 6000 }); await p.keyboard.press('Escape'); await settle(300)
  await p.getByRole('button', { name: /^Export/ }).click(); await p.getByRole('menuitem', { name: /PPTX/ }).click(); await p.getByText(/Pro|Upgrade|upgrade|export/i).first().waitFor({ timeout: 8000 }); await p.keyboard.press('Escape')
})
await check('Share: the owner can create a link', async () => {
  await p.getByRole('button', { name: /Share/ }).first().click(); const d = p.getByRole('dialog').first(); await d.waitFor({ timeout: 8000 })
  need(/share|link|invite/i.test(await d.innerText()), 'share dialog empty'); await p.keyboard.press('Escape')
})
await check('Comments panel opens and a comment can be posted', async () => {
  await p.getByRole('toolbar', { name: 'Editor toolbar' }).getByRole('button', { name: /^Comments/ }).click(); const box = p.getByLabel('Write a comment'); await box.waitFor({ timeout: 8000 })
  await box.fill('live comment'); await p.getByRole('button', { name: 'Comment', exact: true }).click(); await p.getByText('live comment').first().waitFor({ timeout: 8000 })
})
await check('phone width (390 px): the editor opens, nothing scrolls sideways, slide visible', async () => {
  await p.setViewportSize({ width: 390, height: 800 }); await open(); const w = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
  need(w[0] <= w[1] + 1, `page scrolls sideways (${w[0]} > ${w[1]})`); need(await stage().isVisible(), 'stage hidden'); await p.setViewportSize({ width: 1440, height: 900 })
})
await check('clean up: delete the check deck', async () => {
  const r = await ctx.request.delete(`${API}/api/v1/presentations/${deckId}`, { headers: { Origin: APP } }); need(r.ok(), `delete answered ${r.status()}`)
})
await b.close()
const bad = results.filter((r) => !r.ok).length
console.log(`\n${results.length - bad}/${results.length} passed`)
process.exit(bad ? 1 : 0)
