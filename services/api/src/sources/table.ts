import type { Extracted } from './extract.ts'
import { MAX_TEXT_CHARS } from './limits.ts'

/** Rows of a sheet or CSV → parts a citation can point at ("Sales (rows 2–41)"), each part repeating the header row so a number never loses its column name. */
export const MAX_ROWS = 5000
const PART_CHARS = 1400
const CELL_CHARS = 300

export interface SheetRows { name: string; rows: { n: number; cells: string[] }[]; omittedRows: number }

export function sheetParts(sheet: SheetRows, budget: { left: number }): Extracted['parts'] {
  const rows = sheet.rows.filter((r) => r.cells.some((c) => c !== ''))
  if (rows.length === 0 || budget.left <= 0) return []
  const line = (cells: string[]) => cells.map((c) => (c.length > CELL_CHARS ? `${c.slice(0, CELL_CHARS)}…` : c).replace(/\s*\n\s*/g, ' ')).join(' | ').replace(/(?:\s*\|)+\s*$/, '').trimEnd()
  const header = rows[0]!
  const headerLine = line(header.cells)
  const out: Extracted['parts'] = []
  let block: string[] = [], from = header.n, last = header.n, size = headerLine.length
  const flush = () => {
    if (!block.length) return
    const text = (out.length ? `${headerLine}\n` : '') + block.join('\n')
    out.push({ locator: `${sheet.name} (rows ${from}–${last})`, text })
    block = []
  }
  block.push(headerLine)
  for (const r of rows.slice(1)) {
    const l = line(r.cells)
    if (!l) continue
    if (budget.left - (size + l.length) <= 0) { flush(); budget.left = 0; return out }
    if (size + l.length > PART_CHARS && block.length > 1) { flush(); from = r.n; size = headerLine.length }
    block.push(l); last = r.n; size += l.length + 1
  }
  flush()
  if (sheet.omittedRows > 0 && out.length) out[out.length - 1]!.text += `\n(… ${sheet.omittedRows} more rows were not read)`
  for (const p of out) budget.left -= p.text.length
  return out
}

export const newBudget = () => ({ left: MAX_TEXT_CHARS })
