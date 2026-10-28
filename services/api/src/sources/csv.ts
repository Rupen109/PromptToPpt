import type { Extracted } from './extract.ts'
import { SourceError } from './errors.ts'
import { MAX_ROWS, newBudget, sheetParts } from './table.ts'

/** CSV / TSV: comma, semicolon, tab or pipe; quotes and line breaks inside quotes; BOM, UTF-16 (Excel's "Unicode text") and Windows-1252 files. */
export const CSV_MAX_BYTES = 15 * 1024 * 1024
const MAX_COLS = 60

function decode(bytes: Uint8Array): string {
  const b = Buffer.from(bytes)
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2))
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16le').decode(Buffer.from(b.subarray(2)).swap16())
  if (b.subarray(0, 4096).includes(0)) throw new SourceError('That file does not look like a spreadsheet or CSV')
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0)) } catch { return new TextDecoder('windows-1252').decode(b) }
}

function pickDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 8)
  let best = ',', bestScore = -1
  for (const d of [',', ';', '\t', '|']) {
    const counts = lines.map((l) => { let q = false, n = 0; for (const ch of l) { if (ch === '"') q = !q; else if (ch === d && !q) n++ } return n })
    const min = Math.min(...counts, Infinity)
    const score = Number.isFinite(min) ? min * 10 + (counts.every((c) => c === counts[0]) ? 5 : 0) : 0
    if (min > 0 && score > bestScore) { best = d; bestScore = score }
  }
  return best
}

export function parseCsv(text: string, delim: string, maxRows = MAX_ROWS + 1): { rows: string[][]; more: boolean } {
  const rows: string[][] = []
  let row: string[] = [], field = '', q = false, i = 0
  const endField = () => { if (row.length < MAX_COLS) row.push(field.trim()); field = '' }
  const endRow = () => { endField(); rows.push(row); row = [] }
  for (; i < text.length; i++) {
    const ch = text[i]!
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false } else field += ch }
    else if (ch === '"' && field === '') q = true
    else if (ch === delim) endField()
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; endRow(); if (rows.length >= maxRows) return { rows, more: i < text.length - 1 } }
    else field += ch
  }
  if (field !== '' || row.length) endRow()
  return { rows, more: false }
}

export function fromCsv(bytes: Uint8Array, filename: string): Extracted {
  const text = decode(bytes)
  if (text.trim().length < 3) throw new SourceError('That file has no data in it')
  const { rows, more } = parseCsv(text, pickDelimiter(text))
  const name = filename.replace(/\.(csv|tsv|txt)$/i, '').slice(0, 60) || 'Data'
  const read = rows.slice(0, MAX_ROWS)
  const parts = sheetParts({ name, rows: read.map((cells, k) => ({ n: k + 1, cells })), omittedRows: more || rows.length > MAX_ROWS ? 1 : 0 }, newBudget())
  if (parts.length === 0) throw new SourceError('No data found in that spreadsheet')
  if (more || rows.length > MAX_ROWS) parts[parts.length - 1]!.text = parts[parts.length - 1]!.text.replace(/\n\(… 1 more rows were not read\)$/, `\n(… more rows were not read; the first ${MAX_ROWS} are included)`)
  return { title: name, parts }
}
