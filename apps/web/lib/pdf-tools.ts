import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, degrees, type PDFPage } from 'pdf-lib'
import { PdfConvertError } from './pdf-limits'

/**
 * The free PDF page tools — merge, split, organize, compress — on the visitor's device with pdf-lib. Nothing is uploaded and nothing costs us anything per run.
 * The page operations copy pages as they are (text stays text, links and fonts are kept); compress re-encodes only photos, and keeps a file only if it is smaller.
 */

/** limits, measured with pdf-lib in a browser tab (the whole file is held in memory while it is changed) */
export const TOOL_LIMITS = {
  /** one file */
  maxBytes: 100 * 1024 * 1024,
  /** merge: all files together */
  mergeBytes: 150 * 1024 * 1024,
  mergeFiles: 30,
  /** pages in one result */
  maxPages: 1000,
  /** organize draws a thumbnail of every page */
  organizePages: 300,
} as const

const MB = 1024 * 1024
export const mb = (n: number) => `${(n / MB).toFixed(n < 10 * MB ? 1 : 0)} MB`

/** open a PDF to change it; plain-words errors for the usual problems */
export async function loadPdf(bytes: Uint8Array, name = 'That file'): Promise<PDFDocument> {
  if (new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).indexOf('%PDF-') === -1) throw new PdfConvertError(`${name} is not a PDF.`)
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false })
    if (doc.getPageCount() < 1) throw new PdfConvertError(`${name} has no pages.`)
    return doc
  } catch (e) {
    if (e instanceof PdfConvertError) throw e
    if ((e as Error).name === 'EncryptedPDFError' || /encrypt/i.test((e as Error).message)) throw new PdfConvertError(`${name} is password-protected. Remove the password, then try again.`)
    throw new PdfConvertError(`Could not read ${name === 'That file' ? 'that PDF' : name}. It may be damaged.`)
  }
}

const save = (doc: PDFDocument) => doc.save({ useObjectStreams: true })

// ---------- merge ----------

/** the files' pages one after another, in the order given */
export async function mergePdfs(files: { name: string; bytes: Uint8Array }[]): Promise<Uint8Array> {
  if (files.length < 2) throw new PdfConvertError('Add at least two PDFs to merge.')
  const out = await PDFDocument.create()
  let pages = 0
  for (const f of files) {
    const src = await loadPdf(f.bytes, f.name)
    pages += src.getPageCount()
    if (pages > TOOL_LIMITS.maxPages) throw new PdfConvertError(`Together these PDFs have more than ${TOOL_LIMITS.maxPages} pages. Merge fewer at a time.`)
    for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p)
  }
  return save(out)
}

// ---------- page ranges (split, extract) ----------

/**
 * "1-3, 5, 8-" → [[1,2,3],[5],[8,…,last]] (1-based). Each comma-separated part is one group; a part may be a page, a range, or an open range.
 * Throws a plain message for anything that is not a page of this file.
 */
export function parseRanges(text: string, pageCount: number): number[][] {
  const parts = text.split(',').map((s) => s.trim()).filter(Boolean)
  if (!parts.length) throw new PdfConvertError('Type the pages, for example 1-3, 5, 8-10.')
  return parts.map((part) => {
    const m = /^(\d+)?\s*(?:(-|–)\s*(\d+)?)?$/.exec(part)
    if (!m || (!m[1] && !m[3])) throw new PdfConvertError(`"${part}" is not a page or a range. Use numbers like 1-3, 5, 8-10.`)
    const a = m[1] ? Number(m[1]) : 1
    const b = m[2] ? (m[3] ? Number(m[3]) : pageCount) : a
    if (a < 1 || b < 1 || a > pageCount || b > pageCount) throw new PdfConvertError(`"${part}": this PDF has pages 1 to ${pageCount}.`)
    if (b < a) throw new PdfConvertError(`"${part}": the first page must come before the last.`)
    return Array.from({ length: b - a + 1 }, (_, i) => a + i)
  })
}

/** one new PDF per group of (1-based) pages */
export async function splitPdf(bytes: Uint8Array, groups: number[][]): Promise<Uint8Array[]> {
  const src = await loadPdf(bytes)
  const out: Uint8Array[] = []
  for (const g of groups) {
    const doc = await PDFDocument.create()
    for (const p of await doc.copyPages(src, g.map((n) => n - 1))) doc.addPage(p)
    out.push(await save(doc))
  }
  return out
}

// ---------- organize ----------

/** a page of the new file: which page of the original (0-based), turned by how much more (degrees clockwise, a multiple of 90) */
export interface PagePlan { src: number; turn: number }

/** the pages in the new order, turned as asked; pages left out are deleted */
export async function organizePdf(bytes: Uint8Array, plan: PagePlan[]): Promise<Uint8Array> {
  if (!plan.length) throw new PdfConvertError('Keep at least one page.')
  const src = await loadPdf(bytes)
  const doc = await PDFDocument.create()
  const copies = await doc.copyPages(src, plan.map((p) => p.src))
  copies.forEach((page: PDFPage, i) => {
    const turn = plan[i]!.turn
    if (turn) page.setRotation(degrees((((page.getRotation().angle + turn) % 360) + 360) % 360))
    doc.addPage(page)
  })
  return save(doc)
}

// ---------- compress ----------

export type CompressLevel = 'light' | 'recommended' | 'strong'
/** the longest side a photo keeps, and the JPEG quality it is saved at */
export const LEVELS: Record<CompressLevel, { maxSide: number; quality: number }> = {
  light: { maxSide: 2400, quality: 0.85 },
  recommended: { maxSide: 1600, quality: 0.72 },
  strong: { maxSide: 1100, quality: 0.55 },
}

/** what the browser does with pictures (injected, so the PDF part can be tested anywhere) */
export interface Codec {
  /** pixels of a JPEG file */
  decodeJpeg(bytes: Uint8Array): Promise<CanvasImageSource & { width: number; height: number }>
  /** pixels from raw 8-bit RGB / gray samples */
  fromRaw(raw: Uint8Array, w: number, h: number, comps: 1 | 3): CanvasImageSource & { width: number; height: number }
  /** a JPEG of the picture at this size and quality */
  encodeJpeg(img: CanvasImageSource, w: number, h: number, quality: number): Promise<Uint8Array>
  /** zlib inflate */
  inflate(bytes: Uint8Array): Promise<Uint8Array>
}

export interface CompressResult { bytes: Uint8Array; before: number; after: number; photos: number; changed: number }

const nameOf = (v: unknown) => (v instanceof PDFName ? v.decodeText() : null)

/** colour components of an image's colour space we can re-encode (RGB or gray, also as ICC profiles), else null */
function comps(doc: PDFDocument, cs: unknown): 1 | 3 | null {
  const v = cs instanceof PDFRef ? doc.context.lookup(cs) : cs
  const n = nameOf(v)
  if (n === 'DeviceRGB') return 3
  if (n === 'DeviceGray') return 1
  if (v instanceof PDFArray && nameOf(v.get(0)) === 'ICCBased') {
    const prof = doc.context.lookup(v.get(1))
    const N = prof instanceof PDFRawStream ? prof.dict.get(PDFName.of('N')) : null
    const k = N instanceof PDFNumber ? N.asNumber() : 0
    return k === 3 ? 3 : k === 1 ? 1 : null
  }
  return null
}

/**
 * Smaller PDF: every photo (an 8-bit RGB or gray picture, JPEG or deflated) bigger than the level allows is scaled down and saved as a JPEG at the level's quality,
 * kept only when that is clearly smaller. Text, vector drawings, fonts, transparency masks and colour-key masks are left exactly as they are. The file is saved
 * with object streams (a compact layout of the PDF's own structure). If nothing gets smaller the original is returned.
 */
export async function compressPdf(bytes: Uint8Array, level: CompressLevel, codec: Codec, onProgress?: (done: number, total: number) => void): Promise<CompressResult> {
  const doc = await loadPdf(bytes)
  const { maxSide, quality } = LEVELS[level]
  // transparency masks are pictures too, but must stay lossless: find them first
  const masks = new Set<string>()
  const images: [PDFRef, PDFRawStream][] = []
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || nameOf(obj.dict.get(PDFName.of('Subtype'))) !== 'Image') continue
    const sm = obj.dict.get(PDFName.of('SMask'))
    if (sm instanceof PDFRef) masks.add(sm.toString())
    images.push([ref, obj])
  }
  let changed = 0
  const photos = images.filter(([ref]) => !masks.has(ref.toString()))
  for (let i = 0; i < photos.length; i++) {
    onProgress?.(i, photos.length)
    const [ref, img] = photos[i]!
    const d = img.dict
    const num = (k: string) => { const v = d.lookup(PDFName.of(k)); return v instanceof PDFNumber ? v.asNumber() : 0 }
    const w = num('Width'), h = num('Height')
    const filter = d.lookup(PDFName.of('Filter'))
    const f = nameOf(filter) ?? (filter instanceof PDFArray && filter.size() === 1 ? nameOf(filter.get(0)) : null)
    const k = comps(doc, d.get(PDFName.of('ColorSpace')))
    // pictures we must not touch: masks, colour-key masks, odd bit depths, custom decode ranges, predictors, other colour spaces or filters, tiny ones
    const isMask = String(d.lookup(PDFName.of('ImageMask')) ?? '') === 'true'
    if (!w || !h || w * h < 128 * 128 || !k || num('BitsPerComponent') !== 8 || isMask
      || d.lookup(PDFName.of('Mask')) instanceof PDFArray || d.has(PDFName.of('Decode')) || d.has(PDFName.of('DecodeParms')) || (f !== 'DCTDecode' && f !== 'FlateDecode')) continue
    const scale = Math.min(1, maxSide / Math.max(w, h))
    // a JPEG already within the size limit is only re-saved when the level asks for a lower quality than it probably has
    if (f === 'DCTDecode' && scale === 1 && level === 'light') continue
    try {
      let pic: CanvasImageSource & { width: number; height: number }
      if (f === 'DCTDecode') pic = await codec.decodeJpeg(img.contents)
      else {
        const raw = await codec.inflate(img.contents)
        if (raw.length < w * h * k) continue
        pic = codec.fromRaw(raw, w, h, k)
      }
      const nw = Math.max(1, Math.round(w * scale)), nh = Math.max(1, Math.round(h * scale))
      const jpg = await codec.encodeJpeg(pic, nw, nh, quality)
      if (jpg.length > img.contents.length * 0.9) continue // not worth it: keep the original picture
      const keep: Record<string, unknown> = {}
      for (const key of ['SMask', 'Intent', 'Interpolate', 'Alternates', 'OC', 'Metadata']) { const v = d.get(PDFName.of(key)); if (v) keep[key] = v }
      doc.context.assign(ref, doc.context.stream(jpg, { Type: 'XObject', Subtype: 'Image', Width: nw, Height: nh, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode', ...keep }))
      changed++
    } catch { /* a picture the browser cannot read stays as it is */ }
  }
  onProgress?.(photos.length, photos.length)
  const out = await save(doc)
  return out.length < bytes.length
    ? { bytes: out, before: bytes.length, after: out.length, photos: photos.length, changed }
    : { bytes, before: bytes.length, after: bytes.length, photos: photos.length, changed: 0 }
}

/** the browser's own picture codecs */
export function browserCodec(): Codec {
  const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
  return {
    decodeJpeg: (bytes) => createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/jpeg' })),
    fromRaw(raw, w, h, k) {
      const c = canvas(w, h), data = new ImageData(w, h)
      for (let i = 0, j = 0; i < w * h; i++, j += k) {
        const o = i * 4
        data.data[o] = raw[j]!; data.data[o + 1] = raw[k === 3 ? j + 1 : j]!; data.data[o + 2] = raw[k === 3 ? j + 2 : j]!; data.data[o + 3] = 255
      }
      c.getContext('2d')!.putImageData(data, 0, 0)
      return c
    },
    async encodeJpeg(img, w, h, quality) {
      const c = canvas(w, h), g = c.getContext('2d')!
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.imageSmoothingQuality = 'high'
      g.drawImage(img, 0, 0, w, h)
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', quality))
      c.width = 0
      if (!blob) throw new Error('encode failed')
      if ('close' in img && typeof img.close === 'function') img.close()
      return new Uint8Array(await blob.arrayBuffer())
    },
    async inflate(bytes) {
      const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    },
  }
}

// ---------- shared ----------

/** a download name: "Report.pdf" → "Report-merged.pdf" */
export const outName = (file: string, tag: string, ext = 'pdf') => `${file.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, '').slice(0, 80) || 'document'}-${tag}.${ext}`

/** save several PDFs as one zip */
export async function zipPdfs(files: { name: string; bytes: Uint8Array }[]): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  for (const f of files) zip.file(f.name, f.bytes)
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } })
}

export const pdfBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' })
