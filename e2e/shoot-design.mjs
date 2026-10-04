// Contact sheet of every slide in one template's preview:  node e2e/shoot-design.mjs <designId> [aspect e.g. 16:9]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EDITOR, RESULTS, launch } from './lib.mjs'
import { STATE } from './suites/02-auth.mjs'
const [id, aspect = '16:9'] = process.argv.slice(2)
const dir = join(RESULTS, 'templates', id); mkdirSync(dir, { recursive: true })
const b = await launch()
const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 }, storageState: STATE })).newPage()
await p.goto(`${EDITOR}/templates?open=${id}`, { waitUntil: 'networkidle' })
const dlg = p.getByRole('dialog'); await dlg.waitFor({ timeout: 15000 })
if (aspect !== '16:9') await dlg.getByRole('button', { name: aspect, exact: true }).click()
await p.waitForTimeout(1500)
const total = Number((await dlg.locator('text=/^\\d+ \\/ \\d+$/').innerText()).split('/')[1])
const stage = dlg.locator('.max-w-\\[880px\\]')
for (let i = 1; i <= total; i++) {
  await p.waitForTimeout(600)
  await stage.screenshot({ path: join(dir, `${String(i).padStart(2, '0')}.png`) })
  await p.keyboard.press('ArrowRight')
}
writeFileSync(join(dir, 'sheet.html'), `<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:6px">${Array.from({ length: total }, (_, i) => `<img style="width:100%" src="${String(i + 1).padStart(2, '0')}.png">`).join('')}</body>`)
const sp = await (await b.newContext({ viewport: { width: 2000, height: 1000 } })).newPage()
await sp.goto('file://' + join(dir, 'sheet.html')); await sp.waitForTimeout(800)
await sp.screenshot({ path: join(dir, 'sheet.png'), fullPage: true })
console.log('saved', join(dir, 'sheet.png'))
await b.close()
