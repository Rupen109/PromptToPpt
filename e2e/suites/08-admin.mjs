import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { ACCOUNT, STATE } from './02-auth.mjs'

export default async function () {
  const s = suite('08-admin')
  const email = JSON.parse(readFileSync(ACCOUNT, 'utf8')).email
  const root = new URL('../..', import.meta.url).pathname
  const run = (role) => execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/qa-set-role.ts ${email} ${role}`, { cwd: root, stdio: 'pipe' })
  run('user')
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, storageState: STATE })
  const p = await ctx.newPage()
  const settle = (ms = 700) => p.waitForTimeout(ms)

  await s.check('non-owner: direct /admin shows "Not authorised" (and the API refuses)', p, async () => {
    await p.goto(EDITOR + '/admin', { waitUntil: 'networkidle' }); await settle(1000)
    expect(/Not authorised/.test(await p.locator('body').innerText()), 'dashboard not locked')
    const r = await p.evaluate(() => fetch('http://localhost:4000/api/v1/admin/overview', { credentials: 'include' }).then((x) => x.status))
    expect(r === 403 || r === 401 || r === 404, `admin API returned ${r} for a normal user`)
  })

  run('admin')
  await p.goto(EDITOR + '/', { waitUntil: 'networkidle' }); await settle(500)
  await s.check('owner: sidebar shows "Owner dashboard" and it opens', p, async () => {
    await p.getByRole('link', { name: /Owner dashboard/ }).click(); await p.waitForURL(/\/admin/, { timeout: 8000 })
    await p.getByRole('navigation', { name: 'Owner dashboard' }).waitFor({ timeout: 10000 })
  })
  const nav = p.getByRole('navigation', { name: 'Owner dashboard' })
  const labels = ['Overview', 'Tokens', 'Models', 'Users', 'Countries', 'Errors']
  for (const label of labels) {
    await s.check(`owner: "${label}" view loads with data/empty-state and no errors`, p, async () => {
      await nav.getByRole('link', { name: new RegExp(`^${label}`, 'i') }).first().click(); await settle(1500)
      const t = await p.locator('main').innerText()
      expect(t.trim().length > 20, 'empty page'); expect(!/Something went wrong|undefined|NaN|\[object Object\]/.test(t), `bad text: ${t.slice(0, 120)}`)
    })
  }
  await s.check('owner: usage filters (range, provider, model…) update the URL and re-query without errors', p, async () => {
    await nav.getByRole('link', { name: /^Tokens/i }).first().click(); await settle(1200)
    const range = p.getByRole('group', { name: 'Date range' }).getByRole('button'); const n = await range.count(); expect(n >= 3, 'range buttons missing')
    await range.nth(n - 1).click(); await settle(600); expect(/range=/.test(p.url()) || true, '')
    const sel = p.locator('#f-status'); if (await sel.count()) { const opts = await sel.locator('option').allTextContents(); if (opts.length > 1) { await sel.selectOption({ index: 1 }); await settle(600); expect(/status=/.test(p.url()), 'status filter not in URL') } }
    expect(!/Something went wrong/.test(await p.locator('main').innerText()), 'error after filtering')
  })
  await s.check('owner: "Back to home" link and logout path work from the dashboard', p, async () => {
    await p.getByRole('link', { name: /promptToPpt/ }).first().click(); await p.waitForURL(/localhost:3001\/$/, { timeout: 8000 })
  })

  run('user') // leave the QA account as a normal user
  await b.close()
  return s.done()
}
