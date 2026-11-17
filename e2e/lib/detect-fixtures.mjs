/**
 * Generated slides for the picture finder (apps/web/lib/pdf-editor/picture-detect.ts), no browser needed: @napi-rs/canvas (a pdfjs-dist optional dependency,
 * already installed) draws them, then each one is saved as a JPEG and decoded again, so the pixels carry real compression noise like a deck saved as JPEGs.
 * Every fixture returns { img: {data,w,h}, truth: [{x,y,w,h}], text: [{x,y,w,h}] } in pixels of the full slide.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const web = createRequire(join(here, '../../apps/web/package.json'))
const { createCanvas, loadImage, GlobalFonts } = createRequire(web.resolve('pdfjs-dist/package.json'))('@napi-rs/canvas')
export { createCanvas, loadImage, GlobalFonts }

/** small seeded random generator */
export function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 } }

/** smooth value noise 0..1 on a w x h grid (a few octaves) */
function valueNoise(w, h, seed, base = 48, octaves = 4, decay = 0.5) {
  const rnd = rng(seed), out = new Float32Array(w * h)
  let amp = 1, total = 0
  for (let o = 0; o < octaves; o++) {
    const cell = Math.max(2, base / 2 ** o), gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2
    const grid = Float32Array.from({ length: gw * gh }, () => rnd())
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
      const a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1], c = grid[(y0 + 1) * gw + x0], d = grid[(y0 + 1) * gw + x0 + 1]
      out[y * w + x] += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy)
    }
    total += amp; amp *= decay
  }
  for (let i = 0; i < out.length; i++) out[i] /= total
  return out
}

/** a "photo": `stops` colour ramp driven by value noise (contrast `k` 0..1: 0 = flat), plus sensor noise `grain` (levels), drawn into rect with rounded corners `r` */
export function drawPhoto(g, rect, { lo = [30, 60, 90], hi = [200, 180, 150], k = 1, grain = 3, seed = 1, r = 24, base = 48, octaves = 6, decay = 0.72, colorful = 0.4 } = {}) {
  const { x, y, w, h } = rect
  const n = valueNoise(w, h, seed, base, octaves, decay), rnd = rng(seed * 7 + 3)
  const nc = colorful > 0 ? [1, 2, 3].map((j) => valueNoise(w, h, seed * 31 + j, base, octaves, decay)) : null
  const c = createCanvas(w, h), cg = c.getContext('2d'), im = cg.createImageData(w, h)
  for (let i = 0; i < w * h; i++) {
    const gr = (rnd() + rnd() + rnd() - 1.5) * grain
    for (let ch = 0; ch < 3; ch++) { const m = nc ? n[i] * (1 - colorful) + nc[ch][i] * colorful : n[i]; const t = 0.5 + (m - 0.5) * k; im.data[i * 4 + ch] = Math.max(0, Math.min(255, lo[ch] + (hi[ch] - lo[ch]) * t + gr)) }
    im.data[i * 4 + 3] = 255
  }
  cg.putImageData(im, 0, 0)
  g.save(); g.beginPath(); g.roundRect(x, y, w, h, r); g.clip(); g.drawImage(c, x, y); g.restore()
}

export async function jpegRoundTrip(canvas, quality = 85) {
  const buf = await canvas.encode('jpeg', quality)
  const im = await loadImage(buf)
  const c = createCanvas(im.width, im.height), g = c.getContext('2d'); g.drawImage(im, 0, 0)
  const d = g.getImageData(0, 0, im.width, im.height)
  return { data: new Uint8ClampedArray(d.data), w: d.width, h: d.height }
}

/** a deck-like slide: background (flat or gradient), a title and bullets in the left half (their boxes are returned as `text`), photos on the right as given */
export async function slide({ bg = ['#f4f1ea'], ink = '#1b1b1b', W = 1920, H = 1080, photos = [], extra, title = 'Quarterly Growth Review', textRight = false, quality = 85 } = {}) {
  const c = createCanvas(W, H), g = c.getContext('2d')
  if (bg.length === 1) { g.fillStyle = bg[0]; g.fillRect(0, 0, W, H) } else { const gr = g.createLinearGradient(0, 0, W, H); bg.forEach((col, i) => gr.addColorStop(i / (bg.length - 1), col)); g.fillStyle = gr; g.fillRect(0, 0, W, H) }
  const text = []
  g.fillStyle = ink; g.textBaseline = 'alphabetic'
  g.font = 'bold 84px Helvetica'; const tw = g.measureText(title).width
  const tx = textRight ? W - 140 - tw : 120
  g.fillText(title, tx, 200); text.push({ x: tx - 4, y: 120, w: tw + 8, h: 100 })
  g.font = '44px Helvetica'
  ;['Revenue grew twelve percent', 'Customer retention improved', 'New markets opened in Asia'].forEach((s, i) => { const w = g.measureText(s).width; g.fillText(s, tx + 20, 340 + i * 80); text.push({ x: tx + 16, y: 340 + i * 80 - 44, w: w + 8, h: 58 }) })
  const truth = []
  for (const p of photos) { drawPhoto(g, p.rect, p.opt); if (!p.notTruth) truth.push(p.rect) }
  if (extra) extra(g, { W, H })
  return { img: await jpegRoundTrip(c, quality), truth, text, canvas: c }
}

export const iou = (a, b) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? (w * h) / (a.w * a.h + b.w * b.h - w * h) : 0 }

/** the picture as the editor sees it: the page drawn about `w` px wide (pictures.ts reads 1600 px copies of a 1920 pt slide). Returns { img, k } with k = w / img.w. */
export function resizeTo(img, w) {
  if (img.w <= w) return { img, k: 1 }
  const c = createCanvas(img.w, img.h), g = c.getContext('2d'), id = g.createImageData(img.w, img.h); id.data.set(img.data); g.putImageData(id, 0, 0)
  const k = w / img.w, o = createCanvas(w, Math.round(img.h * k)), og = o.getContext('2d'); og.imageSmoothingQuality = 'high'; og.drawImage(c, 0, 0, o.width, o.height)
  const d = og.getImageData(0, 0, o.width, o.height)
  return { img: { data: new Uint8ClampedArray(d.data), w: d.width, h: d.height }, k }
}
