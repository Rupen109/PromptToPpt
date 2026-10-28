/**
 * PDF → PowerPoint, entirely in the visitor's browser (pdf.js to read, pptxgenjs to write). Nothing is uploaded and nothing costs us
 * anything per run. Two modes:
 *  - `image`: each page becomes one slide holding a picture of the page — looks exactly like the PDF, text is not editable.
 *  - `text`:  text is rebuilt as editable text boxes in their original positions; pictures and graphics are not carried over.
 * Both are heavy, so the libraries are loaded only when a file is converted.
 */
export type PdfMode = 'image' | 'text'
export const MAX_PAGES = 60
export const MAX_BYTES = 30 * 1024 * 1024

export class PdfConvertError extends Error {}

interface Progress { page: number; pages: number }

async function openPdf(file: File) {
  if (file.size > MAX_BYTES) throw new PdfConvertError(`That PDF is larger than ${MAX_BYTES / 1024 / 1024} MB. Try a smaller file.`)
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const data = new Uint8Array(await file.arrayBuffer())
  if (new TextDecoder('latin1').decode(data.subarray(0, 5)) !== '%PDF-') throw new PdfConvertError('That file is not a PDF.')
  try {
    const pdf = await pdfjs.getDocument({ data }).promise
    if (pdf.numPages > MAX_PAGES) throw new PdfConvertError(`That PDF has ${pdf.numPages} pages. This free tool converts up to ${MAX_PAGES}.`)
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

export async function convertPdf(file: File, mode: PdfMode, onProgress?: (p: Progress) => void): Promise<Blob> {
  const pdf = await openPdf(file)
  const PptxGenJS = (await import('pptxgenjs')).default
  const pres = new PptxGenJS()
  const first = await pdf.getPage(1)
  const base = first.getViewport({ scale: 1 })
  const W = base.width / 72, H = base.height / 72 // slide size in inches = the PDF page in inches
  pres.defineLayout({ name: 'PDF', width: W, height: H })
  pres.layout = 'PDF'
  pres.title = file.name.replace(/\.pdf$/i, '')

  for (let n = 1; n <= pdf.numPages; n++) {
    onProgress?.({ page: n, pages: pdf.numPages })
    const page = await pdf.getPage(n)
    const slide = pres.addSlide()
    if (mode === 'image') {
      const v1 = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(2, 1800 / v1.width) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      slide.addImage({ data: canvas.toDataURL('image/jpeg', 0.85), x: 0, y: 0, w: W, h: H, sizing: { type: 'contain', w: W, h: H } })
      canvas.width = 0 // release the bitmap before the next page
    } else {
      const v = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items: Item[] = []
      for (const it of content.items) {
        if (!('str' in it) || !it.str.trim()) continue
        const [a, b, , , e, f] = it.transform as number[]
        const [x, y] = v.convertToViewportPoint(e!, f!) as [number, number]
        const size = Math.hypot(a!, b!)
        items.push({ str: it.str, x, y: y - size, w: it.width, size })
      }
      for (const blk of toBlocks(items)) {
        slide.addText(blk.lines.join('\n'), { x: blk.x / 72, y: blk.y / 72, w: Math.min(W - blk.x / 72, Math.max(0.5, blk.w / 72 + 0.3)), h: (blk.lines.length * blk.size * 1.3) / 72 + 0.05, fontSize: Math.max(6, Math.round(blk.size)), margin: 0, valign: 'top', color: '222222', fontFace: 'Arial', fit: 'none' })
      }
      if (items.length === 0) slide.addText('(No text found on this page)', { x: 0.5, y: 0.5, w: W - 1, h: 0.5, fontSize: 12, color: '888888' })
    }
    page.cleanup()
  }
  return (await pres.write({ outputType: 'blob' })) as Blob
}
