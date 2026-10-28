import { imageSize } from '../export/png.ts'
import { assertPublicUrl, BlockedUrlError, safeFetch } from '../sources/ssrf.ts'
import { assetUrl, storeWebsiteLogo } from './assets.ts'
import { extractBrand, findStylesheets, pickPrimaryAccent, type BrandDraft } from './extract.ts'
import { mapFont, type MappedFont } from './fonts.ts'
import { logoDominantColor, svgDominantColor } from './logo-color.ts'

export interface BrandProfile {
  sourceUrl: string
  name: string | null
  colors: { primary: string | null; accent: string | null; accentDerived: boolean; palette: string[] }
  fonts: { heading: MappedFont | null; body: MappedFont | null; detected: string[] }
  /** the logo, saved on our side (never hot-linked): an image URL and its width ÷ height */
  logo: { url: string; aspect: number } | null
  /** low = few brand signals on the static page (often a script-rendered site): the user should check the result */
  confidence: 'high' | 'low'
}

type FetchLike = (url: string, init: { redirect: 'manual'; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>
const MAX_REDIRECTS = 3
const MAX_PAGE_BYTES = 2 * 1024 * 1024
const MAX_CSS_BYTES = 400 * 1024
const MAX_CSS_FILES = 4
const MAX_LOGO_BYTES = 1.5 * 1024 * 1024
const TOTAL_BUDGET_MS = 20_000
/** a plain, honest browser-compatible identity: many sites refuse anything without "Mozilla/5.0" in it */
const USER_AGENT = 'Mozilla/5.0 (compatible; SlidesDone-brand/1.0)'

/** Something went wrong reading the page that the user can act on; the message is safe to show as it is. */
export class BrandReadError extends Error {}

/** Network failures → one short sentence (never "fetch failed" or a stack). A blocked address stays a BlockedUrlError. */
function friendlyNetworkError(e: unknown): Error {
  for (let x: unknown = e, i = 0; x && i < 4; i++, x = (x as { cause?: unknown }).cause) {
    if (x instanceof BlockedUrlError) return x
    const code = (x as { code?: string }).code ?? ''
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return new BrandReadError('We could not find that website. Check the spelling of the address.')
    if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || /^UND_ERR_(SOCKET|CONNECT)|^ERR_(TLS|SSL)|CERT|SELF_SIGNED/.test(code)) return new BrandReadError('We could not connect to that website. Check the address, or try again later.')
  }
  const n = (e as { name?: string })?.name
  if (n === 'TimeoutError' || n === 'AbortError') return new BrandReadError('That website took too long to answer. Try again, or try another page of the site.')
  return new BrandReadError('We could not read that website. Check the address and try again.')
}

/** Sites that only show a login page to visitors: there is no brand to read, so say so instead of returning the login page's colours. */
const LOGIN_WALL_HOSTS = /(^|\.)(linkedin|instagram|facebook|fb|x|twitter|tiktok|threads|snapchat|whatsapp|pinterest-login)\.com$/i
const LOGIN_PATH = /\/(login|log-in|signin|sign-in|authwall|accounts\/login|checkpoint|uas\/login)(\/|$|\?)/i
const SIGN_IN_MESSAGE = 'That page asks visitors to sign in, so there is nothing for us to read. Try the company\'s public home page.'
const SOCIAL_MESSAGE = 'Social networks hide their pages from automated tools. Paste the company\'s own website instead.'

/** One public fetch: validated URL, every redirect re-validated, size and time caps, an allow-list of content types. */
export async function fetchLimited(rawUrl: string, o: { accept: RegExp; maxBytes: number; timeoutMs: number; fetchImpl?: FetchLike | undefined; headerAccept?: string; /** the page itself: say WHY it failed, and keep the first part of an oversized page (the head has what we need) */ page?: boolean }): Promise<{ bytes: Buffer; type: string; url: string } | null> {
  const doFetch: FetchLike = o.fetchImpl ?? ((u, init) => safeFetch(u, init))
  let url = assertPublicUrl(rawUrl)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await doFetch(url.toString(), { redirect: 'manual', signal: AbortSignal.timeout(o.timeoutMs), headers: { 'User-Agent': USER_AGENT, Accept: o.headerAccept ?? '*/*' } }).catch((e) => { throw friendlyNetworkError(e) })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return null
      url = assertPublicUrl(new URL(loc, url).toString())
      continue
    }
    if (!res.ok) {
      if (o.page) throw new BrandReadError(res.status === 404 || res.status === 410 ? 'We could not find that page (it says 404). Check the address.' : res.status >= 500 ? 'That website is having trouble right now. Try again later.' : 'That website does not let automated tools read it. Try another page of the site, or choose your colours by hand.')
      return null
    }
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    if (!o.accept.test(type)) { if (o.page) throw new BrandReadError('That address is not a web page (it looks like a file or an image). Enter the company website instead.'); return null }
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > o.maxBytes && !o.page) return null
    const reader = res.body?.getReader()
    if (!reader) return null
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > o.maxBytes) {
        await reader.cancel()
        if (!o.page) return null
        chunks.push(value.subarray(0, Math.max(0, value.length - (total - o.maxBytes)))) // oversized page: keep the part we are allowed to read
        break
      }
      chunks.push(value)
    }
    return { bytes: Buffer.concat(chunks), type, url: url.toString() }
  }
  return null
}

const rgbDistance = (a: string, b: string) => { const n = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const [x, y] = [n(a), n(b)]; return Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!) }
const isPng = (b: Buffer) => b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG'
const isJpeg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8

/** First candidate that is a real PNG/JPEG of a sensible size and shape. (SVG / ICO / WebP logos are skipped: they cannot go into a PowerPoint export.) */
async function pickLogo(candidates: string[], fetchImpl: FetchLike | undefined, deadline: number): Promise<{ bytes: Buffer; mime: 'image/png' | 'image/jpeg'; aspect: number } | null> {
  for (const url of candidates) {
    if (Date.now() > deadline) break
    try {
      const got = await fetchLimited(url, { accept: /^image\/(png|jpe?g)$|^application\/octet-stream$/, maxBytes: MAX_LOGO_BYTES, timeoutMs: 6000, fetchImpl, headerAccept: 'image/png,image/jpeg' })
      if (!got || !(isPng(got.bytes) || isJpeg(got.bytes))) continue // magic bytes decide, not the declared type
      const size = imageSize(got.bytes)
      if (!size || size.w < 48 || size.h < 48) continue
      const aspect = size.w / size.h
      if (aspect > 6 || aspect < 0.2) continue
      return { bytes: got.bytes, mime: isPng(got.bytes) ? 'image/png' : 'image/jpeg', aspect: Math.round(aspect * 1000) / 1000 }
    } catch { /* blocked or unreachable candidate: try the next */ }
  }
  return null
}

/** Company logos are mostly SVG, which cannot go into a PowerPoint — but their fill colour still tells us the brand colour. */
async function svgLogoColor(candidates: string[], fetchImpl: FetchLike | undefined, deadline: number): Promise<string | null> {
  for (const url of candidates.filter((u) => /\.svg(\?|$)/i.test(u)).slice(0, 2)) {
    if (Date.now() > deadline) break
    try {
      const got = await fetchLimited(url, { accept: /^image\/svg\+xml$|^text\/(plain|xml)$/, maxBytes: 300 * 1024, timeoutMs: 4000, fetchImpl, headerAccept: 'image/svg+xml' })
      const hex = got ? svgDominantColor(got.bytes.toString('utf8')) : null
      if (hex) return hex
    } catch { /* unreachable or blocked: no colour from this one */ }
  }
  return null
}

/** Pages that only bounce the visitor on (a self-submitting form, a meta refresh, location = "…") hold no brand: follow them to the real page. */
export function softRedirectTarget(html: string, base: string): string | null {
  if (html.length > 6000) return null
  const m = /<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"'>\s]+)/i.exec(html)
    ?? /<form[^>]+action=["']([^"']+)["']/i.exec(html.includes('submit()') ? html : '')?.map((x, i) => (i === 1 ? new URL('/', x).toString() : x)) as RegExpExecArray | null // a handoff form: its address expects a POST, the site's front page is what we want
    ?? /location(?:\.href|\.replace\()?\s*=?\s*\(?["'](https?:\/\/[^"']+)["']/i.exec(html)
  try { return m?.[1] ? new URL(m[1].replace(/&amp;/g, '&'), base).toString() : null } catch { return null }
}

/** Reads a website's brand. Throws a short, user-safe Error when the page cannot be read at all. */
export async function findBrand(userId: string, rawUrl: string, fetchImpl?: FetchLike): Promise<BrandProfile> {
  const deadline = Date.now() + TOTAL_BUDGET_MS
  const readPage = async (u: string) => {
    let got = await fetchLimited(u, { accept: /text\/html|application\/xhtml/, maxBytes: MAX_PAGE_BYTES, timeoutMs: 10_000, fetchImpl, headerAccept: 'text/html', page: true })
    if (!got) throw new BrandReadError('That page could not be read. Check the address and try again.')
    for (let hop = 0; hop < 2; hop++) { // pages that only bounce the visitor on (self-submitting form, meta refresh) hold no brand
      const next = softRedirectTarget(got.bytes.toString('utf8'), got.url)
      if (!next) break
      const again = await fetchLimited(next, { accept: /text\/html|application\/xhtml/, maxBytes: MAX_PAGE_BYTES, timeoutMs: 10_000, fetchImpl, headerAccept: 'text/html', page: true })
      if (!again) break
      got = again
    }
    return got
  }
  const wall = (u: string) => { const x = new URL(u); return LOGIN_WALL_HOSTS.test(x.hostname) ? SOCIAL_MESSAGE : LOGIN_PATH.test(x.pathname) ? SIGN_IN_MESSAGE : null }
  const asked = assertPublicUrl(rawUrl)
  if (LOGIN_WALL_HOSTS.test(asked.hostname)) throw new BrandReadError(SOCIAL_MESSAGE)
  let page = await readPage(rawUrl)
  if (wall(page.url) === SIGN_IN_MESSAGE && asked.pathname !== '/') page = await readPage(new URL('/', asked).toString()) // a deep link that needs a sign-in: the front page is public
  const blocked = wall(page.url)
  if (blocked) throw new BrandReadError(blocked)
  const html = page.bytes.toString('utf8')
  const sheets = findStylesheets(html, page.url).slice(0, MAX_CSS_FILES)
  const css = (await Promise.all(sheets.map(async (s) => {
    if (Date.now() > deadline) return ''
    try { return (await fetchLimited(s, { accept: /text\/css|text\/plain/, maxBytes: MAX_CSS_BYTES, timeoutMs: 6000, fetchImpl, headerAccept: 'text/css' }))?.bytes.toString('utf8') ?? '' } catch { return '' }
  }))).join('\n')
  const draft: BrandDraft = extractBrand(html, css, page.url)
  const logo = await pickLogo(draft.logoCandidates, fetchImpl, deadline)
  const logoId = logo ? await storeWebsiteLogo(userId, logo.bytes, logo.mime, page.url) : null
  const logoUrl = logoId ? assetUrl(logoId) : null
  // The logo is usually drawn in the brand colour: use it to confirm a colour read from the CSS, or to supply one the CSS did not show.
  const logoHex = (logo ? logoDominantColor(logo.bytes) : null) ?? (await svgLogoColor(draft.logoCandidates, fetchImpl, deadline))
  let palette = draft.palette
  let primary = draft.primary, accent = draft.accent, derived = draft.accentDerived
  let logoAgrees = true
  if (logoHex) {
    const near = [...palette].sort((a, b) => rgbDistance(a.hex, logoHex) - rgbDistance(b.hex, logoHex)).find((c) => rgbDistance(c.hex, logoHex) <= 60)
    // a colour the logo confirms leads; one the page never showed is added as a middling candidate
    palette = (near ? palette.map((c) => (c === near ? { ...c, score: Math.max(c.score + 8, (palette[0]?.score ?? 0) + 1) } : c)) : [...palette, { hex: logoHex, score: 7 }]).sort((a, b) => b.score - a.score).slice(0, 8)
    ;({ primary, accent, derived } = pickPrimaryAccent(palette))
    logoAgrees = !!near
  }
  const top = palette[0]?.score ?? 0
  return {
    sourceUrl: page.url,
    name: draft.name,
    colors: { primary, accent, accentDerived: derived, palette: palette.map((p) => p.hex) },
    fonts: { heading: draft.fonts.heading ? mapFont(draft.fonts.heading, 'heading') : null, body: draft.fonts.body ? mapFont(draft.fonts.body, 'body') : null, detected: draft.fonts.detected },
    logo: logo && logoUrl ? { url: logoUrl, aspect: logo.aspect } : null,
    confidence: primary && top >= 6 && (logoAgrees || !logoHex) ? 'high' : 'low',
  }
}
