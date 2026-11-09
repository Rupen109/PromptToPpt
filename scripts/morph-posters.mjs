#!/usr/bin/env node
/**
 * The still picture of each Morph template shown on the website's category tiles: one resting scene of its demo, as a small WebP in apps/web/public/morph-posters.
 *
 *   node scripts/morph-posters.mjs [id id ...] [--scene 2]      (no ids = every registered template)
 *
 * Needs the dev servers like scripts/morph-preview.mjs. Re-run it when a template's look changes.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sd = readdirSync(join(root, 'node_modules', '.pnpm')).find((d) => d.startsWith('sharp@'))
const sharp = (await import(pathToFileURL(join(root, 'node_modules', '.pnpm', sd, 'node_modules', 'sharp', 'dist', 'index.mjs')).href)).default
const args = process.argv.slice(2)
const si = args.indexOf('--scene')
const scene = si >= 0 ? args[si + 1] : '1'
let ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--scene')
if (!ids.length) {
  ids = execFileSync('pnpm', ['--filter', '@prompttoppt/api', 'exec', 'tsx', '-e', "import('../../packages/theme/src/morph-templates/index.ts').then((m) => console.log(m.MORPH_TEMPLATES.map((t) => t.id).join(' ')))"], { cwd: root, encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean)
}
const outDir = join(root, 'apps', 'web', 'public', 'morph-posters')
mkdirSync(outDir, { recursive: true })
for (const id of ids) {
  const tmp = join(tmpdir(), 'morph-poster', id)
  mkdirSync(tmp, { recursive: true })
  execFileSync('node', [join(root, 'scripts', 'morph-preview.mjs'), id, '--scene', scene, '--out', tmp], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, E2E_WEB: process.env.E2E_WEB ?? 'http://localhost:3100' } })
  const png = join(tmp, `${id}-${String(scene).padStart(2, '0')}.png`)
  await sharp(png).resize(960, 540, { fit: 'cover' }).webp({ quality: 82 }).toFile(join(outDir, `${id}.webp`))
  console.log('poster', id)
}
