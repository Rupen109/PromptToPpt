// Loads key pages and reports Content-Security-Policy violations and the response headers:  node e2e/csp-check.mjs
import { EDITOR, WEB, launch } from './lib.mjs'
import { STATE } from './suites/02-auth.mjs'
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, storageState: STATE })
const p = await ctx.newPage()
const bad = []
p.on('console', (m) => /Content Security Policy|violates the following|Refused to/i.test(m.text()) && bad.push(m.text().slice(0, 220)))
for (const url of [WEB + '/', WEB + '/login', WEB + '/pricing', EDITOR + '/', EDITOR + '/templates', EDITOR + '/billing']) {
  const res = await p.goto(url, { waitUntil: 'networkidle' }).catch((e) => { console.log('goto fail', url, e.message.slice(0, 60)); return null })
  const h = res?.headers() ?? {}
  console.log(url.padEnd(40), res?.status(), 'csp:', !!h['content-security-policy'], 'xfo:', h['x-frame-options'], 'nosniff:', h['x-content-type-options'])
  await p.waitForTimeout(800)
}
console.log(bad.length ? 'VIOLATIONS:\n' + [...new Set(bad)].join('\n') : 'no CSP violations')
await b.close()
