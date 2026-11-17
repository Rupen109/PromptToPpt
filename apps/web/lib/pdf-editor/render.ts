/** pdf.js side of the editor: open the file, draw pages, find the text runs, sample colours. Browser only; pdf.js is loaded on first use. */
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { MAX_BYTES, MAX_PAGES, PdfConvertError } from '../pdf-to-pptx'
import { runFromItem, unturnRun, type RunBox } from './geometry'
import { guessFont, spansFrom } from './text'
import { closestFont } from './fonts'
import { uid, type Family, type Geom, type PageState, type Span, type Turn } from './model'

export { MAX_PAGES, PdfConvertError }

const turn = (n: number): Turn => ((((Math.round(n / 90) * 90) % 360) + 360) % 360) as Turn
export const geomOf = (page: PDFPageProxy): Geom => ({ view: page.view as [number, number, number, number], rotate: turn(page.rotate) })

/** the visitor pressed Cancel in the password dialog */
export class OpenCancelled extends Error { name = 'OpenCancelled' }
/** `need`: the file asks for a password; `wrong`: the one given was not right (ask again) */
export type PasswordAsk = (reason: 'need' | 'wrong') => Promise<string | null>

/**
 * Open a PDF with pdf.js. A protected file calls `ask` (pdf.js's onPassword) for its password; a wrong one asks again, Cancel throws `OpenCancelled`.
 * Without `ask`, a protected file is refused with a message.
 */
export async function openForEditing(file: File, ask?: PasswordAsk): Promise<{ pdf: PDFDocumentProxy; pages: PageState[]; password?: string }> {
  if (file.size > MAX_BYTES) throw new PdfConvertError(`That PDF is larger than ${MAX_BYTES / 1024 / 1024} MB. Try a smaller file.`)
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const data = new Uint8Array(await file.arrayBuffer())
  if (new TextDecoder('latin1').decode(data.subarray(0, 5)) !== '%PDF-') throw new PdfConvertError('That file is not a PDF.')
  let password: string | undefined, cancelled = false
  const task = pdfjs.getDocument({ data, fontExtraProperties: true })
  task.onPassword = (update: (pw: string) => void, reason: number) => {
    if (!ask) { void task.destroy(); return }
    void ask(reason === 2 ? 'wrong' : 'need').then((pw) => { if (pw === null) { cancelled = true; void task.destroy() } else { password = pw; update(pw) } })
  }
  let pdf: PDFDocumentProxy
  try { pdf = await task.promise } catch (e) {
    if (cancelled) throw new OpenCancelled()
    throw new PdfConvertError((e as { name?: string }).name === 'PasswordException' ? 'That PDF is password-protected. Remove the password and try again.' : 'Could not read that PDF. It may be damaged.')
  }
  if (pdf.numPages < 1) { void pdf.loadingTask.destroy(); throw new PdfConvertError('That PDF has no pages, so there is nothing to edit.') }
  if (pdf.numPages > MAX_PAGES) { void pdf.loadingTask.destroy(); throw new PdfConvertError(`That PDF has ${pdf.numPages} pages. This free tool converts up to ${MAX_PAGES}.`) }
  const pages: PageState[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    pages.push({ id: uid('p'), src: i - 1, geom: geomOf(page), turn: 0, annos: [] })
    page.cleanup()
  }
  return { pdf, pages, ...(password !== undefined ? { password } : {}) }
}

const MAX_SIDE = 8192, MAX_AREA = 24_000_000
/** pixels per point to use so the page is sharp at `zoom` on this screen, without exceeding what a canvas can hold */
export function pixelScale(w: number, h: number, zoom: number, dpr: number): number {
  const want = zoom * Math.max(1, Math.min(dpr, 3))
  return Math.min(want, MAX_SIDE / Math.max(w, h), Math.sqrt(MAX_AREA / (w * h)))
}

export interface RenderJob { done: Promise<number | null>; cancel: () => void }
/** draw source page `src` into `target` (pixel size set here). Resolves with pixels-per-point, or null when cancelled. Draws off-screen first, so the old picture stays until the new one is ready. */
export function renderPage(pdf: PDFDocumentProxy, src: number, target: HTMLCanvasElement, scale: number): RenderJob {
  let cancelled = false
  let task: { cancel: () => void } | null = null
  const done = (async (): Promise<number | null> => {
    const page = await pdf.getPage(src + 1)
    try {
      if (cancelled) return null
      const viewport = page.getViewport({ scale })
      const off = document.createElement('canvas')
      off.width = Math.ceil(viewport.width); off.height = Math.ceil(viewport.height)
      const c = off.getContext('2d')!
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, off.width, off.height)
      const t = page.render({ canvas: off, canvasContext: c, viewport })
      task = t
      await t.promise
      if (cancelled) return null
      target.width = off.width; target.height = off.height
      target.getContext('2d', { willReadFrequently: true })!.drawImage(off, 0, 0)
      off.width = 0
      return scale
    } catch (e) {
      if (cancelled || (e as { name?: string }).name === 'RenderingCancelledException') return null
      throw e
    } finally { page.cleanup() }
  })()
  return { done, cancel: () => { cancelled = true; task?.cancel() } }
}

/** draw a page small, for the rail */
export async function renderThumb(pdf: PDFDocumentProxy, src: number, widthPx: number): Promise<{ url: string; w: number; h: number }> {
  const page = await pdf.getPage(src + 1)
  try {
    const v1 = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: widthPx / v1.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
    const c = canvas.getContext('2d')!
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: c, viewport }).promise
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.8))
    canvas.width = 0
    if (!blob) throw new Error('thumbnail failed')
    return { url: URL.createObjectURL(blob), w: v1.width, h: v1.height }
  } finally { page.cleanup() }
}

/**
 * One clickable piece of text. A line (real PDF text, or one line read from a picture), or, after `groupRuns`, a paragraph: then `parts` holds its lines
 * and `pitch` is the distance between their baselines.
 * `pad` (OCR only): how far the box reaches past the letters on each side; `conf` (OCR only): how sure the reading is, 0..100.
 */
export interface Run { id: string; str: string; box: RunBox; fam: Family; bold: boolean; italic: boolean; pad?: number; conf?: number; parts?: Run[]; pitch?: number; /** real text only: share (0..1) of the line that is bold; between about 0.05 and 0.95 the line mixes bold and regular words */ boldShare?: number; /** real text only: stretches whose weight / slant differ from `bold` / `italic` (characters of `str`) */ spans?: Span[]; /** a list marker left of the words (not part of the run): its box, so it can be removed together with the words */ marker?: { x: number; y: number; w: number; h: number } }
const BULLET = /^[•◦▪▫‣⁃·●○■□]$/
interface FontInfo { name?: string; bold?: boolean; italic?: boolean; isMonospace?: boolean; isSerifFont?: boolean }

/**
 * the page's text as clickable runs: everything on one line that sits close together is ONE run, whatever fonts it mixes (a bold lead-in followed by
 * regular words is one line to the reader). `boldShare` says how much of the line is bold; `bold`/`fam` are the dominant look.
 * Items that are only spaces never widen a run: some producers (Chromium, Word) emit a "space" item that spans the whole gap to the next column or
 * the right margin, which would make a footer or a table cell look as wide as the page.
 */
export async function extractRuns(pdf: PDFDocumentProxy, src: number, geom: Geom): Promise<Run[]> {
  const page = await pdf.getPage(src + 1)
  try {
    const content = await page.getTextContent()
    // the fonts reach the page object a moment AFTER the text (pdf.js sends them as it reads), so wait for each one that is used: without its name a bold or monospace line looks regular
    const ids = [...new Set(content.items.map((it) => ('fontName' in it ? it.fontName : '')).filter(Boolean))]
    await Promise.all(ids.map((id) => new Promise<void>((done) => {
      const t = setTimeout(done, 1500)
      try { page.commonObjs.get(id, () => { clearTimeout(t); done() }) } catch { clearTimeout(t); done() }
    })))
    const fontOf = (id: string): FontInfo => { try { return page.commonObjs.has(id) ? (page.commonObjs.get(id) as FontInfo) : {} } catch { return {} } }
    interface Acc extends Run { end: number; space: boolean; w: Record<string, number>; wBold: number; wTotal: number; wItalic: number; pieces: { s: number; e: number; bold: boolean; italic: boolean }[] }
    const out: Acc[] = []
    let marker: Run['marker']
    const dominant = (w: Record<string, number>): Family => (Object.entries(w).sort((p, q) => q[1] - p[1])[0]?.[0] ?? 'sans') as Family
    const items = content.items
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx]!
      if (!('str' in it) || it.str.length === 0) continue
      const box = runFromItem(geom, it.transform as number[], it.width)
      if (!box) continue
      const last = out.at(-1)
      const sameLine = !!last && Math.abs(last.box.size - box.size) < 0.6 && Math.abs(last.box.baseline - box.baseline) < 0.8 && Math.abs((last.box.rot ?? 0) - (box.rot ?? 0)) < 0.5
      // a list marker ("•") that starts a line belongs to the layout, not to the words: the words are the run, the marker stays on the page (and wrapped lines start at the same left edge as the words)
      if (!box.rot && BULLET.test(it.str.trim()) && !(last && Math.abs(last.box.baseline - box.baseline) < 2)) {
        const nxt = items.slice(idx + 1, idx + 4).find((q) => 'str' in q && q.str.trim())
        const nb = nxt && 'str' in nxt ? runFromItem(geom, nxt.transform as number[], nxt.width) : null
        if (nb && Math.abs(nb.baseline - box.baseline) < 2 && nb.x - (box.x + box.w) < box.size * 2.2 && nb.x > box.x) { marker = { x: box.x, y: box.y, w: box.w, h: box.h }; continue }
      }
      // some producers put the marker and the words in ONE item ("• Text"): the marker stays on the page, the run starts at the words
      let str = it.str, bx = box
      const lead = /^[•◦▪▫‣⁃●○■□]\s+(?=\S)/.exec(str)
      if (lead && !box.rot && !(last && Math.abs(last.box.baseline - box.baseline) < 2)) { str = str.slice(lead[0].length); const shift = Math.min(box.w * 0.5, box.size * 0.63); bx = { ...box, x: box.x + shift, w: box.w - shift }; marker = { x: box.x, y: box.y, w: shift, h: box.h } }
      if (!str.trim()) { if (sameLine && last) last.space = true; continue }
      const f = fontOf(it.fontName)
      const guess = guessFont(f.name ?? '', content.styles[it.fontName]?.fontFamily, f)
      const g = { ...guess, fam: closestFont(f.name ?? '') ?? guess.fam } // a font the bundled set has (Inter, Roboto, Plus Jakarta Sans...) is used as it is, else the generic sans / serif / mono
      const trail = str.length - str.trimEnd().length
      const w = Math.max(0.1, bx.w - trail * bx.size * (g.fam === 'mono' ? 0.6 : 0.28))
      const gap = last ? bx.x - last.end : 0
      if (sameLine && last && gap > -1 && gap < bx.size * 0.75) {
        last.str += (last.space || str.startsWith(' ') || (gap > bx.size * 0.18 && !last.str.endsWith(' ')) ? ' ' : '')
        last.pieces.push({ s: last.str.length, e: last.str.length + str.trimStart().length, bold: g.bold, italic: g.italic })
        last.str += str.trimStart()
        last.end = bx.x + w; last.box = { ...last.box, w: last.end - last.box.x }; last.space = str.length > str.trimEnd().length
        last.w[g.fam] = (last.w[g.fam] ?? 0) + w; last.wTotal += w; if (g.bold) last.wBold += w; if (g.italic) last.wItalic += w
        continue
      }
      out.push({ id: `r${out.length}`, str: str.trimStart(), box: { ...bx, w }, ...g, end: bx.x + w, space: trail > 0, w: { [g.fam]: w }, wBold: g.bold ? w : 0, wTotal: w, wItalic: g.italic ? w : 0, pieces: [{ s: 0, e: str.trimStart().length, bold: g.bold, italic: g.italic }], ...(marker ? { marker } : {}) })
      marker = undefined
    }
    return out.filter((r) => r.str.trim()).map(({ end: _e, space: _s, w, wBold, wTotal, wItalic, pieces, ...r }) => {
      void _e; void _s
      const share = wTotal > 0 ? wBold / wTotal : r.bold ? 1 : 0
      const bold = share >= 0.5, italic = wTotal > 0 ? wItalic / wTotal >= 0.5 : r.italic
      const str = r.str.replace(/\s+$/, '')
      // style per character (separators take the style of the piece before them), kept as spans only where the line really mixes looks
      const styles: number[] = []; let prev = (bold ? 1 : 0) | (italic ? 2 : 0)
      for (let i = 0; i < str.length; i++) { const p = pieces.find((q) => i >= q.s && i < q.e); if (p) prev = (p.bold ? 1 : 0) | (p.italic ? 2 : 0); styles.push(prev) }
      const spans = spansFrom(styles, bold, italic)
      return { ...r, box: unturnRun(r.box), str, fam: dominant(w), bold, italic, boldShare: share, ...(spans.length ? { spans } : {}) }
    })
  } finally { page.cleanup() }
}

const hex = (r: number, g: number, b: number): string => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
const dist = (a: number[], b: number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)

/** colours under a text run: the background (most common colour) and the ink (the strongest pixels far from the background) */
export function sampleRun(canvas: HTMLCanvasElement, pxPerPt: number, box: { x: number; y: number; w: number; h: number }): { text: string; bg: string } {
  const x = Math.max(0, Math.floor(box.x * pxPerPt)), y = Math.max(0, Math.floor(box.y * pxPerPt))
  const w = Math.min(canvas.width - x, Math.ceil(box.w * pxPerPt)), h = Math.min(canvas.height - y, Math.ceil(box.h * pxPerPt))
  if (w < 1 || h < 1) return { text: '#000000', bg: '#ffffff' }
  const { data } = canvas.getContext('2d')!.getImageData(x, y, w, h)
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < data.length; i += 4) {
    const k = ((data[i]! >> 4) << 8) | ((data[i + 1]! >> 4) << 4) | (data[i + 2]! >> 4)
    const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }
    e.n++; e.r += data[i]!; e.g += data[i + 1]!; e.b += data[i + 2]!
    buckets.set(k, e)
  }
  const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0]!
  const bg = [top.r / top.n, top.g / top.n, top.b / top.n]
  const px: { d: number; c: number[] }[] = []
  for (let i = 0; i < data.length; i += 4) { const c = [data[i]!, data[i + 1]!, data[i + 2]!]; px.push({ d: dist(c, bg), c }) }
  px.sort((a, b) => b.d - a.d)
  const take = px.slice(0, Math.max(1, Math.round(px.length * 0.03)))
  const ink = [0, 1, 2].map((k) => take.reduce((s, p) => s + p.c[k]!, 0) / take.length)
  const nearWhite = dist(bg, [255, 255, 255]) < 14
  return { text: take[0]!.d < 60 ? '#000000' : hex(ink[0]!, ink[1]!, ink[2]!), bg: nearWhite ? '#ffffff' : hex(bg[0]!, bg[1]!, bg[2]!) }
}

/** a smooth stand-in for what is under a box, built from the pixels just outside its four edges (for a cover on a gradient, where one flat colour would show as a patch) */
export interface CoverPatch { url: string; bytes: Uint8Array }
export function coverPatch(canvas: HTMLCanvasElement, pxPerPt: number, box: { x: number; y: number; w: number; h: number }): CoverPatch | null {
  const x0 = Math.max(0, Math.floor(box.x * pxPerPt)), y0 = Math.max(0, Math.floor(box.y * pxPerPt))
  const w = Math.min(canvas.width - x0, Math.ceil(box.w * pxPerPt)), h = Math.min(canvas.height - y0, Math.ceil(box.h * pxPerPt))
  if (w < 4 || h < 4) return null
  const T = 3, g = canvas.getContext('2d')!
  type C = [number, number, number]
  /** mean colour of a strip, one value per step along it, then a median filter so a stray letter or edge does not leak in */
  const edge = (sx: number, sy: number, sw: number, sh: number, along: 'x' | 'y', n: number): C[] => {
    const cx = Math.min(Math.max(sx, 0), canvas.width - sw), cy = Math.min(Math.max(sy, 0), canvas.height - sh)
    const d = g.getImageData(cx, cy, sw, sh).data
    const raw: C[] = []
    for (let i = 0; i < n; i++) {
      let r = 0, gg = 0, b = 0, c = 0
      const [ax, ay] = along === 'x' ? [i, 0] : [0, i], [bx, by] = along === 'x' ? [1, sh] : [sw, 1]
      for (let a = 0; a < bx; a++) for (let q = 0; q < by; q++) { const o = ((ay + q) * sw + (ax + a)) * 4; r += d[o]!; gg += d[o + 1]!; b += d[o + 2]!; c++ }
      raw.push([r / c, gg / c, b / c])
    }
    const half = Math.max(2, Math.round(n / 8))
    return raw.map((_, i) => [0, 1, 2].map((k) => { const win = raw.slice(Math.max(0, i - half), i + half + 1).map((v) => v[k]!).sort((p, q) => p - q); return win[win.length >> 1]! }) as C)
  }
  // a side on the page border has no surroundings to read: borrow the opposite side (needs at least one of each pair), never the pixels inside the box
  const hasL = x0 - T >= 0, hasR = x0 + w + T <= canvas.width, hasT = y0 - T >= 0, hasB = y0 + h + T <= canvas.height
  if ((!hasL && !hasR) || (!hasT && !hasB)) return null
  const L0 = hasL ? edge(x0 - T, y0, T, h, 'y', h) : null, R0 = hasR ? edge(x0 + w, y0, T, h, 'y', h) : null, T0 = hasT ? edge(x0, y0 - T, w, T, 'x', w) : null, B0 = hasB ? edge(x0, y0 + h, w, T, 'x', w) : null
  const L = (L0 ?? R0)!, R = (R0 ?? L0)!, Tp = (T0 ?? B0)!, B = (B0 ?? T0)!
  // flat or not is judged on the MIDDLE value of each edge and on how far most of it strays: the overhang of an italic letter or a descender that reaches into one strip must not turn a plain cover into a smeared patch
  const med = (a: C[]): C => [0, 1, 2].map((k) => { const v = a.map((x) => x[k]!).sort((p, q) => p - q); return v[v.length >> 1]! }) as C
  const ms = [med(L), med(R), med(Tp), med(B)]
  let spread = 0
  for (const a of ms) for (const b of ms) spread = Math.max(spread, dist(a, b))
  const ownSpread = Math.max(...[L, R, Tp, B].map((e) => { const m = med(e), d = e.map((v) => dist(v, m)).sort((p, q) => p - q); return d[Math.floor(d.length * 0.85)]! }))
  if (spread < 9 && ownSpread < 9) return null // flat enough: a single colour is exact
  const avg = (a: C, b: C): C => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
  const tl = avg(L[0]!, Tp[0]!), tr = avg(R[0]!, Tp[w - 1]!), bl = avg(L[h - 1]!, B[0]!), br = avg(R[h - 1]!, B[w - 1]!)
  const out = document.createElement('canvas'); out.width = w; out.height = h
  const oc = out.getContext('2d')!, img = oc.createImageData(w, h)
  for (let j = 0; j < h; j++) {
    const v = h > 1 ? j / (h - 1) : 0
    for (let i = 0; i < w; i++) {
      const u = w > 1 ? i / (w - 1) : 0
      for (let k = 0; k < 3; k++) {
        const val = (1 - u) * L[j]![k]! + u * R[j]![k]! + (1 - v) * Tp[i]![k]! + v * B[i]![k]! - ((1 - u) * (1 - v) * tl[k]! + u * (1 - v) * tr[k]! + (1 - u) * v * bl[k]! + u * v * br[k]!)
        img.data[(j * w + i) * 4 + k] = Math.max(0, Math.min(255, Math.round(val)))
      }
      img.data[(j * w + i) * 4 + 3] = 255
    }
  }
  oc.putImageData(img, 0, 0)
  const url = out.toDataURL('image/png'); out.width = 0
  const bin = atob(url.slice(url.indexOf(',') + 1))
  const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { url, bytes }
}

/** the colour just outside a box (its four edges, 3 px deep, middle value of each channel): the flat cover colour for a picture that is picked up */
export function ringColour(canvas: HTMLCanvasElement, pxPerPt: number, box: { x: number; y: number; w: number; h: number }): string {
  const g = canvas.getContext('2d')!, T = 3
  const x0 = Math.floor(box.x * pxPerPt), y0 = Math.floor(box.y * pxPerPt), w = Math.ceil(box.w * pxPerPt), h = Math.ceil(box.h * pxPerPt)
  const strips: [number, number, number, number][] = [[x0, y0 - T, w, T], [x0, y0 + h, w, T], [x0 - T, y0, T, h], [x0 + w, y0, T, h]]
  const rs: number[] = [], gs: number[] = [], bs: number[] = []
  for (const [sx, sy, sw, sh] of strips) {
    if (sx < 0 || sy < 0 || sx + sw > canvas.width || sy + sh > canvas.height || sw < 1 || sh < 1) continue
    const d = g.getImageData(sx, sy, sw, sh).data
    for (let i = 0; i < d.length; i += 16) { rs.push(d[i]!); gs.push(d[i + 1]!); bs.push(d[i + 2]!) }
  }
  if (!rs.length) return '#ffffff'
  const med = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1]!
  return hex(med(rs), med(gs), med(bs))
}
