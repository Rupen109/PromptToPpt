/**
 * PDF → JPG, entirely in the visitor's browser (pdf.js draws each page, the canvas saves it as a JPEG, JSZip bundles them).
 * Nothing is uploaded and nothing costs us anything per run.
 */
import { MAX_PAGES, PdfConvertError, openPdf } from './pdf-to-pptx'

export { MAX_PAGES, PdfConvertError }
export type JpgQuality = 'standard' | 'high' | 'max'
/** longest side in pixels and JPEG quality for each choice */
export const QUALITIES: Record<JpgQuality, { label: string; hint: string; width: number; q: number }> = {
  standard: { label: 'Standard', hint: 'Good for screens and email. Smallest files.', width: 1240, q: 0.85 },
  high: { label: 'High', hint: 'Sharp text. About print size (A4 at 150 dpi).', width: 1754, q: 0.9 },
  max: { label: 'Maximum', hint: 'Crisp for printing and zooming. Biggest files.', width: 2480, q: 0.95 },
}

export interface JpgPage { page: number; blob: Blob; url: string; width: number; height: number }

/** "1-3, 7" → [1,2,3,7], limited to the pages that exist; empty = every page. Throws a plain sentence when the text makes no sense. */
export function parsePages(text: string, total: number): number[] {
  const t = text.trim()
  if (!t) return Array.from({ length: total }, (_, i) => i + 1)
  const out = new Set<number>()
  for (const part of t.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part)
    if (!m) throw new PdfConvertError(`"${part}" is not a page number. Use something like 1-3, 7.`)
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a
    if (a < 1 || b < a || b > total) throw new PdfConvertError(`The PDF has ${total} page${total === 1 ? '' : 's'}; "${part}" is outside that.`)
    for (let n = a; n <= b; n++) out.add(n)
  }
  return [...out].sort((x, y) => x - y)
}

export async function pdfPageCount(file: File): Promise<number> {
  const pdf = await openPdf(file)
  const n = pdf.numPages
  void pdf.cleanup()
  return n
}

export async function convertPdfToJpg(file: File, quality: JpgQuality, pagesText: string, onProgress?: (done: number, total: number) => void): Promise<JpgPage[]> {
  const pdf = await openPdf(file)
  const wanted = parsePages(pagesText, pdf.numPages)
  const { width: target, q } = QUALITIES[quality]
  const out: JpgPage[] = []
  try {
    for (const [i, n] of wanted.entries()) {
      onProgress?.(i, wanted.length)
      const page = await pdf.getPage(n)
      const v1 = page.getViewport({ scale: 1 })
      const scale = target / Math.max(v1.width, v1.height)
      const viewport = page.getViewport({ scale: Math.min(scale, 4) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height) // JPEG has no transparency: pages sit on white
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new PdfConvertError('Your browser could not save a page as a picture.'))), 'image/jpeg', q))
      out.push({ page: n, blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height })
      canvas.width = 0
    }
    onProgress?.(wanted.length, wanted.length)
    return out
  } catch (e) {
    out.forEach((p) => URL.revokeObjectURL(p.url))
    throw e
  } finally { void pdf.cleanup() }
}

export const jpgName = (file: File, page: number, total: number) => `${file.name.replace(/\.pdf$/i, '')}-page-${String(page).padStart(String(total).length, '0')}.jpg`

export async function zipPages(file: File, pages: JpgPage[], total: number): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  for (const p of pages) zip.file(jpgName(file, p.page, total), p.blob)
  return zip.generateAsync({ type: 'blob', compression: 'STORE' }) // JPEGs are already compressed
}
