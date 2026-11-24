/**
 * Merged table cells: ONE rule for the editor, the slide on screen, the PowerPoint file, the import and the assistant.
 *
 * A merged area is { row, column, rows, columns }: its top-left cell and its size. Rows count as everywhere else for tables: -1 is the header row, 0 the first row below it
 * (the same numbering as `highlights` and the editor's cells). The top-left cell keeps the text and the look of the whole area; the other cells are covered (not drawn).
 * The header row only merges across (a header area is one row high) and a body area stays in the body, as in PowerPoint, where the header row is its own band.
 * Every change to the grid (a row or column added, removed or sorted) goes through this file, so merges and highlights always follow the cells they belong to.
 */
export type CellArea = { row: number; column: number; rows: number; columns: number }
export type CellHighlight = { row: number; column: number; fill: string }
/** a cell's own alignment (row -1 = the header): h across, v up and down; unset parts follow the table's defaults (alignOf) */
export type CellAlign = { row: number; column: number; h?: 'left' | 'center' | 'right' | undefined; v?: 'top' | 'middle' | 'bottom' | undefined }
export type TableGrid = { header: string[]; rows: string[][]; merges?: CellArea[] | undefined; highlights?: CellHighlight[] | undefined; aligns?: CellAlign[] | undefined }
/** what a grid change gives back: the parts that changed, ready to assign (merges/highlights undefined = none left) */
export type GridParts = { header: string[]; rows: string[][]; merges: CellArea[] | undefined; highlights: CellHighlight[] | undefined; aligns: CellAlign[] | undefined }

export const MAX_MERGES = 40

const inside = (a: CellArea, r: number, c: number) => r >= a.row && r < a.row + a.rows && c >= a.column && c < a.column + a.columns
const overlaps = (a: CellArea, b: CellArea) => a.row < b.row + b.rows && b.row < a.row + a.rows && a.column < b.column + b.columns && b.column < a.column + a.columns
const within = (inner: CellArea, outer: CellArea) => inner.row >= outer.row && inner.column >= outer.column && inner.row + inner.rows <= outer.row + outer.rows && inner.column + inner.columns <= outer.column + outer.columns
const cellsOf = (a: CellArea) => a.rows * a.columns
const parts = (t: TableGrid, o: Partial<GridParts> = {}): GridParts => {
  const merges = o.merges ?? t.merges, highlights = o.highlights ?? t.highlights, aligns = o.aligns ?? t.aligns
  return { header: o.header ?? t.header, rows: o.rows ?? t.rows, merges: merges?.length ? merges : undefined, highlights: highlights?.length ? highlights : undefined, aligns: aligns?.length ? aligns : undefined }
}

/** why an area cannot be a merge of this table (null = it can): inside the grid, two cells or more, the header only across */
export function areaProblem(t: Pick<TableGrid, 'header' | 'rows'>, a: CellArea): string | null {
  if (![a.row, a.column, a.rows, a.columns].every(Number.isInteger) || a.rows < 1 || a.columns < 1) return 'that is not a block of cells'
  if (a.column < 0 || a.column + a.columns > t.header.length) return `the table has ${t.header.length} column${t.header.length === 1 ? '' : 's'}`
  if (a.row < -1 || a.row + a.rows > t.rows.length) return `the table has ${t.rows.length} row${t.rows.length === 1 ? '' : 's'} below the header`
  if (a.row === -1 && a.rows > 1) return 'the header row only merges across, never with the rows below it'
  if (cellsOf(a) < 2) return 'that is a single cell'
  return null
}

/** The table's merges that can be drawn: inside the grid, two cells or more, not overlapping an earlier one (a stored list is never trusted blindly). */
export function validMerges(t: TableGrid): CellArea[] {
  const out: CellArea[] = []
  for (const a of t.merges ?? []) if (!areaProblem(t, a) && !out.some((b) => overlaps(a, b))) out.push(a)
  return out.slice(0, MAX_MERGES)
}

/** the merged area a cell belongs to, if any */
export const mergeAt = (t: TableGrid, row: number, column: number): CellArea | undefined => validMerges(t).find((a) => inside(a, row, column))

/**
 * How each cell is drawn: `span` for the top-left cell of a merged area (its rows and columns), `covered` for the other cells of the area (not drawn), or nothing for a plain cell.
 * Screen, editor dialog and PowerPoint file read this one function.
 */
export function cellSpans(t: TableGrid): (row: number, column: number) => { covered: true } | { covered: false; rows: number; columns: number } {
  const areas = validMerges(t)
  return (row, column) => {
    const a = areas.find((x) => inside(x, row, column))
    if (!a) return { covered: false, rows: 1, columns: 1 }
    return a.row === row && a.column === column ? { covered: false, rows: a.rows, columns: a.columns } : { covered: true }
  }
}

const textAt = (t: TableGrid, r: number, c: number) => (r < 0 ? t.header[c] : t.rows[r]?.[c]) ?? ''

/**
 * Merges an area: the words of every cell in it are kept, in reading order, in the top-left cell (as PowerPoint keeps them), and the other cells are emptied.
 * Merged areas that lie wholly inside it become part of it; one that sticks out of it refuses the merge (it would cut that area in two).
 */
export function mergeCells(t: TableGrid, a: CellArea): { ok: true; parts: GridParts } | { ok: false; why: string } {
  const problem = areaProblem(t, a)
  if (problem) return { ok: false, why: problem }
  const current = validMerges(t)
  const cut = current.find((b) => overlaps(a, b) && !within(b, a))
  if (cut) return { ok: false, why: `it would cut the cells already merged at ${describeArea(cut)} in two` }
  if (current.some((b) => b.row === a.row && b.column === a.column && b.rows === a.rows && b.columns === a.columns)) return { ok: false, why: 'those cells are already merged' }
  const words: string[] = []
  for (let r = a.row; r < a.row + a.rows; r++) for (let c = a.column; c < a.column + a.columns; c++) { const w = textAt(t, r, c).trim(); if (w && !words.includes(w)) words.push(w) }
  const header = [...t.header], rows = t.rows.map((x) => [...x])
  for (let r = a.row; r < a.row + a.rows; r++) for (let c = a.column; c < a.column + a.columns; c++) {
    const text = r === a.row && c === a.column ? words.join(' ').slice(0, 200) : ''
    if (r < 0) header[c] = text; else rows[r]![c] = text
  }
  const merges = [...current.filter((b) => !within(b, a)), a].slice(0, MAX_MERGES)
  // a highlight on a covered cell would never show: only the top-left cell's stays
  const highlights = t.highlights?.filter((h) => !inside(a, h.row, h.column) || (h.row === a.row && h.column === a.column))
  const aligns = t.aligns?.filter((h) => !inside(a, h.row, h.column) || (h.row === a.row && h.column === a.column))
  return { ok: true, parts: parts(t, { header, rows, merges, highlights, aligns }) }
}

/** Unmerges the areas that touch `a` (none given = every merge of the table). The words stay in the top-left cell; the other cells come back empty. */
export function unmergeCells(t: TableGrid, a?: CellArea): { ok: true; parts: GridParts; count: number } | { ok: false; why: string } {
  const current = validMerges(t)
  const gone = a ? current.filter((b) => overlaps(a, b)) : current
  if (!gone.length) return { ok: false, why: a ? 'those cells are not merged' : 'the table has no merged cells' }
  return { ok: true, parts: parts(t, { merges: current.filter((b) => !gone.includes(b)) }), count: gone.length }
}

/** "the header, columns 1 to 2", "row 3, columns 2 to 4": how an area is named to a person (rows and columns counted from 1, the header by name) */
export function describeArea(a: CellArea): string {
  const span = (from: number, n: number, word: string) => (n === 1 ? `${word} ${from + 1}` : `${word}s ${from + 1} to ${from + n}`)
  const rows = a.row === -1 ? (a.rows === 1 ? 'the header' : `the header and ${a.rows === 2 ? 'row 1' : `rows 1 to ${a.rows - 1}`}`) : span(a.row, a.rows, 'row')
  return `${rows}, ${span(a.column, a.columns, 'column')}`
}

// ── the grid changes: rows and columns added, removed or sorted. Merges and highlights follow their cells. ──

/** a row added before body row `at` (at = the number of rows: at the end) */
export function insertRow(t: TableGrid, at: number): GridParts {
  const rows = t.rows.map((x) => [...x]); rows.splice(at, 0, t.header.map(() => ''))
  const merges = validMerges(t).map((a) => (a.row >= 0 && a.row >= at ? { ...a, row: a.row + 1 } : a.row >= 0 && a.row < at && at < a.row + a.rows ? { ...a, rows: a.rows + 1 } : a))
  const highlights = t.highlights?.map((h) => (h.row >= at ? { ...h, row: h.row + 1 } : h))
  const aligns = t.aligns?.map((h) => (h.row >= at ? { ...h, row: h.row + 1 } : h))
  return parts(t, { rows, merges, highlights, aligns })
}

/** body row `at` removed: an area through it gets one row shorter (its words move down when the top row goes), and drops when one cell is left */
export function removeRow(t: TableGrid, at: number): GridParts {
  const rows = t.rows.map((x) => [...x])
  const merges: CellArea[] = []
  for (const a of validMerges(t)) {
    if (a.row < 0 || a.row + a.rows <= at) { merges.push(a); continue }
    if (a.row > at) { merges.push({ ...a, row: a.row - 1 }); continue }
    // the row goes through this area
    if (a.row === at && a.rows > 1) rows[at + 1]![a.column] = rows[at]![a.column] ?? '' // the words were in the top-left cell, which is going
    const left = { ...a, row: a.row === at ? at : a.row, rows: a.rows - 1 }
    if (left.rows >= 1 && cellsOf(left) >= 2) merges.push(left)
  }
  rows.splice(at, 1)
  const highlights = t.highlights?.filter((h) => h.row !== at).map((h) => (h.row > at ? { ...h, row: h.row - 1 } : h))
  const aligns = t.aligns?.filter((h) => h.row !== at).map((h) => (h.row > at ? { ...h, row: h.row - 1 } : h))
  return parts(t, { rows, merges, highlights, aligns })
}

/** a column added before column `at` (header text `title`) */
export function insertColumn(t: TableGrid, at: number, title: string): GridParts {
  const header = [...t.header]; header.splice(at, 0, title)
  const rows = t.rows.map((x) => { const r = [...x]; r.splice(at, 0, ''); return r })
  const merges = validMerges(t).map((a) => (a.column >= at ? { ...a, column: a.column + 1 } : at < a.column + a.columns ? { ...a, columns: a.columns + 1 } : a))
  const highlights = t.highlights?.map((h) => (h.column >= at ? { ...h, column: h.column + 1 } : h))
  const aligns = t.aligns?.map((h) => (h.column >= at ? { ...h, column: h.column + 1 } : h))
  return parts(t, { header, rows, merges, highlights, aligns })
}

/** column `at` removed: an area through it gets one column narrower (its words move right when the left column goes), and drops when one cell is left */
export function removeColumn(t: TableGrid, at: number): GridParts {
  const header = [...t.header], rows = t.rows.map((x) => [...x])
  const merges: CellArea[] = []
  for (const a of validMerges(t)) {
    if (a.column + a.columns <= at) { merges.push(a); continue }
    if (a.column > at) { merges.push({ ...a, column: a.column - 1 }); continue }
    if (a.column === at && a.columns > 1) { if (a.row < 0) header[at + 1] = header[at] ?? ''; else rows[a.row]![at + 1] = rows[a.row]![at] ?? '' }
    const left = { ...a, columns: a.columns - 1 }
    if (cellsOf(left) >= 2) merges.push(left)
  }
  header.splice(at, 1); for (const r of rows) r.splice(at, 1)
  const highlights = t.highlights?.filter((h) => h.column !== at).map((h) => (h.column > at ? { ...h, column: h.column - 1 } : h))
  const aligns = t.aligns?.filter((h) => h.column !== at).map((h) => (h.column > at ? { ...h, column: h.column - 1 } : h))
  return parts(t, { header, rows, merges, highlights, aligns })
}

/**
 * The body rows put in a new order (`order[i]` = the old index of the row that goes to place i), e.g. a sort. Areas across one row travel with their row;
 * an area over several rows cannot be sorted through, so the sort is refused with the reason.
 */
export function reorderRows(t: TableGrid, order: number[]): { ok: true; parts: GridParts } | { ok: false; why: string } {
  const tall = validMerges(t).find((a) => a.row >= 0 && a.rows > 1)
  if (tall) return { ok: false, why: `cells are merged across rows (${describeArea(tall)}): unmerge them first` }
  const place = new Map(order.map((old, i) => [old, i]))
  const rows = order.map((old) => [...t.rows[old]!])
  const merges = validMerges(t).map((a) => (a.row >= 0 ? { ...a, row: place.get(a.row) ?? a.row } : a))
  const highlights = t.highlights?.map((h) => ({ ...h, row: place.get(h.row) ?? h.row }))
  const aligns = t.aligns?.map((h) => ({ ...h, row: place.get(h.row) ?? h.row }))
  return { ok: true, parts: parts(t, { rows, merges, highlights, aligns }) }
}

// ── alignment inside cells ──

/**
 * How a cell's words sit in it: its own alignment if set, else the table's defaults — the header row left (a header merged across columns centred, as PowerPoint
 * users expect a group heading), the rows left, everything centred up and down. A merged area uses its top-left cell's setting. ONE rule for screen and file.
 */
export function alignOf(t: TableGrid, row: number, column: number): { h: 'left' | 'center' | 'right'; v: 'top' | 'middle' | 'bottom' } {
  const own = t.aligns?.find((a) => a.row === row && a.column === column)
  const area = mergeAt(t, row, column)
  return { h: own?.h ?? (row === -1 && area && area.columns > 1 ? 'center' : 'left'), v: own?.v ?? 'middle' }
}

/** Sets the alignment of a block of cells (each drawn cell of it; a merged area through its top-left cell). Unset parts are left as they are. */
export function alignCells(t: TableGrid, a: CellArea, set: { h?: CellAlign['h']; v?: CellAlign['v'] }): GridParts {
  const span = cellSpans(t)
  const list = (t.aligns ?? []).map((x) => ({ ...x }))
  for (let r = a.row; r < a.row + a.rows; r++) for (let c = a.column; c < a.column + a.columns; c++) {
    if (span(r, c).covered) continue
    const i = list.findIndex((x) => x.row === r && x.column === c)
    const next = { ...(i >= 0 ? list[i]! : { row: r, column: c }), ...(set.h ? { h: set.h } : {}), ...(set.v ? { v: set.v } : {}) }
    if (i >= 0) list[i] = next; else list.push(next)
  }
  return parts(t, { aligns: list.slice(0, 200) })
}
