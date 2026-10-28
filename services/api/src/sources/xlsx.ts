import type { Extracted } from './extract.ts'
import { SourceError } from './errors.ts'
import { MAX_ROWS, newBudget, sheetParts, type SheetRows } from './table.ts'
import { decodeXml, readZip, utf8 } from './zip.ts'

/**
 * Excel (.xlsx / .xlsm): one part per VISIBLE sheet (hidden sheets are skipped — they are hidden for a reason), in workbook order. Cells are read as
 * the person sees them: dates as dates, percentages as percentages, formulas as their last calculated value, no floating-point noise. A sheet is
 * cut at MAX_ROWS rows with an honest note. No XML parser is used.
 */
export const XLSX_MAX_BYTES = 15 * 1024 * 1024
const LIMITS = { maxEntryBytes: 40 * 1024 * 1024, maxTotalBytes: 80 * 1024 * 1024, maxEntries: 400 }
const WANT = /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/
const MAX_COLS = 60

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1]
const colIndex = (ref: string) => { let n = 0; for (const ch of /^[A-Z]+/.exec(ref)?.[0] ?? '') n = n * 26 + ch.charCodeAt(0) - 64; return n - 1 }

const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58])
const isDateFormat = (code: string) => /[ymdhs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\.|_.|\*./g, '')) && !/^0|#/.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, '')) 

function styleKinds(xml: string | undefined): ('date' | 'percent' | 'number')[] {
  if (!xml) return []
  const custom = new Map<number, string>()
  for (const m of xml.matchAll(/<numFmt\b[^>]*>/g)) { const id = Number(attr(m[0], 'numFmtId')); const code = decodeXml(attr(m[0], 'formatCode') ?? ''); if (id) custom.set(id, code) }
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? ''
  return [...cellXfs.matchAll(/<xf\b[^>]*>/g)].map((m) => {
    const id = Number(attr(m[0], 'numFmtId') ?? 0)
    if (id === 9 || id === 10) return 'percent'
    if (BUILTIN_DATE.has(id)) return 'date'
    const code = custom.get(id)
    if (code === undefined) return 'number'
    return code.includes('%') ? 'percent' : isDateFormat(code) ? 'date' : 'number'
  })
}

const num = (v: number) => String(Number(v.toPrecision(12)))
function serialToDate(serial: number, date1904: boolean): string {
  if (serial >= 0 && serial < 1) { const mins = Math.round(serial * 1440); return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}` } // a time of day on its own
  const ms = Math.round(((date1904 ? serial - 24107 : serial >= 61 ? serial - 25569 : serial - 25568) * 86400000))
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return String(serial)
  const iso = d.toISOString()
  return serial % 1 === 0 ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
}

export function fromXlsx(bytes: Uint8Array, filename: string): Extracted {
  const z = readZip(bytes, (n) => WANT.test(n), LIMITS, 'That workbook is too large or unusual to read. Save just the part you need as a smaller file or as CSV.')
  const wbXml = z['xl/workbook.xml']
  if (!wbXml) throw new SourceError('That file is not an Excel (.xlsx) workbook')
  const wb = utf8(wbXml)
  const date1904 = /<workbookPr\b[^>]*date1904="(1|true)"/.test(wb)
  const rels = new Map<string, string>()
  if (z['xl/_rels/workbook.xml.rels']) for (const m of utf8(z['xl/_rels/workbook.xml.rels']).matchAll(/<Relationship\b[^>]*>/g)) { const id = attr(m[0], 'Id'), t = attr(m[0], 'Target'); if (id && t) rels.set(id, t.replace(/^\/?(xl\/)?/, '')) }
  const shared: string[] = []
  if (z['xl/sharedStrings.xml']) for (const si of utf8(z['xl/sharedStrings.xml']).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(decodeXml([...si[1]!.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')))
  const kinds = styleKinds(z['xl/styles.xml'] ? utf8(z['xl/styles.xml']) : undefined)

  const sheets: SheetRows[] = []
  let hidden = 0
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = decodeXml(attr(m[0], 'name') ?? `Sheet ${sheets.length + hidden + 1}`)
    if (/hidden/i.test(attr(m[0], 'state') ?? '')) { hidden++; continue }
    const target = rels.get(attr(m[0], 'r:id') ?? '')
    const xml = target ? z[`xl/${target}`] : undefined
    if (!xml) continue
    const s = utf8(xml)
    const rows: SheetRows['rows'] = []
    let omitted = 0
    for (const r of s.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const body = r[2]
      if (!body) continue
      if (rows.length >= MAX_ROWS) { omitted++; continue }
      const rn = Number(attr(r[1]!, 'r') ?? rows.length + 1)
      const cells: string[] = []
      for (const c of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const head = c[1]!, inner = c[2] ?? ''
        const ci = colIndex(attr(head, 'r') ?? 'A1'); if (ci >= MAX_COLS) continue
        const t = attr(head, 't')
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] || undefined // an empty <v/> is a cell that was never calculated
        let out = ''
        if (t === 'inlineStr') out = decodeXml([...inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''))
        else if (v === undefined) { const f = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(inner)?.[1]; out = f ? `=${decodeXml(f).slice(0, 60)}` : '' } // a formula nobody has calculated yet (files written by programs): show the formula rather than nothing
        else if (t === 's') out = shared[Number(v)] ?? ''
        else if (t === 'str') out = decodeXml(v)
        else if (t === 'b') out = v === '1' ? 'TRUE' : 'FALSE'
        else if (t === 'e') out = decodeXml(v)
        else if (t === 'd') out = v.slice(0, 16).replace('T', ' ')
        else {
          const n = Number(v)
          if (!Number.isFinite(n)) out = decodeXml(v)
          else { const k = kinds[Number(attr(head, 's') ?? 0)]; out = k === 'date' ? serialToDate(n, date1904) : k === 'percent' ? `${num(n * 100)}%` : num(n) }
        }
        while (cells.length < ci) cells.push('')
        cells[ci] = out.trim()
      }
      rows.push({ n: rn, cells })
    }
    sheets.push({ name, rows, omittedRows: omitted })
  }
  const budget = newBudget()
  const parts = sheets.flatMap((sh) => sheetParts(sh, budget))
  if (parts.length === 0) throw new SourceError(sheets.length === 0 && hidden > 0 ? 'Every sheet in that workbook is hidden, so there is nothing to read' : 'No data found in that spreadsheet (it may be empty, or hold only charts and pictures)')
  return { title: filename.replace(/\.(xlsx|xlsm)$/i, '').slice(0, 200) || 'Spreadsheet', parts }
}
