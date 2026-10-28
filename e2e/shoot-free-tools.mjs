import { launch } from './lib.mjs'
const WEB = process.env.E2E_WEB ?? 'http://localhost:3000'
const out = process.argv[2]
const b = await launch()
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
await p.goto(WEB + '/free-tools/presentation-outline-generator', { waitUntil: 'networkidle' })
await p.getByPlaceholder(/Salesforce Agentforce/).fill('Salesforce Agentforce for a retail leadership team')
await p.getByRole('button', { name: /Generate outline/ }).click()
await p.getByRole('button', { name: /Turn this outline into a full presentation/ }).waitFor({ timeout: 60000 })
await p.screenshot({ path: `${out}/outline-result.png`, fullPage: true })
await p.setViewportSize({ width: 390, height: 800 })
await p.goto(WEB + '/free-tools/pdf-to-presentation', { waitUntil: 'networkidle' })
await p.screenshot({ path: `${out}/pdf-mobile.png` })
await p.goto(WEB + '/free-tools', { waitUntil: 'networkidle' })
await p.setViewportSize({ width: 1280, height: 700 })
await p.screenshot({ path: `${out}/hub.png` })
await b.close()
