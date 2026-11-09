#!/usr/bin/env node
/**
 * Look at a Morph template the way a person would: play its demo in present mode and save a picture of every scene, plus contact sheets, so the typography, the pictures and the
 * choreography can be judged by eye (never trust a test for this).
 *
 *   node scripts/morph-preview.mjs <templateId> [--wait 2300] [--transition N] [--out dir]
 *
 *   --scene N        capture only the resting scene N (written as <id>-NN.png, no sheet)
 *   --transition N   instead of the resting scenes, capture 7 frames of the Morph INTO scene N (1.5 s long): the motion itself
 *
 * Needs the web app (:3100, serves apps/web/public/morph-templates), the editor (:3001) and the API (:4000, REQUIRE_EMAIL_VERIFICATION=false) running; it signs a throwaway Gold person up.
 * Output: <out>/<id>-NN.png, <out>/<id>-sheet-N.png (6 scenes each) and, with --transition, <out>/<id>-t<N>-f<k>.png and <out>/<id>-t<N>-sheet.png.
 */
import { readFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { readdirSync, existsSync, writeFileSync } from 'node:fs'
process.env.E2E_WEB ??= 'http://localhost:3100'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { API, EDITOR, WEB, launch } = await import(pathToFileURL(join(root, 'e2e', 'lib.mjs')).href)
const { api, newDeck, person, JSON_HEADERS } = await import(pathToFileURL(join(root, 'e2e', 'kits-lib.mjs')).href)
const sd = readdirSync(join(root, 'node_modules', '.pnpm')).find((d) => d.startsWith('sharp@'))
const sharp = (await import(pathToFileURL(join(root, 'node_modules', '.pnpm', sd, 'node_modules', 'sharp', 'dist', 'index.mjs')).href)).default

const args = process.argv.slice(2)
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const id = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--wait' && args[args.indexOf(a) - 1] !== '--transition' && args[args.indexOf(a) - 1] !== '--scene' && args[args.indexOf(a) - 1] !== '--out')
if (!id) { console.error('usage: morph-preview.mjs <templateId> [--wait ms] [--transition N] [--out dir]'); process.exit(1) }
const wait = Number(flag('--wait', 2300)), tn = flag('--transition'), only = flag('--scene'), out = flag('--out', join(tmpdir(), 'morph-preview', id))
mkdirSync(out, { recursive: true })

const json = join(out, `${id}.json`)
execFileSync('pnpm', ['--filter', '@prompttoppt/api', 'exec', 'tsx', join(root, 'scripts', 'morph-demo-dump.mts'), json, id], { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] })
const d = JSON.parse(readFileSync(json, 'utf8'))

const b = await launch()
/** One throwaway Gold person for every run: signed up once (sign-up is rate limited per hour), then signed in again each time. */
async function previewPerson() {
  const file = join(tmpdir(), 'morph-preview-user.json')
  if (existsSync(file)) {
    const { email } = JSON.parse(readFileSync(file, 'utf8'))
    const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } })
    const r = await ctx.request.post(`${API}/api/auth/sign-in/email`, { headers: JSON_HEADERS, data: { email, password: 'Passw0rd!qa-test' } })
    if (r.ok()) return { email, ctx, p: await ctx.newPage(), id: null, deck: JSON.parse(readFileSync(file, 'utf8')).deck }
    await ctx.close()
  }
  for (let t = 0; ; t++) {
    try { const A = await person(b, 'mp', 'gold'); writeFileSync(file, JSON.stringify({ email: A.email })); return A } catch (e) { if (t >= 3) throw e; await new Promise((r) => setTimeout(r, 4000 * (t + 1))) }
  }
}
const A = await previewPerson()
const p = A.p
const errors = []; p.on('pageerror', (e) => errors.push(e.message))
// one deck for every run (a Gold person may only make 50 a month): the next run overwrites its slides
let deck = A.deck
let got = deck ? await api.get(A, '/presentations/' + deck).catch(() => null) : null
if (!got || got.status >= 400) { deck = await newDeck(A, 'Template'); got = await api.get(A, '/presentations/' + deck); writeFileSync(join(tmpdir(), 'morph-preview-user.json'), JSON.stringify({ email: A.email, deck })) }
const doc = got.data.document; doc.theme = d.theme; doc.slides = d.slides
const r = await A.ctx.request.fetch(API + '/api/v1/presentations/' + deck, { method: 'PUT', headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { baseRevision: got.data.revision, document: doc } })
if (r.status() !== 200) throw new Error('could not save the demo deck: ' + r.status() + ' ' + (await r.text()).slice(0, 300))
await p.setViewportSize({ width: 1280, height: 720 })
await p.goto(EDITOR + '/present/' + deck, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)

const sheet = async (files, name, cols = 2, w = 640, h = 360) => {
  for (let g = 0; g * 6 < files.length; g++) {
    const part = files.slice(g * 6, g * 6 + 6)
    const comps = await Promise.all(part.map(async (f, i) => ({ input: await sharp(f).resize(w, h).toBuffer(), left: (i % cols) * (w + 4), top: Math.floor(i / cols) * (h + 4) })))
    await sharp({ create: { width: cols * (w + 4), height: Math.ceil(part.length / cols) * (h + 4), channels: 3, background: '#888' } }).composite(comps).png().toFile(join(out, `${name}-${g}.png`))
  }
}
const files = []
if (tn) {
  const n = Number(tn)
  for (let i = 1; i < n - 1; i++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(wait) } // rest on the scene before it
  const frames = []
  await p.keyboard.press('ArrowRight')
  await p.locator('[data-testid=morph]').waitFor({ timeout: 4000 }).catch(() => {})
  for (let k = 0; k < 7; k++) {
    await p.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms }), k * 250)
    await p.waitForTimeout(150)
    const f = join(out, `${id}-t${n}-f${k}.png`); await p.screenshot({ path: f }); frames.push(f)
  }
  await sheet(frames, `${id}-t${n}-sheet`, 2, 640, 360)
} else {
  for (let i = 0; i < d.slides.length; i++) {
    if (i) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(only ? 200 : wait) }
    if (only && i + 1 < Number(only)) continue
    const f = join(out, `${id}-${String(i + 1).padStart(2, '0')}.png`); await p.screenshot({ path: f }); files.push(f)
    if (only) break
  }
  if (!only) await sheet(files, `${id}-sheet`)
}
await b.close()
console.log(`${d.slides.length} scenes -> ${out}${errors.length ? '\npage errors: ' + errors.slice(0, 3).join(' | ') : ''}`)
