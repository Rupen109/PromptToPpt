/**
 * The pure part of the text finder: Tesseract lines -> runs, merging two readings, plain pixel helpers. No DOM, no pdf.js, no Tesseract import,
 * so the same code runs in the browser (ocr.ts) and in a Node test harness.
 */
import type { Family } from './model'
import type { Run } from './render'
import { CSS_FAMILY } from './text'
import { downscale, findPhotos, fitBackground, SMALL_WIDTH, type Img, type Rect } from './picture-detect'
import { normAngle, turnedBounds } from './geometry'

// ---------- the pure part: Tesseract lines → runs ----------
export interface Bbox { x0: number; y0: number; x1: number; y1: number }
export interface OcrWord { text: string; confidence: number; bbox: Bbox }
export interface OcrLine { text: string; confidence: number; bbox: Bbox; baseline: Bbox; words: OcrWord[] }

const ASCENDER = /[A-Z0-9bdfhklt]/
/** share of the font size that a capital / ascender letter rises above the baseline (Helvetica 0.72, Times 0.68; a little more because the found box is slightly loose) */
const ASCENT = 0.76
const MIN_CONF = 55
const SHORT_LEN = 12, SHORT_CONF = 80
const BOLD_STROKE = 0.138
/** letters and digits of any script (Latin with accents, Devanagari, Arabic…) */
export const alnumCount = (s: string): number => (s.match(/[\p{L}\p{N}]/gu) ?? []).length
/** `region`: a reading of a cut-out shape (a label in a circle, a chevron, a big number): one digit is a real label there, the rest of the filters stay */
export interface ReadingOptions { region?: boolean }

/** measure a string in a standard-font stand-in (pixels per 100 px of font size); injected so the maths can be tested without a canvas */
export type Measure = (text: string, fam: Family, bold: boolean, size: number) => number

export function canvasMeasure(): Measure {
  const c = document.createElement('canvas').getContext('2d')!
  return (text, fam, bold, size) => { c.font = `${bold ? 'bold ' : ''}${size * 10}px ${CSS_FAMILY[fam]}`; return c.measureText(text).width / 10 }
}

/** which standard font looks closest, from the width the line really has at the size its height suggests. Sans is the default; serif / mono need to be clearly better. */
export function guessLook(text: string, widthPx: number, sizePx: number, measure: Measure): { fam: Family; bold: boolean } {
  const cands: { fam: Family; bold: boolean }[] = [{ fam: 'sans', bold: false }, { fam: 'sans', bold: true }, { fam: 'serif', bold: false }, { fam: 'serif', bold: true }, { fam: 'mono', bold: false }]
  const err = cands.map((c) => Math.abs(measure(text, c.fam, c.bold, sizePx) - widthPx) / Math.max(widthPx, 1))
  let best = 0
  for (let i = 1; i < cands.length; i++) {
    const margin = cands[i]!.fam === 'sans' ? 0.02 : 0.12 // a different family must win by 12 %: width alone is a weak sign
    if (err[i]! + margin < err[best]!) best = i
  }
  return cands[best]!
}

/** Tesseract lines (pixels of the copy that was read) → runs in page space (points). `k` = pixels per point of that copy. */
/** `weight(bbox, sizePx)` = stroke thickness as a share of the font size, for the bold guess; optional */
/**
 * Two columns side by side often come back as ONE line (their words share a baseline): "[insert range]" on the left and "[insert" in the next card.
 * A gap between two words far wider than a space (more than 0.8 × the words' height; a space is about a quarter of it) starts a new line, so each column keeps its own text.
 */
export function splitAtGaps(lines: OcrLine[]): OcrLine[] {
  return lines.flatMap((l) => {
    const words = [...l.words].filter((w) => w.text.trim()).sort((a, b) => a.bbox.x0 - b.bbox.x0)
    if (words.length < 2) return [l]
    const hs = words.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b)
    const gapMax = hs[hs.length >> 1]! * 0.8
    const parts: OcrWord[][] = [[words[0]!]]
    for (let i = 1; i < words.length; i++) {
      if (words[i]!.bbox.x0 - words[i - 1]!.bbox.x1 > gapMax) parts.push([])
      parts.at(-1)!.push(words[i]!)
    }
    if (parts.length === 1) return [l]
    return parts.map((ws) => {
      const bbox = { x0: Math.min(...ws.map((w) => w.bbox.x0)), y0: Math.min(...ws.map((w) => w.bbox.y0)), x1: Math.max(...ws.map((w) => w.bbox.x1)), y1: Math.max(...ws.map((w) => w.bbox.y1)) }
      return { ...l, text: ws.map((w) => w.text).join(' '), words: ws, bbox, baseline: { ...l.baseline, x0: bbox.x0, x1: bbox.x1 } }
    })
  })
}

export function linesToRuns(lines: OcrLine[], k: number, measure: Measure, weight?: (b: Bbox, sizePx: number) => number, opt: ReadingOptions = {}): Run[] {
  const out: Run[] = []
  for (const l of splitAtGaps(lines)) {
    let words = l.words.filter((w) => w.text.trim() && w.confidence >= 30)
    // a list bullet is read as a stray letter or symbol ("e", "¢", "«"): leave it out so the cover and the new text start at the words
    if (words.length > 1 && words[0]!.text.trim().length === 1 && /[^\p{L}\p{N}]|[eocs]/u.test(words[0]!.text.trim())) words = words.slice(1)
    const text = words.map((w) => w.text.trim()).join(' ')
    const alnum = alnumCount(text)
    if (!words.length || alnum < (opt.region && /^\d$/.test(text.trim()) ? 1 : 2)) continue
    const conf = words.reduce((s, w) => s + w.confidence * Math.max(1, w.text.length), 0) / words.reduce((s, w) => s + Math.max(1, w.text.length), 0)
    if (conf < MIN_CONF) continue
    // a SHORT line must be surer: photos (a glass, a phone screen, a plate) make little readings like "ros", "ue", "@Se" at 55-76 %, while real short words and numbers read at 86 % and more
    if (alnum <= SHORT_LEN && conf < SHORT_CONF) continue
    const x0 = Math.min(...words.map((w) => w.bbox.x0)), x1 = Math.max(...words.map((w) => w.bbox.x1))
    let y0 = Math.min(...words.map((w) => w.bbox.y0)), y1 = Math.max(...words.map((w) => w.bbox.y1))
    if (x1 - x0 < 6 || y1 - y0 < 5) continue
    const baseY = (l.baseline.y0 + l.baseline.y1) / 2
    // font size: how high the tallest letters rise above the baseline (capitals and tall letters), else the box height
    const rises = words.filter((w) => ASCENDER.test(w.text)).map((w) => baseY - w.bbox.y0).filter((r) => r > 3)
    // the MIDDLE rise, not the tallest: one word whose box was stretched by something above it (a photo edge, a stray mark) must not make the whole line huge
    const rise = rises.length ? [...rises].sort((p, q) => p - q)[rises.length >> 1]! : (y1 - y0) * 0.75
    const sizePx = Math.max(6, rise / ASCENT)
    const look = guessLook(text, x1 - x0, sizePx, measure)
    // bold: stroke thickness is a better sign than width (measured on regular type 0.12-0.13, on bold 0.14-0.18)
    if (weight) look.bold = weight({ x0, y0, x1, y1 }, sizePx) > BOLD_STROKE
    // a word box can be stretched by what touches the line (the edge of a photo just above, a rule): the ink of a line cannot rise higher than its capitals plus accents, or sink lower than its descenders
    y0 = Math.max(y0, baseY - sizePx * 0.95); y1 = Math.min(y1, baseY + sizePx * 0.3)
    if (y1 - y0 < 5) continue
    const pad = Math.max(2, sizePx * 0.08) // the cover must reach past the anti-aliased edges of the letters
    out.push({
      id: `o${out.length}`, str: text, ...look, italic: false, pad: pad / k, conf,
      box: { x: (x0 - pad) / k, y: (y0 - pad) / k, w: (x1 - x0 + 2 * pad) / k, h: (y1 - y0 + 2 * pad) / k, baseline: baseY / k, size: sizePx / k },
    })
  }
  return out.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
}

/** two lines of two readings are the same line when their boxes overlap by more than half of the smaller one */
const overlap = (a: Run, b: Run): number => {
  const A = turnedBounds(a.box, a.box.rot), B = turnedBounds(b.box, b.box.rot) // turned lines: their real footprint on the page
  const w = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), h = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y)
  return w > 0 && h > 0 ? (w * h) / Math.min(A.w * A.h, B.w * B.h) : 0
}
/** add the lines of a second reading to the first: a line that sits on one already found is the same line (the surer reading wins), the others are new */
export function mergeReadings(first: Run[], second: Run[]): Run[] {
  const out = [...first]
  for (const r of second) {
    const i = out.findIndex((q) => overlap(q, r) > 0.5)
    if (i < 0) out.push(r)
    else if ((r.conf ?? 0) > (out[i]!.conf ?? 0) + 10) out[i] = r
  }
  return out.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x).map((r, i) => ({ ...r, id: `o${i}` }))
}

// ---------- pixels: crop, scale, polarity ----------
export const lumaOf = (d: Uint8ClampedArray, o: number): number => 0.3 * d[o]! + 0.59 * d[o + 1]! + 0.11 * d[o + 2]!

export function cropImg(img: Img, r: Rect): Img {
  const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y)), x1 = Math.min(img.w, Math.ceil(r.x + r.w)), y1 = Math.min(img.h, Math.ceil(r.y + r.h))
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0), out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) out.set(img.data.subarray(((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x0 + w) * 4), y * w * 4)
  return { data: out, w, h }
}
/** bilinear resize by `f` (> 1 enlarges: small type reads much better a few times bigger) */
export function scaleImg(img: Img, f: number): Img {
  if (Math.abs(f - 1) < 0.02) return img
  const w = Math.max(1, Math.round(img.w * f)), h = Math.max(1, Math.round(img.h * f)), out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.h - 1, Math.max(0, (y + 0.5) / f - 0.5)), y0 = Math.floor(sy), y1 = Math.min(img.h - 1, y0 + 1), fy = sy - y0
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.w - 1, Math.max(0, (x + 0.5) / f - 0.5)), x0 = Math.floor(sx), x1 = Math.min(img.w - 1, x0 + 1), fx = sx - x0
      for (let c = 0; c < 3; c++) {
        const a = img.data[(y0 * img.w + x0) * 4 + c]!, b = img.data[(y0 * img.w + x1) * 4 + c]!, p = img.data[(y1 * img.w + x0) * 4 + c]!, q = img.data[(y1 * img.w + x1) * 4 + c]!
        out[(y * w + x) * 4 + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (p * (1 - fx) + q * fx) * fy
      }
      out[(y * w + x) * 4 + 3] = 255
    }
  }
  return { data: out, w, h }
}
/** the commonest colour of an image (5 bits per channel buckets, then their mean) */
export function modeColour(img: Img): [number, number, number] {
  const b = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < img.data.length; i += 4) {
    const k = ((img.data[i]! >> 3) << 10) | ((img.data[i + 1]! >> 3) << 5) | (img.data[i + 2]! >> 3)
    const e = b.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += img.data[i]!; e.g += img.data[i + 1]!; e.b += img.data[i + 2]!; b.set(k, e)
  }
  const top = [...b.values()].sort((p, q) => q.n - p.n)[0]
  return top ? [top.r / top.n, top.g / top.n, top.b / top.n] : [255, 255, 255]
}
/**
 * Dark letters on a white ground, whatever the original looked like: every pixel becomes "how far from the ground colour `c0`" (dark = far), pushed
 * hard so that even grey type on a dark slide, or white type on a coloured circle, comes out as clear black on white. White margin all round.
 */
export function inkOnWhite(img: Img, c0: [number, number, number], pad = 12, gain = 4): Img {
  const w = img.w + 2 * pad, h = img.h + 2 * pad, out = new Uint8ClampedArray(w * h * 4).fill(255)
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const o = (y * img.w + x) * 4
    const d = Math.hypot(img.data[o]! - c0[0], img.data[o + 1]! - c0[1], img.data[o + 2]! - c0[2])
    const v = 255 - Math.min(255, Math.max(0, (d - 12) * gain)), p = ((y + pad) * w + x + pad) * 4
    out[p] = out[p + 1] = out[p + 2] = v
  }
  return { data: out, w, h }
}
/** blank rows and columns that are ink from one edge of the picture to the other: a rule or a connector line running through the crop, never a letter */
export function dropRules(img: Img, pad: number): void {
  const { w, h, data } = img
  const dark = (x: number, y: number): boolean => data[(y * w + x) * 4]! < 140
  const rows: number[] = [], cols: number[] = []
  for (let y = 0; y < h; y++) { let c = 0; for (let x = pad; x < w - pad; x++) if (dark(x, y)) c++; if (c > (w - 2 * pad) * 0.96) rows.push(y) }
  for (let x = 0; x < w; x++) { let c = 0; for (let y = pad; y < h - pad; y++) if (dark(x, y)) c++; if (c > (h - 2 * pad) * 0.96) cols.push(x) }
  for (const y of rows) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; data[o] = data[o + 1] = data[o + 2] = 255 }
  for (const x of cols) for (let y = 0; y < h; y++) { const o = (y * w + x) * 4; data[o] = data[o + 1] = data[o + 2] = 255 }
}
/** grey copy with the dark ground turned light-on-dark → dark-on-light and the contrast stretched (Tesseract reads dark text on a light ground best) */
export function normalisedImg(src: Img, invert: boolean): Img {
  const out = new Uint8ClampedArray(src.data.length), hist = new Uint32Array(256)
  for (let i = 0; i < src.data.length; i += 4) { const l = Math.round(lumaOf(src.data, i)); out[i] = l; hist[l]!++ }
  const total = src.data.length / 4
  let lo = 0, hi = 255, acc = 0
  for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc > total * 0.01) { lo = v; break } }
  acc = 0
  for (let v = 255; v >= 0; v--) { acc += hist[v]!; if (acc > total * 0.01) { hi = v; break } }
  const span = Math.max(1, hi - lo)
  for (let i = 0; i < out.length; i += 4) {
    let l = Math.max(0, Math.min(255, ((out[i]! - lo) / span) * 255))
    if (invert) l = 255 - l
    out[i] = out[i + 1] = out[i + 2] = l; out[i + 3] = 255
  }
  return { data: out, w: src.w, h: src.h }
}
export function brightnessOf(img: Img): number {
  let s = 0, n = 0
  for (let i = 0; i < img.data.length; i += 4 * 7) { s += lumaOf(img.data, i); n++ }
  return n ? s / n : 255
}
/** how thick the strokes are, as a share of the font size (see ocr.ts): 2 x ink area / ink outline length, over the box */
export function strokeRatioOf(img: Img): (b: Bbox, sizePx: number) => number {
  return (b, sizePx) => {
    const x = Math.max(0, Math.floor(b.x0)), y = Math.max(0, Math.floor(b.y0)), w = Math.min(img.w - x, Math.ceil(b.x1 - b.x0)), h = Math.min(img.h - y, Math.ceil(b.y1 - b.y0))
    if (w < 3 || h < 3) return 0
    const lum = new Float32Array(w * h)
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) lum[j * w + i] = lumaOf(img.data, ((y + j) * img.w + x + i) * 4)
    const sorted = [...lum].sort((p, q) => p - q), med = sorted[sorted.length >> 1]!
    const ink = new Uint8Array(w * h); let dark = 0, light = 0
    for (let i = 0; i < lum.length; i++) { if (lum[i]! < med - 70) dark++; else if (lum[i]! > med + 70) light++ }
    const sign = dark >= light ? -1 : 1
    let area = 0
    for (let i = 0; i < lum.length; i++) if ((lum[i]! - med) * sign > 70) { ink[i] = 1; area++ }
    let edge = 0
    for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) { const o = j * w + i; if (ink[o] && (!ink[o - 1] || !ink[o + 1] || !ink[o - w] || !ink[o + w])) edge++ }
    return edge ? (2 * area) / edge / sizePx : 0
  }
}

// ---------- the text finder's passes ----------
/** one reading: `psm` = Tesseract page segmentation (11 sparse text, 7 one line, 8 one word, 6 one block); `digits` limits the alphabet to 0-9 */
export interface ReadOpts { psm: '6' | '7' | '8' | '10' | '11'; digits?: boolean }
export interface Recognizer { read(img: Img, o: ReadOpts): Promise<OcrLine[]> }
export interface PassOptions {
  /** the picture boxes of the page (pixels of `img`): nothing is read inside them except big, sure lines (a title or caption laid over a photo) */
  photos?: Rect[]
  cancelled?: () => boolean
  /** places that are not read at all (curved text: pieces of it read as junk) */
  skip?: Rect[]
  /** Date.now() after which no more blobs are read (what is read so far is kept) */
  deadline?: number
  /** called when the deadline cut the pass short */
  onPartial?: () => void
  /** 0..1 progress within this call */
  progress?: (f: number) => void
}

const dilateRect = (m: Uint8Array, w: number, h: number, rx: number, ry: number): Uint8Array => {
  const tmp = new Uint8Array(m.length), out = new Uint8Array(m.length)
  for (let y = 0; y < h; y++) { let run = 0; for (let x = 0; x < w + rx; x++) { if (x < w && m[y * w + x]) run = rx * 2 + 1; if (run > 0) { const xx = x - rx; if (xx >= 0 && xx < w) tmp[y * w + xx] = 1; run-- } } }
  for (let x = 0; x < w; x++) { let run = 0; for (let y = 0; y < h + ry; y++) { if (y < h && tmp[y * w + x]) run = ry * 2 + 1; if (run > 0) { const yy = y - ry; if (yy >= 0 && yy < h) out[yy * w + x] = 1; run-- } } }
  return out
}

export interface Blob { rect: Rect; /** the colour the blob's text sits on (a shape's fill, or the page ground) */ ground: [number, number, number]; /** pixels that differ from the ground and are not inside a line already read */ content: Rect; contentPx: number }

/**
 * Things on the page that carry ink the first look did not explain: a white digit in a coloured circle, a label on a chevron, a big number, a grey sub-line.
 *  - SHAPES: connected areas of one flat colour that are not the page ground (circles, chevrons, cards). What differs from the fill INSIDE the shape and is not
 *    inside a line already read is the shape's content; the blob to read is that content with a little of the fill around it.
 *  - LOOSE ink: pixels far from the page's background MODEL that belong to no shape, joined into lines (letters and words close together).
 * Photos are never looked into.
 */
export function unexplainedBlobs(img: Img, read: Rect[], photos: Rect[]): Blob[] {
  const f = Math.max(1, img.w / 480)
  const smallW = Math.round(img.w / f), smallH = Math.round(img.h / f)
  const small = new Uint8ClampedArray(smallW * smallH * 4)
  for (let y = 0; y < smallH; y++) for (let x = 0; x < smallW; x++) {
    let r = 0, g = 0, b = 0, n = 0
    for (let yy = Math.floor(y * f); yy < Math.min(img.h, Math.floor((y + 1) * f)); yy++) for (let xx = Math.floor(x * f); xx < Math.min(img.w, Math.floor((x + 1) * f)); xx++) { const o = (yy * img.w + xx) * 4; r += img.data[o]!; g += img.data[o + 1]!; b += img.data[o + 2]!; n++ }
    const o = (y * smallW + x) * 4; small[o] = r / Math.max(1, n); small[o + 1] = g / Math.max(1, n); small[o + 2] = b / Math.max(1, n); small[o + 3] = 255
  }
  const bg = fitBackground({ data: small, w: smallW, h: smallH }, [])
  const W = img.w, H = img.h, D = img.data
  const photoMask = new Uint8Array(W * H)
  for (const p of photos) for (let y = Math.max(0, Math.floor(p.y)); y < Math.min(H, Math.ceil(p.y + p.h)); y++) for (let x = Math.max(0, Math.floor(p.x)); x < Math.min(W, Math.ceil(p.x + p.w)); x++) photoMask[y * W + x] = 1
  const readMask = new Uint8Array(W * H)
  for (const t of read) for (let y = Math.max(0, Math.floor(t.y - 2)); y < Math.min(H, Math.ceil(t.y + t.h + 2)); y++) for (let x = Math.max(0, Math.floor(t.x - 2)); x < Math.min(W, Math.ceil(t.x + t.w + 2)); x++) readMask[y * W + x] = 1
  const far = new Uint8Array(W * H) // far from the page ground
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x
    if (photoMask[i]) continue
    const o = i * 4, m = bg.at(x / f, y / f)
    if (Math.hypot(D[o]! - m[0], D[o + 1]! - m[1], D[o + 2]! - m[2]) > 36) far[i] = 1
  }
  const out: Blob[] = []
  const shapeMask = new Uint8Array(W * H) // shapes and their insides (so loose ink does not pick them up again)
  // ---- shapes: flat colour areas
  const label = new Uint8Array(W * H), comp: number[] = []
  const near = (o: number, c: number[], tol: number): boolean => Math.abs(D[o]! - c[0]!) + Math.abs(D[o + 1]! - c[1]!) + Math.abs(D[o + 2]! - c[2]!) <= tol
  for (let s = 0; s < far.length; s++) {
    if (!far[s] || label[s]) continue
    const so = s * 4, sx = s % W, sy = (s / W) | 0
    // start only on flat ground (not on an anti-aliased edge)
    if (sx + 1 >= W || sy + 1 >= H || !near(so, [D[so + 4]!, D[so + 5]!, D[so + 6]!], 8) || !near(so, [D[so + W * 4]!, D[so + W * 4 + 1]!, D[so + W * 4 + 2]!], 8)) continue
    const seed = [D[so]!, D[so + 1]!, D[so + 2]!]
    comp.length = 0
    const stack = [s]; label[s] = 1
    let x0 = W, y0 = H, x1 = -1, y1 = -1
    while (stack.length) {
      const i = stack.pop()!, x = i % W, y = (i / W) | 0
      comp.push(i); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && !label[j] && far[j] && near(j * 4, seed, 30)) { label[j] = 1; stack.push(j) }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1
    if (comp.length < 600 || bw < 20 || bh < 20 || bw * bh > W * H * 0.5) continue
    // the inside of the shape: pixels with a shape pixel on both sides in their row AND in their column (circles, chevrons and rounded cards, not their corners)
    const own = new Uint8Array(bw * bh)
    for (const i of comp) own[((i / W) | 0) * 0 + (((i / W) | 0) - y0) * bw + (i % W - x0)] = 1
    const rowMin = new Int32Array(bh).fill(bw), rowMax = new Int32Array(bh).fill(-1), colMin = new Int32Array(bw).fill(bh), colMax = new Int32Array(bw).fill(-1)
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (own[y * bw + x]) { if (x < rowMin[y]!) rowMin[y] = x; if (x > rowMax[y]!) rowMax[y] = x; if (y < colMin[x]!) colMin[x] = y; if (y > colMax[x]!) colMax[x] = y }
    let cx0 = bw, cy0 = bh, cx1 = -1, cy1 = -1, n = 0
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const inside = x >= rowMin[y]! && x <= rowMax[y]! && y >= colMin[x]! && y <= colMax[x]!
      if (!inside) continue
      shapeMask[(y0 + y) * W + x0 + x] = 1
      const gi = (y0 + y) * W + x0 + x
      if (own[y * bw + x] || readMask[gi] || photoMask[gi]) continue
      const o = gi * 4
      if (Math.abs(D[o]! - seed[0]!) + Math.abs(D[o + 1]! - seed[1]!) + Math.abs(D[o + 2]! - seed[2]!) < 70) continue
      n++; if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y
    }
    if (n < 40 || cx1 - cx0 < 8 || cy1 - cy0 < 8) continue
    const pad = 8
    const rx0 = Math.max(0, cx0 - pad), ry0 = Math.max(0, cy0 - pad), rx1 = Math.min(bw - 1, cx1 + pad), ry1 = Math.min(bh - 1, cy1 + pad)
    out.push({ rect: { x: x0 + rx0, y: y0 + ry0, w: rx1 - rx0 + 1, h: ry1 - ry0 + 1 }, ground: [seed[0]!, seed[1]!, seed[2]!], content: { x: x0 + cx0, y: y0 + cy0, w: cx1 - cx0 + 1, h: cy1 - cy0 + 1 }, contentPx: n })
  }
  // a connector line can cut one shape (a circle with a label) into several pieces: pieces of the same colour that touch are one shape
  for (let again = true; again;) {
    again = false
    for (let i = 0; i < out.length && !again; i++) for (let j = i + 1; j < out.length && !again; j++) {
      const a = out[i]!, b = out[j]!
      const gap = Math.max(a.rect.x - (b.rect.x + b.rect.w), b.rect.x - (a.rect.x + a.rect.w), a.rect.y - (b.rect.y + b.rect.h), b.rect.y - (a.rect.y + a.rect.h))
      if (gap > 10 || Math.abs(a.ground[0] - b.ground[0]) + Math.abs(a.ground[1] - b.ground[1]) + Math.abs(a.ground[2] - b.ground[2]) > 36) continue
      const x0 = Math.min(a.rect.x, b.rect.x), y0 = Math.min(a.rect.y, b.rect.y), x1 = Math.max(a.rect.x + a.rect.w, b.rect.x + b.rect.w), y1 = Math.max(a.rect.y + a.rect.h, b.rect.y + b.rect.h)
      const cx0 = Math.min(a.content.x, b.content.x), cy0 = Math.min(a.content.y, b.content.y), cx1 = Math.max(a.content.x + a.content.w, b.content.x + b.content.w), cy1 = Math.max(a.content.y + a.content.h, b.content.y + b.content.h)
      out.splice(j, 1); out[i] = { rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, ground: a.ground, content: { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 }, contentPx: a.contentPx + b.contentPx }
      again = true
    }
  }
  // ---- loose ink: far from the ground, in no shape
  // the anti-aliased rim of a shape is not loose ink either
  const shapeOrFlat = new Uint8Array(W * H)
  for (let i = 0; i < shapeOrFlat.length; i++) shapeOrFlat[i] = shapeMask[i]
  const rim = dilateRect(shapeOrFlat, W, H, 3, 3)
  const ink0 = new Uint8Array(W * H)
  for (let i = 0; i < ink0.length; i++) if (far[i] && !rim[i]) ink0[i] = 1
  const ink = dilateRect(ink0, W, H, 6, 3)
  const seen = new Uint8Array(W * H)
  for (let s = 0; s < ink.length; s++) {
    if (!ink[s] || seen[s]) continue
    const stack = [s]; seen[s] = 1
    let x0 = W, y0 = H, x1 = -1, y1 = -1
    while (stack.length) {
      const i = stack.pop()!, x = i % W, y = (i / W) | 0
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && ink[j] && !seen[j]) { seen[j] = 1; stack.push(j) }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1
    if (bw < 8 || bh < 8 || bh > H * 0.6 || bw * bh > W * H * 0.5) continue
    const box = cropImg(img, { x: x0, y: y0, w: bw, h: bh })
    const ground = modeColour(box)
    let cx0 = bw, cy0 = bh, cx1 = -1, cy1 = -1, n = 0
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const gi = (y0 + y) * W + x0 + x, o = (y * bw + x) * 4
      if (Math.hypot(box.data[o]! - ground[0], box.data[o + 1]! - ground[1], box.data[o + 2]! - ground[2]) <= 40 || readMask[gi] || rim[gi]) continue
      n++; if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y
    }
    if (n < 40 || cx1 - cx0 < 8 || cy1 - cy0 < 8) continue
    out.push({ rect: { x: x0, y: y0, w: bw, h: bh }, ground, content: { x: x0 + cx0, y: y0 + cy0, w: cx1 - cx0 + 1, h: cy1 - cy0 + 1 }, contentPx: n })
  }
  return out
}

/** how many separate text rows the content of a blob has, and the typical height of one mark (a letter or a digit), from a row / column projection of its content pixels */
export function contentShape(box: Img, ground: [number, number, number]): { rows: number; markH: number; rowsH: number; marks: number } {
  const w = box.w, h = box.h
  const on = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; on[y * w + x] = Math.hypot(box.data[o]! - ground[0], box.data[o + 1]! - ground[1], box.data[o + 2]! - ground[2]) > 40 ? 1 : 0 }
  // a rule or connector line across the whole crop is not content
  for (let x = 0; x < w; x++) { let c = 0; for (let y = 0; y < h; y++) c += on[y * w + x]!; if (c > h * 0.9) for (let y = 0; y < h; y++) on[y * w + x] = 0 }
  for (let y = 0; y < h; y++) { let c = 0; for (let x = 0; x < w; x++) c += on[y * w + x]!; if (c > w * 0.9) for (let x = 0; x < w; x++) on[y * w + x] = 0 }
  const rowOn = new Array<number>(h).fill(0)
  for (let y = 0; y < h; y++) { let c = 0; for (let x = 0; x < w; x++) c += on[y * w + x]!; rowOn[y] = c }
  const bands: [number, number][] = []; let start = -1
  for (let y = 0; y <= h; y++) { const hit = y < h && rowOn[y]! > Math.max(1, w * 0.004); if (hit && start < 0) start = y; if (!hit && start >= 0) { if (y - start >= 3) bands.push([start, y - 1]); start = -1 } }
  // marks: connected components of content pixels, their typical height
  const seen = new Uint8Array(w * h), hs: number[] = []
  for (let s = 0; s < on.length; s++) {
    if (!on[s] || seen[s]) continue
    const st = [s]; seen[s] = 1; let y0 = h, y1 = -1, n = 0
    while (st.length) { const i = st.pop()!, x = i % w, y = (i / w) | 0; n++; if (y < y0) y0 = y; if (y > y1) y1 = y; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && on[j] && !seen[j]) { seen[j] = 1; st.push(j) } }
    if (n >= 6) hs.push(y1 - y0 + 1)
  }
  hs.sort((a, b) => a - b)
  const bandHs = bands.map(([a, b]) => b - a + 1).sort((a, b) => a - b)
  return { rows: bands.length, markH: hs.length ? hs[hs.length >> 1]! : Math.max(1, h), rowsH: bandHs.length ? bandHs[bandHs.length >> 1]! : h, marks: hs.length }
}

const shift = (lines: OcrLine[], dx: number, dy: number, f: number): OcrLine[] => {
  const b = (q: Bbox): Bbox => ({ x0: q.x0 / f + dx, y0: q.y0 / f + dy, x1: q.x1 / f + dx, y1: q.y1 / f + dy })
  return lines.map((l) => ({ ...l, bbox: b(l.bbox), baseline: b(l.baseline), words: l.words.map((w) => ({ ...w, bbox: b(w.bbox) })) }))
}

/**
 * The extra readings of a page, after the first look: every blob with ink the first look did not explain is cut out, turned into black-on-white by its OWN
 * ground colour (so a white digit on a red circle and a grey line on a dark slide are the same job), enlarged until its letters are about 34 px tall, and
 * read with the page-segmentation mode that fits its shape (one glyph / one word / one line / a block). Digits-only blobs get the digit alphabet first.
 * Returns lines in pixels of `img`, ready for `linesToRuns(…, { region: true })`.
 */
export async function readUnexplained(img: Img, firstLook: Run[], rec: Recognizer, opt: PassOptions = {}): Promise<OcrLine[]> {
  const already = [...firstLook.map((r) => turnedBounds(r.box, r.box.rot)), ...(opt.skip ?? [])]
  const blobs = unexplainedBlobs(img, already, opt.photos ?? [])
  const lines: OcrLine[] = []
  const lineConf = (l: OcrLine): number => { const ws = l.words.filter((w) => w.text.trim()); const t = ws.reduce((s, w) => s + Math.max(1, w.text.trim().length), 0); return t ? ws.reduce((s, w) => s + w.confidence * Math.max(1, w.text.trim().length), 0) / t : 0 }
  for (let bi = 0; bi < blobs.length; bi++) {
    if (opt.cancelled?.()) break
    if (opt.deadline && Date.now() > opt.deadline) { opt.onPartial?.(); break }
    opt.progress?.(bi / Math.max(1, blobs.length))
    const b = blobs[bi]!
    const m = 4
    const rect = { x: b.rect.x - m, y: b.rect.y - m, w: b.rect.w + 2 * m, h: b.rect.h + 2 * m }
    const crop = cropImg(img, rect)
    const shape = contentShape(crop, b.ground)
    const f = Math.min(4, Math.max(1, 34 / Math.max(6, shape.markH)))
    const flat = inkOnWhite(scaleImg(crop, f), b.ground, 14)
    dropRules(flat, 14)
    // where the crop sits inside the final picture (the white margin was added at the enlarged size)
    const shiftX = rect.x - 14 / f, shiftY = rect.y - 14 / f
    const glyph = shape.rows === 1 && shape.marks === 1
    // a short mark or two, tall as a digit: try the digit alphabet first (numbers on a slide: 01, 2, 3)
    const numeral = shape.rows === 1 && shape.marks <= 3 && b.content.w <= b.content.h * 3.2
    const modes: ReadOpts[] = glyph ? [{ psm: '10', digits: true }, { psm: '10' }] : numeral ? [{ psm: '7', digits: true }, { psm: '7' }] : shape.rows === 1 ? [{ psm: '7' }] : shape.rows <= 8 ? [{ psm: '6' }] : [{ psm: '11' }]
    for (const mo of modes) {
      const raw = shift(await rec.read(flat, mo), shiftX, shiftY, f)
      // a single digit reads at 45-60 % even when it is right (a "1" looks like an "I"): see the sibling rule below; anything else must be sure
      const good = raw.filter((l) => l.words.some((w) => w.text.trim()) && lineConf(l) >= (mo.digits ? 40 : 45)).map((l) => ({ ...l, confidence: lineConf(l) }))
      if (good.length) { lines.push(...good); break }
    }
  }
  // Weak readings (a digit that looks like an "I", "Phase 1" next to a sure "Phase 2") are believed when the rest of the page confirms them:
  //  - a number of 1-3 digits: another sure number of about the same height is on the page (a numbered list: "1" next to "3", "01" next to "02")
  //  - a label: every word of 3 letters or more also stands in a sure line (repeated structure: Phase 1 / Phase 2 / Phase 3)
  const numeral = (t: string): boolean => /^\d{1,3}$/.test(t.trim())
  const sure = [...lines.filter((l) => l.confidence >= 80), ...firstLook.filter((r) => (r.conf ?? 0) >= 90).map((r): OcrLine => ({ text: r.str, confidence: r.conf ?? 0, bbox: { x0: r.box.x, y0: r.box.y, x1: r.box.x + r.box.w, y1: r.box.y + r.box.h }, baseline: { x0: 0, y0: 0, x1: 0, y1: 0 }, words: [] }))]
  const sureNumbers = [...lines.filter((l) => numeral(l.text) && l.confidence >= 80).map((l) => l.bbox.y1 - l.bbox.y0), ...firstLook.filter((r) => numeral(r.str) && (r.conf ?? 0) >= 80).map((r) => r.box.h - 2 * (r.pad ?? 0))]
  const sureWords = new Set(sure.flatMap((l) => l.text.toLowerCase().split(/\s+/)))
  const out = lines.filter((l) => {
    if (l.confidence >= 80) return true
    const t = l.text.trim()
    if (numeral(t)) { const h = l.bbox.y1 - l.bbox.y0; return sureNumbers.some((sh) => Math.abs(sh - h) <= 0.35 * Math.max(sh, h)) }
    const ws = t.toLowerCase().split(/\s+/).filter((w) => (w.match(/\p{L}/gu) ?? []).length >= 3)
    return l.confidence >= 45 && ws.length > 0 && ws.every((w) => sureWords.has(w))
  }).map((l) => (l.confidence < 80 ? { ...l, confidence: 80, words: l.words.map((w) => ({ ...w, confidence: Math.max(w.confidence, 80) })) } : l))
  opt.progress?.(1)
  return out
}


/**
 * Ink that no line read so far, joined in ALL directions (words of a turned line are not neighbours along the page's rows): pixels far from the page's background
 * model, outside photos and outside the footprint of every line already read, grown by `grow` px and split into components. Returns each component's ink box.
 */
export function inkBlobs(img: Img, known: Rect[], photos: Rect[], grow: number): { content: Rect; ground: [number, number, number] }[] {
  const f = Math.max(1, img.w / 480), smallW = Math.round(img.w / f), smallH = Math.round(img.h / f)
  const small = new Uint8ClampedArray(smallW * smallH * 4)
  for (let y = 0; y < smallH; y++) for (let x = 0; x < smallW; x++) {
    let r = 0, g = 0, b = 0, n = 0
    for (let yy = Math.floor(y * f); yy < Math.min(img.h, Math.floor((y + 1) * f)); yy++) for (let xx = Math.floor(x * f); xx < Math.min(img.w, Math.floor((x + 1) * f)); xx++) { const o = (yy * img.w + xx) * 4; r += img.data[o]!; g += img.data[o + 1]!; b += img.data[o + 2]!; n++ }
    const o = (y * smallW + x) * 4; small[o] = r / Math.max(1, n); small[o + 1] = g / Math.max(1, n); small[o + 2] = b / Math.max(1, n); small[o + 3] = 255
  }
  const bg = fitBackground({ data: small, w: smallW, h: smallH }, [])
  const W = img.w, H = img.h, D = img.data
  const skip = new Uint8Array(W * H)
  const mark = (r: Rect, pad: number): void => { for (let y = Math.max(0, Math.floor(r.y - pad)); y < Math.min(H, Math.ceil(r.y + r.h + pad)); y++) for (let x = Math.max(0, Math.floor(r.x - pad)); x < Math.min(W, Math.ceil(r.x + r.w + pad)); x++) skip[y * W + x] = 1 }
  for (const p of photos) mark(p, 0)
  for (const k of known) mark(k, 2)
  const ink0 = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (skip[i]) continue
    const o = i * 4, m = bg.at(x / f, y / f)
    if (Math.hypot(D[o]! - m[0], D[o + 1]! - m[1], D[o + 2]! - m[2]) > 60) ink0[i] = 1
  }
  const ink = dilateRect(ink0, W, H, grow, grow)
  const seen = new Uint8Array(W * H), out: { content: Rect; ground: [number, number, number] }[] = []
  for (let s = 0; s < ink.length; s++) {
    if (!ink[s] || seen[s]) continue
    const stack = [s]; seen[s] = 1
    let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0
    while (stack.length) {
      const i = stack.pop()!, x = i % W, y = (i / W) | 0
      if (ink0[i]) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && ink[j] && !seen[j]) { seen[j] = 1; stack.push(j) }
    }
    if (n < 80 || x1 < x0) continue
    const content = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
    if (content.w * content.h > W * H * 0.35) continue
    out.push({ content, ground: modeColour(cropImg(img, { x: x0 - 8, y: y0 - 8, w: content.w + 16, h: content.h + 16 })) })
  }
  return out
}

// ---------- turned and curved text ----------
export interface TurnedNotes { /** blobs read as turned text */ turned: number; /** blobs that look like curved or irregular text: left alone, the visitor drags a box over them */ curved: number; /** where those blobs are (pixels of the page copy), with a margin: the later passes do not read pieces of them */ curvedBoxes?: Rect[] }

/**
 * The angle (degrees clockwise on screen, -90..90 plus the two upright-vertical cases) at which the ink of a crop lines up into text rows, found from a
 * projection profile: for each trial angle the ink pixels are projected onto the axis across the text, and the angle whose profile is sharpest (rows full
 * of ink, gaps between rows empty) wins. `sharpness` is the best score over the mean score of all angles (about 1 for blobs without rows).
 * `straight` is how far the middle of the ink wanders around a straight line along the best angle, in text heights (curved text: 0.7 and more).
 */
export function textAngle(img: Img, ground: [number, number, number], step = 2): { angle: number; sharpness: number; straight: number; length: number; thickness: number } {
  const pts: [number, number][] = []
  const w = img.w, h = img.h, stride = Math.max(1, Math.round(Math.sqrt((w * h) / 24000)))
  for (let y = 0; y < h; y += stride) for (let x = 0; x < w; x += stride) { const o = (y * w + x) * 4; if (Math.hypot(img.data[o]! - ground[0], img.data[o + 1]! - ground[1], img.data[o + 2]! - ground[2]) > 50) pts.push([x - w / 2, y - h / 2]) }
  if (pts.length < 30) return { angle: 0, sharpness: 1, straight: 0, length: 0, thickness: 0 }
  const span = Math.hypot(w, h), bins = Math.max(8, Math.round(span / stride / 2))
  const score = (deg: number): number => {
    const t = (deg * Math.PI) / 180, si = Math.sin(t), co = Math.cos(t)
    const hist = new Float32Array(bins + 2)
    for (const [x, y] of pts) { const v = -x * si + y * co; const b = Math.floor((v + span / 2) / span * bins); if (b >= 0 && b <= bins) hist[b]! += 1 }
    let s = 0; for (const c of hist) s += c * c
    return s
  }
  const scores: number[] = []; let best = 0, bestS = -1
  for (let a = -90; a <= 90; a += step) { const sc = score(a); scores.push(sc); if (sc > bestS) { bestS = sc; best = a } }
  for (let a = best - step; a <= best + step; a += step / 4) { const sc = score(a); if (sc > bestS) { bestS = sc; best = a } } // refine
  const mean = scores.reduce((p, q) => p + q, 0) / scores.length
  // along / across extents at the best angle, and how the middle of the ink drifts along the text
  const t = (best * Math.PI) / 180, si = Math.sin(t), co = Math.cos(t)
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  const proj = pts.map(([x, y]) => { const u = x * co + y * si, v = -x * si + y * co; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; return [u, v] as [number, number] })
  const length = u1 - u0, thickness = v1 - v0
  const cols = 16, mids: number[] = []
  for (let c = 0; c < cols; c++) {
    let lo = Infinity, hi = -Infinity
    for (const [u, v] of proj) if (u >= u0 + (c / cols) * length && u < u0 + ((c + 1) / cols) * length) { if (v < lo) lo = v; if (v > hi) hi = v }
    if (hi > lo) mids.push((lo + hi) / 2)
  }
  // height of one text row: the thickness when there is one row; else the median of the column extents
  const colH: number[] = []
  for (let c = 0; c < cols; c++) { let lo = Infinity, hi = -Infinity; for (const [u, v] of proj) if (u >= u0 + (c / cols) * length && u < u0 + ((c + 1) / cols) * length) { if (v < lo) lo = v; if (v > hi) hi = v } if (hi > lo) colH.push(hi - lo) }
  colH.sort((p, q) => p - q)
  const rowH = Math.max(4, colH[colH.length >> 1] ?? thickness)
  let straight = 0
  if (mids.length >= 6) {
    const n = mids.length, mx = (n - 1) / 2, my = mids.reduce((p, q) => p + q, 0) / n
    let sxy = 0, sxx = 0; mids.forEach((m, i) => { sxy += (i - mx) * (m - my); sxx += (i - mx) ** 2 })
    const slope = sxx ? sxy / sxx : 0
    let r = 0; mids.forEach((m, i) => { r += (m - (my + slope * (i - mx))) ** 2 })
    straight = Math.sqrt(r / n) / rowH
  }
  return { angle: normAngle(best), sharpness: bestS / Math.max(1, mean), straight, length, thickness }
}

/** `img` turned counter-clockwise by `deg` and enlarged by `f` onto a white sheet with `pad` px all round; `map` takes a point of the result back into `img` (pixels) */
export function turnCrop(img: Img, deg: number, f: number, pad: number, ground: [number, number, number]): { img: Img; map: (u: number, v: number) => [number, number] } {
  const t = (deg * Math.PI) / 180, co = Math.cos(t), si = Math.sin(t)
  const cw = img.w, ch = img.h
  const ow = Math.ceil((Math.abs(cw * co) + Math.abs(ch * si)) * f) + 2 * pad, oh = Math.ceil((Math.abs(cw * si) + Math.abs(ch * co)) * f) + 2 * pad
  const out = new Uint8ClampedArray(ow * oh * 4)
  const map = (u: number, v: number): [number, number] => { const dx = (u - ow / 2) / f, dy = (v - oh / 2) / f; return [cw / 2 + dx * co - dy * si, ch / 2 + dx * si + dy * co] }
  for (let v = 0; v < oh; v++) for (let u = 0; u < ow; u++) {
    const [sx, sy] = map(u + 0.5, v + 0.5)
    const o = (v * ow + u) * 4
    if (sx < 0 || sy < 0 || sx >= cw - 1 || sy >= ch - 1) { out[o] = ground[0]; out[o + 1] = ground[1]; out[o + 2] = ground[2]; out[o + 3] = 255; continue }
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0
    for (let c = 0; c < 3; c++) { const a = img.data[(y0 * cw + x0) * 4 + c]!, b = img.data[(y0 * cw + x0 + 1) * 4 + c]!, p = img.data[((y0 + 1) * cw + x0) * 4 + c]!, q = img.data[((y0 + 1) * cw + x0 + 1) * 4 + c]!; out[o + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (p * (1 - fx) + q * fx) * fy }
    out[o + 3] = 255
  }
  return { img: { data: out, w: ow, h: oh }, map }
}

/**
 * Text turned on the page (a vertical sidebar label, a stamp at 15 degrees): ink the other passes could not explain, cut out, turned upright by the angle its
 * rows line up at, read as horizontal text, and returned as runs that carry the turn (`box.rot`), with the box UNTURNED about its own centre. Curved or
 * irregular ink (no straight rows) is counted in `notes.curved` and not read: guessing there only makes junk.
 */
export async function readTurned(img: Img, known: Run[], rec: Recognizer, measure: Measure, photos: Rect[], notes: TurnedNotes, opt: PassOptions = {}): Promise<Run[]> {
  // Lines already read are NOT left out of the ink: a tilted line is often read in part by the horizontal pass ("by" out of "Approved by finance") and the rest must join
  // that piece. Blobs that are really horizontal are skipped below by their angle; turned lines already found stay as they are (`known` with a turn).
  const turnedKnown = known.filter((r) => r.box.rot).map((r) => turnedBounds(r.box, r.box.rot))
  const blobs = inkBlobs(img, turnedKnown, photos, 11)
  const out: Run[] = []
  let tried = 0
  for (const b of blobs) {
    if (opt.cancelled?.() || tried >= 14) break // at most 14 candidates a page: each is a reading
    if (opt.deadline && Date.now() > opt.deadline) { opt.onPartial?.(); break }
    const long = Math.max(b.content.w, b.content.h), thin = Math.min(b.content.w, b.content.h)
    if (long < 40 || long / Math.max(1, thin) < 1.6) continue // not line-like: a mark, a digit, a logo
    const m = 6
    const rect = { x: b.content.x - m, y: b.content.y - m, w: b.content.w + 2 * m, h: b.content.h + 2 * m }
    const crop = cropImg(img, rect)
    const ground = modeColour(crop)
    const ta = textAngle(crop, ground)
    if (ta.sharpness < 1.25 || ta.length < 40 || ta.thickness < 8) continue // (a rule or a connector is as thin as a hair)
    if (Math.abs(ta.angle) < 3 && ta.straight < 0.6) continue // upright and straight: the first looks were meant for this; nothing new here
    if (ta.straight > 0.6 || ta.thickness > ta.length * 0.9) { notes.curved++; (notes.curvedBoxes ??= []).push({ x: b.content.x - 30, y: b.content.y - 30, w: b.content.w + 60, h: b.content.h + 60 }); continue }
    tried++
    const rowH = Math.max(6, Math.min(ta.thickness, ta.length)) // one row of text: its thickness
    const f = Math.min(4, Math.max(1, 34 / Math.max(10, rowH * 0.72)))
    const pad = 14
    const turned = turnCrop(crop, ta.angle, f, pad, ground)
    const flat = inkOnWhite(turned.img, ground, 12)
    dropRules(flat, 12)
    // sideways text can read either way (down or up): a projection cannot tell, so both are read and the surer one wins
    const turns = Math.abs(ta.angle) > 45 ? [ta.angle, ta.angle > 0 ? ta.angle - 180 : ta.angle + 180] : [ta.angle]
    let bestRuns: Run[] = [], bestConf = 0, bestTurn = ta.angle
    for (const deg of turns) {
      const turned = turnCrop(crop, deg, f, pad, ground)
      const flat = inkOnWhite(turned.img, ground, 12)
      dropRules(flat, 12)
      const lines = await rec.read(flat, { psm: ta.thickness < ta.length * 0.35 ? '7' : '6' })
      const found: Run[] = []
      for (const r of linesToRuns(lines, 1, measure, undefined, { region: true })) {
        if ((r.conf ?? 0) < 70) continue
        // the box is axis-aligned in the upright sheet; its centre goes back through the turn, the box stays unturned and carries `rot`.
        // (`flat` is `turned.img` with 12 px of margin: its coordinates are 12 px ahead.)
        const [mx, my] = turned.map(r.box.x - 12, r.box.y - 12) // the TOP-LEFT corner of the line's box: the unturned box is turned about it
        const ox = rect.x + mx, oy = rect.y + my, w = r.box.w / f, h = r.box.h / f
        found.push({ ...r, box: { x: ox, y: oy, w, h, baseline: oy + (r.box.baseline - r.box.y) / f, size: r.box.size / f, rot: normAngle(deg) }, pad: r.pad === undefined ? undefined : r.pad / f })
      }
      const conf = found.reduce((sum, r) => sum + (r.conf ?? 0) * r.str.length, 0)
      if (conf > bestConf) { bestConf = conf; bestRuns = found; bestTurn = deg }
    }
    void bestTurn
    out.push(...bestRuns); notes.turned += bestRuns.length
  }
  return out
}

/** turned lines go in; a horizontal reading that sits inside a turned line's footprint is a piece of that line seen the wrong way ("by" out of a tilted "Approved by finance") and goes */
export function addTurned(first: Run[], turned: Run[]): Run[] {
  const fresh = turned.filter((t) => !first.some((q) => q.box.rot && overlap(q, t) > 0.3))
  const kept = first.filter((q) => q.box.rot || !fresh.some((t) => { const T = turnedBounds(t.box, t.box.rot), b = q.box; const w = Math.min(T.x + T.w, b.x + b.w) - Math.max(T.x, b.x), h = Math.min(T.y + T.h, b.y + b.h) - Math.max(T.y, b.y); return w > 0 && h > 0 && (w * h) / (b.w * b.h) > 0.5 }))
  return mergeReadings(kept, fresh)
}

/** the lines of a second look that sit on nothing found so far (the surer reading of a line never replaces another here: a region pass only ADDS) */
export function addNew(first: Run[], extra: Run[]): Run[] {
  const fresh = extra.filter((r) => !first.some((q) => overlap(q, r) > 0.3))
  return mergeReadings(first, fresh)
}

/** text found inside a photo (a phone screen, a monitor, a sign) is not the slide's text: keep only big, sure lines (a title or caption laid over a photo) */
export function dropOnPhotos(runs: Run[], photos: Rect[], pageH: number): Run[] {
  return runs.filter((r) => {
    const cx = r.box.x + r.box.w / 2, cy = r.box.y + r.box.h / 2
    if (!photos.some((p) => cx >= p.x && cx < p.x + p.w && cy >= p.y && cy < p.y + p.h)) return true
    return r.box.h >= pageH * 0.038 && (r.conf ?? 0) >= 85
  })
}

/** boxes from pixels to points */
export function toPoints(runs: Run[], k: number): Run[] {
  return runs.map((r) => ({ ...r, pad: r.pad === undefined ? undefined : r.pad / k, box: { ...r.box, x: r.box.x / k, y: r.box.y / k, w: r.box.w / k, h: r.box.h / k, baseline: r.box.baseline / k, size: r.box.size / k } }))
}

export type ReadStage = 'first' | 'again' | 'regions'
export interface ReadImageOptions { /** filled while reading: how many turned lines were read, how many curved blobs were left alone */ notes?: TurnedNotes; measure: Measure; cancelled?: () => boolean; stage?: (s: ReadStage, fraction: number) => void; /** time budget in ms for the whole reading (default none); the extra passes stop when it is used up */ budgetMs?: number; onPartial?: () => void }
/**
 * Read a page picture: the whole page (and again with the colours flipped on dark slides or when little was found), then the labels, numbers and small
 * lines that look found nothing for (see `readUnexplained`). Runs come back in pixels of `img`; text inside photos is dropped.
 */
export async function readImage(img: Img, rec: Recognizer, o: ReadImageOptions): Promise<Run[]> {
  const weight = strokeRatioOf(img)
  const deadline = o.budgetMs ? Date.now() + o.budgetMs : undefined
  const lines = async (i: Img): Promise<OcrLine[]> => rec.read(i, { psm: '11' })
  o.stage?.('first', 0)
  let runs = linesToRuns(await lines(img), 1, o.measure, weight)
  if (o.cancelled?.()) return runs
  const dark = brightnessOf(img) < 120
  if ((dark || runs.length < 5) && !(deadline && Date.now() > deadline - o.budgetMs! * 0.4)) { // the second look is skipped when the first one already used most of the time
    o.stage?.('again', 0)
    runs = mergeReadings(runs, linesToRuns(await lines(normalisedImg(img, dark)), 1, o.measure, weight))
  }
  if (o.cancelled?.()) return runs
  const small = downscale(img, SMALL_WIDTH), f = img.w / small.w
  const photos = findPhotos(small, runs.map((r) => ({ x: r.box.x / f, y: r.box.y / f, w: r.box.w / f, h: r.box.h / f }))).map((c) => ({ x: c.rect.x * f, y: c.rect.y * f, w: c.rect.w * f, h: c.rect.h * f }))
  runs = dropOnPhotos(runs, photos, img.h)
  // text turned on the page (sideways labels, tilted stamps) is claimed first, so the small-label pass does not read pieces of it as junk; curved text is only counted
  const notes = o.notes ?? { turned: 0, curved: 0 }
  o.stage?.('regions', 0)
  if (!o.cancelled?.() && !(deadline && Date.now() > deadline)) {
    const turned = await readTurned(img, runs, rec, o.measure, photos, notes, { cancelled: o.cancelled, deadline, onPartial: o.onPartial })
    runs = addTurned(runs, turned)
  }
  const extra = await readUnexplained(img, runs, rec, { photos, skip: notes.curvedBoxes, cancelled: o.cancelled, deadline, onPartial: o.onPartial, progress: (p) => o.stage?.('regions', p) })
  runs = addNew(runs, linesToRuns(extra, 1, o.measure, weight, { region: true }))
  return runs.map((r, i) => ({ ...r, id: `o${i}` }))
}
