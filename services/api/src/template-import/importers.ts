import { isOle, isZip } from '../sources/zip.ts'
import { SourceError } from '../sources/errors.ts'
import { importPdfTemplate, importPptxTemplate } from './index.ts'
import type { UploadedTemplate } from './types.ts'

/**
 * The file readers that produce an `UploadedTemplate`, by the kind of file: .pptx (parse.ts) and PDF (parse-pdf.ts, pages rebuilt from what they draw). Both return the SAME
 * `UploadedTemplate` (theme, slides as editor slides, slots, pictures stored as the user's `template` assets), so the route, the plan gate, the storage, the create flow and the editor
 * do not care which one it was. A reader refuses a file it cannot use with a `SourceError` (a sentence for the person).
 */
export type TemplateKind = 'pptx' | 'pdf'
type Importer = (bytes: Uint8Array, o: { userId: string; filename: string }) => Promise<UploadedTemplate>
export const IMPORTERS: Partial<Record<TemplateKind, Importer>> = { pptx: importPptxTemplate, pdf: importPdfTemplate }


/** The kind from the file's content (a renamed file is still what it is). null = not a presentation or PDF. */
export function detectKind(bytes: Uint8Array, filename: string): TemplateKind | null {
  if (bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf'
  if (isZip(bytes) || isOle(bytes) || /\.pptx?$/i.test(filename)) return 'pptx'
  return null
}

export class TemplateKindError extends Error { constructor(public readonly code: 'NOT_A_PRESENTATION', message: string) { super(message) } }

export async function importTemplateFile(bytes: Uint8Array, o: { userId: string; filename: string }): Promise<UploadedTemplate> {
  const kind = detectKind(bytes, o.filename)
  if (!kind) throw new TemplateKindError('NOT_A_PRESENTATION', 'Upload a PowerPoint (.pptx) or PDF file to use as a template.')
  const importer = IMPORTERS[kind]
  if (!importer) throw new TemplateKindError('NOT_A_PRESENTATION', 'Upload a PowerPoint (.pptx) or PDF file to use as a template.')
  return importer(bytes, o)
}
export { SourceError }
