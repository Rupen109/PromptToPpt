import { chromium } from 'playwright-core'
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
export const launch = () => chromium.launch({ executablePath: CHROMIUM })

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
