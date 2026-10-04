// Captures every slide of a public presentations.ai share link for design reference, plus a contact sheet:
//   node e2e/ref-shoot.mjs <url> <name>
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RESULTS, launch } from './lib.mjs'
const [url, name] = process.argv.slice(2)
const dir = join(RESULTS, 'ref', name); mkdirSync(dir, { recursive: true })
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 810 } })
const p = await ctx.newPage()
await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
await p.waitForTimeout(6000)
const counter = async () => (await p.locator('text=/^\\d+\\/\\d+$/').first().innerText().catch(() => '1/1')).trim()
const total = Number((await counter()).split('/')[1] ?? 1)
const texts = []
for (let i = 1; i <= total; i++) {
  await p.waitForTimeout(1500)
  await p.screenshot({ path: join(dir, `${String(i).padStart(2, '0')}.png`), clip: { x: 0, y: 0, width: 1440, height: 760 } })
  texts.push(`#${i}: ` + (await p.locator('body').innerText()).slice(0, 0))
  await p.keyboard.press('ArrowRight')
}
const sheet = `<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:6px">${Array.from({ length: total }, (_, i) => `<div style="position:relative"><img style="width:100%" src="${String(i + 1).padStart(2, '0')}.png"><span style="position:absolute;left:6px;top:4px;color:#fff;background:#0008;padding:1px 6px;font:12px sans-serif">${i + 1}</span></div>`).join('')}</body>`
writeFileSync(join(dir, 'sheet.html'), sheet)
const sp = await (await b.newContext({ viewport: { width: 1800, height: 1000 } })).newPage()
await sp.goto('file://' + join(dir, 'sheet.html')); await sp.waitForTimeout(800)
await sp.screenshot({ path: join(dir, 'sheet.png'), fullPage: true })
console.log(name, 'slides:', total)
await b.close()
