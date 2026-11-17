/**
 * Pictures on a page, found and picked up. Browser only (pdf.js, canvas); loaded with the editor only.
 *
 *  - REAL pictures (normal PDFs): the page's operator list says where every image is drawn (paintImageXObject … with the current matrix). Exact.
 *  - PICTURE PAGES (a page that is one full-page image: a scan, a deck saved as JPEGs): `picture-detect.ts` looks for photo-like regions on a rendered copy.
 *  - Picking one up = cropping its pixels out of a render of the page at the picture's own resolution (no bytes are extracted from the file: simple and exact enough).
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { multiply, userToPageMatrix, type Matrix } from './geometry'
import { pageSize, type Box, type Geom } from './model'
import { cornerAlpha, downscale, findPhotos, refineRect, SMALL_WIDTH, TILE, type Img } from './picture-detect'
import { hasSeeThrough, splitAlpha } from './images'
import type { AlphaMask } from './model'
import { renderPage } from './render'

export interface Pic { id: string; box: Box; /** drawn from a real image in the file (exact edges) or found by looking at the picture (approximate) */ embedded: boolean; /** pixels per point the original image has here (0 = unknown) */ native: number; /** the finder is not sure: shown as a dashed grey "Picture?" that one click confirms */ maybe?: boolean }

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
const MIN_SHARE = 0.01 // smaller than 1 % of the page: an icon or a bullet, not a picture
const PAGE_SHARE = 0.85 // an image this big is the page's own picture (a scan / a deck page), not a picture on it
const cap = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** where every image is drawn, in page space */
async function embeddedImages(pdf: PDFDocumentProxy, src: number, geom: Geom): Promise<Pic[]> {
  const { OPS } = await import('pdfjs-dist')
  const page = await pdf.getPage(src + 1)
  try {
    const ol = await page.getOperatorList()
    const out: Pic[] = []
    let ctm: Matrix = userToPageMatrix(geom)
    const stack: Matrix[] = []
    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i], a = ol.argsArray[i] as unknown[] | null
      if (fn === OPS.save) stack.push(ctm)
      else if (fn === OPS.restore) ctm = stack.pop() ?? ctm
      else if (fn === OPS.transform && a) ctm = multiply(ctm, a as unknown as Matrix)
      else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (a?.[0]) ctm = multiply(ctm, a[0] as Matrix) }
      else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm
      else if (a && (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject)) {
        const dims = fn === OPS.paintImageXObject ? { w: Number(a[1]), h: Number(a[2]) } : { w: Number((a[0] as { width?: number })?.width), h: Number((a[0] as { height?: number })?.height) }
        // the image fills the unit square of the current matrix. Only upright pictures (a turn by a multiple of 90 degrees) are offered.
        const [m0, m1, m2, m3, e, f] = ctm
        const upright = Math.abs(m1) < Math.abs(m0) * 0.02 && Math.abs(m2) < Math.abs(m3) * 0.02
        const turned = Math.abs(m0) < Math.abs(m1) * 0.02 && Math.abs(m3) < Math.abs(m2) * 0.02
        if (!upright && !turned) continue
        const xs = [e, e + m0 + m2], ys = [f, f + m1 + m3]
        const box: Box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.abs(xs[1]! - xs[0]!), h: Math.abs(ys[1]! - ys[0]!) }
        const across = upright ? Math.abs(m0) : Math.abs(m1)
        out.push({ id: `e${out.length}`, box, embedded: true, native: dims.w > 0 && across > 0 ? dims.w / across : 0 })
      }
    }
    return out
  } finally { page.cleanup() }
}

const share = (b: Box, w: number, h: number): number => (b.w * b.h) / (w * h)
const iou = (a: Box, b: Box): number => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? (w * h) / (a.w * a.h + b.w * b.h - w * h) : 0
}

export interface DetectOptions { /** the page's text lines (page space): they are never offered as a picture */ text: Box[]; /** the text of the page could not be read: be stricter */ strict: boolean }
export interface DetectStats { ms: number; pagePicture: boolean; found: number }

/** Every picture of one page, in page space. Heavy steps are separated by yields, so the screen stays responsive. */
export async function detectPictures(pdf: PDFDocumentProxy, src: number, geom: Geom, opt: DetectOptions, stats?: (s: DetectStats) => void): Promise<Pic[]> {
  const t0 = performance.now()
  const { w: pw, h: ph } = pageSize(geom)
  const all = await embeddedImages(pdf, src, geom)
  await tick()
  const real: Pic[] = []
  let pagePic: Pic | null = null
  for (const p of all) {
    const bx = { x: Math.max(0, p.box.x), y: Math.max(0, p.box.y), w: Math.min(pw, p.box.x + p.box.w) - Math.max(0, p.box.x), h: Math.min(ph, p.box.y + p.box.h) - Math.max(0, p.box.y) }
    if (bx.w <= 0 || bx.h <= 0) continue
    if (share(bx, pw, ph) >= PAGE_SHARE) { if (!pagePic || p.native > pagePic.native) pagePic = { ...p, box: bx }; continue }
    if (share(bx, pw, ph) < MIN_SHARE) continue
    if (real.some((q) => iou(q.box, bx) > 0.9)) continue
    real.push({ ...p, id: `e${real.length}`, box: bx })
  }
  const found: Pic[] = []
  if (pagePic) found.push(...(await lookForPhotos(pdf, src, pw, ph, pagePic.native, opt)))
  // a found region that is (nearly) one of the real pictures is the same picture: keep the exact one
  const merged = [...real, ...found.filter((f) => !real.some((r) => iou(r.box, f.box) > 0.6))].map((p, i) => ({ ...p, id: `${p.embedded ? 'e' : 'f'}${i}` }))
  try { performance.measure(`pdf-editor-pictures-${src}`, { start: t0 }) } catch { /* User Timing missing: only used for measuring */ }
  stats?.({ ms: performance.now() - t0, pagePicture: !!pagePic, found: merged.length })
  return merged.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
}

/** the picture-page case: draw the page, look for photo-like regions that are not text */
async function lookForPhotos(pdf: PDFDocumentProxy, src: number, pw: number, ph: number, native: number, opt: DetectOptions): Promise<Pic[]> {
  // about 1600 px wide is plenty to place an edge to within a point; a scan at 300 dpi would only cost memory
  const k = Math.min(cap(native || 1.5, 1, 2), 1600 / pw, 2400 / ph)
  const canvas = document.createElement('canvas')
  try {
    const job = renderPage(pdf, src, canvas, k)
    const px = await job.done
    if (!px) return []
    await tick()
    const g = canvas.getContext('2d', { willReadFrequently: true })!
    const raw = g.getImageData(0, 0, canvas.width, canvas.height)
    const full: Img = { data: raw.data, w: raw.width, h: raw.height }
    await tick()
    const small = downscale(full, SMALL_WIDTH)
    await tick()
    const toSmall = small.w / full.w
    const textFull = opt.text.map((t) => ({ x: t.x * px, y: t.y * px, w: t.w * px, h: t.h * px }))
    const cands = findPhotos(small, textFull.map((t) => ({ x: t.x * toSmall, y: t.y * toSmall, w: t.w * toSmall, h: t.h * toSmall })), opt.strict, { img: full, scale: 1 / toSmall })
    await tick()
    const out: Pic[] = []
    for (const c of cands) {
      const r = refineRect(full, { x: c.rect.x / toSmall, y: c.rect.y / toSmall, w: c.rect.w / toSmall, h: c.rect.h / toSmall }, textFull, Math.ceil((2.5 * TILE) / toSmall))
      out.push({ id: `f${out.length}`, box: { x: r.x / px, y: r.y / px, w: r.w / px, h: r.h / px }, embedded: false, native, ...(c.maybe ? { maybe: true } : {}) })
      await tick()
    }
    return out
  } finally { canvas.width = 0 }
}

// ---------- picking one up ----------
const MAX_SIDE = 4000, MAX_PIXELS = 12_000_000
/** `bytes` are always a JPEG; rounded corners are an 8-bit soft mask beside it (`alpha`), `url` (screen only) a PNG of the same look */
export interface Cropped { url: string; mime: 'image/png' | 'image/jpeg'; bytes: Uint8Array; alpha?: AlphaMask; box: Box; px: { w: number; h: number }; transparent: boolean }

/** the pixels of `pic` cut out of a render of the page at the picture's own resolution (1x to 3x, at most 4000 px a side and 12 million pixels) */
export async function cropPicture(pdf: PDFDocumentProxy, src: number, geom: Geom, pic: Pic): Promise<Cropped> {
  const { w: pw, h: ph } = pageSize(geom)
  let s = cap(pic.native || 2, 1, 3)
  s = Math.min(s, MAX_SIDE / Math.max(pic.box.w, pic.box.h), Math.sqrt(MAX_PIXELS / (pic.box.w * pic.box.h)))
  const M = 6 // px of the surroundings kept on every side: to tell rounded corners from the picture, and to settle the edges to the pixel on this sharper copy
  const bx = Math.round(pic.box.x * s), by = Math.round(pic.box.y * s), bw = Math.max(2, Math.round(pic.box.w * s)), bh = Math.max(2, Math.round(pic.box.h * s))
  const rx0 = Math.max(0, bx - M), ry0 = Math.max(0, by - M), rx1 = Math.min(Math.ceil(pw * s), bx + bw + M), ry1 = Math.min(Math.ceil(ph * s), by + bh + M)
  const page = await pdf.getPage(src + 1)
  const off = document.createElement('canvas'); off.width = rx1 - rx0; off.height = ry1 - ry0
  try {
    const c = off.getContext('2d', { willReadFrequently: true })!
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, off.width, off.height)
    await page.render({ canvas: off, canvasContext: c, viewport: page.getViewport({ scale: s, offsetX: -rx0, offsetY: -ry0 }) }).promise
  } finally { page.cleanup() }
  const data = off.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, off.width, off.height)
  const full = { data: data.data, w: data.width, h: data.height }
  let inner = { x: bx - rx0, y: by - ry0, w: Math.min(bw, off.width - (bx - rx0)), h: Math.min(bh, off.height - (by - ry0)) }
  // a found picture's edges came from a smaller copy: settle them to the pixel here
  if (!pic.embedded) inner = refineRect(full, inner, [], M - 2)
  const holes = pic.embedded ? 0 : cornerAlpha(full, inner)
  const out = document.createElement('canvas'); out.width = inner.w; out.height = inner.h
  const og = out.getContext('2d')!
  const tmp = document.createElement('canvas'); tmp.width = off.width; tmp.height = off.height
  tmp.getContext('2d')!.putImageData(data, 0, 0)
  og.drawImage(tmp, inner.x, inner.y, inner.w, inner.h, 0, 0, inner.w, inner.h)
  tmp.width = 0; off.width = 0
  const blobOf = (type: string, q?: number): Promise<Blob | null> => new Promise<Blob | null>((res) => out.toBlob(res, type, q))
  let shown: Blob | null = null, alpha: AlphaMask | undefined
  if (holes > 0) {
    shown = await blobOf('image/png') // what the screen draws (never saved)
    const px = og.getImageData(0, 0, out.width, out.height), mask = splitAlpha(px)
    if (hasSeeThrough(mask)) { alpha = mask; og.putImageData(px, 0, 0) }
  }
  const jpg = await blobOf('image/jpeg', 0.92)
  const box = { x: (rx0 + inner.x) / s, y: (ry0 + inner.y) / s, w: inner.w / s, h: inner.h / s }, dims = { w: inner.w, h: inner.h }
  out.width = 0
  const blob = alpha ? shown : jpg
  if (!blob || !jpg) throw new Error('Could not pick up that picture.')
  return { url: URL.createObjectURL(blob), mime: 'image/jpeg', bytes: new Uint8Array(await jpg.arrayBuffer()), ...(alpha ? { alpha } : {}), box, px: dims, transparent: !!alpha }
}

/** the box a picture's cover takes: the picture plus a little more on every side, so its soft edge does not peek out */
export function coverBox(pic: Box, pw: number, ph: number, pad: number): Box {
  const x = Math.max(0, pic.x - pad), y = Math.max(0, pic.y - pad)
  return { x, y, w: Math.min(pw, pic.x + pic.w + pad) - x, h: Math.min(ph, pic.y + pic.h + pad) - y }
}
