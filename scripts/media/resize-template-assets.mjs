// The website draws template photos small (gallery thumbnails) or medium (a template's own page), but the originals are 1920 px and 300-600 KB each,
// so a visitor far from the server downloaded megabytes for pictures shown a few hundred pixels wide. This writes resized copies with the SAME names
// next to the originals: template-assets/w768/ (thumbnails) and template-assets/w1280/ (the big preview). The editor and new decks keep the originals.
// Run after adding or changing a picture in apps/web/public/template-assets:  node scripts/media/resize-template-assets.mjs
import { createRequire } from 'node:module'
import { mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
const require = createRequire(new URL('../../services/api/package.json', import.meta.url))
const sharp = require('sharp')
const DIR = new URL('../../apps/web/public/template-assets/', import.meta.url).pathname
const SIZES = [[768, 72], [1280, 78]] // width, JPEG quality
const files = readdirSync(DIR).filter((f) => /\.jpe?g$/i.test(f))
let before = 0, after = {}
for (const [w, q] of SIZES) { mkdirSync(join(DIR, `w${w}`), { recursive: true }); after[w] = 0 }
for (const f of files) {
  before += statSync(join(DIR, f)).size
  for (const [w, q] of SIZES) {
    const out = join(DIR, `w${w}`, f)
    await sharp(join(DIR, f)).resize({ width: w, withoutEnlargement: true }).jpeg({ quality: q, mozjpeg: true, progressive: true }).toFile(out)
    after[w] += statSync(out).size
  }
}
console.log(`${files.length} pictures: originals ${(before / 1e6).toFixed(1)} MB; ${SIZES.map(([w]) => `w${w} ${(after[w] / 1e6).toFixed(1)} MB (avg ${(after[w] / files.length / 1024).toFixed(0)} KB)`).join('; ')}`)
