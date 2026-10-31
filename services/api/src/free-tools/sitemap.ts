import { parseHTML } from 'linkedom'
import { assertPublicUrl, BlockedUrlError, safeFetch } from '../sources/ssrf.ts'

/**
 * Free sitemap generator: walks a public website the way a polite search-engine bot does and writes sitemap.xml.
 * No AI, so it costs only a little bandwidth; the limits below keep one visitor from using more than a little of it.
 * Every address is checked with assertPublicUrl and fetched through safeFetch (private networks are unreachable), and robots.txt is obeyed.
 */
export const SITEMAP_MAX_PAGES = 200
export const SITEMAP_DEFAULT_PAGES = 100
const FETCH_MS = 8_000
const BUDGET_MS = 40_000
const PAGE_BYTES = 1_500_000
const CONCURRENCY = 5
const MAX_DEPTH = 6
const MAX_REDIRECTS = 4
const UA = 'SlidesDone-sitemap-bot/1.0'
const SKIP_EXT = /\.(?:pdf|jpe?g|png|gif|webp|svg|ico|avif|bmp|tiff?|zip|gz|rar|7z|tar|exe|dmg|apk|mp3|mp4|mov|avi|mkv|webm|wav|ogg|css|js|mjs|json|xml|txt|rss|atom|woff2?|ttf|eot|docx?|xlsx?|pptx?|csv)$/i
const TRACKING = /^(?:utm_[a-z]+|fbclid|gclid|msclkid|mc_cid|mc_eid|igshid|ref|_ga|yclid)$/i

export type ChangeFreq = 'none' | 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
export interface SitemapOptions { maxPages?: number; lastmod?: boolean; changefreq?: ChangeFreq; priority?: boolean }
export interface SitemapUrl { loc: string; depth: number; lastmod?: string }
export interface SitemapResult {
  site: string
  urls: SitemapUrl[]
  xml: string
  stats: { found: number; crawled: number; skipped: { robots: number; noindex: number; other: number }; failed: number; truncated: boolean; slow: boolean; ms: number; foundSitemap: boolean }
}
type FetchLike = (url: string, init: { redirect: 'manual'; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>
export class SitemapError extends Error {}

const sameSite = (a: string, b: string) => a.replace(/^www\./, '') === b.replace(/^www\./, '')

/** One canonical spelling per page: no #fragment, no tracking parameters, no index.html, no duplicate slashes, sorted query, no trailing slash except the home page. */
export function normalizeUrl(raw: string, base?: string): string | null {
  let u: URL
  try { u = new URL(raw.trim(), base) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  u.hash = ''
  u.username = ''; u.password = ''
  if (u.port === (u.protocol === 'https:' ? '443' : '80')) u.port = ''
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k)
  u.searchParams.sort()
  u.pathname = u.pathname.replace(/\/{2,}/g, '/').replace(/\/index\.(?:html?|php)$/i, '/')
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1)
  return u.toString()
}

interface Robots { disallow: string[]; allow: string[]; sitemaps: string[] }
/** The rules for "*" and for our own bot name; the longest matching rule wins and Allow beats Disallow on a tie, like Google. */
export function parseRobots(text: string): Robots {
  const out: Robots = { disallow: [], allow: [], sitemaps: [] }
  let applies = false, seenRule = false
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.replace(/#.*/, '').trim()
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1]!.toLowerCase(), val = m[2]!.trim()
    if (key === 'sitemap') { if (/^https?:\/\//i.test(val)) out.sitemaps.push(val); continue }
    if (key === 'user-agent') {
      if (seenRule) { applies = false; seenRule = false }
      applies = applies || val === '*' || /slidesdone/i.test(val)
      continue
    }
    seenRule = true
    if (!applies || !val) continue
    if (key === 'disallow') out.disallow.push(val)
    else if (key === 'allow') out.allow.push(val)
  }
  return out
}
const ruleRe = (rule: string) => new RegExp('^' + rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'))
export function robotsAllows(r: Robots, url: string): boolean {
  const u = new URL(url)
  const path = u.pathname + u.search
  const best = (rules: string[]) => rules.reduce((n, rule) => (ruleRe(rule).test(path) ? Math.max(n, rule.length) : n), -1)
  return best(r.allow) >= best(r.disallow)
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

export function buildXml(urls: SitemapUrl[], o: Required<Pick<SitemapOptions, 'lastmod' | 'changefreq' | 'priority'>>): string {
  const rows = urls.map((u) => {
    const prio = u.depth === 0 ? '1.0' : u.depth === 1 ? '0.8' : u.depth === 2 ? '0.6' : '0.5'
    return `  <url>\n    <loc>${esc(u.loc)}</loc>\n${o.lastmod && u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : ''}${o.changefreq !== 'none' ? `    <changefreq>${o.changefreq}</changefreq>\n` : ''}${o.priority ? `    <priority>${prio}</priority>\n` : ''}  </url>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`
}

async function readCapped(res: Response, cap: number): Promise<string | null> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > cap) { await reader.cancel(); return null }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function crawlSite(rawUrl: string, opts: SitemapOptions = {}, fetchImpl?: FetchLike, clock: () => number = Date.now): Promise<SitemapResult> {
  const doFetch: FetchLike = fetchImpl ?? ((u, init) => safeFetch(u, init))
  const maxPages = Math.min(SITEMAP_MAX_PAGES, Math.max(1, opts.maxPages ?? SITEMAP_DEFAULT_PAGES))
  const started = clock()
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`
  let startUrl: URL
  try { startUrl = assertPublicUrl(withScheme) } catch (e) { throw new SitemapError(e instanceof BlockedUrlError ? e.message : 'That is not a web address we can read') }

  /** GET with every redirect re-validated; returns the final URL, or null on any failure */
  async function get(url: string, accept: string): Promise<{ res: Response; url: URL } | null> {
    let u: URL
    try { u = assertPublicUrl(url) } catch { return null }
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let res: Response
      try { res = await doFetch(u.toString(), { redirect: 'manual', signal: AbortSignal.timeout(FETCH_MS), headers: { 'User-Agent': UA, Accept: accept } }) } catch { return null }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc) return null
        try { u = assertPublicUrl(new URL(loc, u).toString()) } catch { return null }
        continue
      }
      return res.ok ? { res, url: u } : null
    }
    return null
  }

  // the home page first: it settles which spelling of the host (www or not, http or https) the site really uses
  const homeTry = await get(startUrl.toString(), 'text/html')
  if (!homeTry) throw new SitemapError('We could not open that website. Check the address, and that the site is public.')
  const home = homeTry
  const origin = home.url.origin
  const host = home.url.hostname

  const robotsRes = await get(`${origin}/robots.txt`, 'text/plain')
  const robots = robotsRes ? parseRobots((await readCapped(robotsRes.res, 200_000)) ?? '') : { disallow: [], allow: [], sitemaps: [] }

  const found = new Map<string, SitemapUrl>() // loc → entry, in discovery order
  const queue: { url: string; depth: number }[] = []
  const stats: SitemapResult['stats'] = { found: 0, crawled: 0, skipped: { robots: 0, noindex: 0, other: 0 }, failed: 0, truncated: false, slow: false, ms: 0, foundSitemap: false }

  const consider = (raw: string, base: string, depth: number): void => {
    const n = normalizeUrl(raw, base)
    if (!n) return
    const u = new URL(n)
    if (!sameSite(u.hostname, host) || SKIP_EXT.test(u.pathname)) return
    // keep the site's own spelling of the host
    u.hostname = host; u.protocol = home.url.protocol
    const loc = u.toString()
    if (found.has(loc) || queue.some((q) => q.url === loc)) return
    if (!robotsAllows(robots, loc)) { stats.skipped.robots++; return }
    if (depth > MAX_DEPTH) return
    queue.push({ url: loc, depth })
  }

  // a sitemap the site already has points at pages no link reaches
  const sitemapUrls = [...new Set([...robots.sitemaps, `${origin}/sitemap.xml`])].slice(0, 4)
  async function readSitemap(url: string, level: number): Promise<void> {
    const r = await get(url, 'application/xml,text/xml')
    if (!r) return
    const body = await readCapped(r.res, 3_000_000)
    if (!body) return
    stats.foundSitemap = true
    const locs = [...body.matchAll(/<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi)].map((m) => m[1]!.replace(/&amp;/g, '&'))
    if (/<sitemapindex/i.test(body)) { if (level < 1) for (const l of locs.slice(0, 5)) await readSitemap(l, level + 1) } else for (const l of locs.slice(0, maxPages * 2)) consider(l, url, 1)
  }
  for (const s of sitemapUrls) { if (clock() - started > BUDGET_MS / 4) break; await readSitemap(s, 0) }

  const homeLoc = normalizeUrl(home.url.toString())!
  queue.unshift({ url: homeLoc, depth: 0 })
  const seen = new Set<string>()

  async function visit(item: { url: string; depth: number }, first?: { res: Response; url: URL }): Promise<void> {
    const got = first ?? (await get(item.url, 'text/html'))
    if (!got) { stats.failed++; return }
    const type = got.res.headers.get('content-type') ?? ''
    if (!/text\/html|application\/xhtml/i.test(type)) { stats.skipped.other++; await got.res.body?.cancel().catch(() => {}); return }
    const body = await readCapped(got.res, PAGE_BYTES)
    if (body === null) { stats.skipped.other++; return }
    stats.crawled++
    const { document } = parseHTML(body)
    const robotsMeta = document.querySelector('meta[name="robots" i], meta[name="googlebot" i]')?.getAttribute('content') ?? ''
    if (/noindex/i.test(robotsMeta)) stats.skipped.noindex++
    else {
      let loc = normalizeUrl(got.url.toString())!
      const canonical = document.querySelector('link[rel="canonical" i]')?.getAttribute('href')
      const cn = canonical ? normalizeUrl(canonical, got.url.toString()) : null
      if (cn && sameSite(new URL(cn).hostname, host)) { const u = new URL(cn); u.hostname = host; u.protocol = home.url.protocol; loc = u.toString() } // the page says which address is the real one
      if (!found.has(loc) && found.size < maxPages) {
        const lm = got.res.headers.get('last-modified')
        const d = lm ? new Date(lm) : null
        found.set(loc, { loc, depth: item.depth, ...(d && !Number.isNaN(d.getTime()) ? { lastmod: d.toISOString().slice(0, 10) } : {}) })
      }
    }
    const nofollow = /nofollow/i.test(robotsMeta)
    if (!nofollow) for (const a of document.querySelectorAll('a[href]')) { if (found.size + queue.length > maxPages * 3) break; consider(a.getAttribute('href') ?? '', got.url.toString(), item.depth + 1) }
  }

  const firstPage = { res: home.res, url: home.url }
  seen.add(homeLoc)
  queue.shift()
  await visit({ url: homeLoc, depth: 0 }, firstPage)

  const running = new Set<Promise<void>>()
  while ((queue.length > 0 || running.size > 0) && found.size < maxPages) {
    if (clock() - started > BUDGET_MS) { stats.slow = true; break }
    while (queue.length > 0 && running.size < CONCURRENCY && found.size + running.size < maxPages + CONCURRENCY) {
      const item = queue.shift()!
      if (seen.has(item.url)) continue
      seen.add(item.url)
      const p: Promise<void> = visit(item).catch(() => { stats.failed++ }).finally(() => { running.delete(p) })
      running.add(p)
    }
    if (running.size === 0) break
    await Promise.race(running)
  }
  await Promise.allSettled([...running])
  stats.truncated = queue.length > 0 || found.size >= maxPages
  // pages listed in the site's own sitemap that we did not visit are still real pages: add them (up to the cap) so the file is complete
  for (const q of queue) { if (found.size >= maxPages) break; if (!found.has(q.url)) found.set(q.url, { loc: q.url, depth: q.depth }) }

  const urls = [...found.values()].sort((a, b) => a.depth - b.depth || a.loc.length - b.loc.length).slice(0, maxPages)
  if (urls.length === 0) throw new SitemapError('We opened the site but found no pages that search engines are allowed to list. Check robots.txt and noindex tags.')
  stats.found = urls.length
  stats.ms = clock() - started
  return {
    site: origin,
    urls,
    xml: buildXml(urls, { lastmod: opts.lastmod ?? false, changefreq: opts.changefreq ?? 'none', priority: opts.priority ?? true }),
    stats,
  }
}
