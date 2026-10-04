// Slices of a page at a phone/tablet width for visual review:  node e2e/shoot-responsive.mjs <url> <width> <name> [sliceHeight]
// Also prints horizontal-overflow offenders and tiny tap targets.
import { join } from 'node:path'
import { RESULTS, launch } from './lib.mjs'
import { STATE } from './suites/02-auth.mjs'
const [url, w = '375', name = 'page', sh = '1500'] = process.argv.slice(2)
const b = await launch()
const ctx = await b.newContext({ viewport: { width: +w, height: +sh }, deviceScaleFactor: 1, storageState: STATE, hasTouch: +w < 800, isMobile: +w < 800 })
const p = await ctx.newPage()
await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
// trigger scroll reveals
const total = await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) } window.scrollTo(0, 0); return document.documentElement.scrollHeight })
await p.waitForTimeout(600)
const over = await p.evaluate((vw) => [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1) && getComputedStyle(e).position !== 'fixed' && !e.closest('[aria-hidden="true"]') }).slice(0, 8).map((e) => `${e.tagName}.${String(e.className).slice(0, 50)} ${Math.round(e.getBoundingClientRect().left)}→${Math.round(e.getBoundingClientRect().right)}`), +w)
const small = await p.evaluate(() => [...document.querySelectorAll('a,button,[role=button],input,select')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 32 || r.width < 32) && getComputedStyle(e).visibility !== 'hidden' }).slice(0, 8).map((e) => `${e.tagName} "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20)}" ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`))
console.log(`${name} @${w}: page height ${total}px; overflow: ${over.length ? '\n  ' + over.join('\n  ') : 'none'}; small targets: ${small.length ? '\n  ' + small.join('\n  ') : 'none'}`)
let i = 0
const vh = 800
for (let y = 0; y < total; y += +sh) {
  await p.evaluate((yy) => window.scrollTo(0, yy), y)
  await p.waitForTimeout(650)
  await p.screenshot({ path: join(RESULTS, 'resp', `${name}-${w}-${String(++i).padStart(2, '0')}.png`) })
}
void vh
console.log('slices:', i)
await b.close()
