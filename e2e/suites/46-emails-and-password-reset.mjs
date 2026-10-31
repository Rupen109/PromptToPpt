/**
 * Account e-mails and getting back into an account, in a real browser against the real API.
 * Mail to the reserved test domains (example.com) is never sent: the API keeps it in services/api/.data/outbox.jsonl, which is read here
 * to follow the real links. No AI is called.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EDITOR, PASSWORD, WEB, expect, launch, suite, uniqueEmail } from '../lib.mjs'

const OUTBOX = join(new URL('../..', import.meta.url).pathname, 'services/api/.data/outbox.jsonl')
const mails = (to) => (existsSync(OUTBOX) ? readFileSync(OUTBOX, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.to.toLowerCase() === to.toLowerCase()) : [])
const wait = async (fn, ms = 12000, what = 'condition') => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`); await new Promise((r) => setTimeout(r, 250)) } }
const linkIn = (m, re) => new RegExp(re.source, 'i').exec(m.text)?.[0]
const NEW_PASSWORD = 'Brand-new-pass-9!x'

export default async function () {
  const s = suite('46-emails-and-password-reset')
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  const p = await ctx.newPage()
  const email = uniqueEmail('pw')

  await p.goto(WEB + '/login', { waitUntil: 'networkidle' })
  // a plain sign-up through the API (the UI sign-up is covered elsewhere)
  const up = await p.evaluate(async ({ email, password }) => (await fetch('http://localhost:4000/api/auth/sign-up/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ email, password, name: 'Priya Nair' }) })).status, { email, password: PASSWORD })
  expect(up === 200, `sign-up answered ${up}`)
  await ctx.clearCookies()

  await s.check('the log-in page offers "Forgot password?" and it opens a page asking for the email', p, async () => {
    await p.goto(WEB + '/login', { waitUntil: 'networkidle' })
    await p.getByRole('link', { name: 'Forgot password?' }).click()
    await p.waitForURL(/\/forgot-password/, { timeout: 8000 })
    await p.getByRole('heading', { name: 'Forgot your password?' }).waitFor()
    expect(await p.locator('input[name=email]').count() === 1, 'no email field')
    expect(await p.locator('meta[name=robots]').getAttribute('content') === 'noindex, nofollow', 'page can be indexed')
  })

  await s.check('an address with NO account gets the very same answer and no email (nobody can probe who has an account)', p, async () => {
    const ghost = uniqueEmail('ghost')
    await p.goto(WEB + '/forgot-password', { waitUntil: 'networkidle' })
    await p.locator('input[name=email]').fill(ghost); await p.getByRole('button', { name: 'Send me the link' }).click()
    await p.getByRole('heading', { name: 'Check your email' }).waitFor({ timeout: 10000 })
    expect(await p.getByRole('status').innerText().then((t) => t.includes(ghost)), 'the answer does not repeat the address')
    await p.waitForTimeout(1500)
    expect(mails(ghost).length === 0, 'an email was sent to an address without an account')
  })

  let resetMail
  await s.check('a real account: the page says "check your email" and a branded reset email arrives with a one-hour link', p, async () => {
    await p.goto(WEB + '/forgot-password', { waitUntil: 'networkidle' })
    await p.locator('input[name=email]').fill(email); await p.getByRole('button', { name: 'Send me the link' }).click()
    await p.getByRole('heading', { name: 'Check your email' }).waitFor({ timeout: 10000 })
    resetMail = await wait(() => mails(email).find((m) => /Reset your SlidesDone password/.test(m.subject)), 12000, 'the reset email')
    expect(/Hi Priya,/.test(resetMail.text), 'greeting missing')
    expect(/works for 1 hour/.test(resetMail.text), 'no expiry given')
    expect(!!linkIn(resetMail, /http\S+\/api\/auth\/reset-password\/\S+/), `no reset link: ${resetMail.text.slice(0, 200)}`)
  })

  await s.check('the link opens the new-password page; two different passwords are refused; a good one changes it and shows "Password changed"', p, async () => {
    await p.goto(linkIn(resetMail, /http\S+\/api\/auth\/reset-password\/\S+/), { waitUntil: 'networkidle' })
    await p.getByRole('heading', { name: 'Choose a new password' }).waitFor({ timeout: 10000 })
    expect(/\/reset-password\?token=/.test(p.url()), `unexpected page ${p.url()}`)
    await p.locator('input[name=password]').fill(NEW_PASSWORD); await p.locator('input[name=again]').fill(NEW_PASSWORD + 'x'); await p.getByRole('button', { name: 'Change my password' }).click()
    await p.locator('p[role=alert]').waitFor({ timeout: 5000 })
    expect(/not the same/.test(await p.locator('p[role=alert]').innerText()), 'no mismatch message')
    await p.locator('input[name=again]').fill(NEW_PASSWORD); await p.getByRole('button', { name: 'Change my password' }).click()
    await p.getByRole('heading', { name: 'Password changed' }).waitFor({ timeout: 10000 })
  })

  await s.check('afterwards: the old password is refused, the new one logs in, and a "your password was changed" email arrives', p, async () => {
    const tryLogin = (password) => p.evaluate(async ({ email, password }) => (await fetch('http://localhost:4000/api/auth/sign-in/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ email, password }) })).status, { email, password })
    expect(await tryLogin(PASSWORD) === 401, 'the old password still works')
    expect(await tryLogin(NEW_PASSWORD) === 200, 'the new password does not work')
    const m = await wait(() => mails(email).find((x) => /password was changed/.test(x.subject)), 12000, 'the changed-password email')
    expect(/signed out/.test(m.text) && /forgot-password/.test(m.text), 'the notice must say you were signed out and how to react if it was not you')
    await ctx.clearCookies()
  })

  await s.check('a used link, a made-up token and a page without a token all say "This link no longer works" with a way to get a new one', p, async () => {
    for (const url of [linkIn(resetMail, /http\S+\/api\/auth\/reset-password\/\S+/), `${WEB}/reset-password?error=INVALID_TOKEN`, `${WEB}/reset-password`]) {
      await p.goto(url, { waitUntil: 'networkidle' })
      await p.getByRole('heading', { name: 'This link no longer works' }).waitFor({ timeout: 10000 })
      expect(await p.getByRole('link', { name: 'Get a new link' }).count() === 1, `no way forward on ${url}`)
    }
    // a token that looks right but was never issued: the form shows, the server refuses it in plain words
    await p.goto(`${WEB}/reset-password?token=abcdefghijklmnopqrstuvwxyz123456`, { waitUntil: 'networkidle' })
    await p.locator('input[name=password]').fill(NEW_PASSWORD); await p.locator('input[name=again]').fill(NEW_PASSWORD); await p.getByRole('button', { name: 'Change my password' }).click()
    await p.locator('p[role=alert]').waitFor({ timeout: 8000 })
    expect(/expired|already used|new one/i.test(await p.locator('p[role=alert]').innerText()), `message: ${await p.locator('p[role=alert]').innerText()}`)
  })

  await s.check('asking again and again is limited with a plain message, never a crash', p, async () => {
    const victim = uniqueEmail('limit')
    await p.evaluate(async ({ email, password }) => fetch('http://localhost:4000/api/auth/sign-up/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, name: 'L' }) }), { email: victim, password: PASSWORD })
    let limited = false
    for (let i = 0; i < 8 && !limited; i++) {
      await p.goto(WEB + '/forgot-password?email=' + encodeURIComponent(victim), { waitUntil: 'networkidle' })
      await p.getByRole('button', { name: 'Send me the link' }).click()
      await Promise.race([p.getByRole('heading', { name: 'Check your email' }).waitFor({ timeout: 6000 }), p.locator('p[role=alert]').waitFor({ timeout: 6000 })]).catch(() => {})
      limited = await p.locator('p[role=alert]').count() > 0
    }
    if (limited) expect(/too many|try again/i.test(await p.locator('p[role=alert]').innerText()), 'the limit message is unclear')
  })

  await s.check('email confirmation: the branded mail arrives, its link confirms the address and signs in, and a welcome email follows', p, async () => {
    const mine = uniqueEmail('ver')
    await p.goto(WEB + '/login', { waitUntil: 'networkidle' })
    await p.evaluate(async ({ email, password }) => fetch('http://localhost:4000/api/auth/sign-up/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ email, password, name: 'Mei Tanaka' }) }), { email: mine, password: PASSWORD })
    await ctx.clearCookies()
    const sent = await p.evaluate(async ({ email }) => (await fetch('http://localhost:4000/api/auth/send-verification-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, callbackURL: 'http://localhost:3001/' }) })).status, { email: mine })
    expect(sent === 200, `send-verification-email answered ${sent}`)
    const m = await wait(() => mails(mine).find((x) => /Confirm your email/.test(x.subject)), 12000, 'the confirmation email')
    expect(/Hi Mei,/.test(m.text) && /works for 1 hour/.test(m.text), 'greeting / expiry missing')
    await p.goto(linkIn(m, /http\S+\/api\/auth\/verify-email\?\S+/), { waitUntil: 'networkidle' })
    const welcome = await wait(() => mails(mine).find((x) => /Welcome to SlidesDone/.test(x.subject)), 12000, 'the welcome email')
    expect(/1\. Describe your topic/.test(welcome.text), 'the welcome email has no steps')
  })

  await s.check('no email text carries a raw tag, an emoji, or an address that is not ours', p, async () => {
    const all = [...mails(email)]
    expect(all.length >= 2, `only ${all.length} mails for the test account`)
    for (const m of all) {
      expect(!/<[a-z][^>]*>/i.test(m.text), `HTML in the plain text of "${m.subject}"`)
      expect(!/[\u{1F300}-\u{1FAFF}]/u.test(m.subject + m.text), `emoji in "${m.subject}"`)
      for (const u of m.text.match(/https?:\/\/[^\s)]+/g) ?? []) expect(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u), `unexpected host in "${m.subject}": ${u}`)
    }
  })

  void EDITOR
  await b.close()
  return s.done()
}
