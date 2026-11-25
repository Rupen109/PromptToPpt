import { xmlSafe } from '@prompttoppt/validation'
import { MAX_BYTES, MAX_PAGES, PPT_MAX_BYTES, PPT_MAX_PAGES, PdfConvertError, type PdfLimits } from './pdf-limits'
import type { Run } from './pdf-editor/render'
import type { Family } from './pdf-editor/model'

/**
 * PDF → PowerPoint, entirely in the visitor's browser (pdf.js to read, pptxgenjs to write). Nothing is uploaded and nothing costs us anything per run.
 * Every page becomes a slide that looks like the page and whose words are editable:
 *  - the page is drawn WITHOUT its text as the slide's background (photos, shapes, colours stay), and the text goes on top as text boxes in the same place,
 *    size and colour (the colour the PDF draws each line in);
 *  - `ocr`: a page with no real text (a scan, a deck exported as pictures) is read with OCR, its words are hidden on the background (a cover from the
 *    surrounding colours) and put back on top as editable text; without OCR such a page stays as its picture, so it never comes out blank.
 * One text box per line keeps the page's layout (justified and multi-column text comes in pieces). The text finding, OCR, colour sampling and covers are the PDF editor's own (lib/pdf-editor), so both tools read a page the same way.
 * The libraries are heavy, so they are loaded only when a file is converted.
 */
export { MAX_BYTES, MAX_PAGES, PPT_MAX_BYTES, PPT_MAX_PAGES, PdfConvertError, type PdfLimits }
const TOOL_LIMITS: PdfLimits = { maxPages: MAX_PAGES, maxBytes: MAX_BYTES }

export interface Progress { page: number; pages: number; /** reading the page's words from its picture */ reading?: boolean }
export interface ConvertOptions { ocr: boolean; /** OCR language (lib/pdf-editor/ocr-info.ts) */ ocrLanguage: string }
export interface ConvertResult {
  blob: Blob
  pages: number
  /** pages without real text that were kept as pictures (OCR off) */
  pictures: number
  /** pages read with OCR */
  read: number
  /** pages where OCR ran out of time and read only part of the page */
  partial: number
}

export async function openPdf(file: File, limits: PdfLimits = TOOL_LIMITS) {
  if (file.size > limits.maxBytes) throw new PdfConvertError(`That PDF is larger than ${limits.maxBytes / 1024 / 1024} MB. Try a smaller file.`)
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const data = new Uint8Array(await file.arrayBuffer())
  if (new TextDecoder('latin1').decode(data.subarray(0, 5)) !== '%PDF-') throw new PdfConvertError('That file is not a PDF.')
  try {
    const pdf = await pdfjs.getDocument({ data, fontExtraProperties: true }).promise
    if (pdf.numPages > limits.maxPages) { void pdf.loadingTask.destroy(); throw new PdfConvertError(`That PDF has ${pdf.numPages} pages. This free tool converts up to ${limits.maxPages}.`) }
    return pdf
  } catch (e) {
    if (e instanceof PdfConvertError) throw e
    const name = (e as { name?: string }).name
    throw new PdfConvertError(name === 'PasswordException' ? 'That PDF is password-protected. Remove the password and try again.' : 'Could not read that PDF. It may be damaged.')
  }
}
type Pdf = Awaited<ReturnType<typeof openPdf>>

/** fonts every PowerPoint, Keynote and Google Slides has, closest to the look the page's text was found to have */
const FACE: Record<Family, string> = { sans: 'Arial', inter: 'Arial', jakarta: 'Arial', roboto: 'Arial', opensans: 'Arial', serif: 'Times New Roman', lora: 'Georgia', mono: 'Courier New', jbmono: 'Courier New' }
/** how long OCR may spend on one page of a conversion (the editor, one page at a time, allows more) */
const OCR_PAGE_MS = 25_000
/** how sure an OCR reading must be to become text (the editor, where a person checks each line, takes less) */
const OCR_MIN_CONF = 75
/** the slide picture's width in pixels: sharp on a 1080p screen, small enough for 300 pages */
const BG_WIDTH = 1600
/** a size PowerPoint accepts: 1 to 4,000 pt (a PDF can hold text smaller than 1 pt, and one such run makes PowerPoint refuse the whole file) */
const ptSize = (pt: number) => Math.min(4000, Math.max(1, Math.round(pt * 10) / 10))
const hex6 = (c: string) => c.replace('#', '').slice(0, 6).toUpperCase()

/**
 * The page drawn as the slide's background, without its text: pdf.js draws text with the canvas's fillText / strokeText, which do nothing here, so photos,
 * shapes and colours stay and the words (which become text boxes) do not appear twice. Each skipped glyph's position and colour is kept, to colour the boxes.
 */
async function drawWithoutText(pdf: Pdf, n: number, k: number) {
  const page = await pdf.getPage(n)
  const viewport = page.getViewport({ scale: k })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  const glyphs: { x: number; y: number; colour: string }[] = []
  const keep = (x: number, y: number) => {
    const p = ctx.getTransform().transformPoint({ x, y })
    if (typeof ctx.fillStyle === 'string') glyphs.push({ x: p.x, y: p.y, colour: ctx.fillStyle })
  }
  ctx.fillText = (_t: string, x: number, y: number) => keep(x, y)
  ctx.strokeText = (_t: string, x: number, y: number) => keep(x, y)
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  page.cleanup()
  return { canvas, glyphs }
}

/** the page drawn as it is (for OCR pages and pages kept as pictures) */
async function drawPage(pdf: Pdf, n: number, k: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(n)
  const viewport = page.getViewport({ scale: k })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  page.cleanup()
  return canvas
}

/** the colour most glyphs inside a box were drawn in (boxes in points, glyphs in pixels at k pixels per point) */
function colourIn(glyphs: { x: number; y: number; colour: string }[], box: Run['box'], k: number): string | null {
  const count = new Map<string, number>()
  const x0 = box.x * k, x1 = (box.x + box.w) * k, y0 = box.y * k, y1 = (box.y + box.h) * k
  for (const g of glyphs) if (g.x >= x0 - 2 && g.x <= x1 + 2 && g.y >= y0 - 2 && g.y <= y1 + 2) count.set(g.colour, (count.get(g.colour) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/** the colour of the pixels inside a box that the cover changed most (the letters), as #rrggbb; null when nothing changed */
function inkOf(before: ImageData, after: ImageData, box: { x: number; y: number; w: number; h: number }, k: number): string | null {
  const W = before.width, x0 = Math.max(0, Math.floor(box.x * k)), y0 = Math.max(0, Math.floor(box.y * k))
  const x1 = Math.min(W, Math.ceil((box.x + box.w) * k)), y1 = Math.min(before.height, Math.ceil((box.y + box.h) * k))
  const px: { d: number; r: number; g: number; b: number }[] = []
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * W + x) * 4, a = before.data, c = after.data
    const d = Math.abs(a[o]! - c[o]!) + Math.abs(a[o + 1]! - c[o + 1]!) + Math.abs(a[o + 2]! - c[o + 2]!)
    if (d > 90) px.push({ d, r: a[o]!, g: a[o + 1]!, b: a[o + 2]! })
  }
  if (px.length < 4) return null
  // the clearest letter pixels (anti-aliased edges are a blend with the background)
  px.sort((p, q) => q.d - p.d)
  const top = px.slice(0, Math.max(4, Math.round(px.length * 0.3)))
  const avg = (f: (p: (typeof top)[number]) => number) => Math.round(top.reduce((s, p) => s + f(p), 0) / top.length)
  return `#${[avg((p) => p.r), avg((p) => p.g), avg((p) => p.b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Where PowerPoint must put a box so it lands where the text is: the reading turns the unturned box about its TOP-LEFT corner (where the text starts),
 * PowerPoint turns a box about its CENTRE. Same centre after the turn → same place.
 */
export function placeTurned(x: number, y: number, w: number, h: number, rot: number): { x: number; y: number } {
  if (!rot) return { x, y }
  const t = (rot * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  const cx = x + (w / 2) * c - (h / 2) * s, cy = y + (w / 2) * s + (h / 2) * c
  return { x: cx - w / 2, y: cy - h / 2 }
}

type Editor = typeof import('./pdf-editor/render')
/**
 * Hides lines on the background (a cover built from the colours around each line: flat, or a smooth patch on a gradient) and returns each line's colour:
 * what the pixels the cover changed were before, i.e. the letters themselves, exact on dark cards and photos alike. Turned lines are covered by their real footprint.
 */
async function coverRuns(ed: Editor, canvas: HTMLCanvasElement, runs: Run[], k: number): Promise<Map<Run, string>> {
  const { turnedBounds } = await import('./pdf-editor/geometry')
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  const before = g.getImageData(0, 0, canvas.width, canvas.height)
  const foot = (run: Run) => { const b = turnedBounds(run.box, run.box.rot), pad = 1.5; return { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad } }
  for (const run of runs) {
    const box = foot(run)
    const patch = ed.coverPatch(canvas, k, box)
    if (patch) {
      const img = await createImageBitmap(new Blob([patch.bytes as BlobPart], { type: 'image/png' }))
      g.drawImage(img, box.x * k, box.y * k, box.w * k, box.h * k); img.close(); URL.revokeObjectURL(patch.url)
    } else { g.fillStyle = ed.ringColour(canvas, k, box); g.fillRect(box.x * k, box.y * k, box.w * k, box.h * k) }
  }
  const after = g.getImageData(0, 0, canvas.width, canvas.height)
  return new Map(runs.map((run) => [run, inkOf(before, after, foot(run), k) ?? '#000000']))
}

const jpeg = (canvas: HTMLCanvasElement) => canvas.toDataURL('image/jpeg', 0.85)

/**
 * pdf.js keeps every page it has read (its fonts, decoded pictures, parsed drawing) until the document is closed: over 600 MB for 300 pages.
 * Between pages nothing is being drawn, so its caches can be emptied (its own `cleanup()`), every few pages so fonts shared by nearby pages are reused.
 */
async function releaseEvery(pdf: Pdf, n: number) {
  if (n % 10 === 0) await pdf.cleanup()
}

export async function convertPdf(file: File, o: ConvertOptions, onProgress?: (p: Progress) => void): Promise<ConvertResult> {
  const pdf = await openPdf(file, { maxPages: PPT_MAX_PAGES, maxBytes: PPT_MAX_BYTES })
  const [{ default: PptxGenJS }, ed] = await Promise.all([import('pptxgenjs'), import('./pdf-editor/render')])
  const { hasRtl } = await import('./pdf-editor/text')
  const ocr = o.ocr ? await import('./pdf-editor/ocr') : null
  const result = { pictures: 0, read: 0, partial: 0 }
  try {
    const first = await pdf.getPage(1)
    const base = first.getViewport({ scale: 1 })
    const W = base.width, H = base.height // points; the slide is the first page's size
    const pres = new PptxGenJS()
    pres.defineLayout({ name: 'PDF', width: W / 72, height: H / 72 })
    pres.layout = 'PDF'
    pres.title = xmlSafe(file.name.replace(/\.pdf$/i, ''))

    for (let n = 1; n <= pdf.numPages; n++) {
      onProgress?.({ page: n, pages: pdf.numPages })
      const page = await pdf.getPage(n)
      const geom = ed.geomOf(page)
      const size1 = page.getViewport({ scale: 1 })
      page.cleanup()
      const k = Math.min(2, BG_WIDTH / size1.width)
      const slide = pres.addSlide()
      const runs = (await ed.extractRuns(pdf, n - 1, geom)).filter((r) => r.str.trim())
      let boxes: { run: Run; colour: string }[] = []

      if (runs.length) {
        // real text: background without it, text boxes in the colour each line is drawn in
        const { canvas, glyphs } = await drawWithoutText(pdf, n, k)
        const caught = new Map(runs.map((run) => [run, colourIn(glyphs, run.box, k)]))
        // some PDFs draw their letters as shapes (no fillText to switch off): those lines are still on the background, so they are covered like OCR lines
        const missed = runs.filter((run) => caught.get(run) === null)
        const covered = missed.length ? await coverRuns(ed, canvas, missed, k) : new Map<Run, string>()
        slide.addImage({ data: jpeg(canvas), x: 0, y: 0, w: W / 72, h: H / 72 })
        canvas.width = 0
        boxes = runs.map((run) => ({ run, colour: caught.get(run) ?? covered.get(run) ?? '#000000' }))
      } else if (ocr) {
        // a picture of a page: read it, hide the words on the background, put them back as text
        onProgress?.({ page: n, pages: pdf.numPages, reading: true })
        const job = ocr.ocrPage(pdf, n - 1, { w: size1.width, h: size1.height }, o.ocrLanguage, () => {}, OCR_PAGE_MS)
        // a reading the OCR is unsure of stays part of the picture (the words still show, just not editable) instead of becoming garbled text
        const read = (await job.done).filter((r) => r.str.trim() && (r.conf ?? 100) >= OCR_MIN_CONF)
        result.read++
        if (job.notes.partial) result.partial++
        const canvas = await drawPage(pdf, n, k)
        const colours = await coverRuns(ed, canvas, read, k)
        boxes = read.map((run) => ({ run, colour: colours.get(run)! }))
        slide.addImage({ data: jpeg(canvas), x: 0, y: 0, w: W / 72, h: H / 72 })
        canvas.width = 0
      } else {
        // no real text and no OCR: the page as it is, so the slide is never blank
        const canvas = await drawPage(pdf, n, k)
        slide.addImage({ data: jpeg(canvas), x: 0, y: 0, w: W / 72, h: H / 72 })
        canvas.width = 0
        result.pictures++
      }

      // one text box per line (or piece of a line) at its exact place: justified and multi-column pages split lines into pieces, and merging those into
      // paragraphs moved words onto each other; a box per line keeps the page's layout, and every word is still editable
      for (const { run: l, colour } of boxes) {
        const rtl = hasRtl(l.str)
        const w = l.box.w * 1.08 + 6, h = Math.max(l.box.h, l.box.size * 1.3)
        const { x, y } = placeTurned(l.box.x, l.box.y, w, h, l.box.rot ?? 0)
        slide.addText([{ text: xmlSafe(l.str), options: { bold: l.bold, italic: l.italic, color: hex6(colour), fontSize: ptSize(l.box.size), fontFace: FACE[l.fam] ?? 'Arial' } }], {
          x: x / 72, y: y / 72, w: w / 72, h: h / 72,
          margin: 0, valign: 'top', wrap: false, fit: 'none', align: rtl ? 'right' : 'left', ...(rtl ? { rtlMode: true } : {}), ...(l.box.rot ? { rotate: l.box.rot } : {}),
        })
      }
      await releaseEvery(pdf, n)
    }
    return { blob: (await pres.write({ outputType: 'blob' })) as Blob, pages: pdf.numPages, ...result }
  } finally {
    if (ocr) void ocr.stopOcr()
    void pdf.loadingTask.destroy() // the PDF itself (and pdf.js's copy in its worker) is let go as soon as the file is made
  }
}
