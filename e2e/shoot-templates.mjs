// Screenshots a template category's gallery for visual review:  node e2e/shoot-templates.mjs Education [out-name]
import { join } from 'node:path'
import { EDITOR, RESULTS, launch } from './lib.mjs'
import { STATE } from './suites/02-auth.mjs'

const tab = process.argv[2] ?? 'Education'
const out = process.argv[3] ?? tab.toLowerCase().replace(/[^a-z]+/g, '-')
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 1500, height: 2300 }, storageState: STATE })
const p = await ctx.newPage()
await p.goto(EDITOR + '/templates', { waitUntil: 'networkidle' })
await p.getByRole('tab', { name: tab }).click()
await p.waitForTimeout(1500)
await p.locator('main').screenshot({ path: join(RESULTS, 'templates', `${out}.png`) })
console.log('saved', out)
await b.close()
