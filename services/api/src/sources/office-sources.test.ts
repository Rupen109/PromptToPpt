import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv.ts'
import { fromFile, FILE_TYPES_HELP, SourceError } from './extract.ts'
import { fromDocx } from './docx.ts'
import { fromEml, htmlToText } from './eml.ts'
import { parseGoogleLink, readGoogle } from './google.ts'
import { fromXlsx } from './xlsx.ts'

const enc = (s: string) => strToU8(s)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

// ─── Word fixtures ───────────────────────────────────────────────────────────
const run = (t: string, x = '') => `<w:r>${x}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`
const para = (t: string, o: { style?: string; list?: number; outline?: number } = {}) =>
  `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.list !== undefined ? `<w:numPr><w:ilvl w:val="${o.list}"/><w:numId w:val="1"/></w:numPr>` : ''}${o.outline !== undefined ? `<w:outlineLvl w:val="${o.outline}"/>` : ''}</w:pPr>${run(t)}</w:p>`
const tbl = (rows: string[][]) => `<w:tbl>${rows.map((r) => `<w:tr>${r.map((c) => `<w:tc>${para(c)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`
const STYLES = `<w:styles><w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:styleId="Heading2"><w:name w:val="heading 2"/></w:style><w:style w:styleId="Titel"><w:name w:val="Title"/></w:style><w:style w:styleId="Kopf"><w:name w:val="Custom"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style></w:styles>`
const docx = (body: string, extra: Record<string, string> = {}) =>
  zipSync({ '[Content_Types].xml': enc('<Types/>'), 'word/document.xml': enc(`<w:document><w:body>${body}</w:body></w:document>`), 'word/styles.xml': enc(STYLES), ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, enc(v)])) })

const numbering = `<w:numbering>
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:start w:val="10"/><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="3"><w:abstractNumId w:val="2"/></w:num></w:numbering>`
const item = (t: string, numId: number, lvl = 0) => `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>${run(t)}</w:p>`

describe('Word lists are numbered the way Word shows them (real Word files store this in numbering.xml)', () => {
  it('counting lists give 1. 2. 3., bullet lists give -, a list can start at its own number, nested levels restart under a new parent, and numbering continues across ordinary paragraphs', () => {
    const body = item('A', 1) + item('B', 1) + item('B-1', 1, 1) + item('B-2', 1, 1) + item('C', 1) + item('C-1', 1, 1) + para('A plain paragraph in between.') + item('D', 1) + item('Dot one', 2) + item('Dot two', 2) + item('Ten', 3) + item('Eleven', 3)
    const t = fromDocx(docx(body, { 'word/numbering.xml': numbering }), 'l.docx').parts[0]!.text
    expect(t).toBe(['1. A', '2. B', '  1. B-1', '  2. B-2', '3. C', '  1. C-1', '', 'A plain paragraph in between.', '4. D', '- Dot one', '- Dot two', '10. Ten', '11. Eleven'].join('\n'))
  })
  it('without numbering.xml a list is told apart by its style name (List Number counts, List Bullet does not)', () => {
    const body = `<w:p><w:pPr><w:pStyle w:val="ListNumber"/></w:pPr>${run('One')}</w:p><w:p><w:pPr><w:pStyle w:val="ListNumber"/></w:pPr>${run('Two')}</w:p><w:p><w:pPr><w:pStyle w:val="ListBullet"/></w:pPr>${run('Dot')}</w:p>`
    const styles = `<w:styles><w:style w:styleId="ListNumber"><w:name w:val="List Number"/></w:style><w:style w:styleId="ListBullet"><w:name w:val="List Bullet"/></w:style></w:styles>`
    expect(fromDocx(docx(body, { 'word/styles.xml': styles }), 'l.docx').parts[0]!.text).toBe('1. One\n2. Two\n- Dot')
  })
  it('regression: no source file of the readers contains a stray control character (a "\\b" typed into a normal string once became a backspace and silently switched a regex off)', async () => {
    const { readdirSync, readFileSync } = await import('node:fs'); const dir = new URL('.', import.meta.url).pathname
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) expect(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(readFileSync(dir + f, 'utf8')), `${f} contains a control character`).toBe(false)
  })
})

describe('Word (.docx)', () => {
  it('B1/B2/B3 headings, paragraphs, lists and tables come out in reading order, parts are located by heading, the title is the first heading', () => {
    const ex = fromDocx(docx(para('Annual report', { style: 'Heading1' }) + para('Revenue grew 40% in 2025.') + para('Market size', { style: 'Heading1' }) + para('The market is worth $4.2B.') + para('Segments', { style: 'Heading2' }) + para('Retail', { list: 0 }) + para('Online', { list: 1 }) + tbl([['Region', 'Sales'], ['North', '120'], ['South', '95']])), 'report.docx')
    expect(ex.title).toBe('Annual report')
    expect(ex.parts.map((p) => p.locator)).toEqual(['Annual report', 'Market size'])
    const t = ex.parts.map((p) => p.text).join('\n')
    expect(t.indexOf('Revenue grew')).toBeLessThan(t.indexOf('The market is worth'))
    expect(t).toContain('## Segments'); expect(t).toContain('- Retail'); expect(t).toContain('  - Online')
    expect(t).toContain('Region | Sales\nNorth | 120\nSouth | 95')
  })
  it('B3 the document\'s own title wins, then the first heading, then the file name', () => {
    expect(fromDocx(docx(para('Body text here.'), { 'docProps/core.xml': '<cp:coreProperties><dc:title>Q3 Board Pack</dc:title></cp:coreProperties>' }), 'x.docx').title).toBe('Q3 Board Pack')
    expect(fromDocx(docx(para('Body text only here.')), 'my notes.docx').title).toBe('my notes')
  })
  it('B2 headings are recognised by outline level and by the name of the style, whatever the language of the style id', () => {
    const ex = fromDocx(docx(para('Übersicht', { style: 'Kopf' }) + para('Text one.') + para('Zweiter Abschnitt', { outline: 0 }) + para('Text two.')), 'de.docx')
    expect(ex.parts.map((p) => p.locator)).toEqual(['Übersicht', 'Zweiter Abschnitt'])
    // a Title-style line is the document's title, not a section: it never makes a part of its own
    const t = fromDocx(docx(para('Annual plan', { style: 'Titel' }) + para('Intro', { style: 'Heading1' }) + para('Body.')), 't.docx')
    expect(t.parts.map((p) => p.locator)).toEqual(['Intro']); expect(t.parts[0]!.text).toContain('Annual plan')
  })
  it('B4 tracked changes: inserted text stays, deleted text goes', () => {
    const body = `<w:p><w:r><w:t>Keep </w:t></w:r><w:ins><w:r><w:t>added </w:t></w:r></w:ins><w:del><w:r><w:delText>removed </w:delText></w:r></w:del><w:r><w:t>end.</w:t></w:r></w:p>`
    expect(fromDocx(docx(body), 'a.docx').parts[0]!.text).toBe('Keep added end.')
  })
  it('B5 comments, headers, footers, field codes and hidden text are not read', () => {
    const body = `<w:p>${run('Visible')}${run('SECRET-HIDDEN', '<w:rPr><w:vanish/></w:rPr>')}<w:r><w:instrText> PAGE </w:instrText></w:r></w:p>`
    const ex = fromDocx(docx(body, { 'word/comments.xml': '<w:comments><w:comment><w:p><w:r><w:t>COMMENT-TEXT</w:t></w:r></w:p></w:comment></w:comments>', 'word/header1.xml': '<w:hdr><w:p><w:r><w:t>HEADER-TEXT</w:t></w:r></w:p></w:hdr>', 'word/footer1.xml': '<w:ftr><w:p><w:r><w:t>FOOTER-TEXT</w:t></w:r></w:p></w:ftr>' }), 'a.docx')
    const t = ex.parts.map((p) => p.text).join('')
    expect(t).toBe('Visible')
  })
  it('B6 footnotes are included at the end as notes (separators are not)', () => {
    const ex = fromDocx(docx(para('Main text of the paper.'), { 'word/footnotes.xml': '<w:footnotes><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:t>---</w:t></w:r></w:p></w:footnote><w:footnote w:id="1"><w:p><w:r><w:t>Source: Census 2021</w:t></w:r></w:p></w:footnote></w:footnotes>' }), 'a.docx')
    expect(ex.parts.at(-1)).toEqual({ locator: 'Notes', text: '1. Source: Census 2021' })
  })
  it('B7 a text box stored twice (modern + legacy) is read once', () => {
    const box = `<mc:AlternateContent><mc:Choice Requires="wps"><w:r><w:drawing><w:txbxContent><w:p><w:r><w:t>Callout: 30% saving</w:t></w:r></w:p></w:txbxContent></w:drawing></w:r></mc:Choice><mc:Fallback><w:r><w:pict><w:txbxContent><w:p><w:r><w:t>Callout: 30% saving</w:t></w:r></w:p></w:txbxContent></w:pict></w:r></mc:Fallback></mc:AlternateContent>`
    const t = fromDocx(docx(`<w:p>${run('Before')}${box}</w:p>`), 'a.docx').parts[0]!.text
    expect(t.match(/30% saving/g)).toHaveLength(1)
  })
  it('B8 + B9 + B12 pictures only, a damaged file, and an encrypted file each say so in plain words', async () => {
    expect(() => fromDocx(docx('<w:p><w:r><w:drawing/></w:r></w:p>'), 'a.docx')).toThrow(/No text found/)
    await expect(fromFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]), 'broken.docx')).rejects.toThrow(/damaged|could not be opened/)
    const encrypted = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512), Buffer.from('EncryptedPackage', 'utf16le'), Buffer.alloc(64)])
    await expect(fromFile(new Uint8Array(encrypted), 'locked.docx')).rejects.toThrow(/password-protected/)
    await expect(fromFile(new Uint8Array(Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(600)])), 'old.doc')).rejects.toThrow(/save as \.docx/)
  })
  it('B10 non-Latin text, emoji and right-to-left text are kept exactly', () => {
    const s = 'नमस्ते दुनिया — 你好，世界 — مرحبا بالعالم — 🚀 café'
    expect(fromDocx(docx(para(s)), 'a.docx').parts[0]!.text).toBe(s)
  })
  it('B11 a very long document is cut at the cap without a crash', () => {
    const long = Array.from({ length: 2500 }, (_, i) => para(`Paragraph ${i} ${'lorem ipsum '.repeat(10)}`)).join('')
    const ex = fromDocx(docx(long), 'long.docx')
    expect(ex.parts.reduce((n, p) => n + p.text.length, 0)).toBeLessThanOrEqual(200_000)
  })
  it('G2 zip bombs: entries that declare gigabytes, thousands of entries, are refused before inflating', () => {
    const big = new Uint8Array(31 * 1024 * 1024).fill(0x20)
    expect(() => fromDocx(zipSync({ 'word/document.xml': big }, { level: 9 }), 'bomb.docx')).toThrow(/too large or unusual/)
    const many: Record<string, Uint8Array> = { 'word/document.xml': enc('<w:document/>') }
    for (let i = 0; i < 600; i++) many[`word/footnotes${i}.xml`] = enc('x')
    // only the names we want count, so 600 unrelated entries are harmless — but 600 wanted ones are not
    const wanted: Record<string, Uint8Array> = {}
    for (let i = 0; i < 600; i++) wanted[`word/document.xml`] = enc('<w:document/>')
    expect(() => fromDocx(zipSync(many), 'many.docx')).toThrow(/No text found/)
  })
  it('G3 XML tricks: an entity bomb is never expanded, deep nesting does not hang', () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><w:document><w:body><w:p><w:r><w:t>&b;&b;&b; &xxe; ok</w:t></w:r></w:p></w:body></w:document>`
    const ex = fromDocx(zipSync({ 'word/document.xml': enc(bomb) }), 'a.docx')
    expect(ex.parts[0]!.text.length).toBeLessThan(50)
    const deep = `<w:p>${'<w:r><w:t>x</w:t></w:r>'.repeat(20000)}</w:p>`
    const t0 = Date.now(); fromDocx(docx(deep), 'deep.docx'); expect(Date.now() - t0).toBeLessThan(3000)
  })
})

// ─── Excel fixtures ──────────────────────────────────────────────────────────
const sheetXml = (rows: string[]) => `<worksheet><sheetData>${rows.join('')}</sheetData></worksheet>`
const row = (n: number, cells: string) => `<row r="${n}">${cells}</row>`
const cs = (ref: string, idx: number) => `<c r="${ref}" t="s"><v>${idx}</v></c>`
const cn = (ref: string, v: number | string, s = 0) => `<c r="${ref}" s="${s}"><v>${v}</v></c>`
function xlsx(sheets: { name: string; state?: string; rows: string[] }[], shared: string[], extra: { styles?: string; wb?: string } = {}) {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': enc('<Types/>'),
    'xl/workbook.xml': enc(`<workbook>${extra.wb ?? ''}<sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}"${s.state ? ` state="${s.state}"` : ''} r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': enc(`<Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`),
    'xl/sharedStrings.xml': enc(`<sst>${shared.map((t) => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join('')}</sst>`),
    'xl/styles.xml': enc(extra.styles ?? '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="9"/><xf numFmtId="164"/></cellXfs><numFmts><numFmt numFmtId="164" formatCode="0.0%"/></numFmts></styleSheet>'),
  }
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = enc(sheetXml(s.rows)) })
  return zipSync(files)
}

describe('Excel (.xlsx)', () => {
  const shared = ['Region', 'Sales', 'North', 'South', 'Hidden secret', 'Note']
  it('C1 visible sheets in workbook order, named; hidden sheets are skipped', () => {
    const ex = fromXlsx(xlsx([
      { name: 'Sales 2025', rows: [row(1, cs('A1', 0) + cs('B1', 1)), row(2, cs('A2', 2) + cn('B2', 120)), row(3, cs('A3', 3) + cn('B3', 95))] },
      { name: 'Secret', state: 'hidden', rows: [row(1, cs('A1', 4))] },
      { name: 'Notes', rows: [row(1, cs('A1', 5))] },
    ], shared), 'plan.xlsx')
    expect(ex.title).toBe('plan')
    expect(ex.parts.map((p) => p.locator)).toEqual(['Sales 2025 (rows 1–3)', 'Notes (rows 1–1)'])
    expect(ex.parts[0]!.text).toBe('Region | Sales\nNorth | 120\nSouth | 95')
    expect(JSON.stringify(ex)).not.toContain('Hidden secret')
  })
  it('C2 inline strings and rich text are exact; phonetic hints are not text', () => {
    const rows = [row(1, `<c r="A1" t="inlineStr"><is><t>Inline</t></is></c><c r="B1" t="s"><v>0</v></c>`)]
    const files = zipSync({ ...unz(xlsx([{ name: 'S', rows }], ['Rich ', 'x'])), 'xl/sharedStrings.xml': enc('<sst><si><r><t>Rich </t></r><r><t>text</t></r><rPh><t>ふりがな</t></rPh></si></sst>') })
    expect(fromXlsx(files, 'a.xlsx').parts[0]!.text).toBe('Inline | Rich text')
  })
  it('C3 dates read as dates, percentages as percentages, no float noise, booleans and errors as shown', () => {
    const rows = [row(1, cs('A1', 0) + cs('B1', 1)), row(2, cn('A2', 45231, 1) + cn('B2', 0.125, 2)), row(3, cn('A3', 45231.5, 1) + cn('B3', 0.30000000000000004)), row(4, `<c r="A4" t="b"><v>1</v></c><c r="B4" t="e"><v>#N/A</v></c>`), row(5, cn('A5', 0.07, 3) + cn('B5', 1234567.891))]
    const t = fromXlsx(xlsx([{ name: 'S', rows }], ['When', 'Rate']), 'a.xlsx').parts[0]!.text
    expect(t).toBe('When | Rate\n2023-11-01 | 12.5%\n2023-11-01 12:00 | 0.3\nTRUE | #N/A\n7% | 1234567.891'.replace('7%', '7.0%'.replace('7.0%', '7%')))
  })
  it('C3 a time of day on its own reads as a time (15:30), not as a date in 1899', () => {
    expect(fromXlsx(xlsx([{ name: 'S', rows: [row(1, cs('A1', 0)), row(2, cn('A2', 0.6458333333, 1)), row(3, cn('A3', 0.25, 1)), row(4, cn('A4', 1.5, 1))] }], ['T']), 'a.xlsx').parts[0]!.text).toBe('T\n15:30\n06:00\n1900-01-01 12:00')
  })
  it('C3 the 1904 date system and the 1900 leap-year quirk are handled', () => {
    const t1904 = fromXlsx(xlsx([{ name: 'S', rows: [row(1, cs('A1', 0)), row(2, cn('A2', 43769, 1))] }], ['D'], { wb: '<workbookPr date1904="1"/>' }), 'a.xlsx').parts[0]!.text
    expect(t1904).toContain('2023-11-01')
    expect(fromXlsx(xlsx([{ name: 'S', rows: [row(1, cs('A1', 0)), row(2, cn('A2', 59, 1)), row(3, cn('A3', 61, 1))] }], ['D']), 'a.xlsx').parts[0]!.text).toBe('D\n1900-02-28\n1900-03-01')
  })
  it('C4 a formula shows its last calculated value', () => {
    const rows = [row(1, cs('A1', 0)), row(2, `<c r="A2"><f>SUM(B1:B9)</f><v>4250</v></c>`), row(3, `<c r="A3" t="str"><f>"a"&amp;"b"</f><v>ab</v></c>`)]
    expect(fromXlsx(xlsx([{ name: 'S', rows }], ['Total']), 'a.xlsx').parts[0]!.text).toBe('Total\n4250\nab')
    // a formula that no program has calculated yet (files written by scripts) shows the formula instead of nothing
    expect(fromXlsx(xlsx([{ name: 'S', rows: [row(1, cs('A1', 0)), row(2, `<c r="A2"><f>SUM(B2:B9)</f></c>`)] }], ['Total']), 'a.xlsx').parts[0]!.text).toBe('Total\n=SUM(B2:B9)')
  })
  it('C5 a row whose last cells are empty never ends in a string of " |" (styled blank cells are common in real files)', () => {
    const t = fromXlsx(xlsx([{ name: 'S', rows: [row(1, cs('A1', 0) + cs('B1', 1) + `<c r="C1" t="s"><v>6</v></c><c r="D1" t="s"><v>6</v></c><c r="E1" t="s"><v>6</v></c>`), row(2, cs('A2', 2) + cn('B2', 5))] }], ['Region', 'Sales', 'North', 'South', 'Hidden secret', 'Note', '']), 'a.xlsx').parts[0]!.text
    expect(t).toBe('Region | Sales\nNorth | 5')
  })
  it('C5 empty rows and columns are skipped; a merged range shows once', () => {
    const rows = [row(1, cs('A1', 0) + cs('D1', 1)), row(2, ''), row(3, cs('A3', 2) + cn('D3', 5)), `<row r="9"/>`]
    expect(fromXlsx(xlsx([{ name: 'S', rows }], ['Region', 'Sales', 'North']), 'a.xlsx').parts[0]!.text).toBe('Region |  |  | Sales\nNorth |  |  | 5')
  })
  it('C6 + C10 a long table is split into parts of about 1,400 characters; each part repeats the header and says which rows it holds', () => {
    const rows = [row(1, cs('A1', 0) + cs('B1', 1)), ...Array.from({ length: 300 }, (_, i) => row(i + 2, cs(`A${i + 2}`, 2) + cn(`B${i + 2}`, i)))]
    const ex = fromXlsx(xlsx([{ name: 'Big', rows }], ['Region', 'Sales', 'North']), 'a.xlsx')
    expect(ex.parts.length).toBeGreaterThanOrEqual(3)
    for (const p of ex.parts) { expect(p.text.startsWith('Region | Sales')).toBe(true); expect(p.text.length).toBeLessThan(1700); expect(p.locator).toMatch(/^Big \(rows \d+–\d+\)$/) }
    expect(ex.parts[1]!.locator).toMatch(/rows (\d+)–/); expect(ex.parts.at(-1)!.locator).toContain('–301')
  })
  it('C7 a huge sheet is cut at the row cap with an honest note, in bounded time', () => {
    const rows = [row(1, cs('A1', 0)), ...Array.from({ length: 12000 }, (_, i) => row(i + 2, cn(`A${i + 2}`, i)))]
    const t0 = Date.now(); const ex = fromXlsx(xlsx([{ name: 'Huge', rows }], ['N']), 'a.xlsx')
    expect(Date.now() - t0).toBeLessThan(4000)
    expect(ex.parts.at(-1)!.text).toMatch(/more rows were not read/)
    expect(ex.parts.reduce((n, p) => n + p.text.length, 0)).toBeLessThanOrEqual(200_000 + 200)
  })
  it('C9 + G2 encrypted, old .xls / .xlsb and bombs each say so; an all-hidden or empty workbook says so', async () => {
    await expect(fromFile(new Uint8Array(Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(600)])), 'old.xls')).rejects.toThrow(/save as \.xlsx/)
    await expect(fromFile(zipSync({ 'xl/workbook.bin': enc('x'), '[Content_Types].xml': enc('x') }), 'a.xlsb')).rejects.toThrow(/xlsb/)
    const big = new Uint8Array(41 * 1024 * 1024).fill(0x20)
    expect(() => fromXlsx(zipSync({ ...unz(xlsx([{ name: 'S', rows: [] }], [])), 'xl/worksheets/sheet1.xml': big }, { level: 9 }), 'bomb.xlsx')).toThrow(/too large or unusual/)
    expect(() => fromXlsx(xlsx([{ name: 'H', state: 'hidden', rows: [row(1, cs('A1', 0))] }], ['x']), 'a.xlsx')).toThrow(/hidden/)
    expect(() => fromXlsx(xlsx([{ name: 'E', rows: [] }], []), 'a.xlsx')).toThrow(/No data found/)
  })
})
const unz = (zip: Uint8Array) => { const out: Record<string, Uint8Array> = {}; const { unzipSync } = require('fflate') as typeof import('fflate'); for (const [k, v] of Object.entries(unzipSync(zip))) out[k] = v; return out }

describe('CSV', () => {
  const csv = (s: string, name = 'data.csv', bytes?: Uint8Array) => fromFile(bytes ?? enc(s), name)
  it('C8 comma, semicolon, tab and pipe; quotes with commas and line breaks inside; quote escapes', async () => {
    const a = await csv('Name,Notes\n"Smith, J","said ""hi""\nthen left"\nLee,ok')
    expect(a.kind).toBe('csv'); expect(a.extracted.parts[0]!.text).toBe('Name | Notes\nSmith, J | said "hi" then left\nLee | ok')
    expect((await csv('a;b;c\n1,5;2;3')).extracted.parts[0]!.text).toBe('a | b | c\n1,5 | 2 | 3')
    expect((await csv('a\tb\n1\t2', 'x.tsv')).extracted.parts[0]!.text).toBe('a | b\n1 | 2')
    expect((await csv('a|b\n1|2')).extracted.parts[0]!.text).toBe('a | b\n1 | 2')
  })
  it('C8 BOM, UTF-16 and Windows-1252 files are decoded', async () => {
    expect((await csv('', 'b.csv', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Ünï,Wert\n1,2')]))).extracted.parts[0]!.text).toBe('Ünï | Wert\n1 | 2')
    const u16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Name\tCity\nAsha\tPune', 'utf16le')])
    expect((await csv('', 'u.csv', u16)).extracted.parts[0]!.text).toBe('Name | City\nAsha | Pune')
    expect((await csv('', 'w.csv', Buffer.from([0x4e, 0x61, 0x6d, 0x65, 0x2c, 0x43, 0x69, 0x74, 0x79, 0x0a, 0x4a, 0x6f, 0x73, 0xe9, 0x2c, 0x4c, 0x69, 0x6d, 0x61]))).extracted.parts[0]!.text).toBe('Name | City\nJosé | Lima')
  })
  it('C7 + C10 a very long CSV is cut at the row cap with a note and located by rows', async () => {
    const big = 'id,v\n' + Array.from({ length: 9000 }, (_, i) => `${i},${i * 2}`).join('\n')
    const ex = (await csv(big)).extracted
    expect(ex.parts[0]!.locator).toBe('data (rows 1–' + /rows 1–(\d+)\)/.exec(ex.parts[0]!.locator!)![1] + ')')
    expect(ex.parts.at(-1)!.text).toMatch(/more rows were not read/)
  })
  it('binary junk named .csv and an empty file are refused in plain words', async () => {
    await expect(csv('', 'a.csv', Buffer.from([1, 2, 0, 0, 3, 4, 0, 5]))).rejects.toThrow(/does not look like a spreadsheet/)
    await expect(csv('  ')).rejects.toThrow(/no data/)
    expect(parseCsv('a,b\n1,2', ',').rows).toEqual([['a', 'b'], ['1', '2']])
  })
})

// ─── Email ───────────────────────────────────────────────────────────────────
const eml = (s: string) => fromEml(Buffer.from(s.replace(/\n/g, '\r\n'), 'latin1'), 'm.eml')
const HEAD = 'From: Asha Rao <asha@example.com>\nTo: team@example.com\nDate: Mon, 6 Oct 2026 10:00:00 +0530\nSubject: Q3 numbers\nMIME-Version: 1.0\n'

describe('Email (.eml)', () => {
  it('D1 + D6 plain text: headers, body, the subject is the title', () => {
    const ex = eml(`${HEAD}Content-Type: text/plain; charset=utf-8\n\nHi all,\n\nRevenue was 4.2M this quarter.\n\nAsha`)
    expect(ex.title).toBe('Q3 numbers')
    expect(ex.parts[0]!.text).toBe('From: Asha Rao <asha@example.com>\nTo: team@example.com\nDate: Mon, 6 Oct 2026 10:00:00 +0530\nSubject: Q3 numbers\n\nHi all,\n\nRevenue was 4.2M this quarter.\n\nAsha')
    expect(ex.parts[0]!.locator).toBe('email from Asha Rao')
  })
  it('D2 HTML-only mail becomes readable text without styles, scripts or tracking pixels', () => {
    const t = eml(`${HEAD}Content-Type: text/html\n\n<html><head><style>p{color:red}</style><title>x</title></head><body><p>Hello&nbsp;team,</p><p>Profit &amp; loss: <b>up 12%</b></p><img src="http://t.example/pixel.gif" width=1><script>track()</script><table><tr><td>A</td><td>B</td></tr></table></body></html>`).parts[0]!.text
    expect(t).toContain('Hello team,'); expect(t).toContain('Profit & loss: up 12%')
    expect(t).not.toMatch(/color:red|track\(\)|pixel|<p>/)
    expect(htmlToText('<p>a</p><p>b</p>')).toBe('a\nb\n')
  })
  it('D3 multipart/alternative prefers the plain-text part; falls back to HTML when the plain part is empty', () => {
    const mk = (plain: string) => `${HEAD}Content-Type: multipart/alternative; boundary="B1"\n\n--B1\nContent-Type: text/plain; charset=utf-8\n\n${plain}\n--B1\nContent-Type: text/html; charset=utf-8\n\n<p>HTML VERSION of the message body</p>\n--B1--\n`
    expect(eml(mk('PLAIN VERSION of the message body, long enough')).parts[0]!.text).toContain('PLAIN VERSION')
    expect(eml(mk('')).parts[0]!.text).toContain('HTML VERSION')
  })
  it('D4 quoted-printable, base64, charsets and encoded subjects are decoded', () => {
    const qp = eml(`From: =?UTF-8?B?w4FzaGE=?= <a@example.com>\nSubject: =?ISO-8859-1?Q?Caf=E9_menu?=\nMIME-Version: 1.0\nContent-Type: text/plain; charset=iso-8859-1\nContent-Transfer-Encoding: quoted-printable\n\nCaf=E9 =E2=82=AC soft=\nbreak =3D done`)
    expect(qp.title).toBe('Café menu'); expect(qp.parts[0]!.text).toContain('Café â\u0082¬ softbreak = done')
    const b64 = eml(`${HEAD}Content-Type: text/plain; charset=utf-8\nContent-Transfer-Encoding: base64\n\n${Buffer.from('नमस्ते — 100% ✓').toString('base64')}`)
    expect(b64.parts[0]!.text).toContain('नमस्ते — 100% ✓')
    expect(eml(`From: Zoë <z@example.com>\nSubject: Résumé\nMIME-Version: 1.0\nContent-Type: text/plain; charset=utf-8\n\nbody text`).title).toBe('Résumé')
  })
  it('D5 attachments are listed by name and never read', () => {
    const t = eml(`${HEAD}Content-Type: multipart/mixed; boundary="M"\n\n--M\nContent-Type: text/plain\n\nSee attached.\n--M\nContent-Type: application/pdf; name="report.pdf"\nContent-Disposition: attachment; filename="report.pdf"\nContent-Transfer-Encoding: base64\n\nJVBERi0xLjQKU0VDUkVULVBERi1DT05URU5U\n--M--\n`).parts[0]!.text
    expect(t).toContain('See attached.'); expect(t).toContain('Attachments (not read): report.pdf'); expect(t).not.toMatch(/SECRET|JVBER/)
  })
  it('D5 a forwarded email inside the message is read too', () => {
    const t = eml(`${HEAD}Content-Type: multipart/mixed; boundary="M"\n\n--M\nContent-Type: text/plain\n\nFYI below.\n--M\nContent-Type: message/rfc822\n\nFrom: ceo@example.com\nSubject: Original ask\nContent-Type: text/plain\n\nPlease prepare the board deck.\n--M--\n`).parts[0]!.text
    expect(t).toContain('Forwarded message'); expect(t).toContain('Please prepare the board deck.'); expect(t).toContain('Subject: Original ask')
  })
  it('D7 broken boundaries, header-only mail, junk and a missing body never crash and say so in plain words', async () => {
    expect(() => eml(`${HEAD}Content-Type: multipart/mixed; boundary="X"\n\n--X\nContent-Type: text/plain\n\nunterminated part with enough text here`)).not.toThrow()
    expect(() => eml(`${HEAD}\n`)).toThrow(/No readable text/)
    expect(() => eml('just some words, not an email at all')).toThrow(/does not look like an email/)
    await expect(fromFile(Buffer.from([1, 2, 0, 3, 4, 0]), 'x.eml')).rejects.toThrow(/does not look like an email/)
    expect(() => eml(`${HEAD}Content-Type: multipart/mixed\n\nbody without a boundary, but readable text`)).not.toThrow()
  })
  it('D8 Outlook .msg says to save as .eml', async () => {
    await expect(fromFile(new Uint8Array(Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(600)])), 'mail.msg')).rejects.toThrow(/save the email as \.eml/)
  })
})

// ─── File-type detection (G1) ────────────────────────────────────────────────
describe('what a file IS is decided by its content', () => {
  const D = docx(para('A real Word document with some text.'))
  const X = xlsx([{ name: 'S', rows: [row(1, cs('A1', 0))] }], ['cell'])
  it('G1 a .docx renamed .pdf / .xlsx / .txt, an .xlsx renamed .docx, are read as what they are', async () => {
    for (const name of ['x.pdf', 'x.xlsx', 'x.docm', 'noextension']) expect((await fromFile(D, name)).kind).toBe('docx')
    for (const name of ['x.docx', 'x.pptx', 'x.csv']) expect((await fromFile(X, name)).kind).toBe('xlsx')
  })
  it('G1 an executable, a picture or a random zip named .docx are refused in plain words', async () => {
    await expect(fromFile(new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0]), 'setup.docx')).rejects.toThrow(/not a valid Office document/)
    await expect(fromFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]), 'pic.docx')).rejects.toThrow(/not a valid Office document/)
    await expect(fromFile(zipSync({ 'a.txt': enc('hello') }), 'archive.docx')).rejects.toThrow(/Unsupported file type/)
    await expect(fromFile(enc('plain words'), 'notes.xyz')).rejects.toThrow(new RegExp(FILE_TYPES_HELP.slice(0, 20).replace(/[()]/g, '.')))
  })
  it('G4 every message a user can see comes from SourceError (plain sentences, no paths, no stack)', async () => {
    const bad: [Uint8Array, string][] = [[new Uint8Array([0x50, 0x4b, 3, 4, 9, 9, 9, 9, 9]), 'a.docx'], [enc('x'), 'a.exe'], [zipSync({ 'xl/workbook.xml': enc('<workbook/>') }), 'a.xlsx']]
    for (const [b, n] of bad) {
      const e = await fromFile(b, n).then(() => null, (x: Error) => x)
      expect(e).toBeInstanceOf(SourceError); expect(e!.message).not.toMatch(/\/Users\/|node_modules|at \S+\.(ts|js)|Unexpected|undefined/)
    }
  })
})

// ─── Google links (E) ────────────────────────────────────────────────────────
describe('Google Docs / Sheets / Slides links', () => {
  const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'
  it('E1–E3 each kind is turned into the export of the matching file type', () => {
    expect(parseGoogleLink(`https://docs.google.com/document/d/${ID}/edit?usp=sharing`)).toMatchObject({ kind: 'docx', exportUrl: `https://docs.google.com/document/d/${ID}/export?format=docx` })
    expect(parseGoogleLink(`docs.google.com/spreadsheets/d/${ID}/edit#gid=0`)).toMatchObject({ kind: 'xlsx', exportUrl: `https://docs.google.com/spreadsheets/d/${ID}/export?format=xlsx` })
    expect(parseGoogleLink(`https://docs.google.com/presentation/d/${ID}/edit`)).toMatchObject({ kind: 'pptx', exportUrl: `https://docs.google.com/presentation/d/${ID}/export/pptx` })
  })
  it('E5 other links stay ordinary web pages; published-to-web pages too; Forms, Drive files and malformed Google links are refused in plain words', () => {
    expect(parseGoogleLink('https://example.com/a')).toBeNull(); expect(parseGoogleLink('https://sites.google.com/view/x')).toBeNull()
    expect(parseGoogleLink('https://docs.google.com/document/d/e/2PACX-1vTabcdefghijklmnop/pub')).toBeNull()
    expect(() => parseGoogleLink('https://forms.gle/abc')).toThrow(/Forms/)
    expect(() => parseGoogleLink(`https://docs.google.com/forms/d/${ID}/edit`)).toThrow(/Forms/)
    expect(() => parseGoogleLink(`https://drive.google.com/file/d/${ID}/view`)).toThrow(/Link to the Google Doc/)
    expect(() => parseGoogleLink('https://docs.google.com/document/d/short/edit')).toThrow(/does not look like/)
  })
  const link = () => parseGoogleLink(`https://docs.google.com/document/d/${ID}/edit`)!
  const reply = (status: number, body: Uint8Array | string = '', headers: Record<string, string> = {}) => new Response(typeof body === 'string' ? body : new Uint8Array(body), { status, headers })
  it('E1 a public document is read like a Word file and named after the document', async () => {
    const calls: string[] = []
    const ex = await readGoogle(link(), async (u) => { calls.push(u); return calls.length === 1 ? reply(307, '', { location: 'https://doc-0g-abc.googleusercontent.com/export/x' }) : reply(200, docx(para('Plan', { style: 'Heading1' }) + para('Launch in March.')), { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'content-disposition': `attachment; filename="Launch plan.docx"; filename*=UTF-8''Launch%20plan.docx` }) })
    expect(ex.kind).toBe('docx'); expect(ex.title).toBe('Launch plan'); expect(ex.parts[0]!.text).toContain('Launch in March.')
  })
  it('E4 private documents (a sign-in redirect, an HTML page, 401/403) say how to share; 404 says not found; no login page text is stored', async () => {
    const msgOf = (f: Parameters<typeof readGoogle>[1]) => readGoogle(link(), f).then(() => '', (e: Error) => e.message)
    expect(await msgOf(async () => reply(302, '', { location: 'https://accounts.google.com/ServiceLogin?x=1' }))).toMatch(/Anyone with the link/)
    expect(await msgOf(async () => reply(200, '<html>Sign in to Google</html>', { 'content-type': 'text/html' }))).toMatch(/Anyone with the link/)
    expect(await msgOf(async () => reply(403))).toMatch(/Anyone with the link/)
    expect(await msgOf(async () => reply(404))).toMatch(/not found/)
    expect(await msgOf(async () => reply(500))).toMatch(/right now/)
    expect(await msgOf(async () => { throw new TypeError('fetch failed') })).toMatch(/could not be reached/)
  })
  it('E6 only Google hosts are contacted: a redirect elsewhere, to a private address, too many redirects, and oversized files are refused', async () => {
    const msgOf = (f: Parameters<typeof readGoogle>[1]) => readGoogle(link(), f).then(() => '', (e: Error) => e.message)
    expect(await msgOf(async () => reply(302, '', { location: 'https://evil.example/steal' }))).toMatch(/redirected somewhere unexpected/)
    expect(await msgOf(async () => reply(302, '', { location: 'http://169.254.169.254/' }))).toMatch(/not allowed/)
    expect(await msgOf(async () => reply(302, '', { location: 'https://docs.google.com/loop' }))).toMatch(/too many times/)
    expect(await msgOf(async () => reply(200, 'x', { 'content-type': 'application/octet-stream', 'content-length': String(40 * 1024 * 1024) }))).toMatch(/larger than 15 MB/)
  })
})
