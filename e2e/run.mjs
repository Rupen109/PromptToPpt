import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), 'suites')
const want = process.argv.slice(2)
const files = readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort().filter((f) => !want.length || want.some((w) => f.includes(w)))
let failed = 0
for (const f of files) {
  console.log(`\n▶ ${f}`)
  failed += (await (await import(join(dir, f))).default()) ?? 0
}
console.log(failed ? `\n✗ ${failed} check(s) failed` : '\n✓ all checks passed')
process.exit(failed ? 1 : 0)
