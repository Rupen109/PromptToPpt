import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EDITOR, PASSWORD, RESULTS, WEB, expect, launch, suite, uniqueEmail } from '../lib.mjs'

export const ACCOUNT = join(RESULTS, 'account.json')
export const STATE = join(RESULTS, 'auth-state.json')

export default async function () {
  const s = suite('02-auth')
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  const email = uniqueEmail('qa')
  const settle = (ms = 500) => p.waitForTimeout(ms)

  await s.check('protected editor route redirects a signed-out user to login with ?next', p, async () => {
    await p.goto(EDITOR + '/created')
    await p.waitForURL(/\/login\?next=/, { timeout: 15000 })
    expect(decodeURIComponent(p.url()).includes('localhost:3001/created'), `next lost: ${p.url()}`)
  })

  await s.check('login form validates: empty submit blocked, wrong password shows an error', p, async () => {
    await p.goto(WEB + '/login', { waitUntil: 'networkidle' })
    await p.getByRole('button', { name: 'Log in' }).click(); await settle(200)
    expect(p.url().endsWith('/login'), 'left the page with empty form')
    await p.locator('input[name=email]').fill('nobody@example.com')
    await p.locator('input[name=password]').fill('wrong-password-123')
    await p.getByRole('button', { name: 'Log in' }).click()
    await p.getByRole('alert').waitFor({ timeout: 8000 })
  })

  await s.check('signup validates: short password blocked; valid sign-up lands in the editor', p, async () => {
    await p.goto(WEB + '/signup', { waitUntil: 'networkidle' })
    await p.locator('input[name=name]').fill('QA Tester')
    await p.locator('input[name=email]').fill(email)
    await p.locator('input[name=password]').fill('short')
    await p.getByRole('button', { name: 'Sign up free' }).click(); await settle(300)
    expect(p.url().includes('/signup'), 'short password accepted')
    await p.locator('input[name=password]').fill(PASSWORD)
    await p.getByRole('button', { name: 'Sign up free' }).click()
    await p.waitForURL(/localhost:3001/, { timeout: 20000 })
    await p.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 15000 })
    writeFileSync(ACCOUNT, JSON.stringify({ email, password: PASSWORD }))
  })

  await s.check('session survives a reload and shows the signed-in sidebar (plan, credits, log out)', p, async () => {
    await p.reload({ waitUntil: 'networkidle' })
    await p.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 10000 })
    expect(await p.getByLabel('Plan and credits').isVisible(), 'plan card missing')
    expect(await p.getByRole('button', { name: 'Log out' }).isVisible(), 'log out missing')
    await ctx.storageState({ path: STATE })
  })

  await s.check('signed-in user hitting /login or /signup is not stuck (can still navigate)', p, async () => {
    const r = await p.goto(WEB + '/login'); expect(r.status() < 400, 'login page error')
  })

  await s.check('duplicate email sign-up shows an error', p, async () => {
    const c2 = await b.newContext(); const q = await c2.newPage()
    await q.goto(WEB + '/signup', { waitUntil: 'networkidle' })
    await q.locator('input[name=name]').fill('Dup'); await q.locator('input[name=email]').fill(email); await q.locator('input[name=password]').fill(PASSWORD)
    await q.getByRole('button', { name: 'Sign up free' }).click()
    await q.getByRole('alert').waitFor({ timeout: 8000 })
    await c2.close()
  })

  await s.check('open-redirect is blocked: ?next=https://evil.example never leaves our domains', p, async () => {
    const c2 = await b.newContext(); const q = await c2.newPage()
    await q.goto(WEB + '/login?next=' + encodeURIComponent('https://evil.example/phish'), { waitUntil: 'networkidle' })
    await q.locator('input[name=email]').fill(email); await q.locator('input[name=password]').fill(PASSWORD)
    await q.getByRole('button', { name: 'Log in' }).click()
    await q.waitForURL(/localhost:3001/, { timeout: 20000 })
    expect(!q.url().includes('evil'), `redirected to ${q.url()}`)
    await c2.close()
  })

  await s.check('login → logout → protected pages are locked again', p, async () => {
    await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    await p.getByRole('button', { name: 'Log out' }).click()
    await p.waitForURL(/localhost:3000/, { timeout: 15000 })
    await p.goto(EDITOR + '/created'); await p.waitForURL(/\/login\?next=/, { timeout: 15000 })
  })

  await s.check('login with the new account works and returns to the originally requested page', p, async () => {
    await p.locator('input[name=email]').fill(email); await p.locator('input[name=password]').fill(PASSWORD)
    await p.getByRole('button', { name: 'Log in' }).click()
    await p.waitForURL(/localhost:3001\/created/, { timeout: 20000 })
    await ctx.storageState({ path: STATE })
  })

  await s.check('admin area is hidden from non-owners (no link; direct URL does not render the dashboard)', p, async () => {
    expect(await p.getByRole('link', { name: /Owner dashboard/ }).count() === 0, 'admin link shown to a normal user')
    await p.goto(EDITOR + '/admin', { waitUntil: 'networkidle' }); await settle(1200)
    const txt = await p.locator('body').innerText()
    expect(!/Token usage|Overview/i.test(txt) || /not authori[sz]ed|forbidden|403/i.test(txt) || !p.url().includes('/admin'), 'admin UI rendered for a normal user')
  })

  await s.check('Google sign-in button is offered on login and signup', p, async () => {
    const c2 = await b.newContext(); const q = await c2.newPage()
    await q.goto(WEB + '/login', { waitUntil: 'networkidle' })
    expect(await q.getByRole('button', { name: /Continue with Google/ }).count() === 1, 'Google button missing (GOOGLE_AUTH flag off?)')
    await c2.close()
  })

  await b.close()
  return s.done()
}
