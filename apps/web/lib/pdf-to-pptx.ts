import { xmlSafe } from '@prompttoppt/validation'
import { MAX_BYTES, MAX_PAGES, PPT_MAX_BYTES, PPT_MAX_PAGES, type PdfLimits } from './pdf-limits'

/**
 * PDF → PowerPoint, entirely in the visitor's browser (pdf.js to read; pptx-picture-deck.ts / pptxgenjs to write). Nothing is uploaded and nothing costs us
 * anything per run. Two modes:
 *  - `image`: each page becomes one slide holding a picture of the page — looks exactly like the PDF, text is not editable.
 *  - `text`:  text is rebuilt as editable text boxes in their original positions; pictures and graphics are not carried over.
 * Both are heavy, so the libraries are loaded only when a file is converted.
 */
export type PdfMode = 'image' | 'text'
export { MAX_BYTES, MAX_PAGES, PPT_MAX_BYTES, PPT_MAX_PAGES, type PdfLimits }
const TOOL_LIMITS: PdfLimits = { maxPages: MAX_PAGES, maxBytes: MAX_BYTES }

export class PdfConvertError extends Error {}

interface Progress { page: number; pages: number }

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

interface Item { str: string; x: number; y: number; w: number; size: number }

/** Group a page's text fragments into lines, then merge neighbouring lines of one block into a paragraph box. */
function toBlocks(items: Item[]) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: { x: number; y: number; w: number; size: number; text: string }[] = []
  for (const it of sorted) {
    const last = lines.at(-1)
    if (last && Math.abs(last.y - it.y) < Math.max(last.size, it.size) * 0.5) {
      last.text += (last.text.endsWith(' ') || it.str.startsWith(' ') ? '' : ' ') + it.str
      last.w = Math.max(last.w, it.x + it.w - last.x)
    } else lines.push({ x: it.x, y: it.y, w: it.w, size: it.size, text: it.str })
  }
  const blocks: { x: number; y: number; w: number; size: number; lines: string[] }[] = []
  for (const l of lines) {
    const b = blocks.at(-1)
    if (b && Math.abs(l.x - b.x) < b.size * 1.5 && Math.abs(l.size - b.size) < 1 && l.y - (b.y + b.lines.length * b.size * 1.25) < b.size * 0.9) {
      b.lines.push(l.text); b.w = Math.max(b.w, l.w)
    } else blocks.push({ x: l.x, y: l.y, w: l.w, size: l.size, lines: [l.text] })
  }
  return blocks
}

/**
 * pdf.js keeps every page it has read (its fonts, decoded pictures, parsed drawing) until the document is closed: over 600 MB for 300 pages, even when only the
 * text is read. Between pages nothing is being drawn, so its caches can be emptied (its own `cleanup()`), every few pages so fonts shared by nearby pages are reused.
 */
async function releaseEvery(pdf: Awaited<ReturnType<typeof openPdf>>, n: number) {
  if (n % 10 === 0) await pdf.cleanup()
}

/** a page drawn as a JPEG (bytes, not text: a 300-page PDF must not hold 300 pictures as strings) */
async function pageJpeg(page: Awaited<ReturnType<Awaited<ReturnType<typeof openPdf>>['getPage']>>): Promise<Uint8Array> {
  const v1 = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: Math.min(2, 1800 / v1.width) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
  try {
    await page.render({ canvas, viewport }).promise
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85))
    if (!blob) throw new PdfConvertError('Your browser ran out of memory drawing a page. Try the editable-text mode, or a smaller PDF.')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    canvas.width = 0 // release the bitmap before the next page
  }
}

export async function convertPdf(file: File, mode: PdfMode, onProgress?: (p: Progress) => void): Promise<Blob> {
  const pdf = await openPdf(file, { maxPages: PPT_MAX_PAGES, maxBytes: PPT_MAX_BYTES })
  const first = await pdf.getPage(1)
  const base = first.getViewport({ scale: 1 })
  const W = base.width / 72, H = base.height / 72 // slide size in inches = the PDF page in inches
  const title = xmlSafe(file.name.replace(/\.pdf$/i, ''))
  try {
    if (mode === 'image') {
      // "exact look": every page a picture, written into the file as it is drawn
      const { pictureDeck } = await import('./pptx-picture-deck')
      const deck = await pictureDeck({ widthIn: W, heightIn: H, title })
      for (let n = 1; n <= pdf.numPages; n++) {
        onProgress?.({ page: n, pages: pdf.numPages })
        const page = await pdf.getPage(n)
        deck.add(await pageJpeg(page))
        page.cleanup()
        await releaseEvery(pdf, n)
      }
      return deck.finish()
    }
    return await textDeck(pdf, W, H, title, onProgress)
  } finally {
    void pdf.loadingTask.destroy() // the PDF itself (and pdf.js's copy in its worker) is let go as soon as the file is made
  }
}

/** "editable text": text rebuilt as text boxes where it was; light at any size, so it stays with pptxgenjs */
async function textDeck(pdf: Awaited<ReturnType<typeof openPdf>>, W: number, H: number, title: string, onProgress?: (p: Progress) => void): Promise<Blob> {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pres = new PptxGenJS()
  pres.defineLayout({ name: 'PDF', width: W, height: H })
  pres.layout = 'PDF'
  pres.title = title

  for (let n = 1; n <= pdf.numPages; n++) {
    onProgress?.({ page: n, pages: pdf.numPages })
    const page = await pdf.getPage(n)
    const slide = pres.addSlide()
    const v = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items: Item[] = []
    for (const it of content.items) {
      // PDF text can hold control characters XML forbids (one made PowerPoint "repair" the file): they are invisible, so they go
      if (!('str' in it)) continue
      const str = xmlSafe(it.str)
      if (!str.trim()) continue
      const [a, b, , , e, f] = it.transform as number[]
      const [x, y] = v.convertToViewportPoint(e!, f!) as [number, number]
      const size = Math.hypot(a!, b!)
      items.push({ str, x, y: y - size, w: it.width, size })
    }
    for (const blk of toBlocks(items)) {
      slide.addText(blk.lines.join('\n'), { x: blk.x / 72, y: blk.y / 72, w: Math.min(W - blk.x / 72, Math.max(0.5, blk.w / 72 + 0.3)), h: (blk.lines.length * blk.size * 1.3) / 72 + 0.05, fontSize: Math.max(6, Math.round(blk.size)), margin: 0, valign: 'top', color: '222222', fontFace: 'Arial', fit: 'none' })
    }
    if (items.length === 0) slide.addText('(No text found on this page)', { x: 0.5, y: 0.5, w: W - 1, h: 0.5, fontSize: 12, color: '888888' })
    page.cleanup()
    await releaseEvery(pdf, n)
  }
  return (await pres.write({ outputType: 'blob' })) as Blob
}
