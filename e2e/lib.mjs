import { chromium, firefox, webkit } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const WEB = process.env.E2E_WEB ?? 'http://localhost:3000'
export const EDITOR = process.env.E2E_EDITOR ?? 'http://localhost:3001'
export const API = process.env.E2E_API ?? 'http://localhost:4000'
export const RESULTS = join(here, 'results')
mkdirSync(RESULTS, { recursive: true })

const CHROMIUM = process.env.E2E_CHROMIUM ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`
/** The website loads Google's translate script quietly for every visitor. Tests do not need it (and hundreds of loads from one machine make Google answer "unusual traffic"), so it is blocked unless a suite asks for the real thing: `launch({ google: true })`. */
const GOOGLE_TRANSLATE = /translate\.google\.com|translate\.googleapis\.com|translate-pa\.googleapis\.com|www\.gstatic\.com\/(_\/translate|images\/branding)/
/**
 * The editor asks every account once "What do you make presentations for?" (components/WelcomeGate.tsx). Suites are about other things, so every page they open
 * answers it by itself ("Something else") the moment it shows. The suite that tests the question itself opts out: `launch({ welcome: 'ask' })`.
 */
async function answerWelcome(page) {
  await page.addLocatorHandler(page.getByRole('heading', { name: 'What do you make presentations for?' }), async () => {
    await page.getByRole('radio', { name: /Something else/ }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('heading', { name: 'What do you make presentations for?' }).waitFor({ state: 'detached', timeout: 15000 })
  })
}

export async function launch({ google = false, welcome = 'answer' } = {}) {
  // E2E_BROWSER=firefox|webkit runs a suite in that engine (installed with playwright's own installer); the default is the local Chromium
  const engine = { firefox, webkit }[process.env.E2E_BROWSER ?? '']
  const browser = engine ? await engine.launch() : await chromium.launch({ executablePath: CHROMIUM })
  const make = browser.newContext.bind(browser)
  browser.newContext = async (options) => {
    const ctx = await make(options)
    // answered empty (not failed) so the console stays clean
    if (!google) await ctx.route(GOOGLE_TRANSLATE, (r) => void r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
    if (welcome === 'answer') { const open = ctx.newPage.bind(ctx); ctx.newPage = async () => { const page = await open(); await answerWelcome(page); return page } }
    return ctx
  }
  // browser.newPage() makes its own context: route it through the one above
  browser.newPage = async (options) => { const ctx = await browser.newContext(options); const page = await ctx.newPage(); page.close = ((close) => async (o) => { await close(o); await ctx.close() })(page.close.bind(page)); return page }
  return browser
}

/** Ignorable noise: dev-only warnings that are not product defects. */
const NOISE = [/Download the React DevTools/, /\[vite\]/, /Fast Refresh/, /favicon/i]

/** A tiny runner: each check is isolated, failures keep a screenshot, console errors / failed requests are attached. */
export function suite(name) {
  const results = []
  return {
    name,
    results,
    async check(title, page, fn) {
      const log = []
      const onErr = (e) => log.push(`pageerror: ${String(e).slice(0, 200)}`)
      const onCons = (m) => m.type() === 'error' && !NOISE.some((r) => r.test(m.text())) && log.push(`console: ${m.text().slice(0, 200)}`)
      const onResp = (r) => r.status() >= 400 && !/favicon/.test(r.url()) && log.push(`http ${r.status()}: ${r.request().method()} ${r.url().slice(0, 120)}`)
      page?.on('pageerror', onErr); page?.on('console', onCons); page?.on('response', onResp)
      const t0 = Date.now()
      let ok = true, error = ''
      try { await fn() } catch (e) { ok = false; error = String(e.message ?? e).split('\n').filter((l) => l.trim() && !/^Call log/.test(l.trim())).slice(0, 4).join(' ⏎ ').slice(0, 500) }
      page?.off('pageerror', onErr); page?.off('console', onCons); page?.off('response', onResp)
      const shot = !ok && page ? `${name}-${results.length}.png` : undefined
      if (shot) await page.screenshot({ path: join(RESULTS, shot) }).catch(() => {})
      results.push({ title, ok, error, noise: log, ms: Date.now() - t0, ...(shot ? { shot } : {}) })
      console.log(`${ok ? '  ✓' : '  ✗'} ${title}${ok ? '' : `\n      ${error}`}${log.length ? `\n      ⚠ ${log.slice(0, 3).join('\n      ⚠ ')}` : ''}`)
    },
    done() {
      writeFileSync(join(RESULTS, `${name}.json`), JSON.stringify(results, null, 2))
      const bad = results.filter((r) => !r.ok).length
      console.log(`${name}: ${results.length - bad}/${results.length} passed`)
      return bad
    },
  }
}

export const expect = (cond, msg) => { if (!cond) throw new Error(msg) }
// no `+tag`: the server treats `qa+1@…` and `qa+2@…` as the same mailbox (account-farming protection), so every test account needs its own local part
export const uniqueEmail = (p = 'qa') => `${p}${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`
export const PASSWORD = 'Passw0rd!qa-test'

/**
 * The create screen, after the prompt was submitted. `choicesReady` waits until the analysis is done and the person can choose; `startBuild` then gets the build going whatever this
 * plan's flow looks like: "Let AI decide" when directions are offered, then the summary's Start button (the prompt named its length) or a length (choosing one starts the build);
 * on a plan with model choice (Premium) the length is only selected and a model (default Gemini 3.6 Flash) starts it.
 */
export async function choicesReady(p) {
  const dir = p.getByRole('button', { name: /Let AI decide/ }), len = p.getByRole('radio', { name: /\d+ slides/ }).first(), start = p.getByRole('button', { name: 'Start', exact: true })
  await Promise.race([dir.waitFor({ timeout: 90000 }), len.waitFor({ timeout: 90000 }), start.waitFor({ timeout: 90000 })])
}
export async function startBuild(p, { model = /3\.6 Flash/ } = {}) {
  const dir = p.getByRole('button', { name: /Let AI decide/ }), len = p.getByRole('radio', { name: /\d+ slides/ }).first(), start = p.getByRole('button', { name: 'Start', exact: true }), models = p.getByRole('radiogroup', { name: 'AI model' })
  await choicesReady(p)
  if (await dir.count()) { await dir.click(); await Promise.race([len.waitFor({ timeout: 90000 }), start.waitFor({ timeout: 90000 })]) }
  if (await models.count()) {
    if (await len.count()) await len.click()
    const radios = models.getByRole('radio'), names = await radios.allInnerTexts()
    await radios.nth(Math.max(0, names.findIndex((n) => model.test(n)))).click()
  } else if (await start.count()) await start.click()
  else await len.click()
}

/**
 * Sign up through the real form and end in the editor, signed in, whatever the API's REQUIRE_EMAIL_VERIFICATION is. With it on (the default now), sign-up shows
 * "Check your email" and creates no session: the address is confirmed with the QA script (what the person's click on the emailed link does), then they log in.
 * `next` = where the login returns to (the editor by default).
 */
export async function signUpAndEnter(p, { name = 'QA Tester', email, password = PASSWORD, next } = {}) {
  const { execSync } = await import('node:child_process')
  await p.goto(WEB + '/signup', { waitUntil: 'networkidle' })
  await p.locator('input[name=name]').fill(name); await p.locator('input[name=email]').fill(email); await p.locator('input[name=password]').fill(password)
  await p.getByRole('button', { name: 'Sign up free' }).click()
  const landed = await Promise.race([
    p.waitForURL(/localhost:3001/, { timeout: 20000 }).then(() => 'editor'),
    p.getByRole('heading', { name: 'Check your email' }).waitFor({ timeout: 20000 }).then(() => 'confirm'),
  ])
  if (landed === 'editor') return 'signed-in'
  execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/qa-verify-email.ts ${email}`, { cwd: new URL('..', import.meta.url).pathname, stdio: 'pipe' })
  await p.goto(WEB + '/login' + (next ? `?next=${encodeURIComponent(next)}` : ''), { waitUntil: 'networkidle' })
  await p.locator('input[name=email]').fill(email); await p.locator('input[name=password]').fill(password)
  await p.getByRole('button', { name: 'Log in' }).click()
  await p.waitForURL(/localhost:3001/, { timeout: 20000 })
  return 'confirmed'
}
