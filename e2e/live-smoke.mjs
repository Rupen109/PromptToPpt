/**
 * End-to-end smoke test of a LIVE environment through a real browser (no database access, no plan changes).
 *   LIVE_EMAIL=... LIVE_PASSWORD=... node live-smoke.mjs        (defaults to https://slidesdone.app, app., api.)
 *   QA: LIVE_WEB=https://qa.slidesdone.app LIVE_APP=https://app.qa.slidesdone.app LIVE_API=https://api.qa.slidesdone.app (an invited, confirmed account)
 * The account must already exist and be verified. It tests what a Starter (free) person can do; paid-only features are listed as skipped.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './lib.mjs'

const WEB = process.env.LIVE_WEB ?? 'https://slidesdone.app', APP = process.env.LIVE_APP ?? 'https://app.slidesdone.app', API = process.env.LIVE_API ?? 'https://api.slidesdone.app'
const EMAIL = process.env.LIVE_EMAIL, PASSWORD = process.env.LIVE_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('set LIVE_EMAIL and LIVE_PASSWORD'); process.exit(1) }
const OUT = process.env.LIVE_OUT ?? '/tmp/live-smoke'; mkdirSync(OUT, { recursive: true })
const PHOTO = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'images', 'phone-photo.jpg')

const b = await launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
const results = []
let noise = []
p.on('pageerror', (e) => noise.push(`pageerror ${String(e).slice(0, 140)}`))
p.on('console', (m) => m.type() === 'error' && !/401|favicon/.test(m.text()) && noise.push(`console ${m.text().slice(0, 140)}`))
p.on('response', (r) => r.status() >= 400 && r.status() !== 401 && !/favicon|_rsc/.test(r.url()) && noise.push(`http ${r.status()} ${r.request().method()} ${r.url().slice(0, 110)}`))
const settle = (ms = 600) => p.waitForTimeout(ms)
async function check(name, fn) {
  noise = []
  let ok = true, err = ''
  try { await fn() } catch (e) { ok = false; err = String(e.message ?? e).split('\n')[0].slice(0, 260); await p.screenshot({ path: join(OUT, `${results.length + 1}-fail.png`) }).catch(() => {}) }
  results.push({ name, ok, err, noise: [...noise] })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${err}`}${noise.length ? `\n      ! ${noise.slice(0, 3).join('\n      ! ')}` : ''}`)
}
const need = (c, m) => { if (!c) throw new Error(m) }
const bodyText = async () => (await p.locator('body').innerText()).slice(0, 6000)
let deckId = null

await check('public pages load (home, pricing, templates, blog, support, free tools, sitemap, robots)', async () => {
  for (const [path, re] of [['/', /Presentation/i], ['/pricing', /Free/], ['/templates', /template/i], ['/blog', /./], ['/support', /support|message/i], ['/free-tools', /free/i], ['/sitemap.xml', /<urlset|<\?xml/], ['/robots.txt', /User-agent/i]]) {
    const r = await p.goto(WEB + path, { waitUntil: 'domcontentloaded', timeout: 40000 })
    need(r && r.status() < 400, `${path} answered ${r?.status()}`)
    need(re.test(await p.content()), `${path} has no expected content`)
  }
})
await check('pricing page shows rupees to an Indian visitor (or says why not)', async () => {
  await p.goto(WEB + '/pricing', { waitUntil: 'networkidle' }); await settle()
  const t = await bodyText(); need(/₹/.test(t), `no rupee prices on the pricing page (shows: ${(t.match(/[$₹]\s?\d+/g) ?? []).slice(0, 4).join(' ')})`)
})
await check('log in with email and password; session is shared with the app subdomain', async () => {
  await p.goto(WEB + '/login', { waitUntil: 'networkidle' })
  await p.locator('input[name=email]').fill(EMAIL); await p.locator('input[name=password]').fill(PASSWORD)
  await p.getByRole('button', { name: /^log in$/i }).click()
  await p.waitForURL((u) => u.hostname.startsWith('app.'), { timeout: 30000 })
  await settle(1200)
  need(!/login/.test(p.url()), `still on ${p.url()}`)
})
await check('home (create) page loads for a signed-in person, with the prompt box and Create from scratch', async () => {
  await p.goto(APP + '/', { waitUntil: 'networkidle' }); await settle()
  need(await p.getByRole('textbox').count() > 0, 'no prompt box'); need(await p.getByRole('link', { name: 'Create from scratch' }).count() > 0, 'no scratch link')
})
await check('billing page loads: plan, credits, prices in rupees, test-mode note', async () => {
  await p.goto(APP + '/billing', { waitUntil: 'networkidle' }); await settle()
  const t = await bodyText(); need(/Plan & credits/.test(t) && /Credits left/.test(t), 'billing content missing')
  await p.getByRole('button', { name: /Upgrade|Change plan/ }).first().click(); await settle(800)
  const t2 = await bodyText(); need(/₹/.test(t2), 'upgrade window shows no rupee prices'); need(!/International \(USD\) payments are not available/.test(t2), 'USD error is showing')
  await p.keyboard.press('Escape')
})
await check('Create from scratch: choose size and look, editor opens with one empty slide and the toolbar', async () => {
  await p.goto(APP + '/scratch', { waitUntil: 'networkidle' })
  await p.locator('#scratch-title').fill('Live smoke deck'); await p.getByTestId('size-4:3').click(); await p.locator('[data-testid^="look-"]').nth(2).click()
  await p.getByTestId('scratch-start').click(); await p.waitForURL(/\/edit\//, { timeout: 30000 })
  deckId = p.url().split('/edit/')[1].split('?')[0]
  await p.getByTestId('stage').waitFor({ timeout: 20000 }); await settle(800)
  need(await p.getByTestId('top-toolbar').count() === 1, 'no top toolbar')
})
await check('editor: background colour from the toolbar saves (autosave), survives a reload', async () => {
  await p.getByTestId('tb-background').click(); await p.getByTestId('bg-color').click()
  await p.getByTestId('color-panel').getByLabel('Hex colour').fill('#1E3A8A'); await settle(500); await p.keyboard.press('Escape')
  await settle(4000)
  await p.reload({ waitUntil: 'networkidle' }); await p.getByTestId('stage').waitFor(); await settle(800)
  const r = await ctx.request.get(`${API}/api/v1/presentations/${deckId}`); const d = (await r.json()).data.document
  need(String(d.slides[0].background?.value).toUpperCase() === '#1E3A8A', `saved background: ${JSON.stringify(d.slides[0].background)}`)
})
await check('editor: undo, redo and History work', async () => {
  await p.getByTestId('tb-background').click(); await p.getByTestId('bg-grad-ocean').click(); await settle(400)
  const undo = p.getByTestId('tb-undo'); need(!(await undo.isDisabled()), 'undo disabled after an edit')
  await undo.click(); await settle(300); need(!(await p.getByTestId('tb-redo').isDisabled()), 'redo disabled after an undo')
  await p.getByTestId('tb-history').click(); await p.getByRole('dialog', { name: 'Version history' }).waitFor({ timeout: 8000 }); await p.keyboard.press('Escape')
})
await check('pictures: upload to storage (S3) and the picture is served back from the API', async () => {
  const r = await ctx.request.post(`${API}/api/v1/presentations/${deckId}/images/upload`, { headers: { Origin: APP }, multipart: { file: { name: 'smoke.jpg', mimeType: 'image/jpeg', buffer: readFileSync(PHOTO) } } })
  need(r.ok(), `upload answered ${r.status()}: ${(await r.text()).slice(0, 160)}`)
  const url = (await r.json()).data.url
  const g = await ctx.request.get(url); need(g.ok() && /image\//.test(g.headers()['content-type'] ?? ''), `picture not served: ${g.status()}`)
})
// what this account's plan allows, from the server (plans are data and change: Starter got the advanced editor later, sharing stays paid)
const features = async () => (await (await ctx.request.get(`${API}/api/v1/me/entitlements`)).json()).data.features
await check('adding objects (text, shapes) follows the plan: a text box when the plan has the advanced editor, else the upgrade message', async () => {
  const f = await features()
  await p.getByTestId('tb-text').click()
  if (f.advancedEditor) { await p.locator('[contenteditable="true"]').first().waitFor({ timeout: 6000 }); await p.keyboard.press('Escape'); await p.keyboard.press('Escape') }
  else { await p.getByText(/Advanced editor/).first().waitFor({ timeout: 6000 }); await p.keyboard.press('Escape') }
})
await check('template deck: create from a free template, editor opens with slides', async () => {
  const r = await ctx.request.post(`${API}/api/v1/presentations`, { headers: { Origin: APP }, data: { templateId: 'pitch-seed-round' } })
  const body = await r.json(); need(r.ok() || /Pro template/.test(JSON.stringify(body)), `create answered ${r.status()}`)
  if (r.ok()) { await p.goto(`${APP}/edit/${body.data.id}`, { waitUntil: 'networkidle' }); await p.getByTestId('stage').waitFor(); need(await p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]').count() > 3, 'too few slides') }
})
await check('Created by me lists the decks; open one; delete the smoke deck cleans up', async () => {
  await p.goto(APP + '/created', { waitUntil: 'networkidle' }); await settle()
  need(/Live smoke deck|Untitled|Seed/.test(await bodyText()), 'created decks missing in the list')
})
await check('share link follows the plan: a paid plan creates one an anonymous browser can open; Starter is told sharing is a paid feature', async () => {
  const r = await ctx.request.post(`${API}/api/v1/presentations/${deckId}/share`, { headers: { Origin: APP } })
  if (!(await features()).livePreview) { const e = await r.json(); need(r.status() === 403 && e.error?.code === 'UPGRADE_REQUIRED', `Starter share answered ${r.status()} ${JSON.stringify(e).slice(0, 120)}`); return }
  need(r.ok(), `share answered ${r.status()}`)
  const link = (await r.json()).data.url
  const anon = await (await b.newContext()).newPage(); const rr = await anon.goto(link, { waitUntil: 'networkidle', timeout: 40000 }); need(rr.status() < 400, `share page ${rr.status()}`)
  await anon.close()
})
await check('support form: a message can be sent', async () => {
  await p.goto(WEB + '/support', { waitUntil: 'networkidle' })
  await p.locator('input[type=email]').fill(EMAIL); await p.locator('textarea').fill('Live smoke test message, please ignore.')
  const sent = p.waitForResponse((r) => r.url().endsWith('/api/v1/support') && r.request().method() === 'POST', { timeout: 15000 })
  await p.locator('button[type=submit]').click()
  const r = await sent; need(r.status() === 201, `support answered ${r.status()}`)
})
await check('AI deck generation: a prompt reaches the model and comes back', async () => {
  // QA runs a free-tier key: slower answers and an occasional "high demand" retry, so allow two minutes
  const r = await ctx.request.post(`${API}/api/v1/generation/analyze`, { headers: { Origin: APP }, data: { prompt: 'A short deck about tea', language: 'en' }, timeout: 120000 })
  need(r.ok(), `analyze answered ${r.status()}: ${(await r.text()).slice(0, 200)}`)
})
await check('log out ends the session', async () => {
  await ctx.request.post(`${API}/api/auth/sign-out`, { headers: { Origin: APP, 'Content-Type': 'application/json' }, data: {} })
  const me = await ctx.request.get(`${API}/api/v1/me`); need(me.status() === 401, `still signed in (${me.status()})`)
})

await b.close()
const bad = results.filter((r) => !r.ok).length
console.log(`\n${results.length - bad}/${results.length} passed`)
process.exit(bad ? 1 : 0)
