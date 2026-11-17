import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { CANVAS, elementSchema, presentationSchema, themeStyleSchema, type AspectRatio, type Slide, type SlideElement, type Theme } from '@prompttoppt/validation'
import { SourceError } from '../sources/errors.ts'
import { fromHex, isDark, mix, toHex } from './color.ts'
import { mapFont } from './fonts.ts'
import { openPdf, pictureData, readPage, roundness, type Chunk, type PageContent, type Placed, type Pt, type Shape } from './pdf-ops.ts'
import { familyOf, toBoxes, toLines, toParagraphs, weightOf, type Line, type TextBox } from './pdf-text.ts'
import { aspectFor } from './parse.ts'
import { classifyPictures, classifySlide, mergeChrome, repeatedText, type SlideForSlots } from './slots.ts'
import { IMPORT_LIMITS, pendingRef, pendingSrc, type ExtractedPicture, type ParsedTemplate, type TemplateSlide, type UploadedFont, type UploadedTemplate } from './types.ts'
import type { Emitted } from './walk.ts'

/**
 * `parsePdfTemplate(bytes, filename)`: a PDF as a design to reuse ("same format, different data"), free of the database and of the network (it runs in the parse worker, like the .pptx
 * reader). A PDF has no layouts, placeholders or text boxes, so each PAGE is rebuilt from what it draws: the page colour (or picture) as the background, filled shapes, pictures and
 * text lines grouped into paragraphs and boxes. Pages that are only a picture (a scan, a deck exported as one JPEG per page) have no text to keep and are left out; a file with no
 * text page at all is refused with a message that says why. docs/TEMPLATE_FROM_FILE.md, "PDF", lists what is kept and what is approximated.
 */

export const PDF_TIME_BUDGET_MS = 20_000
export const PDF_MAX_PAGES_SCANNED = 200
type BgFill = NonNullable<Slide['background']>

const r1 = (n: number) => Math.round(n * 10) / 10
const clampN = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const luma = (h: string) => { const c = fromHex(h); return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255 }
const sat = (h: string) => { const { r, g, b } = fromHex(h); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx }
const hexU = (h: string) => toHex(fromHex(h))

export const PDF_MESSAGES = {
  portrait: 'This PDF is a portrait document (like A4 or Letter), not a slide design. Upload a landscape PDF exported from PowerPoint, Google Slides, Canva or Keynote, or the .pptx file itself.',
  pictures: 'The pages of this PDF are pictures (a scan, or slides saved as images), so there is no text or layout to read. Upload the .pptx file, or export a PDF that keeps its text from PowerPoint, Google Slides or Canva.',
  password: 'That PDF is password protected. Remove the password (open it, then print or save a copy without one) and upload it again.',
  damaged: 'That PDF could not be opened. It may be damaged. Try saving it again from the program that made it.',
  empty: 'That PDF has no pages.',
} as const

/** the text of a page that carries words: letters or digits drawn visibly */
const wordsOn = (c: PageContent) => c.chunks.reduce((n, k) => n + (k.text.match(/[\p{L}\p{N}]/gu)?.length ?? 0), 0)

// ─── shapes ──────────────────────────────────────────────────────────────────

const near = (a: number, b: number, e: number) => Math.abs(a - b) <= e
const bboxOf2 = (pts: Pt[]) => { const b = bboxOf(pts); return b }
/** two concentric round outlines: one ring, not two shapes */
const isRing = (sh: Shape) => sh.subpaths.length === 2 && !!sh.fill && sh.subpaths.every((s) => s.curves >= 4 && s.lines === 0)
function dedupe(pts: Pt[]): Pt[] {
  const out: Pt[] = []
  for (const p of pts) { const l = out[out.length - 1]; if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.05) out.push(p) }
  if (out.length > 1 && Math.hypot(out[0]![0] - out[out.length - 1]![0], out[0]![1] - out[out.length - 1]![1]) < 0.05) out.pop()
  return out
}
function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts
  const [ax, ay] = pts[0]!, [bx, by] = pts[pts.length - 1]!
  const len = Math.hypot(bx - ax, by - ay) || 1
  let idx = 0, best = 0
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((bx - ax) * (ay - pts[i]![1]) - (ax - pts[i]![0]) * (by - ay)) / len; if (d > best) { best = d; idx = i } }
  if (best <= eps) return [pts[0]!, pts[pts.length - 1]!]
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)]
}
const bboxOf = (pts: Pt[]) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y } return { x0, y0, x1, y1 } }

interface Ge { x: number; y: number; w: number; h: number; rot: number; shape: 'rect' | 'ellipse' | 'polygon' | 'ring' | 'line'; radius: number; points?: Pt[]; ringWidth?: number }
type Sub = Shape['subpaths'][number]

/** what a filled / stroked path is, in the editor's vocabulary: rectangle, rounded rectangle, ellipse, ring, line or polygon. null = not representable. */
function geometry(sh: Shape): Ge | null {
  const subs = sh.subpaths
  const main = [...subs].sort((a, b) => { const A = bboxOf(a.pts), B = bboxOf(b.pts); return (B.x1 - B.x0) * (B.y1 - B.y0) - (A.x1 - A.x0) * (A.y1 - A.y0) })[0]!
  const b = bboxOf(main.pts)
  const w = b.x1 - b.x0, h = b.y1 - b.y0
  const eps = Math.max(0.3, Math.min(w, h) * 0.004)
  const pts = dedupe(main.pts)
  // a straight line (stroke only)
  if (!sh.fill && sh.stroke && !main.closed && main.curves === 0 && pts.length === 2) {
    const [p, q] = pts as [Pt, Pt]
    const len = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (len < 0.5) return null
    const thick = Math.max(sh.lineWidth, 0.75)
    return { x: (p[0] + q[0]) / 2 - len / 2, y: (p[1] + q[1]) / 2 - thick / 2, w: len, h: thick, rot: (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI, shape: 'line', radius: 0 }
  }
  // two concentric round outlines filled with the even-odd rule: a ring
  if (subs.length === 2 && sh.fill && subs.every((s) => s.curves >= 4 && s.lines === 0)) {
    const [o, i] = [...subs].sort((a, c) => (bboxOf(c.pts).x1 - bboxOf(c.pts).x0) - (bboxOf(a.pts).x1 - bboxOf(a.pts).x0)) as [Sub, Sub]
    const ob = bboxOf(o.pts), ib = bboxOf(i.pts)
    if (near((ob.x0 + ob.x1) / 2, (ib.x0 + ib.x1) / 2, 1) && near((ob.y0 + ob.y1) / 2, (ib.y0 + ib.y1) / 2, 1) && near(ob.x1 - ob.x0, ob.y1 - ob.y0, 2)) {
      return { x: ob.x0, y: ob.y0, w: ob.x1 - ob.x0, h: ob.y1 - ob.y0, rot: 0, shape: 'ring', radius: 0, ringWidth: ((ob.x1 - ob.x0) - (ib.x1 - ib.x0)) / 2 }
    }
  }
  if (w < 0.3 && h < 0.3) return null
  if (main.curves === 0 && pts.length === 4) {
    const axis = [0, 1, 2, 3].every((k) => { const p = pts[k]!, q = pts[(k + 1) % 4]!; return near(p[0], q[0], eps) || near(p[1], q[1], eps) })
    if (axis) return { x: b.x0, y: b.y0, w, h, rot: 0, shape: 'rect', radius: 0 }
    const e0: Pt = [pts[1]![0] - pts[0]![0], pts[1]![1] - pts[0]![1]], e1: Pt = [pts[2]![0] - pts[1]![0], pts[2]![1] - pts[1]![1]], e2: Pt = [pts[3]![0] - pts[2]![0], pts[3]![1] - pts[2]![1]]
    const l0 = Math.hypot(...e0), l1 = Math.hypot(...e1)
    if (l0 > 0.5 && l1 > 0.5 && Math.abs(e0[0] * e1[0] + e0[1] * e1[1]) / (l0 * l1) < 0.03 && near(l0, Math.hypot(...e2), eps * 3)) {
      const cx = (pts[0]![0] + pts[2]![0]) / 2, cy = (pts[0]![1] + pts[2]![1]) / 2
      return { x: cx - l0 / 2, y: cy - l1 / 2, w: l0, h: l1, rot: (Math.atan2(e0[1], e0[0]) * 180) / Math.PI, shape: 'rect', radius: 0 }
    }
  }
  if (main.curves >= 4 && main.lines === 0) return { x: b.x0, y: b.y0, w, h, rot: 0, shape: 'ellipse', radius: 0 }
  if (main.curves >= 4 && main.lines >= 3 && main.lines <= 5) {
    // a rounded rectangle: the straight part of the top edge starts one radius in from the left
    const top = main.pts.filter((p) => near(p[1], b.y0, eps))
    const r = top.length ? Math.min(...top.map((p) => p[0])) - b.x0 : 0
    const rr = top.length ? Math.max(0, Math.min(r > 0.3 ? r : Math.min(...main.pts.filter((p) => near(p[0], b.x0, eps)).map((p) => p[1])) - b.y0, Math.min(w, h) / 2)) : 0
    return { x: b.x0, y: b.y0, w, h, rot: 0, shape: 'rect', radius: rr }
  }
  // anything else: its outline as a polygon, simplified to at most 64 corners
  if (!sh.fill) return null
  let simple = rdp(pts, Math.max(eps, Math.max(w, h) * 0.003))
  for (let t = 2; simple.length > 64 && t < 40; t *= 1.6) simple = rdp(pts, Math.max(w, h) * 0.003 * t)
  if (simple.length < 3 || simple.length > 64 || w < 0.5 || h < 0.5) return null
  return { x: b.x0, y: b.y0, w, h, rot: 0, shape: 'polygon', radius: 0, points: simple.map(([x, y]) => [clampN((x - b.x0) / w, -1, 2), clampN((y - b.y0) / h, -1, 2)] as Pt) }
}

// ─── pictures ────────────────────────────────────────────────────────────────

sharp.cache(false)
sharp.concurrency(1)

interface PicPlan { id: string; flipH: boolean; flipV: boolean; crop: { l: number; t: number; r: number; b: number } | null; outW: number; outH: number }
async function renderPicture(data: { width: number; height: number; channels: 1 | 3 | 4; data: Uint8Array }, plan: PicPlan): Promise<ExtractedPicture | null> {
  let pipe = sharp(data.data, { raw: { width: data.width, height: data.height, channels: data.channels }, limitInputPixels: IMPORT_LIMITS.maxSourcePixels })
  let cw = data.width, ch = data.height
  if (plan.flipV) pipe = pipe.flip()
  if (plan.flipH) pipe = pipe.flop()
  const c = plan.crop
  if (c && (c.l > 0.002 || c.t > 0.002 || c.r > 0.002 || c.b > 0.002)) {
    const l = Math.round(cw * c.l), t = Math.round(ch * c.t)
    const w = Math.max(1, Math.round(cw * (1 - c.l - c.r))), h = Math.max(1, Math.round(ch * (1 - c.t - c.b)))
    // the flips above apply first: sharp reorders extract before flip, so extract on a buffer of the flipped picture
    const flipped = await pipe.raw().toBuffer({ resolveWithObject: true })
    pipe = sharp(flipped.data, { raw: { width: flipped.info.width, height: flipped.info.height, channels: flipped.info.channels } }).extract({ left: Math.min(l, cw - 1), top: Math.min(t, ch - 1), width: Math.min(w, cw - l), height: Math.min(h, ch - t) })
    cw = Math.min(w, cw - l); ch = Math.min(h, ch - t)
  }
  const k = Math.min(1, cw / plan.outW, ch / plan.outH)
  const ow = clampN(Math.round(plan.outW * k), 8, IMPORT_LIMITS.maxImageSide), oh = clampN(Math.round(plan.outH * k), 8, IMPORT_LIMITS.maxImageSide)
  pipe = pipe.resize(ow, oh, { fit: 'fill', kernel: 'lanczos3' })
  const alpha = data.channels === 4 && (() => { for (let i = 3; i < data.data.length; i += 4 * 7) if (data.data[i]! < 250) return true; return false })()
  let out = alpha ? await pipe.clone().png({ compressionLevel: 9, effort: 4 }).toBuffer({ resolveWithObject: true }) : await pipe.clone().removeAlpha().jpeg({ quality: 86, mozjpeg: true }).toBuffer({ resolveWithObject: true })
  if (out.data.length > 6 * 1024 * 1024) out = alpha ? await pipe.clone().resize(Math.round(out.info.width * 0.6), Math.round(out.info.height * 0.6)).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true }) : await pipe.clone().removeAlpha().jpeg({ quality: 68, mozjpeg: true }).toBuffer({ resolveWithObject: true })
  if (out.data.length > 8 * 1024 * 1024) return null
  const ref = createHash('sha1').update(out.data).digest('hex').slice(0, 20)
  return { ref, bytes: new Uint8Array(out.data), mime: alpha ? 'image/png' : 'image/jpeg', width: out.info.width, height: out.info.height }
}

// ─── the page ────────────────────────────────────────────────────────────────

interface Built { n: number; emitted: Emitted[]; background: BgFill | null; warnings: Map<string, number> }
const MARK = /^(page\s*)?\d{1,3}(\s*(\/|of)\s*\d{1,3})?$/i

export async function parsePdfTemplate(bytes: Uint8Array, filename: string): Promise<ParsedTemplate> {
  const t0 = Date.now()
  const deadline = t0 + PDF_TIME_BUDGET_MS
  let pdf: Awaited<ReturnType<typeof openPdf>>
  try { pdf = await openPdf(bytes) } catch (e) {
    const name = (e as { name?: string })?.name ?? ''
    if (/Password/i.test(name)) throw new SourceError(PDF_MESSAGES.password)
    throw new SourceError(PDF_MESSAGES.damaged)
  }
  try {
    const total = pdf.numPages
    if (total < 1) throw new SourceError(PDF_MESSAGES.empty)
    if (total > PDF_MAX_PAGES_SCANNED) throw new SourceError(`That PDF has ${total} pages; a design is read from at most ${IMPORT_LIMITS.maxSlides}. Upload a shorter file.`)
    // first look at every page cheaply is not needed: read pages in order and stop at the limit of usable ones
    const pages: PageContent[] = []
    const skipped: { n: number; why: string }[] = []
    let first: { w: number; h: number } | null = null
    let beyond = 0
    let portraitSkips = 0
    for (let n = 1; n <= total; n++) {
      if (pages.length >= IMPORT_LIMITS.maxSlides) { beyond = total - n + 1; break }
      if (Date.now() > deadline) { beyond = total - n + 1; break }
      let c: PageContent
      try { c = await readPage(pdf, n, deadline) } catch { skipped.push({ n, why: 'could not be read' }); continue }
      const hasWords = wordsOn(c) > 0
      const covering = c.pictures.some((p) => coverageOf(p, c) >= 0.6)
      const meaningfulShapes = c.shapes.filter((s) => (s.box.x1 - s.box.x0) * (s.box.y1 - s.box.y0) < c.width * c.height * 0.97).length
      if (!hasWords && (covering || meaningfulShapes < 3)) { skipped.push({ n, why: covering ? 'is a picture without text' : 'is empty' }); continue }
      if (!first) {
        if (c.width / c.height < 0.85) throw new SourceError(PDF_MESSAGES.portrait)
        first = { w: c.width, h: c.height }
      } else if (c.width / c.height < 0.85) { portraitSkips++; skipped.push({ n, why: 'is a portrait page in a landscape deck' }); continue }
      pages.push(c)
    }
    if (!first || pages.length === 0) {
      if (skipped.length && skipped.every((s) => /picture|empty/.test(s.why))) throw new SourceError(PDF_MESSAGES.pictures)
      throw new SourceError(PDF_MESSAGES.pictures)
    }
    void portraitSkips
    const { aspect, fitted: fittedFirst } = aspectFor(first.w, first.h)
    const { width: W, height: H } = CANVAS[aspect]
    const k = Math.min(W / first.w, H / first.h)
    const offX = (W - first.w * k) / 2, offY = (H - first.h * k) / 2
    let sizeFitted = fittedFirst
    const deckNotes = new Set<string>()
    const pictures = new Map<string, ExtractedPicture>()
    let storedBytes = 0
    const failedPics = new Set<string>()
    const fontUse = new Map<string, { chars: number; maxSize: number; names: Set<string> }>()
    const fillArea = new Map<string, number>()
    const textColour = new Map<string, number>()
    const sizeChars = new Map<number, number>()
    const headVotes = new Map<string, number>()

    const built: Built[] = []
    for (const c of pages) {
      const warnings = new Map<string, number>()
      const warn = (m: string) => void warnings.set(m, (warnings.get(m) ?? 0) + 1)
      for (const note of c.notes) { if (note === 'stencil') deckNotes.add('stencil'); else warn(note) }
      // pages of another size are fitted (uniform scale, centred) to the deck's canvas
      const kp = Math.min(W / c.width, H / c.height)
      const same = Math.abs(c.width / c.height - first.w / first.h) < 0.02
      const sc = same ? k : kp
      const ox = same ? offX : (W - c.width * kp) / 2, oy = same ? offY : (H - c.height * kp) / 2
      if (!same) { sizeFitted = true; warn(`This page is a different size from the first page and was fitted to the ${aspect} canvas`) }
      const X = (v: number) => ox + v * sc, Y = (v: number) => oy + v * sc
      const emitted: { e: Emitted; order: number }[] = []
      let nid = 0
      const id = () => `e${++nid}`

      // pictures
      let bgImage: { ref: string } | null = null
      const covered = new Set<Placed>()
      for (const p of c.pictures) {
        const cov = coverageOf(p, c)
        const u = p.m
        const [a, b, cc, d, e, f] = u
        const wPt = Math.hypot(a, b), hPt = Math.hypot(cc, d)
        if (wPt < 1 || hPt < 1) continue
        const theta = (Math.atan2(b, a) * 180) / Math.PI
        const upright = Math.abs(b) < Math.abs(a) * 0.01 && Math.abs(cc) < Math.abs(d) * 0.01
        const expV: Pt = [Math.sin((theta * Math.PI) / 180) * hPt, -Math.cos((theta * Math.PI) / 180) * hPt]
        const flipV = (cc * expV[0] + d * expV[1]) < 0
        const flipH = false
        let cx = e + (a + cc) / 2, cy = f + (b + d) / 2
        let bw = wPt, bh = hPt
        let crop: PicPlan['crop'] = null
        if (upright && p.clip) {
          const x0 = Math.min(e, e + a), x1 = Math.max(e, e + a), y0 = Math.min(f, f + d), y1 = Math.max(f, f + d)
          const vx0 = Math.max(x0, p.clip.x0), vx1 = Math.min(x1, p.clip.x1), vy0 = Math.max(y0, p.clip.y0), vy1 = Math.min(y1, p.clip.y1)
          if (vx1 - vx0 < 1 || vy1 - vy0 < 1) continue
          if (vx0 > x0 + 0.5 || vx1 < x1 - 0.5 || vy0 > y0 + 0.5 || vy1 < y1 - 0.5) {
            crop = { l: (vx0 - x0) / (x1 - x0), t: (vy0 - y0) / (y1 - y0), r: (x1 - vx1) / (x1 - x0), b: (y1 - vy1) / (y1 - y0) }
            cx = (vx0 + vx1) / 2; cy = (vy0 + vy1) / 2; bw = vx1 - vx0; bh = vy1 - vy0
          }
        }
        const full = bw * bh >= c.width * c.height * 0.85
        // tiny pictures (a bullet image, a hairline) are kept: they are design
        if (bw * bh < 4) continue
        const dat = await pictureData(c.page, p.id)
        if (!dat) { warn('A picture could not be read and was left out'); continue }
        const plan: PicPlan = { id: p.id, flipH, flipV, crop, outW: Math.max(8, Math.round(bw * sc)), outH: Math.max(8, Math.round(bh * sc)) }
        let ex: ExtractedPicture | null = null
        try {
          if (Date.now() > deadline) throw new Error('time')
          ex = await renderPicture(dat, plan)
        } catch { ex = null }
        if (!ex) { warn('A picture could not be imported and was left out'); failedPics.add('could not be decoded'); continue }
        if (!pictures.has(ex.ref)) {
          if (pictures.size >= IMPORT_LIMITS.maxImages || storedBytes + ex.bytes.length > IMPORT_LIMITS.maxImageBytes) { warn('Some pictures were left out (the importer keeps at most 100 pictures)'); failedPics.add('more pictures than the importer keeps'); continue }
          pictures.set(ex.ref, ex); storedBytes += ex.bytes.length
        }
        if (full && cov >= 0.85 && p.alpha > 0.95 && !bgImage) { bgImage = { ref: ex.ref }; covered.add(p); continue }
        const el = {
          type: 'image' as const, id: id(), x: r1(X(cx) - (bw * sc) / 2 + 0), y: r1(Y(cy) - (bh * sc) / 2), width: Math.max(1, r1(bw * sc)), height: Math.max(1, r1(bh * sc)),
          rotation: r1(Math.abs(theta) < 0.3 ? 0 : theta > 180 ? theta - 360 : theta), locked: false, zIndex: 0, opacity: clampN(p.alpha, 0, 1), src: pendingSrc(ex.ref), alt: '', fit: 'cover' as const, clip: (p.clip?.ellipse && crop ? 'circle' : 'none') as 'circle' | 'none', radius: p.clip?.round && crop ? Math.min(400, r1(p.clip.round * sc)) : 0,
        } as SlideElement
        // the box was placed from centre-based numbers: X() maps points to canvas, centre moves the same way
        ;(el as { x: number }).x = r1(ox + cx * sc - (bw * sc) / 2); (el as { y: number }).y = r1(oy + cy * sc - (bh * sc) / 2)
        emitted.push({ order: p.order, e: { el, origin: 'slide', kind: 'picture', pic: { mediaKey: ex.ref, masked: !!(p.clip?.round || p.clip?.ellipse), shape: false } } })
      }
      // a picture that fills the page is the page's background: the slide's own background picture, not an element
      let bg: BgFill | null = bgImage ? { type: 'image', value: pendingSrc(bgImage.ref) } : null

      // shapes, in drawing order; the first ones that cover the page set its colour
      // text lines first: small dots and squares just left of a line are its list marker (many programs draw bullets as shapes, not as letters)
      const lines = toLines(c.chunks, c.width)
      const usedMarkers = markersFromShapes(lines, c.shapes)
      const bgOrder = bgImage ? c.pictures.find((p) => covered.has(p))!.order : -1
      const shapes: Shape[] = []
      for (const sh of [...c.shapes].sort((p, q) => p.order - q.order)) {
        if (sh.order < bgOrder) continue // drawn under the page's own picture: never seen
        if (usedMarkers.has(sh)) continue
        if (sh.subpaths.length > 1 && !isRing(sh)) for (const sub of sh.subpaths) { if (shapes.length < 6000) shapes.push({ ...sh, subpaths: [sub], box: bboxOf2(sub.pts) }) }
        else shapes.push(sh)
      }
      let leading = true
      const pageArea = c.width * c.height
      for (const sh of shapes) {
        const area = (sh.box.x1 - sh.box.x0) * (sh.box.y1 - sh.box.y0)
        if (leading && sh.fill && !sh.stroke && area >= pageArea * 0.97 && sh.alpha > 0.95 && !bgImage) {
          bg = sh.fill.grad ? { type: 'gradient', value: hexU(sh.fill.grad.from), gradient: { from: hexU(sh.fill.grad.from), to: hexU(sh.fill.grad.to), angle: sh.fill.grad.angle } } : { type: 'color', value: hexU(sh.fill.hex) }
          continue
        }
        // once something else is drawn, later page-sized fills are drawn as shapes
        if (!(sh.fill && area >= pageArea * 0.97)) leading = false
        const g = geometry(sh)
        if (!g) { warn('A complex drawing was left out'); continue }
        // a drawing cut by a clip (a picture's frame, a card's rounded corners): the part inside it is what is seen
        if (sh.clip && g.rot === 0 && (g.shape === 'rect' || g.shape === 'polygon' || g.shape === 'ellipse')) {
          const cl = sh.clip
          const x0 = Math.max(g.x, cl.x0), y0 = Math.max(g.y, cl.y0), x1 = Math.min(g.x + g.w, cl.x1), y1 = Math.min(g.y + g.h, cl.y1)
          if (x1 - x0 < 0.3 || y1 - y0 < 0.3) continue
          const cut = x0 > g.x + 0.5 || y0 > g.y + 0.5 || x1 < g.x + g.w - 0.5 || y1 < g.y + g.h - 0.5
          if (cut && g.shape === 'rect') { g.x = x0; g.y = y0; g.w = x1 - x0; g.h = y1 - y0; if (cl.round) g.radius = Math.max(g.radius, cl.round) }
          else if (cut && (g.shape === 'polygon' || g.shape === 'ellipse')) warn('A drawing cut by a frame is shown whole')
        }
        if (g.shape === 'polygon' && !sh.fill) continue
        const fill = sh.fill ? hexU(sh.fill.hex) : 'none'
        if (sh.fill) fillArea.set(fill, (fillArea.get(fill) ?? 0) + area)
        const gradient = sh.fill?.grad ? { from: hexU(sh.fill.grad.from), to: hexU(sh.fill.grad.to), angle: sh.fill.grad.angle } : undefined
        const sw = sh.stroke ? clampN(r1(sh.lineWidth * sc), 1, 80) : 0
        let el: Record<string, unknown>
        const boxPx = { x: r1(X(g.x)), y: r1(Y(g.y)), width: Math.max(1, r1(g.w * sc)), height: Math.max(1, r1(g.h * sc)), rotation: r1(g.rot), locked: false, zIndex: 0, opacity: clampN(sh.alpha, 0, 1) }
        if (g.shape === 'line') el = { type: 'shape', id: id(), ...boxPx, shape: 'rect', fill: hexU(sh.stroke!), radius: 0 }
        else if (g.shape === 'ring') el = { type: 'shape', id: id(), ...boxPx, shape: 'ring', fill: 'none', stroke: fill === 'none' ? '#000000' : fill, strokeWidth: clampN(r1((g.ringWidth ?? 4) * sc), 1, 80), radius: 0 }
        else el = { type: 'shape', id: id(), ...boxPx, shape: g.shape, fill, radius: g.shape === 'rect' ? r1(g.radius * sc) : 0, ...(gradient ? { gradient } : {}), ...(g.points ? { points: g.points } : {}), ...(sh.stroke && g.shape !== 'polygon' ? { stroke: hexU(sh.stroke), strokeWidth: sw } : {}) }
        if (g.shape === 'polygon' && sh.stroke) warn('Outlines on polygon shapes are not drawn')
        emitted.push({ order: sh.order, e: { el: el as SlideElement, origin: 'slide', kind: 'shape' } })
      }

      // text
      const boxes = toBoxes(toParagraphs(lines), c.width)
      for (const bx of boxes) {
        const t = textElement(bx, { sc, X, Y, c, id })
        if (!t) continue
        for (const l of bx.paras.flatMap((p) => p.lines)) {
          const fam = familyOf(l.fontName)
          const u = fontUse.get(fam) ?? { chars: 0, maxSize: 0, names: new Set<string>() }
          u.chars += l.text.length; u.maxSize = Math.max(u.maxSize, l.size); u.names.add(l.fontName); fontUse.set(fam, u)
          textColour.set(hexU(l.color), (textColour.get(hexU(l.color)) ?? 0) + l.text.length)
          const sz = Math.round(l.size); sizeChars.set(sz, (sizeChars.get(sz) ?? 0) + l.text.length)
        }
        emitted.push({ order: bx.order, e: t })
      }
      // the page's biggest text, in the top half, votes for the deck's heading font
      const top = boxes.filter((b) => b.angle === 0 && b.firstBaseline < c.height * 0.6).sort((a, b) => b.size - a.size)[0]
      if (top) { const fam = familyOf(top.fontName); headVotes.set(fam, (headVotes.get(fam) ?? 0) + 1) }
      if (c.chunks.length && !lines.length) warn('Some text could not be read')
      emitted.sort((p, q) => p.order - q.order)
      built.push({ n: c.n, emitted: emitted.map((x) => x.e), background: bg, warnings })
    }

    // page numbers: a number near the page edge on most pages is the deck's slide number: removed, drawn by the viewer instead
    let numberPages = 0
    const isMark = (e: Emitted) => e.kind === 'text' && !!e.text && MARK.test(e.text.plain.trim()) && (e.el.y < H * 0.09 || e.el.y > H * 0.86) && e.text.px <= 30
    for (const b of built) if (b.emitted.some(isMark)) numberPages++
    const numbered = built.length >= 2 && numberPages >= Math.max(2, Math.ceil(built.length * 0.5))
    if (numbered) for (const b of built) b.emitted = b.emitted.filter((e) => !isMark(e))

    // sizes and limits per page, z-order, validation
    const slides: TemplateSlide[] = []
    const forSlots: SlideForSlots[] = []
    let elementTotal = 0
    for (const b of built) {
      const warn = (m: string) => void b.warnings.set(m, (b.warnings.get(m) ?? 0) + 1)
      let list = b.emitted
      for (const e of list) if (e.el.type === 'image' && e.el.src) { const ref = pendingRef(e.el.src); if (ref && !pictures.has(ref)) delete (e.el as { src?: string }).src }
      list = validateElements(list, warn)
      if (list.length > IMPORT_LIMITS.maxElementsPerSlide) {
        const drop = list.length - IMPORT_LIMITS.maxElementsPerSlide
        const ranked = list.map((e) => ({ e, a: e.el.width * e.el.height })).filter((x) => x.e.kind === 'shape').sort((x, y) => x.a - y.a).slice(0, drop)
        const gone = new Set(ranked.map((x) => x.e))
        list = list.filter((e) => !gone.has(e)).slice(0, IMPORT_LIMITS.maxElementsPerSlide)
        warn(`The page had more than ${IMPORT_LIMITS.maxElementsPerSlide} objects; the smallest decoration was left out`)
      }
      // ids are re-numbered after filtering so they stay dense and stable
      list.forEach((e, i) => { e.el.zIndex = i + 1 })
      list = list.map((e, i) => { const nid = `e${i + 1}`; e.el.id = nid; return e })
      forSlots.push({ n: b.n, emitted: list, W, H })
      slides.push({ n: b.n, name: '', layoutName: `PDF page ${b.n}`, slide: { id: `slide-${b.n}`, layoutId: 'blank', locked: false, manual: true, ownLook: true, background: b.background ?? { type: 'color', value: '#FFFFFF' }, elements: list.map((e) => e.el), speakerNotes: '', sources: [], validation: { status: 'pending', issues: [] } } as Slide, slots: [], decor: [], pictures: [], warnings: [] })
      elementTotal += list.length
    }

    // the deck's design
    const bgOf = (b: BgFill | null) => (b?.type === 'color' || b?.type === 'gradient' ? hexU(b.value) : null)
    const bgVotes = new Map<string, number>()
    for (const b of built) { const h = bgOf(b.background); if (h) bgVotes.set(h, (bgVotes.get(h) ?? 0) + 1) }
    const firstBg = bgOf(built[0]!.background)
    const bgHex = firstBg ?? [...bgVotes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '#FFFFFF'
    const topColours = [...textColour].sort((a, b) => b[1] - a[1]).map(([h]) => h)
    const readable = (h: string) => Math.abs(luma(h) - luma(bgHex)) >= 0.35
    const textPrimary = topColours.find(readable) ?? (isDark(bgHex) ? '#FFFFFF' : '#111827')
    const secondText = topColours.find((h) => h !== textPrimary && readable(h) && sat(h) < 0.35 && Math.abs(luma(h) - luma(bgHex)) < Math.abs(luma(textPrimary) - luma(bgHex)) - 0.05)
    const fills = [...fillArea].filter(([h]) => h !== bgHex && Math.abs(luma(h) - luma(bgHex)) > 0.04).sort((a, b) => sat(b[0]) * Math.sqrt(b[1]) - sat(a[0]) * Math.sqrt(a[1])).map(([h]) => h)
    const accentText = topColours.find((h) => sat(h) > 0.45 && h !== textPrimary)
    const colourful = [...fills.filter((h) => sat(h) > 0.2), ...(accentText && !fills.includes(accentText) ? [accentText] : [])]
    const primary = colourful[0] ?? (isDark(bgHex) ? '#38BDF8' : '#2563EB')
    const secondary = colourful[1] ?? mix(primary, textPrimary, 0.4)
    const accent = colourful[2] ?? accentText ?? mix(primary, bgHex, 0.35)
    const surfaceCand = [...fillArea].filter(([h]) => h !== bgHex && Math.abs(luma(h) - luma(bgHex)) > 0.015 && Math.abs(luma(h) - luma(bgHex)) < 0.3 && sat(h) < 0.35).sort((a, b) => b[1] - a[1])[0]?.[0]
    const headingFam = [...headVotes].sort((a, b) => b[1] - a[1] || (fontUse.get(b[0])?.maxSize ?? 0) - (fontUse.get(a[0])?.maxSize ?? 0))[0]?.[0] ?? [...fontUse].sort((a, b) => b[1].maxSize - a[1].maxSize)[0]?.[0] ?? 'Arial'
    const bodyFam = [...fontUse].sort((a, b) => b[1].chars - a[1].chars)[0]?.[0] ?? headingFam
    const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 8)
    const name = filename.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 80) || 'Uploaded template'
    const heading = mapFont(headingFam), body = mapFont(bodyFam)
    const theme: Theme = {
      id: `uploaded-${hash}`, name, templateId: `upload:${hash}`,
      colors: { background: bgHex, surface: surfaceCand ?? mix(bgHex, textPrimary, 0.06), textPrimary, textSecondary: secondText ?? mix(textPrimary, bgHex, 0.38), primary, secondary, accent, onPrimary: isDark(primary) ? '#FFFFFF' : '#0F172A' },
      fonts: { heading: heading.mapped, body: body.mapped }, radius: 8, style: themeStyleSchema.parse({ footer: numbered ? 'number' : 'none' }),
    }
    // text elements take their role from the font they use: the viewer draws title / heading / subtitle roles in the heading font, the rest in the body font
    for (const [i, b] of built.entries()) {
      for (const e of b.emitted) if (e.el.type === 'text' && e.text) {
        const fm = mapFont(e.text.name || bodyFam).mapped
        const px = e.text.px
        const bodyPx = [...sizeChars].sort((p, q) => q[1] - p[1])[0]![0] * (e.el.fontSize / Math.max(1, e.text.px))
        void bodyPx
        const wantsHeading = fm === heading.mapped && heading.mapped !== body.mapped
        const bigRel = px >= medianBodyPx(forSlots) * 1.35
        e.el.role = bigRel && (wantsHeading || fm === heading.mapped) ? (isTopOfPage(e, forSlots[i]!) ? 'title' : 'heading') : wantsHeading ? 'heading' : px <= medianBodyPx(forSlots) * 0.82 ? 'caption' : 'body'
        e.text.name = ''
      }
    }

    // slots, chrome, pictures (the same rules as a .pptx)
    const repeated = repeatedText(forSlots)
    const pics = classifyPictures(forSlots)
    const chromePer: { n: number; ids: ReturnType<typeof classifySlide>['chromeIds'] }[] = []
    forSlots.forEach((fs, i) => {
      const cl = classifySlide(fs, repeated, pics.decorIds[i]!)
      const t = slides[i]!
      t.slots = cl.slots; t.decor = cl.decor; t.pictures = pics.placements[i]!
      const title = cl.slots.find((s) => s.role === 'title')
      t.name = (title?.sample.split('\n')[0] ?? '').slice(0, 80) || `Page ${t.n}`
      chromePer.push({ n: t.n, ids: cl.chromeIds })
      t.warnings = [...built[i]!.warnings].map(([m, n]) => (n > 1 ? `${m} (${n} times)` : m))
    })
    for (const t of slides) {
      const r = presentationSchema.safeParse({ schemaVersion: 1 as const, id: 'template-check', title: name, aspectRatio: aspect, language: 'en', theme, slides: [t.slide], sources: [] })
      if (!r.success) throw new SourceError('That PDF could not be converted into a valid template')
      t.slide = r.data.slides[0]!
    }

    const fonts: UploadedFont[] = []
    const seen = new Set<string>()
    for (const [fam, u] of [...fontUse].sort((a, b) => b[1].chars - a[1].chars)) {
      if (seen.has(fam)) continue; seen.add(fam)
      const m = mapFont(fam)
      fonts.push({ original: fam, mapped: m.mapped, replaced: m.replaced, role: fam === headingFam ? 'heading' : fam === bodyFam ? 'body' : 'other', uses: u.names.size ? Math.max(1, Math.round(u.chars / 20)) : 0 })
    }
    const warnings: string[] = []
    warnings.push('This design was read from a PDF: pages are rebuilt from what they draw, so text boxes, bullets and spacing are close to the original, not exact')
    if (sizeFitted) warnings.push(`The page size is not exactly ${aspect}; the pages were fitted to the ${aspect} canvas`)
    if (fonts.some((x) => x.replaced)) warnings.push(`Fonts replaced: ${fonts.filter((x) => x.replaced).map((x) => `${x.original} became ${x.mapped}`).join(', ')}`)
    if (skipped.length) {
      const pictureOnly = skipped.filter((s) => /picture|empty/.test(s.why)).map((s) => s.n)
      if (pictureOnly.length) warnings.push(`${pictureOnly.length} page${pictureOnly.length === 1 ? '' : 's'} (${listPages(pictureOnly)}) ${pictureOnly.length === 1 ? 'is' : 'are'} a picture or empty and ${pictureOnly.length === 1 ? 'was' : 'were'} left out: there is no text to keep`)
      const other = skipped.filter((s) => !/picture|empty/.test(s.why))
      if (other.length) warnings.push(`${other.length} page${other.length === 1 ? '' : 's'} (${listPages(other.map((s) => s.n))}) ${other[0]!.why} and ${other.length === 1 ? 'was' : 'were'} skipped`)
    }
    if (beyond) warnings.push(`Only the first ${built.length} pages were imported; ${beyond} more were skipped`)
    if (deckNotes.has('stencil')) warnings.push('Single-colour icons or shapes drawn as stencils are not kept')
    if (failedPics.size) warnings.push(`Some pictures could not be imported (${[...failedPics].join(', ')})`)
    if (numbered) warnings.push('Page numbers were removed from the pages; the viewer draws slide numbers instead')
    warnings.push('Links, annotations, form fields and bookmarks in the PDF are not imported')

    const template: UploadedTemplate = {
      name, source: { kind: 'pdf', filename: filename.slice(0, 200), bytes: bytes.length }, theme, aspect, canvas: { width: W, height: H, fitted: sizeFitted },
      slides, chrome: mergeChrome(chromePer), fonts, warnings,
      stats: { sourceSlides: total, importedSlides: slides.length, skippedSlides: total - slides.length, hiddenSlides: 0, masters: 0, elements: elementTotal, pictures: pictures.size, storedAssets: 0 },
    }
    return { template, pictures: [...pictures.values()] }
  } finally {
    void pdf.loadingTask.destroy().catch(() => undefined)
  }
}

/** a dot or small square left of a text line, level with its first letters, is that line's bullet: the line gets the marker and the shape is not drawn */
function markersFromShapes(lines: Line[], shapes: Shape[]): Set<Shape> {
  const used = new Set<Shape>()
  const small = shapes.filter((sh) => sh.fill && !sh.stroke && sh.alpha > 0.3)
  for (const l of lines) {
    if (l.marker || l.angle !== 0) continue
    for (const sh of small) {
      if (used.has(sh)) continue
      const w = sh.box.x1 - sh.box.x0, h = sh.box.y1 - sh.box.y0
      if (w < l.size * 0.12 || w > l.size * 0.75 || h < l.size * 0.12 || h > l.size * 0.75 || Math.abs(w - h) > Math.max(w, h) * 0.35) continue
      const cx = (sh.box.x0 + sh.box.x1) / 2, cy = (sh.box.y0 + sh.box.y1) / 2
      if (cx > l.x - l.size * 0.15 || cx < l.x - l.size * 3.2) continue
      if (Math.abs(cy - (l.y - l.size * 0.3)) > l.size * 0.45) continue
      const round = sh.subpaths.length === 1 && sh.subpaths[0]!.curves >= 4
      l.marker = { glyph: round ? '•' : '▪', x: sh.box.x0, kind: 'bullet', font: '' }
      used.add(sh)
      break
    }
  }
  return used
}
const listPages = (ns: number[]) => (ns.length > 6 ? `${ns.slice(0, 6).join(', ')} and more` : ns.join(', '))
function coverageOf(p: Placed, c: PageContent): number {
  const w = Math.hypot(p.m[0], p.m[1]), h = Math.hypot(p.m[2], p.m[3])
  let area = w * h
  if (p.clip) area = Math.min(area, Math.max(0, p.clip.x1 - p.clip.x0) * Math.max(0, p.clip.y1 - p.clip.y0))
  return Math.min(1, area / (c.width * c.height))
}
function validateElements(els: Emitted[], warn: (m: string) => void): Emitted[] {
  const out: Emitted[] = []
  for (const e of els) {
    const el = e.el as unknown as Record<string, unknown>
    for (const key of ['x', 'y', 'width', 'height', 'rotation', 'opacity']) if (typeof el[key] !== 'number' || !Number.isFinite(el[key] as number)) el[key] = key === 'opacity' ? 1 : key === 'width' || key === 'height' ? 1 : 0
    el['opacity'] = clampN(el['opacity'] as number, 0, 1)
    if (el['type'] === 'text') el['fontSize'] = clampN(el['fontSize'] as number, 4, 600)
    const parsed = elementSchema.safeParse(el)
    if (parsed.success) { e.el = parsed.data; out.push(e) } else warn('An element could not be represented and was left out')
  }
  return out.filter((e) => {
    // off the page entirely
    return true && e.el.width > 0
  })
}
function medianBodyPx(slides: SlideForSlots[]): number {
  const all: { px: number; n: number }[] = []
  for (const s of slides) for (const e of s.emitted) if (e.kind === 'text' && e.text) all.push({ px: e.text.px, n: e.text.plain.length })
  all.sort((a, b) => a.px - b.px)
  const total = all.reduce((n, x) => n + x.n, 0)
  let acc = 0
  for (const x of all) { acc += x.n; if (acc >= total / 2) return x.px }
  return 24
}
function isTopOfPage(e: Emitted, s: SlideForSlots): boolean {
  const mine = e.text!.px
  const biggest = Math.max(...s.emitted.filter((x) => x.kind === 'text' && x.text).map((x) => x.text!.px))
  return mine >= biggest - 0.5 && e.el.y < s.H * 0.55
}

// ─── text boxes -> elements ─────────────────────────────────────────────────

function textElement(bx: TextBox, o: { sc: number; X: (v: number) => number; Y: (v: number) => number; c: PageContent; id: () => string }): Emitted | null {
  const { sc, X, Y } = o
  const lines = bx.paras.flatMap((p) => p.lines)
  const size = bx.size
  const px = r1(size * sc)
  if (px < 4) return null
  const listed = bx.list !== null
  const multiPitch = bx.paras.flatMap((p) => (p.lines.length >= 2 ? p.lines.slice(1).map((l, i) => l.y - p.lines[i]!.y) : []))
  const L = clampN(multiPitch.length ? [...multiPitch].sort((a, b) => a - b)[multiPitch.length >> 1]! / size : 1.2, 0.9, 1.9)
  const gapPitch = bx.paras.slice(1).map((p, i) => p.lines[0]!.y - bx.paras[i]!.lines[bx.paras[i]!.lines.length - 1]!.y)
  const paraGap = gapPitch.length ? clampN(([...gapPitch].sort((a, b) => a - b)[gapPitch.length >> 1]! - L * size) / size, 0, 2) : undefined
  // the words: one paragraph per PDF paragraph; bold / italic / colour changes inside become runs
  const mixedWeight = lines.some((l) => l.segs.some((s) => s.bold !== bx.bold))
  const boxColour = hexU(bx.color)
  const paragraphs = bx.paras.map((p) => {
    const runs: { text: string; bold?: boolean; italic?: boolean; color?: string }[] = []
    p.lines.forEach((l, li) => {
      const segs = l.segs.map((s) => ({ ...s }))
      if (li > 0 && segs[0]) segs[0].text = ' ' + segs[0].text
      for (const s of segs) {
        const col = hexU(s.color)
        const run = { text: s.text.replace(/[ \t]+/g, ' '), ...(mixedWeight && s.bold ? { bold: true } : {}), ...(s.italic && !bx.italic ? { italic: true } : {}), ...(col !== boxColour ? { color: col } : {}) }
        const last = runs[runs.length - 1]
        if (last && !!last.bold === !!run.bold && !!last.italic === !!run.italic && last.color === run.color) last.text += run.text
        else runs.push(run)
      }
    })
    const first = runs[0]; if (first) first.text = first.text.replace(/^\s+/, '')
    const last = runs[runs.length - 1]; if (last) last.text = last.text.replace(/\s+$/, '')
    const kept = runs.filter((r) => r.text.length > 0)
    return { runs: kept, listed: !!p.lines[0]!.marker, num: p.lines[0]!.marker?.kind === 'number' }
  }).filter((p) => p.runs.length > 0)
  if (paragraphs.length === 0) return null
  if (!/[\p{L}\p{N}]/u.test(paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(''))) { /* symbols only: still a text (an arrow, a dash) */ }
  const maxW = Math.max(...lines.map((l) => l.w))
  const multi = lines.length > 1 && bx.paras.some((p) => p.lines.length > 1)
  const slack = multi ? maxW * 0.06 + size * 0.3 : maxW * 0.12 + size * 0.5
  const pad = listed ? size * 0.9 : 0
  const wPt = maxW + slack + pad
  let xPt: number
  if (bx.align === 'center') xPt = bx.left + (bx.right - bx.left) / 2 - wPt / 2
  else if (bx.align === 'right') xPt = bx.right - wPt
  else xPt = bx.left - pad
  const turned = Math.abs(bx.angle) >= 1.5
  const topPt = bx.firstBaseline - (L * size) / 2 - 0.36 * size
  const hPt = bx.lastBaseline - bx.firstBaseline + L * size
  let el: Record<string, unknown>
  const rot = turned ? (bx.angle > 180 ? bx.angle - 360 : bx.angle) : 0
  const weight = clampN(mixedWeight ? weightOf(bx.fontName, false) : weightOf(bx.fontName, bx.bold), 300, 900)
  let bxPx = { x: r1(X(xPt)), y: r1(Y(topPt)), width: Math.max(1, r1(wPt * sc)), height: Math.max(1, r1(hPt * sc)) }
  if (turned) {
    // turned text: the box turns about the start of its first line
    const l0 = lines[0]!
    const th = (l0.angle * Math.PI) / 180
    const dx = Math.cos(th), dy = Math.sin(th), nx = -Math.sin(th), ny = Math.cos(th)
    const u = bx.align === 'center' ? l0.w / 2 : bx.align === 'right' ? l0.w - wPt / 2 : wPt / 2 - pad
    const cx = l0.x + dx * u - nx * 0.36 * size, cy = l0.y + dy * u - ny * 0.36 * size
    bxPx = { x: r1(X(cx) - (wPt * sc) / 2), y: r1(Y(cy) - (L * size * sc) / 2), width: Math.max(1, r1(wPt * sc)), height: Math.max(1, r1(L * size * sc)) }
  }
  el = {
    type: 'text', id: o.id(), ...bxPx, rotation: r1(rot), locked: false, zIndex: 0, opacity: clampN(bx.alpha, 0, 1), role: 'body', fontSize: px, align: bx.align, color: boxColour, valign: 'top',
    bullet: bulletOf(bx.bulletGlyph, bx.paras[0]?.lines[0]?.marker?.font ?? ''), weight, lineHeight: r1(L * 100) / 100, ...(bx.spacing > 0.2 ? { letterSpacing: clampN(r1(bx.spacing * sc), 0, 30) } : {}), ...(paraGap !== undefined ? { paraGap: r1(paraGap * 100) / 100 } : {}),
    ...(bx.italic && !mixedWeight ? {} : {}),
    paragraphs: paragraphs.map((p) => ({ runs: p.runs, ...(p.listed ? { list: p.num ? 'number' : 'bullet' } : {}) })),
  }
  if (bx.italic) for (const p of el['paragraphs'] as { runs: { italic?: boolean }[] }[]) for (const r of p.runs) r.italic = true
  const plain = paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n')
  const fam = familyOf(bx.fontName)
  const heavy = weight >= 700
  const caps = /\p{L}/u.test(plain) && plain === plain.toUpperCase()
  const meta = { plain, paras: paragraphs.map((p) => ({ runs: p.runs })) as never, px, heavy, caps, list: paragraphs.filter((p) => p.listed).length, shapeBound: false, name: fam, boxW: bxPx.width, boxH: bxPx.height, lineFactor: L }
  return { el: el as unknown as SlideElement, origin: 'slide', kind: 'text', text: meta }
}

function bulletOf(glyph: string, font: string): 'bullet' extends never ? never : '•' | '–' | '▪' | '✓' | '→' | '●' {
  const g = glyph.trim()
  if (/wingdings|symbol|webdings/i.test(font)) return g === '' || /[§▪■]/.test(g) ? '▪' : /[ü✓✔]/.test(g) ? '✓' : /[Ø→➢➤]/.test(g) ? '→' : '•'
  if (/^[–—-]$/.test(g)) return '–'
  if (/^[▪■▫□◆◇]$/.test(g)) return '▪'
  if (/^[✓✔]$/.test(g)) return '✓'
  if (/^[→➢➤➔▶►]$/.test(g)) return '→'
  if (/^[●○]$/.test(g)) return '●'
  return '•'
}

export type { Chunk, Line }
export type { AspectRatio }
