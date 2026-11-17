/** Picture finder on generated JPEG slides, printed as JSON for suite 67: hard photos (flat blue, black, dark gradient, white product shot), photo PAIRS at gaps 2..20 px, and false positives on busy synthetic slides. */
import { slide, iou } from './detect-fixtures.mjs'
import { detectOn } from './detect-run.mts'

const R = { x: 1100, y: 160, w: 640, h: 460 }
const kinds: Record<string, { lo: number[]; hi: number[]; k: number; dark: boolean }> = {
  flatBlue: { lo: [40, 110, 200], hi: [60, 130, 215], k: 0.25, dark: false },
  black: { lo: [4, 4, 5], hi: [14, 14, 16], k: 1, dark: true },
  darkGradient: { lo: [16, 24, 32], hi: [40, 56, 76], k: 0.6, dark: true },
  whiteProduct: { lo: [236, 236, 238], hi: [250, 250, 252], k: 1, dark: true },
}
const hard = { sure: 0, maybe: 0, miss: 0, wrong: 0 }
for (const [, o] of Object.entries(kinds)) for (const q of [60, 75, 92]) for (const grain of [1, 2.5, 5]) {
  const s = await slide({ quality: q, bg: o.dark ? ['#0c1016'] : ['#f4f1ea'], ink: o.dark ? '#eee' : '#1b1b1b', photos: [{ rect: R, opt: { lo: o.lo, hi: o.hi, k: o.k, grain, seed: 9 } }] })
  const f = detectOn(s.img, s.text)
  if (f.length === 1 && iou(f[0]!, R) > 0.9) hard[f[0]!.maybe ? 'maybe' : 'sure']++
  else hard[f.length === 0 ? 'miss' : 'wrong']++
}
let ok = 0, total = 0
const bad: string[] = []
for (const mode of ['side', 'stack']) for (const bg of [['#f4f1ea'], ['#1a0d10', '#3b1219']]) for (const gap of [2, 3, 4, 6, 8, 10, 12, 14, 16, 20]) for (const q of [90, 75]) {
  const A = mode === 'side' ? { x: 1000, y: 160, w: 360, h: 420 } : { x: 1100, y: 100, w: 640, h: 260 }
  const B = mode === 'side' ? { x: A.x + A.w + gap, y: 160, w: 360, h: 420 } : { x: 1100, y: A.y + A.h + gap, w: 640, h: 260 }
  const s = await slide({ bg, ink: bg.length > 1 ? '#fff' : '#1b1b1b', quality: q, photos: [{ rect: A, opt: { seed: 11, r: 20 } }, { rect: B, opt: { seed: 12, lo: [120, 40, 40], hi: [230, 160, 120], r: 20 } }] })
  const found = detectOn(s.img, s.text)
  total++
  if (found.length === 2 && s.truth.every((t) => found.some((f) => iou(f, t) > 0.9))) ok++; else bad.push(`${mode} ${bg.length > 1 ? 'dark' : 'light'} gap${gap} q${q}: ${found.length}`)
}
let fp = 0, n = 0
for (let seed = 1; seed <= 8; seed++) for (const bg of [['#f4f1ea'], ['#0c1016'], ['#1a0d10', '#3b1219'], ['#ffffff']]) {
  const dark = bg[0] !== '#f4f1ea' && bg[0] !== '#ffffff'
  const s = await slide({ bg, ink: dark ? '#fff' : '#111', quality: 70 + (seed % 3) * 10, extra: (g: any) => {
    const cols = ['#f6d365', '#2b6cb0', '#d69e2e', '#7b341e', '#38a169', '#e53e3e', '#101820', '#fafafa'], c1 = cols[seed % 8]!, c2 = cols[(seed + 3) % 8]!
    g.fillStyle = c1; g.beginPath(); g.roundRect(1100, 160, 300, 200, 20); g.fill(); g.fillStyle = c2; g.beginPath(); g.roundRect(1440, 160, 300, 200, 20); g.fill()
    const gr = g.createLinearGradient(1100, 0, 1740, 0); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.beginPath(); g.roundRect(1100, 420, 640, 90, 16); g.fill()
    g.beginPath(); g.arc(1200, 700, 80, 0, 7); g.fillStyle = c2; g.fill()
    g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 30; g.shadowOffsetY = 10; g.fillStyle = '#fff'; g.beginPath(); g.roundRect(1400, 580, 340, 240, 20); g.fill()
  } })
  n++; if (detectOn(s.img, s.text).length) fp++
}
console.log(JSON.stringify({ hard, pairs: { ok, total, bad }, falsePositives: { fp, n } }))
