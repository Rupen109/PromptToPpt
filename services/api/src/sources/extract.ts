import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import { extractText, getDocumentProxy } from 'unpdf'
import { unzipSync } from 'fflate'
import { CSV_MAX_BYTES, fromCsv } from './csv.ts'
import { DOCX_MAX_BYTES, fromDocx } from './docx.ts'
import { EML_MAX_BYTES, fromEml } from './eml.ts'
import { SourceError } from './errors.ts'
import { clean, MAX_TEXT_CHARS } from './limits.ts'
import { fromTranscript } from './transcript.ts'
import { XLSX_MAX_BYTES, fromXlsx } from './xlsx.ts'
import { isEncryptedOffice, isOle, isZip, zipNames } from './zip.ts'
import { assertPublicUrl, BlockedUrlError, safeFetch } from './ssrf.ts'

export interface Extracted {
  title: string
  /** locator → text; locator is what citations show ("p. 4", "section 2") */
  parts: { locator: string | null; text: string }[]
  /** set when the text came from a Google document: what kind of file it was exported as (decides the icon) */
  kind?: 'docx' | 'xlsx' | 'pptx'
}

/** What to tell a person when a website refuses or fails: plain words and a way forward (many news sites block automated readers on purpose). */
export function pageStatusMessage(status: number): string {
  if (status === 401 || status === 403) return `That website does not allow automated reading (it answered ${status}). Many news sites do this. Copy the text from the page and use Paste text, or try another link.`
  if (status === 404 || status === 410) return `That page was not found (${status}). Check the address.`
  if (status === 429) return 'That website is limiting automated visits right now. Try again in a few minutes, or paste the text.'
  if (status >= 500) return `That website had a problem on its side (error ${status}). Try again later, or paste the text.`
  return `The page responded with ${status}. Try another link, or paste the text.`
}

export const MAX_FETCH_BYTES = 2 * 1024 * 1024
export { MAX_TEXT_CHARS }
const MAX_REDIRECTS = 3


/** Chunk on paragraph boundaries (~1500 chars) so citations point at a small, findable region. */
export function chunkText(parts: Extracted['parts'], target = 1500): { locator: string | null; text: string }[] {
  const out: { locator: string | null; text: string }[] = []
  for (const part of parts) {
    let cur = ''
    const flush = () => {
      if (cur.trim()) out.push({ locator: part.locator, text: cur.trim() })
      cur = ''
    }
    for (const para of part.text.split(/\n{2,}/)) {
      if (cur && cur.length + para.length > target) flush()
      if (para.length > target * 2) {
        for (let i = 0; i < para.length; i += target) out.push({ locator: part.locator, text: para.slice(i, i + target) })
      } else cur += (cur ? '\n\n' : '') + para
    }
    flush()
  }
  return out
}

export function fromText(title: string, text: string): Extracted {
  return { title: title.slice(0, 200) || 'Pasted text', parts: [{ locator: null, text: clean(text).slice(0, MAX_TEXT_CHARS) }] }
}

export function fromHtml(html: string, url: string): Extracted {
  const { document } = parseHTML(html)
  const article = new Readability(document as never).parse() // main content, not nav/ads
  const text = clean(article?.textContent ?? document.body?.textContent ?? '')
  if (text.length < 80) throw new Error('Could not find readable content on that page')
  return { title: (article?.title || document.title || new URL(url).hostname).slice(0, 200), parts: [{ locator: null, text: text.slice(0, MAX_TEXT_CHARS) }] }
}

type FetchLike = (url: string, init: { redirect: 'manual'; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>

/** Fetch a public web page: validated URL, validated redirects, size + time caps, text/html only. */
export async function fetchPage(rawUrl: string, fetchImpl?: FetchLike): Promise<Extracted> {
  const doFetch: FetchLike = fetchImpl ?? ((u, init) => safeFetch(u, init))
  let url = assertPublicUrl(rawUrl)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await doFetch(url.toString(), { redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'SlidesDone-bot/1.0', Accept: 'text/html,text/plain' } })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) throw new Error('Bad redirect')
      url = assertPublicUrl(new URL(loc, url).toString()) // every hop re-validated
      continue
    }
    if (!res.ok) throw new Error(pageStatusMessage(res.status))
    const type = res.headers.get('content-type') ?? ''
    if (!/text\/html|text\/plain|application\/xhtml/.test(type)) throw new Error('That URL is not a web page')
    const reader = res.body?.getReader()
    if (!reader) throw new Error('Empty response')
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > MAX_FETCH_BYTES) {
        await reader.cancel()
        throw new Error('Page is too large')
      }
      chunks.push(value)
    }
    const body = Buffer.concat(chunks).toString('utf8')
    return type.includes('text/plain') ? { title: url.hostname, parts: [{ locator: null, text: clean(body).slice(0, MAX_TEXT_CHARS) }] } : fromHtml(body, url.toString())
  }
  throw new Error('Too many redirects')
}

export const PDF_MAX_BYTES = 10 * 1024 * 1024
export const PDF_MAX_PAGES = 100
const PDF_PARSE_MS = 25_000

export async function fromPdf(bytes: Uint8Array, filename: string): Promise<Extracted> {
  // Magic-byte check: never trust the extension or client-declared content type.
  if (Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== '%PDF-') throw new Error('That file is not a PDF')
  // pdf.js runs in this process: a crafted PDF must not be able to hold it forever, so parsing gets a wall-clock budget
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('That PDF took too long to read')), PDF_PARSE_MS) })
  const work = (async () => {
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    if (pdf.numPages > PDF_MAX_PAGES) throw new Error(`PDF has too many pages (max ${PDF_MAX_PAGES})`)
    return extractText(pdf, { mergePages: false })
  })()
  work.catch(() => {}) // a late failure after the timeout must not surface as an unhandled rejection
  const { text } = await Promise.race([work, timeout]).finally(() => clearTimeout(timer))
  const parts = text.map((t, i) => ({ locator: `p. ${i + 1}`, text: clean(t) })).filter((p) => p.text)
  if (parts.length === 0) throw new Error('This PDF has no text we can read: it looks like a scan, or its text was turned into pictures. Add pictures (screenshots) of its pages instead, or paste the text.')
  let budget = MAX_TEXT_CHARS
  return { title: filename.replace(/\.pdf$/i, '').slice(0, 200) || 'PDF', parts: parts.map((p) => ({ ...p, text: p.text.slice(0, Math.max(0, (budget -= p.text.length) + p.text.length)) })).filter((p) => p.text) }
}

export const PPTX_MAX_BYTES = 15 * 1024 * 1024
export const PPTX_MAX_SLIDES = 200
export const TXT_MAX_BYTES = 1024 * 1024
const MAX_TOTAL_INFLATED = 40 * 1024 * 1024
const MAX_ENTRY_BYTES = 8 * 1024 * 1024 // one slide's XML can't legitimately be larger → zip-bomb guard

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decodeXml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (XML_ENTITIES[e.toLowerCase()] ?? '')))

/** Text of a slide / notes XML: each <a:p> paragraph on its own line, runs (<a:t>) joined, tabs/breaks kept as spaces. */
function xmlText(xml: string): string {
  return xml
    .split(/<\/a:p>/)
    .map((para) => [...para.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1]!)).join(''))
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * PowerPoint (.pptx = a zip of XML). Reads slide text and speaker notes, one part per slide ("slide 4"). Old binary .ppt files
 * are rejected with a hint. Entry names are filtered BEFORE decompression and oversized entries are skipped (zip-bomb guard).
 */
export function fromPptx(bytes: Uint8Array, filename: string): Extracted {
  const head = Buffer.from(bytes.subarray(0, 8))
  if (head.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) throw new Error('Old .ppt files are not supported — open it in PowerPoint and save as .pptx')
  if (!(head[0] === 0x50 && head[1] === 0x4b)) throw new Error('That file is not a PowerPoint (.pptx) presentation')
  let entries: Record<string, Uint8Array>
  // Zip-bomb guard: besides the per-entry cap, the TOTAL that would be inflated and the NUMBER of entries are capped (a 15 MB file of many 8 MB entries
  // would otherwise inflate to gigabytes of memory in the API process).
  let total = 0, count = 0, bomb = false
  try {
    entries = unzipSync(new Uint8Array(bytes), {
      filter: (f) => {
        if (!/^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/.test(f.name)) return false
        total += f.originalSize
        count++
        if (f.originalSize > MAX_ENTRY_BYTES || total > MAX_TOTAL_INFLATED || count > 2 * PPTX_MAX_SLIDES + 10) { bomb = true; return false }
        return true
      },
    })
  } catch {
    throw new Error('That PowerPoint file could not be opened')
  }
  if (bomb) throw new Error('That PowerPoint file is too large or unusual to read')
  const num = (name: string) => Number(/(\d+)\.xml$/.exec(name)?.[1] ?? 0)
  const slides = Object.keys(entries).filter((n) => n.startsWith('ppt/slides/')).sort((a, b) => num(a) - num(b))
  if (slides.length === 0) throw new Error('No slides found in that PowerPoint file')
  if (slides.length > PPTX_MAX_SLIDES) throw new Error(`That presentation has too many slides (max ${PPTX_MAX_SLIDES})`)
  const dec = new TextDecoder()
  const notes = new Map(Object.keys(entries).filter((n) => n.startsWith('ppt/notesSlides/')).map((n) => [num(n), xmlText(dec.decode(entries[n]!))]))
  let budget = MAX_TEXT_CHARS
  const parts: Extracted['parts'] = []
  for (const name of slides) {
    const n = num(name)
    const body = xmlText(dec.decode(entries[name]!))
    const note = notes.get(n)
    const text = clean([body, note ? `Speaker notes: ${note}` : ''].filter(Boolean).join('\n\n'))
    if (!text || budget <= 0) continue
    parts.push({ locator: `slide ${n}`, text: text.slice(0, budget) })
    budget -= text.length
  }
  if (parts.length === 0) throw new Error('No text found in that PowerPoint file (it may contain only images)')
  return { title: filename.replace(/\.pptx?$/i, '').slice(0, 200) || 'Presentation', parts }
}

/** Plain text / Markdown. Rejects anything that looks binary. */
export function fromTextFile(bytes: Uint8Array, filename: string): Extracted {
  if (bytes.length > TXT_MAX_BYTES) throw new Error('Text files can be up to 1 MB')
  if (bytes.subarray(0, 4096).includes(0)) throw new Error('That file does not look like plain text')
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  if (text.trim().length < 20) throw new Error('That file has too little text')
  return fromText(filename.replace(/\.(txt|md|markdown)$/i, ''), text)
}

export type FileKind = 'pdf' | 'pptx' | 'docx' | 'xlsx' | 'csv' | 'email' | 'text' | 'transcript'
export const FILE_MAX_BYTES = Math.max(PDF_MAX_BYTES, PPTX_MAX_BYTES, DOCX_MAX_BYTES, XLSX_MAX_BYTES, CSV_MAX_BYTES)
export const FILE_TYPES_HELP = 'PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), CSV, email (.eml), caption files (.srt, .vtt), or text/Markdown'

const ext = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? ''
const tooBig = (kind: string, max: number, n: number) => { if (n > max) throw new SourceError(`That ${kind} is larger than ${Math.round(max / 1024 / 1024)} MB`) }

/** Decides what an upload is from its CONTENT (magic bytes, and for zip files the names inside), never from the file name or declared type; the extension only separates the plain-text kinds. */
export async function fromFile(bytes: Uint8Array, filename: string): Promise<{ kind: FileKind; extracted: Extracted }> {
  const head = Buffer.from(bytes.subarray(0, 5)).toString('latin1')
  const e = ext(filename)
  if (head === '%PDF-') {
    if (bytes.length > PDF_MAX_BYTES) throw new Error('PDF is larger than 10 MB')
    return { kind: 'pdf', extracted: await fromPdf(bytes, filename) }
  }
  if (isEncryptedOffice(bytes)) throw new SourceError('That file is password-protected. Remove the password in Word, Excel or PowerPoint, save it, and upload it again.')
  if (isOle(bytes)) {
    if (e === 'msg') return { kind: 'email', extracted: fromEml(bytes, filename) } // throws the .msg hint
    if (e === 'doc' || e === 'dot' || e === 'rtf') throw new SourceError('Old .doc files are not supported — open it in Word and save as .docx')
    if (e === 'xls' || e === 'xlt') throw new SourceError('Old .xls files are not supported — open it in Excel and save as .xlsx (or CSV)')
    if (e === 'ppt' || e === 'pps') throw new SourceError('Old .ppt files are not supported — open it in PowerPoint and save as .pptx')
    throw new SourceError(`Unsupported file type — upload ${FILE_TYPES_HELP}`)
  }
  if (isZip(bytes)) {
    const names = zipNames(bytes)
    if (names.includes('word/document.xml')) { tooBig('Word file', DOCX_MAX_BYTES, bytes.length); return { kind: 'docx', extracted: fromDocx(bytes, filename) } }
    if (names.includes('xl/workbook.xml')) { tooBig('workbook', XLSX_MAX_BYTES, bytes.length); return { kind: 'xlsx', extracted: fromXlsx(bytes, filename) } }
    if (names.includes('xl/workbook.bin')) throw new SourceError('.xlsb workbooks are not supported — open it in Excel and save as .xlsx (or CSV)')
    if (names.some((n) => n.startsWith('ppt/slides/') || n === 'ppt/presentation.xml')) { tooBig('PowerPoint file', PPTX_MAX_BYTES, bytes.length); return { kind: 'pptx', extracted: fromPptx(bytes, filename) } }
    throw new SourceError(`Unsupported file type — upload ${FILE_TYPES_HELP}`)
  }
  if (e === 'csv' || e === 'tsv') { tooBig('file', CSV_MAX_BYTES, bytes.length); return { kind: 'csv', extracted: fromCsv(bytes, filename) } }
  if (e === 'eml') { tooBig('email', EML_MAX_BYTES, bytes.length); return { kind: 'email', extracted: fromEml(bytes, filename) } }
  if (e === 'srt' || e === 'vtt' || e === 'sbv') {
    if (bytes.length > 2 * 1024 * 1024) throw new SourceError('That caption file is larger than 2 MB')
    if (bytes.subarray(0, 4096).includes(0)) throw new SourceError('That file does not look like a caption file')
    return { kind: 'transcript', extracted: fromTranscript(filename.replace(/\.(srt|vtt|sbv)$/i, ''), new TextDecoder('utf-8', { fatal: false }).decode(bytes)) }
  }
  if (e === 'doc' || e === 'xls' || e === 'ppt' || e === 'docx' || e === 'xlsx' || e === 'pptx') throw new SourceError('That file is not a valid Office document — it may be damaged or renamed from another type')
  if (!/\.(txt|md|markdown|text)$/i.test(filename)) throw new SourceError(`Unsupported file type — upload ${FILE_TYPES_HELP}`)
  return { kind: 'text', extracted: fromTextFile(bytes, filename) }
}

export { BlockedUrlError, SourceError }
