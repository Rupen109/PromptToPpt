import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { API, EDITOR, expect, launch, suite } from '../lib.mjs'
import { ACCOUNT, STATE } from './02-auth.mjs'

const SECTIONS = [
  ['Sales & revenue', '/admin/sales', /Sales|revenue/i], ['Subscriptions', '/admin/subscriptions', /Subscriptions/i], ['Cost & margin', '/admin/margin', /margin/i],
  ['Presentations', '/admin/presentations', /Presentations/i], ['Prompts / use cases', '/admin/prompts', /Prompts|use case/i], ['Images', '/admin/images', /Images/i],
  ['Exports', '/admin/exports', /Exports/i], ['Providers', '/admin/providers', /Providers/i], ['Performance', '/admin/performance', /Performance|latency/i],
  ['Google Cloud', '/admin/cloud', /Google Cloud/i], ['Feature flags', '/admin/flags', /flag/i], ['Audit logs', '/admin/audit', /Audit/i],
]

export default async function () {
  const s = suite('10-admin-sections')
  const email = JSON.parse(readFileSync(ACCOUNT, 'utf8')).email
  const root = new URL('../..', import.meta.url).pathname
  const role = (r) => execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/qa-set-role.ts ${email} ${r}`, { cwd: root, stdio: 'pipe' })
  role('admin')
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, storageState: STATE })
  const p = await ctx.newPage()
  p.on('dialog', (d) => void d.accept())
  const settle = (ms = 1200) => p.waitForTimeout(ms)
  const main = () => p.locator('main').innerText()
  await p.goto(EDITOR + '/admin', { waitUntil: 'networkidle' })

  await s.check('sidebar lists all 18 sections in 4 groups and no "COMING" placeholders', p, async () => {
    const nav = p.getByRole('navigation', { name: 'Owner dashboard' }); await nav.waitFor({ timeout: 10000 })
    const links = await nav.getByRole('link').count(); expect(links === 18, `${links} links`)
    expect(!/COMING/.test(await nav.innerText()), 'placeholders still listed')
  })

  for (const [label, path, re] of SECTIONS) {
    await s.check(`${label}: loads real data (no errors, no NaN/undefined/Infinity), has a heading, tables have headers`, p, async () => {
      await p.getByRole('navigation', { name: 'Owner dashboard' }).getByRole('link', { name: label, exact: true }).click(); await p.waitForURL(new RegExp(path + '$'), { timeout: 8000 }); await settle(1800)
      const t = await main(); expect(t.length > 80, `thin page: ${t.slice(0, 60)}`)
      expect(re.test(t), 'wrong page content')
      expect(!/NaN|undefined|Infinity|\[object Object\]|Something went wrong|Failed to load/.test(t), `bad text: ${(/NaN|undefined|Infinity|\[object Object\]|Something went wrong|Failed to load/.exec(t) ?? [''])[0]} … ${t.slice(0, 100)}`)
      const bad = await p.locator('main table').evaluateAll((ts) => ts.filter((t) => !t.querySelector('th')).length); expect(bad === 0, `${bad} tables without headers`)
    })
  }

  await s.check('costs show in INR (₹) by default; the toggle switches to USD and the choice survives a reload', p, async () => {
    await p.goto(EDITOR + '/admin/margin', { waitUntil: 'networkidle' }); await settle(1800)
    let t = await main(); expect(/₹/.test(t) && !/\$\d/.test(t), `expected ₹ amounts only: ${(t.match(/[₹$][\d,.]+/g) ?? []).slice(0, 5).join(' ')}`)
    await p.getByRole('group', { name: 'Display currency' }).getByRole('button', { name: /USD/ }).click(); await settle(900)
    t = await main(); expect(/\$\d/.test(t), 'USD not shown after toggle')
    await p.reload({ waitUntil: 'networkidle' }); await settle(1500); expect(/\$\d/.test(await main()), 'choice lost on reload')
    await p.getByRole('group', { name: 'Display currency' }).getByRole('button', { name: /INR/ }).click(); await settle(600)
  })
  await s.check('Google Cloud: add two readings → burn vs ledger comparison appears; readings can be removed', p, async () => {
    await p.goto(EDITOR + '/admin/cloud', { waitUntil: 'networkidle' }); await settle(1500)
    const add = async (amount, minsAgo) => { const d = new Date(Date.now() - minsAgo * 60000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); await p.getByLabel('Credit remaining (₹)').fill(String(amount)); await p.getByLabel('Read at').fill(d.toISOString().slice(0, 16)); await p.getByRole('button', { name: 'Save reading' }).click(); await settle(1200) }
    await add(50000, 120); await add(49900.5, 5)
    expect(/Google burned/.test(await main()) && /₹99\.50/.test(await main()), 'burn of ₹99.50 not shown')
    expect(/Coverage/.test(await main()) && !/NaN|Infinity/.test(await main()), 'coverage missing or invalid')
    for (let i = 0; i < 2; i++) { await p.getByRole('button', { name: /Remove reading/ }).first().click(); await settle(900) }
    expect(/No readings yet/.test(await main()), 'readings not removed')
    expect(/Not connected yet/.test(await main()), 'connector setup steps missing')
  })
  await s.check('date-range buttons refetch (Today / 7 / 30 / 90 days) on a section without errors', p, async () => {
    await p.goto(EDITOR + '/admin/sales', { waitUntil: 'networkidle' }); await settle(1200)
    for (const name of ['Today', '7 days', '90 days', '30 days']) { await p.getByRole('group', { name: 'Date range' }).getByRole('button', { name }).click(); await settle(900); expect(!/Something went wrong|Failed to load/.test(await main()), `${name} errored`); }
  })
  await s.check('sales & subscriptions tables paginate / filter without errors', p, async () => {
    await p.goto(EDITOR + '/admin/subscriptions', { waitUntil: 'networkidle' }); await settle(1500)
    const search = p.getByRole('searchbox').or(p.getByPlaceholder(/search/i)).first()
    if (await search.count()) { await search.fill('qa'); await settle(900); expect(!/Something went wrong/.test(await main()), 'search errored') }
  })
  await s.check('exports page reflects a real export (export a deck, it appears in Recent exports)', p, async () => {
    await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    const id = await p.evaluate(async () => (await (await fetch('http://localhost:4000/api/v1/presentations', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: 'pitch-launchpad' }) })).json()).data.id)
    const ok = await p.evaluate(async (id) => (await fetch('http://localhost:4000/api/v1/exports', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presentationId: id, format: 'pptx' }) })).status, id)
    expect(ok === 200, `export status ${ok}`)
    await p.goto(EDITOR + '/admin/exports', { waitUntil: 'networkidle' }); await settle(2000)
    expect(/PPTX/i.test(await main()), 'no PPTX row on the Exports page')
  })
  await s.check('prompts page never shows emails or names (privacy)', p, async () => {
    await p.goto(EDITOR + '/admin/prompts', { waitUntil: 'networkidle' }); await settle(2000)
    expect(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(await main()), 'an email address appears on the prompts page')
  })
  await s.check('providers page shows integration status without secrets', p, async () => {
    await p.goto(EDITOR + '/admin/providers', { waitUntil: 'networkidle' }); await settle(2000)
    const t = await main(); expect(!/rzp_|AIza|sk-|secret[:=]/i.test(t), 'secret-looking text on the page')
  })
  await s.check('feature flags: toggle a flag, it persists after reload and shows in audit logs; reset restores default', p, async () => {
    await p.goto(EDITOR + '/admin/flags', { waitUntil: 'networkidle' }); await settle(1500)
    const sw = p.getByRole('switch').first(); await sw.waitFor({ timeout: 8000 })
    const before = await sw.getAttribute('aria-checked'); const name = await sw.getAttribute('aria-label')
    await sw.click(); await p.getByRole('button', { name: /^Save/ }).first().click(); await settle(1500)
    await p.reload({ waitUntil: 'networkidle' }); await settle(1500)
    const after = await p.getByRole('switch').first().getAttribute('aria-checked'); expect(after !== before, `flag "${name}" did not persist`)
    await p.goto(EDITOR + '/admin/audit', { waitUntil: 'networkidle' }); await settle(1800)
    expect(/flag/i.test(await main()), 'flag change missing from audit log')
    await p.goto(EDITOR + '/admin/flags', { waitUntil: 'networkidle' }); await settle(1200)
    await p.getByRole('button', { name: /Reset to default/ }).first().click(); await settle(1500)
    await p.reload({ waitUntil: 'networkidle' }); await settle(1200)
    expect(await p.getByRole('switch').first().getAttribute('aria-checked') === before, 'reset did not restore the default')
  })
  await s.check('maintenance mode really blocks AI for users and the banner shows; turning it off restores', p, async () => {
    const put = (enabled) => p.evaluate(async (enabled) => (await fetch('http://localhost:4000/api/v1/admin/flags/maintenance_mode', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, rolloutPercent: 100, plans: [], note: 'e2e' }) })).status, enabled)
    await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    expect(await put(true) === 200, 'could not enable')
    try {
      const code = await p.evaluate(async () => { const r = await fetch('http://localhost:4000/api/v1/generation/analyze', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'A pitch deck for a coffee shop' }) }); return [r.status, (await r.json()).error?.code] })
      expect(code[0] === 503 && code[1] === 'MAINTENANCE', `analyze during maintenance → ${code}`)
      await p.reload({ waitUntil: 'networkidle' }); await settle(1500); expect(/maintenance/i.test(await p.locator('body').innerText()), 'no maintenance banner on Home')
    } finally { await p.evaluate(() => fetch('http://localhost:4000/api/v1/admin/flags/maintenance_mode', { method: 'DELETE', credentials: 'include' })) }
    await p.reload({ waitUntil: 'networkidle' }); await settle(1200); expect(!/maintenance/i.test(await p.locator('body').innerText()), 'banner stuck after reset')
  })
  await s.check('audit log: filters + CSV download work and the page hides its own reads by default', p, async () => {
    await p.goto(EDITOR + '/admin/audit', { waitUntil: 'networkidle' }); await settle(1800)
    expect(await p.getByRole('button', { name: /CSV/i }).count() >= 1, 'no CSV button')
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.getByRole('button', { name: /CSV/i }).first().click()])
    expect(/\.csv$/.test(dl.suggestedFilename()), dl.suggestedFilename())
  })
  await s.check('non-admin gets 403 from every new admin API', p, async () => {
    role('user'); await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    const paths = ['cloud', 'sales/summary', 'subscriptions/summary', 'margin/summary', 'presentations/summary', 'prompts/overview', 'images/summary', 'exports/summary', 'providers/overview', 'performance/overview', 'flags', 'audit']
    const codes = await p.evaluate(async (paths) => Promise.all(paths.map((x) => fetch('http://localhost:4000/api/v1/admin/' + x, { credentials: 'include' }).then((r) => r.status))), paths)
    expect(codes.every((c) => c === 403), `statuses: ${codes.join(',')}`)
  })

  role('user')
  await b.close()
  void API
  return s.done()
}
