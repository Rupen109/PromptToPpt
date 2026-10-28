import type { Extracted } from './extract.ts'
import { SourceError } from './errors.ts'
import { clean, MAX_TEXT_CHARS } from './limits.ts'
import { decodeXml, readZip, utf8 } from './zip.ts'

/**
 * Word (.docx / .docm): a zip of XML. Reads body text in reading order — headings, paragraphs, lists, tables (a row is `cell | cell`), text boxes
 * (once), footnotes — and leaves out what is not the document's content: comments, headers/footers, deleted tracked changes, hidden text, field
 * codes. Parts are located by heading so a citation can say "Market size". No XML parser is used (nothing the file defines is ever expanded).
 */
export const DOCX_MAX_BYTES = 15 * 1024 * 1024
const LIMITS = { maxEntryBytes: 30 * 1024 * 1024, maxTotalBytes: 60 * 1024 * 1024, maxEntries: 400 }
const WANT = /^(word\/(document|footnotes|endnotes|styles|numbering)\.xml|docProps\/core\.xml)$/

interface StyleInfo { name: string; outline: number | null }
const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1]

function readStyles(xml: string | undefined): Map<string, StyleInfo> {
  const m = new Map<string, StyleInfo>()
  if (!xml) return m
  for (const st of xml.matchAll(/<w:style\b[^>]*>[\s\S]*?<\/w:style>/g)) {
    const id = attr(st[0], 'w:styleId'); if (!id) continue
    const name = attr(/<w:name\b[^>]*>/.exec(st[0])?.[0] ?? '', 'w:val') ?? ''
    const o = /<w:outlineLvl\b[^>]*w:val="(\d+)"/.exec(st[0])?.[1]
    m.set(id, { name, outline: o === undefined ? null : Number(o) })
  }
  return m
}

/** numId → for each list level, whether it counts (1. 2. 3.) or uses bullets */
interface ListLevel { ordered: boolean; start: number }
function readNumbering(xml: string | undefined): Map<string, ListLevel[]> {
  const abstract = new Map<string, ListLevel[]>()
  const out = new Map<string, ListLevel[]>()
  if (!xml) return out
  for (const a of xml.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
    const levels: ListLevel[] = []
    for (const l of a[2]!.matchAll(/<w:lvl\b[^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g)) levels[Number(l[1])] = { ordered: !/<w:numFmt\b[^>]*w:val="(bullet|none)"/.test(l[2]!), start: Number(/<w:start\b[^>]*w:val="(\d+)"/.exec(l[2]!)?.[1] ?? 1) }
    abstract.set(a[1]!, levels)
  }
  for (const n of xml.matchAll(/<w:num\b[^>]*w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g)) { const a = /<w:abstractNumId\b[^>]*w:val="(\d+)"/.exec(n[2]!)?.[1]; if (a && abstract.has(a)) out.set(n[1]!, abstract.get(a)!) }
  return out
}

type Block = { kind: 'heading'; level: number; text: string; title?: boolean } | { kind: 'para'; text: string; list?: boolean } | { kind: 'table'; rows: string[][] }

/** Text of one paragraph's runs: tabs and breaks become spaces; deleted / hidden text and field codes are not included (they are not <w:t>). */
function runsText(xml: string): string {
  const x = xml
    .replace(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:vanish\b[^>]*\/>[\s\S]*?<\/w:r>/g, '') // hidden runs
    .replace(/<w:(del|moveFrom)\b[\s\S]*?<\/w:\1>/g, '') // deleted tracked changes
  let out = ''
  for (const m of x.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(?:tab|br|cr|noBreakHyphen)\b[^>]*\/>/g)) out += m[1] !== undefined ? decodeXml(m[1]) : m[0].includes('noBreakHyphen') ? '-' : ' '
  return out.replace(/[ \t]+/g, ' ').trim()
}

function bodyBlocks(xmlIn: string, styles: Map<string, StyleInfo>, numbering: Map<string, ListLevel[]>): Block[] {
  const counters = new Map<string, number>()
  let xml = xmlIn
    .replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '') // shapes are stored twice (modern + legacy): keep one
    .replace(/<w:txbxContent>([\s\S]*?)<\/w:txbxContent>/g, (_m, inner: string) => { // text boxes: their text, inline, once
      const t = [...inner.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((p) => runsText(p[0])).filter(Boolean).join(' ')
      return t ? `<w:r><w:t xml:space="preserve"> [Text box: ${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}] </w:t></w:r>` : ''
    })
  xml = xml.replace(/<w:sdtPr>[\s\S]*?<\/w:sdtPr>/g, '').replace(/<w:pPrChange\b[\s\S]*?<\/w:pPrChange>/g, '')
  const blocks: Block[] = []
  const para = (p: string): Block | null => {
    const text = runsText(p)
    if (!text) return null
    const ppr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(p)?.[0] ?? ''
    const styleId = attr(/<w:pStyle\b[^>]*>/.exec(ppr)?.[0] ?? '', 'w:val') ?? ''
    const st = styles.get(styleId)
    const own = /<w:outlineLvl\b[^>]*w:val="(\d+)"/.exec(ppr)?.[1]
    const isTitle = /^(title|subtitle)$/i.test(st?.name ?? styleId)
    const byName = /^(?:heading|überschrift|titre|título|titolo)\s*(\d)$/i.exec(st?.name ?? styleId)?.[1] ?? (isTitle ? '1' : undefined)
    const level = own !== undefined ? Number(own) + 1 : st?.outline != null ? st.outline + 1 : byName ? Number(byName) : 0
    if (level >= 1 && level <= 9 && text.length < 300) return isTitle ? { kind: 'heading', level, text, title: true } : { kind: 'heading', level, text }
    const numId = /<w:numId\b[^>]*w:val="(\d+)"/.exec(ppr)?.[1]
    if (numId !== undefined || /list/i.test(st?.name ?? '')) {
      const il = Math.min(Number(/<w:ilvl\b[^>]*w:val="(\d+)"/.exec(ppr)?.[1] ?? 0), 4)
      const level = numId !== undefined ? numbering.get(numId)?.[il] : undefined
      const ordered = level?.ordered ?? /number|ordered/i.test(st?.name ?? '')
      let marker = '-'
      if (ordered) {
        // like Word: a list keeps counting across ordinary paragraphs; a deeper level starts again when its parent moves on; another list has its own count
        const list = numId ?? styleId; const k = `${list}:${il}`
        const n = (counters.has(k) ? counters.get(k)! : (level?.start ?? 1) - 1) + 1
        counters.set(k, n)
        for (const key of [...counters.keys()]) { const [l2, lv2] = [key.slice(0, key.lastIndexOf(':')), Number(key.slice(key.lastIndexOf(':') + 1))]; if (l2 === list && lv2 > il) counters.delete(key) }
        marker = `${n}.`
      }
      return { kind: 'para', text: `${'  '.repeat(il)}${marker} ${text}`, list: true }
    }
    return { kind: 'para', text }
  }
  // walk top-level paragraphs and tables in order; a table's cells hold their paragraphs (nested tables are flattened into the cell)
  const re = /<w:tbl>|<\/w:tbl>|<w:tr\b[^>]*>|<\/w:tr>|<w:tc\b[^>]*>|<\/w:tc>|<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g
  let depth = 0, rows: string[][] = [], row: string[] = [], cell: string[] = []
  for (const m of xml.matchAll(re)) {
    const t = m[0]
    if (t === '<w:tbl>') { if (depth++ === 0) rows = [] }
    else if (t === '</w:tbl>') { if (--depth === 0 && rows.length) blocks.push({ kind: 'table', rows }) }
    else if (t.startsWith('<w:tr')) { if (depth === 1) row = [] }
    else if (t === '</w:tr>') { if (depth === 1 && row.some(Boolean)) rows.push(row) }
    else if (t.startsWith('<w:tc')) { if (depth === 1) cell = [] }
    else if (t === '</w:tc>') { if (depth === 1) row.push(cell.join(' ').trim()) }
    else if (t.startsWith('<w:p')) {
      if (t.endsWith('/>')) continue
      const b = para(t)
      if (!b) continue
      const text = b.kind === 'heading' || b.kind === 'para' ? b.text : ''
      if (depth > 0) cell.push(text.replace(/^\s*(?:-|\d+\.) /, ''))
      else blocks.push(b)
    }
  }
  return blocks
}

function notesText(xml: string | undefined): string {
  if (!xml) return ''
  return [...xml.matchAll(/<w:(?:footnote|endnote)\b([^>]*)>([\s\S]*?)<\/w:(?:footnote|endnote)>/g)]
    .filter((m) => !/w:type="(separator|continuationSeparator|continuationNotice)"/.test(m[1]!))
    .map((m) => [...m[2]!.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((p) => runsText(p[0])).filter(Boolean).join(' '))
    .filter(Boolean).map((t, i) => `${i + 1}. ${t}`).join('\n')
}

export function fromDocx(bytes: Uint8Array, filename: string): Extracted {
  const z = readZip(bytes, (n) => WANT.test(n), LIMITS, 'That Word file is too large or unusual to read')
  const docXml = z['word/document.xml']
  if (!docXml) throw new SourceError('That file is not a Word (.docx) document')
  const styles = readStyles(z['word/styles.xml'] ? utf8(z['word/styles.xml']) : undefined)
  const blocks = bodyBlocks(utf8(docXml), styles, readNumbering(z['word/numbering.xml'] ? utf8(z['word/numbering.xml']) : undefined))

  // parts: one per top-level section (the shallowest heading level present, at most 2)
  const levels = blocks.filter((b): b is Extract<Block, { kind: 'heading' }> => b.kind === 'heading' && !b.title).map((b) => b.level)
  const cut = levels.length ? Math.min(2, levels.reduce((m, x) => Math.min(m, x), 9)) : 0 // (no spread: a hostile file can have hundreds of thousands of headings)
  const parts: Extracted['parts'] = []
  let loc: string | null = null, lines: string[] = []
  const flush = () => { const t = clean(lines.join('\n')); if (t) parts.push({ locator: loc, text: t }); lines = [] }
  let produced = 0
  for (const b of blocks) {
    if (produced > MAX_TEXT_CHARS * 1.5) break // far more than will ever be kept: do not build the rest
    produced += b.kind === 'table' ? b.rows.length * 20 : b.text.length
    if (b.kind === 'heading') {
      if (b.title) lines.push(b.text, '')
      else if (b.level <= cut) { flush(); loc = b.text.slice(0, 80); lines.push(b.text) } else lines.push('', `${'#'.repeat(b.level)} ${b.text}`)
    } else if (b.kind === 'table') { lines.push(''); for (const r of b.rows) lines.push(r.join(' | ').replace(/(?:\s*\|)+\s*$/, '')); lines.push('') }
    else if (b.list) lines.push(b.text)
    else lines.push('', b.text)
  }
  flush()
  if (parts.length > 1 && parts[0]!.locator === null && parts[0]!.text.length < 300) { const first = parts.shift()!; parts[0]!.text = `${first.text}\n\n${parts[0]!.text}` } // a lone title line belongs with the first section
  const notes = notesText(z['word/footnotes.xml'] ? utf8(z['word/footnotes.xml']) : undefined) + (z['word/endnotes.xml'] ? `\n${notesText(utf8(z['word/endnotes.xml']))}` : '')
  if (clean(notes)) parts.push({ locator: 'Notes', text: clean(notes) })
  let budget = MAX_TEXT_CHARS
  const capped = parts.map((p) => { const t = p.text.slice(0, Math.max(0, budget)); budget -= p.text.length; return { ...p, text: t } }).filter((p) => p.text)
  if (capped.length === 0) throw new SourceError('No text found in that Word document (it may contain only pictures)')

  const core = z['docProps/core.xml'] ? decodeXml(/<dc:title>([\s\S]*?)<\/dc:title>/.exec(utf8(z['docProps/core.xml']))?.[1] ?? '').trim() : ''
  const firstHeading = blocks.find((b) => b.kind === 'heading')
  const title = (core && !/^(untitled|document\d*|microsoft word.*)$/i.test(core) ? core : firstHeading && firstHeading.kind === 'heading' ? firstHeading.text : '') || filename.replace(/\.(docx|docm)$/i, '')
  return { title: title.slice(0, 200) || 'Word document', parts: capped }
}
