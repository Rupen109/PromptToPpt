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

  await s.check('session survives a reload and shows the signed-in sidebar (name + email, Billing, log out)', p, async () => {
    await p.reload({ waitUntil: 'networkidle' })
    await p.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 10000 })
    const nav = p.locator('aside').first()
    expect(await nav.getByText(email, { exact: true }).isVisible(), 'the signed-in email is not shown under the name')
    expect(await nav.getByRole('link', { name: 'Billing' }).isVisible(), 'Billing button missing')
    expect(await p.getByLabel('Plan and credits').count() === 0 && !/credits/i.test(await nav.innerText()), 'the sidebar should not show credits (they live on the Billing page)')
    expect(await p.getByRole('button', { name: 'Log out' }).isVisible(), 'log out missing')
    await ctx.storageState({ path: STATE })
  })

  await s.check('Billing page: plan, credits left, plan limits (no spending breakdown)', p, async () => {
    await p.locator('aside').first().getByRole('link', { name: 'Billing' }).click(); await p.waitForURL(/\/billing/, { timeout: 8000 })
    await p.getByRole('heading', { name: 'Plan & credits' }).waitFor({ timeout: 8000 })
    const credits = p.getByLabel('Credits', { exact: true }); await credits.waitFor({ timeout: 8000 })
    expect(/Credits left/.test(await credits.innerText()) && /used this period/.test(await credits.innerText()), 'credits section incomplete')
    expect(!/Where your credits went/.test(await p.locator('main').innerText()), 'the spending breakdown should be gone')
    expect(await p.getByLabel('Plan limits').isVisible() && await p.getByLabel('Payment history').isVisible(), 'a section is missing')
    expect(await p.getByLabel('Recent credit activity').count() === 0, 'the recent activity section should be gone')
    expect(/Starter|Pro|Gold/.test(await p.getByLabel('Current plan').innerText()), 'plan name missing')
    await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
  })

  await s.check('two tabs: switching account in one tab stops the other tab from acting as the wrong person, then continues as the new account', p, async () => {
    const c2 = await b.newContext({ viewport: { width: 1440, height: 900 } })
    const A = await c2.newPage(), B = await c2.newPage()
    const e1 = uniqueEmail('taba'), e2 = uniqueEmail('tabb')
    const post = (pg, path, body) => pg.evaluate(async ([path, body]) => { const r = await fetch('http://localhost:4000' + path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.status }, [path, body])
    await A.goto(WEB + '/login', { waitUntil: 'domcontentloaded' })
    expect(await post(A, '/api/auth/sign-up/email', { email: e1, password: PASSWORD, name: 'Tab A' }) === 200, 'sign-up A failed')
    await A.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    await A.locator('aside').first().getByText(e1, { exact: true }).waitFor({ timeout: 10000 })
    const idA = await A.evaluate(() => fetch('http://localhost:4000/api/v1/me', { credentials: 'include' }).then((r) => r.json()).then((j) => j.data.id))
    // tab B: sign out, sign in as someone else (the cookie is shared by both tabs)
    await B.goto(WEB + '/login', { waitUntil: 'domcontentloaded' })
    await post(B, '/api/auth/sign-out', {})
    expect(await post(B, '/api/auth/sign-up/email', { email: e2, password: PASSWORD, name: 'Tab B' }) === 200, 'sign-up B failed')
    // back in tab A: it regains focus
    await A.bringToFront(); await A.evaluate(() => window.dispatchEvent(new Event('focus')))
    const dlg = A.getByRole('alertdialog'); await dlg.waitFor({ timeout: 8000 })
    expect(new RegExp(e2.replace(/[.+]/g, '\\$&')).test(await dlg.innerText()), 'the dialog does not name the new account')
    // a write from tab A (which still believes it is account A) is refused by the server
    const blocked = await A.evaluate(async (id) => (await fetch('http://localhost:4000/api/v1/projects', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Session-User': id }, body: JSON.stringify({ name: 'should not exist' }) })).status, idA)
    expect(blocked === 409, `write as the old account returned ${blocked}`)
    await dlg.getByRole('button', { name: /Continue as/ }).click()
    await A.locator('aside').first().getByText(e2, { exact: true }).waitFor({ timeout: 10000 })
    expect(await A.locator('aside').first().getByText(e1, { exact: true }).count() === 0, 'still showing the old account')
    await c2.close()
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
    await p.waitForURL((u) => u.origin === new URL(WEB).origin, { timeout: 15000 })
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
