import { SourceError } from '../sources/errors.ts'
import type { RawFileBrand } from './file-types.ts'

/** Picks the reader by the file's content (never its name alone) and runs it. Runs in the parse worker. */
export async function readBrandFile(bytes: Uint8Array, filename: string): Promise<RawFileBrand> {
  if (bytes.length > 4 && Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-') return (await import('./read-pdf.ts')).readPdfBrand(bytes, filename)
  if (bytes.length > 4 && ((bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0xd0 && bytes[1] === 0xcf))) return (await import('./read-pptx.ts')).readPptxBrand(bytes, filename)
  throw new SourceError('Upload a PowerPoint (.pptx) or a PDF file.')
}
