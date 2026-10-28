import { launch } from './lib.mjs'
const WEB = process.env.E2E_WEB ?? 'http://localhost:3000'
const out = process.argv[2]
const b = await launch()
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
await p.goto(WEB + '/free-templates/pitch-deck-templates', { waitUntil: 'networkidle' })
await p.waitForTimeout(2500)
await p.screenshot({ path: `${out}/landing-top.png` })
await p.locator('#templates').scrollIntoViewIfNeeded(); await p.waitForTimeout(2500)
await p.screenshot({ path: `${out}/landing-grid.png` })
await p.goto(WEB + '/free-tools/pdf-to-ppt', { waitUntil: 'networkidle' })
await p.screenshot({ path: `${out}/pdf2ppt.png` })
await b.close()
