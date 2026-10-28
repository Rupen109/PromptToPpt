import { type Extracted, FILE_MAX_BYTES, fromFile } from './extract.ts'
import { SourceError } from './errors.ts'
import { assertPublicUrl, safeFetch } from './ssrf.ts'

/**
 * Google Docs / Sheets / Slides shared as "anyone with the link": read through Google's own export (Word / Excel / PowerPoint file) and then
 * through the same readers as an uploaded file. Private documents need a Google sign-in, which this does not do (the person is told how to share
 * the file or to upload it). Only Google's hosts are ever contacted, every redirect is re-checked, and size and time are capped.
 */
export type FetchLike = (url: string, init: { redirect: 'manual'; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>

export interface GoogleLink { kind: 'docx' | 'xlsx' | 'pptx'; label: string; exportUrl: string }

const ID = '[A-Za-z0-9_-]{15,}'
const GOOGLE_HOST = /(^|\.)(google\.com|googleusercontent\.com)$/i
const NEEDS_SHARING = 'That Google document is private. In Google, choose Share → "Anyone with the link" → Viewer, then paste the link again — or download it as .docx / .xlsx / .pptx and upload the file.'

/** null = not a Google document link (a normal web page); throws for Google links that can never be read. */
export function parseGoogleLink(raw: string): GoogleLink | null {
  let u: URL
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`) } catch { return null }
  const host = u.hostname.toLowerCase()
  if (host === 'forms.gle' || (host === 'docs.google.com' && u.pathname.startsWith('/forms'))) throw new SourceError('Google Forms cannot be read. Open the responses as a Google Sheet and paste that link instead.')
  if (host === 'drive.google.com') throw new SourceError('Link to the Google Doc, Sheet or Slides itself (open it, then copy the address), or download the file and upload it.')
  if (host !== 'docs.google.com') return null
  if (/^\/(document|spreadsheets|presentation)\/d\/e\//.test(u.pathname)) return null // "published to the web" pages are ordinary public web pages
  const m = new RegExp(`^/(document|spreadsheets|presentation)/d/(${ID})`).exec(u.pathname)
  if (!m) throw new SourceError('That Google link does not look like a Doc, Sheet or Slides document')
  const id = m[2]!
  if (m[1] === 'document') return { kind: 'docx', label: 'Google Doc', exportUrl: `https://docs.google.com/document/d/${id}/export?format=docx` }
  if (m[1] === 'spreadsheets') return { kind: 'xlsx', label: 'Google Sheet', exportUrl: `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx` }
  return { kind: 'pptx', label: 'Google Slides', exportUrl: `https://docs.google.com/presentation/d/${id}/export/pptx` }
}

const MAX_HOPS = 5
export async function readGoogle(link: GoogleLink, fetchImpl?: FetchLike): Promise<Extracted> {
  const doFetch: FetchLike = fetchImpl ?? ((u, init) => safeFetch(u, init))
  let url = assertPublicUrl(link.exportUrl)
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (!GOOGLE_HOST.test(url.hostname)) throw new SourceError('That Google link redirected somewhere unexpected, so it was not read')
    if (url.hostname === 'accounts.google.com') throw new SourceError(NEEDS_SHARING)
    const res = await doFetch(url.toString(), { redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SlidesDone-sources/1.0)', Accept: '*/*' } })
      .catch((e: unknown) => { if ((e as { name?: string }).name === 'TimeoutError') throw new SourceError('Google took too long to answer. Try again in a moment.'); throw new SourceError('Google could not be reached. Try again in a moment.') })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) throw new SourceError('That Google document could not be read')
      url = assertPublicUrl(new URL(loc, url).toString())
      continue
    }
    if (res.status === 404 || res.status === 410) throw new SourceError('That Google document was not found. Check the link — it may have been deleted.')
    if (res.status === 401 || res.status === 403) throw new SourceError(NEEDS_SHARING)
    if (!res.ok) throw new SourceError('Google could not give us that document right now. Try again in a moment.')
    const type = (res.headers.get('content-type') ?? '').toLowerCase()
    if (type.includes('text/html')) throw new SourceError(NEEDS_SHARING) // a sign-in or "request access" page instead of the file
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > FILE_MAX_BYTES) throw new SourceError('That Google document is larger than 15 MB')
    const reader = res.body?.getReader()
    if (!reader) throw new SourceError('That Google document could not be read')
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > FILE_MAX_BYTES) { await reader.cancel(); throw new SourceError('That Google document is larger than 15 MB') }
      chunks.push(value)
    }
    const disp = res.headers.get('content-disposition') ?? ''
    const star = /filename\*=(?:UTF-8|utf-8)''([^;]+)/.exec(disp)?.[1]
    let name = ''
    try { name = star ? decodeURIComponent(star) : (/filename="?([^";]+)"?/.exec(disp)?.[1] ?? '') } catch { name = '' }
    const file = name || `${link.label}.${link.kind}`
    const { extracted } = await fromFile(new Uint8Array(Buffer.concat(chunks)), file.replace(/\.[a-z0-9]+$/i, `.${link.kind}`))
    const base = file.replace(/\.[a-z0-9]+$/i, '').trim()
    return { ...extracted, title: (base && base !== link.label ? base : extracted.title).slice(0, 200), kind: link.kind }
  }
  throw new SourceError('That Google link redirected too many times')
}
