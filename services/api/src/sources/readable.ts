import { CSV_MAX_BYTES } from './csv.ts'
import { DOCX_MAX_BYTES } from './docx.ts'
import { EML_MAX_BYTES } from './eml.ts'
import { PDF_MAX_BYTES, PPTX_MAX_BYTES, TXT_MAX_BYTES } from './extract.ts'
import { IMAGE_MAX_BYTES } from './image-read.ts'
import { MEDIA_MAX_BYTES } from './media-read.ts'
import { XLSX_MAX_BYTES } from './xlsx.ts'

/**
 * What can be attached to a deck as a source, and what is read from it. The limits are the SAME constants the upload routes enforce, so what the assistant says it can read can never drift from
 * what is really parsed. Used to answer "what can you read?" (assistant/registry.ts); nothing here parses anything.
 */
const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024 * 10) / 10} MB`.replace('.0 ', ' ')
export const READABLE_SOURCES: { what: string; reads: string }[] = [
  { what: `PDF (up to ${mb(PDF_MAX_BYTES)})`, reads: 'its text, page by page' },
  { what: `Word documents (up to ${mb(DOCX_MAX_BYTES)})`, reads: 'headings, paragraphs and lists' },
  { what: `Excel workbooks (up to ${mb(XLSX_MAX_BYTES)}) and CSV files (up to ${mb(CSV_MAX_BYTES)})`, reads: 'the cell values, sheet by sheet' },
  { what: `PowerPoint files (up to ${mb(PPTX_MAX_BYTES)})`, reads: 'the text on its slides' },
  { what: `email files (.eml, up to ${mb(EML_MAX_BYTES)}), text and Markdown (up to ${mb(TXT_MAX_BYTES)}), pasted text and transcripts`, reads: 'the words' },
  { what: 'web pages you link', reads: 'the page text (not pages that block automated reading, and not pages drawn by scripts)' },
  { what: `pictures (up to ${mb(IMAGE_MAX_BYTES)})`, reads: 'the text and figures a model can see in them' },
  { what: `recordings (up to ${mb(MEDIA_MAX_BYTES)})`, reads: 'the spoken words' },
]

export const describeReadable = (): string[] => READABLE_SOURCES.map((r) => `${r.what}: ${r.reads}`)
