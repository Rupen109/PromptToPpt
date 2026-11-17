// Build-time check run by services/api/Dockerfile inside the final image (cwd /app, copied next to node_modules, removed afterwards).
// The build fails here instead of the first deploy failing at run time: Node is new enough, the native module (sharp) loads on this libc,
// and EVERY third-party package that the bundle in dist/ imports can really be resolved (the image prunes unused optional peers, see the Dockerfile).
import { readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 19)) throw new Error(`Node >= 22.19 is required (undici 8 needs zlib.createZstdDecompress), got ${process.version}`)
if (typeof (await import('node:zlib')).createZstdDecompress !== 'function') throw new Error('zlib.createZstdDecompress is missing')

const { default: sharp } = await import('sharp')
const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer()
if (!(await sharp(png).resize(4).webp().toBuffer()).length) throw new Error('sharp produced nothing')

const builtin = new Set(builtinModules)
const specs = new Set()
for (const f of readdirSync('dist').filter((n) => n.endsWith('.js'))) {
  for (const m of readFileSync(`dist/${f}`, 'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)["']([^"'./][^"']*)["']/gm)) {
    const s = m[1]
    if (s.startsWith('node:') || builtin.has(s.split('/')[0])) continue
    if (/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+(\/[\w./-]+)?$/i.test(s)) specs.add(s) // a package name, not a sentence that happens to follow the word "from"
  }
}
const failed = []
for (const s of [...specs].sort()) {
  try { await import(s) } catch (e) { failed.push(`${s}: ${e.message.split('\n')[0]}`) }
}
if (failed.length) { console.error('packages the bundle imports but the image cannot load:\n  ' + failed.join('\n  ')); process.exit(1) }
console.log(`docker-check ok: node ${process.version}, sharp ${sharp.versions.vips}, ${specs.size} third-party imports resolve`)
