import { getDocumentProxy, getResolvedPDFJS } from 'unpdf'
type PDFDocumentProxy = Awaited<ReturnType<typeof getDocumentProxy>>
type PDFPageProxy = Awaited<ReturnType<PDFDocumentProxy['getPage']>>

/**
 * The PDF page "interpreter" of the PDF template reader (docs/TEMPLATE_FROM_FILE.md, "PDF"). It runs pdf.js's operator list of one page and reports what is drawn, in points on the
 * page as a person sees it (y down, rotation applied): text pieces with their position, size, colour and font, filled / stroked shapes, and pictures with their placement. No layout
 * decisions are made here (that is pdf-layout.ts) and nothing is rendered: nothing draws pixels, so a page costs milliseconds, not a canvas.
 *
 * Bounded on purpose: operator count, path points, pictures per page and wall-clock time are capped, so a hostile or huge page ends early with a note instead of holding the worker.
 */

export type M6 = [number, number, number, number, number, number]
export const IDENTITY: M6 = [1, 0, 0, 1, 0, 0]
export const multiply = (m1: M6, m2: M6): M6 => [
  m1[0] * m2[0] + m1[1] * m2[2], m1[0] * m2[1] + m1[1] * m2[3],
  m1[2] * m2[0] + m1[3] * m2[2], m1[2] * m2[1] + m1[3] * m2[3],
  m1[4] * m2[0] + m1[5] * m2[2] + m2[4], m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
]
export const applyM = (m: M6, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

export type Pt = [number, number]
export interface GradientPaint { from: string; to: string; angle: number }
export type Paint = { hex: string; grad?: GradientPaint }

/** a run of text drawn by one show-text operator */
export interface Chunk {
  text: string
  /** where the first letter's baseline starts, and the advance along the baseline (pt) */
  x: number
  y: number
  w: number
  /** font size on the page (pt) and rotation of the baseline in degrees clockwise */
  size: number
  angle: number
  color: string
  alpha: number
  /** pdf.js's id of the font, and what is known about it */
  font: string
  fontName: string
  bold: boolean
  italic: boolean
  mono: boolean
  serif: boolean
  /** drawn after this many other operators: z-order across text, shapes and pictures */
  order: number
}

export interface Shape {
  /** corner points of the outline in page space; `curved` marks that the outline had curves (the points are a flattened version) */
  subpaths: { pts: Pt[]; closed: boolean; curves: number; lines: number }[]
  fill: Paint | null
  stroke: string | null
  lineWidth: number
  alpha: number
  /** the path's own bounding box in page space */
  box: { x0: number; y0: number; x1: number; y1: number }
  order: number
  /** a shading fill (gradient) painted into this region */
  shading?: boolean
  /** the visible part when the shape was drawn */
  clip?: Clip | null
}

export interface Clip { x0: number; y0: number; x1: number; y1: number; round?: number; ellipse?: boolean }
export interface Placed {
  /** pdf.js object id of the picture and its pixel size */
  id: string
  pw: number
  ph: number
  /** the picture's matrix: unit square -> page space */
  m: M6
  /** the visible part (clip), page space, or null; `round` = corner radius (pt) of a rounded clip, `ellipse` = a round clip */
  clip: Clip | null
  alpha: number
  order: number
  /** a one-colour stencil (icon mask, glyph shape): not kept */
  mask: boolean
}

export interface PageContent {
  n: number
  width: number
  height: number
  chunks: Chunk[]
  shapes: Shape[]
  pictures: Placed[]
  /** bits that could not be read / were left out, as short facts (deduplicated by the caller) */
  notes: Set<string>
  ops: number
  page: PDFPageProxy
}

export const PDF_LIMITS = { maxOps: 600_000, maxPathPoints: 4000, maxShapes: 6000, maxChunks: 8000, maxPictures: 120, maxImagePixels: 36_000_000 } as const

const hexOf = (v: unknown): string | null => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null)

interface FontFacts { name: string; bold: boolean; italic: boolean; mono: boolean; serif: boolean; fm: number }
const fontCache = new WeakMap<PDFPageProxy, Map<string, Promise<FontFacts>>>()
function fontFacts(page: PDFPageProxy, id: string): Promise<FontFacts> {
  let m = fontCache.get(page)
  if (!m) { m = new Map(); fontCache.set(page, m) }
  let p = m.get(id)
  if (!p) {
    p = new Promise<FontFacts>((resolve) => {
      const done = (f: Record<string, unknown> | undefined) => {
        const fm = Array.isArray(f?.['fontMatrix']) ? Number((f!['fontMatrix'] as number[])[0]) : 0.001
        resolve({ name: String(f?.['name'] ?? ''), bold: !!f?.['bold'] || /bold|black|heavy/i.test(String(f?.['name'] ?? '')), italic: !!f?.['italic'] || /italic|oblique/i.test(String(f?.['name'] ?? '')), mono: !!f?.['isMonospace'], serif: !!f?.['isSerifFont'], fm: Number.isFinite(fm) && fm !== 0 ? fm : 0.001 })
      }
      const t = setTimeout(() => done(undefined), 2500)
      try {
        const objs = page.commonObjs as unknown as { has: (k: string) => boolean; get: (k: string, cb?: (v: unknown) => void) => unknown }
        if (objs.has(id)) { clearTimeout(t); done(objs.get(id) as Record<string, unknown>) } else objs.get(id, (v) => { clearTimeout(t); done(v as Record<string, unknown>) })
      } catch { clearTimeout(t); done(undefined) }
    })
    m.set(id, p)
  }
  return p
}

/** a bright-to-dark ramp of a pdf.js gradient description (axial / radial): first and last colour and the angle */
function gradientOf(ir: unknown, m: M6): GradientPaint | null {
  try {
    const a = ir as unknown[]
    if (!Array.isArray(a) || a[0] !== 'RadialAxial') return null
    const stops = a[3] as [number, string][]
    const from = hexOf(stops?.[0]?.[1]), to = hexOf(stops?.[stops.length - 1]?.[1])
    if (!from || !to) return null
    const p0 = a[4] as number[], p1 = a[5] as number[]
    let angle = 180
    if (a[1] === 'axial' && p0 && p1) {
      const [x0, y0] = applyM(m, p0[0]!, p0[1]!), [x1, y1] = applyM(m, p1[0]!, p1[1]!)
      angle = Math.round((((Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI + 90) % 360 + 360) % 360)
    }
    return { from, to, angle }
  } catch { return null }
}

type PathCmds = Float32Array | number[]
/** the drawing commands pdf.js merged into a path (0 move, 1 line, 2 cubic, 3 quadratic, 4 close) as flattened sub-paths in page space */
export function readPath(data: PathCmds, m: M6, maxPoints: number): Shape['subpaths'] | null {
  const out: Shape['subpaths'] = []
  let cur: Shape['subpaths'][number] | null = null
  let last: Pt = [0, 0]
  let points = 0
  const push = (p: Pt) => { cur!.pts.push(p); last = p; points++ }
  for (let i = 0; i < data.length;) {
    const op = data[i++]!
    if (points > maxPoints) return null
    if (op === 0) { cur = { pts: [], closed: false, curves: 0, lines: 0 }; out.push(cur); push(applyM(m, data[i]!, data[i + 1]!)); i += 2 }
    else if (op === 1) { if (!cur) { cur = { pts: [], closed: false, curves: 0, lines: 0 }; out.push(cur) } push(applyM(m, data[i]!, data[i + 1]!)); cur.lines++; i += 2 }
    else if (op === 2 || op === 3) {
      if (!cur) { cur = { pts: [], closed: false, curves: 0, lines: 0 }; out.push(cur); last = [0, 0] }
      const c = op === 2 ? 3 : 2
      const ps: Pt[] = []
      for (let k = 0; k < c; k++) ps.push(applyM(m, data[i + k * 2]!, data[i + k * 2 + 1]!))
      i += c * 2
      const p0 = last
      const bez = (t: number): Pt => {
        const u = 1 - t
        if (c === 3) return [u * u * u * p0[0] + 3 * u * u * t * ps[0]![0] + 3 * u * t * t * ps[1]![0] + t * t * t * ps[2]![0], u * u * u * p0[1] + 3 * u * u * t * ps[0]![1] + 3 * u * t * t * ps[1]![1] + t * t * t * ps[2]![1]]
        return [u * u * p0[0] + 2 * u * t * ps[0]![0] + t * t * ps[1]![0], u * u * p0[1] + 2 * u * t * ps[0]![1] + t * t * ps[1]![1]]
      }
      for (const t of [0.25, 0.5, 0.75]) cur.pts.push(bez(t))
      cur.curves++
      push(ps[c - 1]!)
    } else if (op === 4) { if (cur) cur.closed = true }
    else return null // an unknown command: the path is not read
  }
  return out.filter((s) => s.pts.length >= 2)
}

/** a closed outline of one round shape: four curves and nothing else (an ellipse), or four curves joined by straight sides (a rounded rectangle, with its radius) */
export function roundness(sub: Shape['subpaths'][number], b: { x0: number; y0: number; x1: number; y1: number }): { ellipse?: true; r?: number } | null {
  const eps = Math.max(0.3, Math.min(b.x1 - b.x0, b.y1 - b.y0) * 0.004)
  if (sub.curves >= 4 && sub.lines === 0) return { ellipse: true }
  if (sub.curves >= 4 && sub.lines >= 3 && sub.lines <= 5) {
    const top = sub.pts.filter((p) => Math.abs(p[1] - b.y0) <= eps)
    const r = top.length ? Math.min(...top.map((p) => p[0])) - b.x0 : 0
    const left = sub.pts.filter((p) => Math.abs(p[0] - b.x0) <= eps)
    const r2 = left.length ? Math.min(...left.map((p) => p[1])) - b.y0 : 0
    const rad = Math.max(r > 0.3 ? r : 0, r2 > 0.3 ? r2 : 0)
    return rad > 0.3 ? { r: Math.min(rad, Math.min(b.x1 - b.x0, b.y1 - b.y0) / 2) } : null
  }
  return null
}

const boxOf = (subs: Shape['subpaths']) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const s of subs) for (const [x, y] of s.pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  return { x0, y0, x1, y1 }
}

export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  return getDocumentProxy(new Uint8Array(bytes), { isEvalSupported: false, useSystemFonts: false, disableFontFace: true, maxImageSize: PDF_LIMITS.maxImagePixels, verbosity: 0, stopAtErrors: false } as never)
}

/** Reads one page. `deadline`: epoch ms after which the page stops being read (what was read so far is returned, with a note). */
export async function readPage(pdf: PDFDocumentProxy, n: number, deadline: number): Promise<PageContent> {
  const pdfjs = (await getResolvedPDFJS()) as unknown as { OPS: Record<string, number> }
  const OPS = pdfjs.OPS
  const page = await pdf.getPage(n)
  const vp = page.getViewport({ scale: 1 })
  const base = vp.transform as unknown as M6
  const content: PageContent = { n, width: vp.width, height: vp.height, chunks: [], shapes: [], pictures: [], notes: new Set(), ops: 0, page }
  const ol = await page.getOperatorList()
  const fn = ol.fnArray, args = ol.argsArray
  content.ops = fn.length
  if (fn.length > PDF_LIMITS.maxOps) { content.notes.add('The page is drawn with a very large number of operations; only the first part was read'); }

  // graphics state
  let ctm: M6 = base
  const stack: { ctm: M6; fill: Paint; stroke: string; lineWidth: number; alpha: number; clip: Placed['clip'] }[] = []
  const groups: boolean[] = []
  let masked = 0
  let softMask = false
  let fill: Paint = { hex: '#000000' }
  let stroke = '#000000'
  let lineWidth = 1
  let alpha = 1
  let clip: Placed['clip'] = null
  let pendingClip = false
  // text state
  let tm: M6 = IDENTITY, tlm: M6 = IDENTITY
  let tx = 0
  let fontId = '', fontSize = 1, charSp = 0, wordSp = 0, hScale = 1, leading = 0, rise = 0, renderMode = 0
  let facts: FontFacts = { name: '', bold: false, italic: false, mono: false, serif: false, fm: 0.001 }
  let order = 0

  const showGlyphs = async (glyphs: unknown) => {
    if (!Array.isArray(glyphs) || renderMode === 3 || renderMode === 7) { advanceOnly(glyphs); return }
    if (content.chunks.length >= PDF_LIMITS.maxChunks) { content.notes.add('The page has more text pieces than are read; the rest was left out'); advanceOnly(glyphs); return }
    const full = multiply(tm, ctm)
    let text = ''
    let x = tx
    const x0 = x
    for (const g of glyphs as (number | { unicode?: string; width?: number; isSpace?: boolean })[]) {
      if (typeof g === 'number') { x += (-g * fontSize * hScale) / 1000; continue }
      let u = g.unicode ?? ''
      if (u === ' ') u = ' '
      // ligatures and private-use letters: the plain letters are what a person reads
      if (u.length === 1 && u >= 'ﬀ' && u <= 'ﬆ') u = u.normalize('NFKC')
      if (/[\u0000-\u0008\u000b-\u001f�]/.test(u)) u = ''
      text += u
      const w = typeof g.width === 'number' ? g.width : 0
      x += (w * fontSize * facts.fm + charSp + (g.isSpace || u === ' ' ? wordSp : 0)) * hScale
    }
    const advance = x - x0
    const [px, py] = applyM(full, x0, rise)
    const sx = Math.hypot(full[0], full[1]), sy = Math.hypot(full[2], full[3])
    const size = fontSize * sy
    if (text.trim().length > 0 && size > 0.5 && Number.isFinite(px) && Number.isFinite(py)) {
      content.chunks.push({
        text, x: px, y: py, w: Math.abs(advance) * sx, size, angle: (Math.atan2(full[1], full[0]) * 180) / Math.PI, color: fill.hex, alpha,
        font: fontId, fontName: facts.name, bold: facts.bold, italic: facts.italic, mono: facts.mono, serif: facts.serif, order: order++,
      })
    }
    tx = x
  }
  const advanceOnly = (glyphs: unknown) => {
    if (!Array.isArray(glyphs)) return
    let x = tx
    for (const g of glyphs as (number | { width?: number; isSpace?: boolean; unicode?: string })[]) {
      if (typeof g === 'number') { x += (-g * fontSize * hScale) / 1000; continue }
      x += ((typeof g.width === 'number' ? g.width : 0) * fontSize * facts.fm + charSp + (g.isSpace ? wordSp : 0)) * hScale
    }
    tx = x
  }
  const moveText = (dx: number, dy: number) => { tlm = multiply([1, 0, 0, 1, dx, dy], tlm); tm = tlm; tx = 0 }

  const addPath = (op: number, data: PathCmds) => {
    const clipOnly = op === OPS['endPath']
    const subs = readPath(data, ctm, PDF_LIMITS.maxPathPoints)
    if (pendingClip) {
      pendingClip = false
      if (subs && subs.length === 1) {
        const b = boxOf(subs)
        const sub = subs[0]!
        const w = b.x1 - b.x0, h = b.y1 - b.y0
        const round = roundness(sub, b)
        const next: Clip = { ...b, ...(round?.ellipse ? { ellipse: true } : {}), ...(round?.r ? { round: round.r } : {}) }
        const straight = sub.curves === 0 && sub.pts.length <= 6
        if ((straight || round) && w * h < content.width * content.height * 0.99) {
          clip = clip ? { x0: Math.max(clip.x0, b.x0), y0: Math.max(clip.y0, b.y0), x1: Math.min(clip.x1, b.x1), y1: Math.min(clip.y1, b.y1), ...(round?.ellipse ? { ellipse: true } : {}), ...(round?.r ? { round: round.r } : clip.round ? { round: clip.round } : {}) } : next
        }
      }
    }
    if (clipOnly) return
    const painted = op === OPS['fill'] || op === OPS['eoFill'] || op === OPS['fillStroke'] || op === OPS['eoFillStroke'] || op === OPS['closeFillStroke'] || op === OPS['closeEOFillStroke']
    const stroked = op === OPS['stroke'] || op === OPS['closeStroke'] || op === OPS['fillStroke'] || op === OPS['eoFillStroke'] || op === OPS['closeFillStroke'] || op === OPS['closeEOFillStroke']
    if (!subs) { content.notes.add('A very detailed drawing was left out'); return }
    if (!painted && !stroked) return
    if (masked > 0 || softMask) { content.notes.add('A soft shadow or fade was not kept'); return }
    if (content.shapes.length >= PDF_LIMITS.maxShapes) { content.notes.add('The page has more drawn shapes than are read'); return }
    const box = boxOf(subs)
    if (!Number.isFinite(box.x0)) return
    const sc = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]))
    content.shapes.push({ subpaths: subs, fill: painted ? fill : null, stroke: stroked ? stroke : null, lineWidth: lineWidth * sc, alpha, box, order: order++, clip })
  }

  const limit = Math.min(fn.length, PDF_LIMITS.maxOps)
  for (let i = 0; i < limit; i++) {
    if ((i & 1023) === 0 && Date.now() > deadline) { content.notes.add('The page took too long to read; the rest was left out'); break }
    const f = fn[i]!, a = args[i] as unknown[] | null
    switch (f) {
      case OPS['save']: stack.push({ ctm, fill, stroke, lineWidth, alpha, clip }); break
      case OPS['restore']: { const s = stack.pop(); if (s) { ctm = s.ctm; fill = s.fill; stroke = s.stroke; lineWidth = s.lineWidth; alpha = s.alpha; clip = s.clip } break }
      case OPS['transform']: if (a) ctm = multiply(a as unknown as M6, ctm); break
      case OPS['paintFormXObjectBegin']: stack.push({ ctm, fill, stroke, lineWidth, alpha, clip }); if (a?.[0]) ctm = multiply(a[0] as M6, ctm); break
      case OPS['paintFormXObjectEnd']: { const s = stack.pop(); if (s) { ctm = s.ctm; fill = s.fill; stroke = s.stroke; lineWidth = s.lineWidth; alpha = s.alpha; clip = s.clip } break }
      case OPS['setLineWidth']: lineWidth = Number(a?.[0] ?? 1); break
      case OPS['beginGroup']: { const m = !!(a?.[0] as { smask?: unknown } | undefined)?.smask; groups.push(m); if (m) masked++; break }
      case OPS['endGroup']: { if (groups.pop()) masked = Math.max(0, masked - 1); break }
      case OPS['setGState']: {
        for (const kv of (a?.[0] as [string, unknown][] | undefined) ?? []) { if (kv[0] === 'SMask') softMask = kv[1] === true }
        for (const kv of (a?.[0] as [string, unknown][] | undefined) ?? []) { if (kv[0] === 'ca' && typeof kv[1] === 'number') alpha = Math.min(1, Math.max(0, kv[1])); else if (kv[0] === 'LW' && typeof kv[1] === 'number') lineWidth = kv[1] }
        break
      }
      case OPS['setFillRGBColor']: fill = { hex: hexOf(a?.[0]) ?? '#000000' }; break
      case OPS['setStrokeRGBColor']: stroke = hexOf(a?.[0]) ?? '#000000'; break
      case OPS['setFillColorN']: case OPS['setFillColor']: {
        let g = gradientOf(a, ctm)
        // a gradient the page names: pdf.js keeps its description as an object of the page; its matrix takes pattern space to page space
        if (!g && a && a[0] === 'Shading' && typeof a[1] === 'string') { const ir = await objectOf(page, a[1]); g = ir ? gradientOf(ir, multiply((Array.isArray(a[2]) ? (a[2] as M6) : IDENTITY), base)) : null }
        if (g) fill = { hex: g.from, grad: g }
        else if (a && hexOf(a[0])) fill = { hex: hexOf(a[0])! }
        else if (a && String(a[0]) === 'TilingPattern') { fill = { hex: '#808080' }; content.notes.add('A pattern fill was drawn as a plain colour') }
        break
      }
      case OPS['setStrokeColorN']: case OPS['setStrokeColor']: { const g = gradientOf(a, ctm); if (g) stroke = g.from; else if (a && hexOf(a[0])) stroke = hexOf(a[0])!; break }
      case OPS['shadingFill']: {
        const g = gradientOf(a?.[0], ctm)
        const r = clip ?? { x0: 0, y0: 0, x1: content.width, y1: content.height }
        const pts: Pt[] = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]]
        if (content.shapes.length < PDF_LIMITS.maxShapes) content.shapes.push({ subpaths: [{ pts, closed: true, curves: 0, lines: 4 }], fill: g ? { hex: g.from, grad: g } : { hex: '#808080' }, stroke: null, lineWidth: 0, alpha, box: { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 }, order: order++, shading: true, clip })
        break
      }
      case OPS['clip']: case OPS['eoClip']: pendingClip = true; break
      case OPS['constructPath']: if (a && a.length >= 2) { const data = (a[1] as PathCmds[])[0]; if (data) addPath(Number(a[0]), data) } break
      case OPS['beginText']: tm = IDENTITY; tlm = IDENTITY; tx = 0; break
      case OPS['setCharSpacing']: charSp = Number(a?.[0] ?? 0); break
      case OPS['setWordSpacing']: wordSp = Number(a?.[0] ?? 0); break
      case OPS['setHScale']: hScale = Number(a?.[0] ?? 100) / 100; break
      case OPS['setLeading']: leading = Number(a?.[0] ?? 0); break
      case OPS['setTextRise']: rise = Number(a?.[0] ?? 0); break
      case OPS['setTextRenderingMode']: renderMode = Number(a?.[0] ?? 0); break
      case OPS['setFont']: { fontId = String(a?.[0] ?? ''); fontSize = Number(a?.[1] ?? 1); facts = await fontFacts(page, fontId); break }
      case OPS['setTextMatrix']: tm = Array.from(a![0] as ArrayLike<number>) as unknown as M6; tlm = tm; tx = 0; break
      case OPS['moveText']: moveText(Number(a![0]), Number(a![1])); break
      case OPS['setLeadingMoveText']: leading = -Number(a![1]); moveText(Number(a![0]), Number(a![1])); break
      case OPS['nextLine']: moveText(0, -leading); break
      case OPS['showText']: case OPS['showSpacedText']: await showGlyphs(a?.[0]); break
      case OPS['nextLineShowText']: moveText(0, -leading); await showGlyphs(a?.[0]); break
      case OPS['nextLineSetSpacingShowText']: wordSp = Number(a![0]); charSp = Number(a![1]); moveText(0, -leading); await showGlyphs(a![2]); break
      case OPS['paintImageXObject']: case OPS['paintInlineImageXObject']: case OPS['paintImageMaskXObject']: case OPS['paintImageXObjectRepeat']: {
        if (!a) break
        if (masked > 0 || softMask) { content.notes.add('A soft shadow or fade was not kept'); break }
        const mask = f === OPS['paintImageMaskXObject']
        const inline = f === OPS['paintInlineImageXObject']
        if (content.pictures.length >= PDF_LIMITS.maxPictures) { content.notes.add('The page has more pictures than are kept'); break }
        const id = inline ? `inline-${i}` : String(a[0])
        const pw = inline ? Number((a[0] as { width?: number })?.width) : Number(a[1]), ph = inline ? Number((a[0] as { height?: number })?.height) : Number(a[2])
        if (!(pw > 0 && ph > 0)) break
        if (mask || inline) { if (mask) content.notes.add('stencil'); else content.notes.add('inline'); if (mask) break }
        content.pictures.push({ id, pw, ph, m: ctm, clip, alpha, order: order++, mask })
        break
      }
      default: break
    }
  }
  return content
}

/** an object pdf.js keeps for the page (a picture, a gradient description): waits a moment for it, null when it does not come */
async function objectOf(page: PDFPageProxy, id: string): Promise<Record<string, unknown> | unknown[] | null> {
  const objs = (id.startsWith('g_') ? page.commonObjs : page.objs) as unknown as { has: (k: string) => boolean; get: (k: string, cb?: (v: unknown) => void) => unknown }
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), 3000)
    try { if (objs.has(id)) { clearTimeout(t); resolve(objs.get(id) as never) } else objs.get(id, (v) => { clearTimeout(t); resolve(v as never) }) } catch { clearTimeout(t); resolve(null) }
  })
}

/** The pixels of one picture of a page (pdf.js decoded them): RGB or RGBA, or null when they are not available. */
export async function pictureData(page: PDFPageProxy, id: string): Promise<{ width: number; height: number; channels: 1 | 3 | 4; data: Uint8Array } | null> {
  const obj = (await objectOf(page, id)) as Record<string, unknown> | null
  if (!obj) return null
  const width = Number(obj['width']), height = Number(obj['height'])
  const data = obj['data'] as Uint8Array | Uint8ClampedArray | undefined
  const kind = Number(obj['kind'])
  if (!data || !(width > 0 && height > 0)) return null
  if (width * height > PDF_LIMITS.maxImagePixels) return null
  if (kind === 3 && data.length >= width * height * 4) return { width, height, channels: 4, data: new Uint8Array(data.buffer, data.byteOffset, width * height * 4) }
  if (kind === 2 && data.length >= width * height * 3) return { width, height, channels: 3, data: new Uint8Array(data.buffer, data.byteOffset, width * height * 3) }
  if (kind === 1) {
    // 1 bit per pixel, rows padded to bytes: a black-and-white picture
    const rowBytes = Math.ceil(width / 8)
    if (data.length < rowBytes * height) return null
    const out = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[y * width + x] = (data[y * rowBytes + (x >> 3)]! >> (7 - (x & 7))) & 1 ? 255 : 0
    return { width, height, channels: 1, data: out }
  }
  return null
}
