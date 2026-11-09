#!/usr/bin/env node
/**
 * The Space morph template's own artwork (everything the owner's planet cut-outs in apps/web/public/morph-templates do not cover):
 *   space-stars.svg    a star field (procedural, the same every run)
 *   (the Sun, Uranus, Neptune and the Moon are photographs made by scripts/gen-morph-photos.mjs, as space-*.webp)
 *   space-void.png     a transparent pixel: the picture an invisible, parked staging copy shows
 *   space-lineup.png   the eight planets on a diagonal, composed from the cut-outs (transparent background)
 *
 *   node scripts/gen-space-assets.mjs
 */
import { createServer } from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { launch } from '../e2e/lib.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public', 'morph-templates')

// ── a deterministic random source, so the artwork never changes between runs ──
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

// ── stars ──
function stars() {
  const r = rng(7), W = 1920, H = 1080
  const dots = []
  for (let i = 0; i < 1100; i++) {
    const big = r() > 0.97
    const rad = big ? 1.1 + r() * 1.2 : 0.35 + r() * 0.75
    const tint = r() > 0.8 ? '#aab8ff' : r() > 0.9 ? '#ffd9b0' : '#ffffff'
    dots.push(`<circle cx="${(r() * W).toFixed(1)}" cy="${(r() * H).toFixed(1)}" r="${rad.toFixed(2)}" fill="${tint}" opacity="${(0.25 + r() * 0.75).toFixed(2)}"/>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#02030a"/>${dots.join('')}</svg>\n`
}

writeFileSync(join(OUT, 'space-stars.svg'), stars())
// a 1 x 1 transparent PNG
writeFileSync(join(OUT, 'space-void.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'))

// ── the lineup: eight planets on a diagonal, transparent background (1982 x 880, like the template's strip) ──
const W = 1982, H = 880, k = W / 1400
const planets = [ // centre x, centre y, disc diameter (in a 1400-wide drawing), picture
  [28, 583, 52, 'space5.png'], [160, 535, 105, 'space3.png'], [308, 478, 100, 'space6.png'], [466, 412, 100, 'space1.png'], [675, 342, 235, 'space7.png'],
  [885, 228, 125, 'space4.png'], [1160, 125, 120, 'space-uranus.webp'], [1335, 62, 112, 'space-neptune.webp'],
]
// the pictures are served from a local address (a page may not read the pixels of a file opened from disk)
const types = { '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' }
const server = createServer((req, res) => {
  try { const f = decodeURIComponent((req.url ?? '/').slice(1)) || 'index.html'; if (f === 'index.html') { res.setHeader('content-type', 'text/html'); return res.end('<html></html>') } res.setHeader('content-type', types[f.slice(f.lastIndexOf('.'))] ?? 'application/octet-stream'); res.end(readFileSync(join(OUT, f))) } catch { res.statusCode = 404; res.end() }
}).listen(0)
const origin = `http://127.0.0.1:${server.address().port}/`
const b = await launch()
const page = await (await b.newContext({ viewport: { width: W, height: H } })).newPage()
await page.goto(origin)
const png = await page.evaluate(async ({ planets, W, H, k, base }) => {
  const load = (f) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = base + f })
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')
  for (const [cx, cy, d, f] of planets) {
    const img = await load(f)
    // the disc inside the picture (its opaque area), so every planet is drawn at the size asked for
    const t = document.createElement('canvas'); t.width = img.naturalWidth; t.height = img.naturalHeight
    const tg = t.getContext('2d'); tg.drawImage(img, 0, 0)
    const data = tg.getImageData(0, 0, t.width, t.height).data
    let x0 = t.width, y0 = t.height, x1 = 0, y1 = 0
    for (let y = 0; y < t.height; y += 4) for (let x = 0; x < t.width; x += 4) if (data[(y * t.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    const isSaturn = f === 'space4.png'
    // Saturn is sized by its globe, not by its rings: the globe is about 31% of the picture's width
    const disc = isSaturn ? t.width * 0.31 : Math.max(x1 - x0, y1 - y0)
    const s = (d * k) / disc
    const mx = isSaturn ? t.width * 0.5 : (x0 + x1) / 2, my = isSaturn ? t.height * 0.5 : (y0 + y1) / 2
    g.drawImage(img, cx * k - mx * s, cy * k - my * s, t.width * s, t.height * s)
  }
  return c.toDataURL('image/png')
}, { planets, W, H, k, base: origin })
writeFileSync(join(OUT, 'space-lineup.png'), Buffer.from(png.split(',')[1], 'base64'))
await b.close()
server.close()
console.log('wrote space-stars.svg, space-void.png, space-lineup.png')
