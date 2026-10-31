import { describe, expect, it } from 'vitest'
import { buildXml, crawlSite, normalizeUrl, parseRobots, robotsAllows } from './sitemap.ts'

type Page = { body?: string; type?: string; status?: number; headers?: Record<string, string>; redirect?: string }
/** an in-memory website: path → page */
function site(host: string, pages: Record<string, Page | string>) {
  const calls: string[] = []
  const fetchImpl = async (url: string, _init?: unknown) => {
    calls.push(url)
    const u = new URL(url)
    const p = pages[u.pathname + u.search] ?? pages[u.pathname]
    if (u.hostname !== host && !(pages as Record<string, unknown>)['__any']) return new Response('nope', { status: 404 })
    if (p === undefined) return new Response('not found', { status: 404 })
    const page: Page = typeof p === 'string' ? { body: p } : p
    if (page.redirect) return new Response(null, { status: 301, headers: { location: page.redirect } })
    return new Response(page.body ?? '', { status: page.status ?? 200, headers: { 'content-type': page.type ?? 'text/html', ...(page.headers ?? {}) } })
  }
  return { fetchImpl, calls }
}
const html = (links: string[], head = '') => `<html><head>${head}</head><body>${links.map((l) => `<a href="${l}">x</a>`).join('')}</body></html>`

describe('sitemap generator', () => {
  it('normalises addresses: fragments, tracking, trailing slashes, index.html, ports, duplicate slashes', () => {
    expect(normalizeUrl('https://a.com/x/?utm_source=t&b=2&a=1#top')).toBe('https://a.com/x?a=1&b=2')
    expect(normalizeUrl('https://a.com:443//p//q/index.html')).toBe('https://a.com/p/q')
    expect(normalizeUrl('https://a.com')).toBe('https://a.com/')
    expect(normalizeUrl('mailto:a@b.c')).toBeNull()
    expect(normalizeUrl('/rel', 'https://a.com/x/')).toBe('https://a.com/rel')
  })

  it('robots.txt: longest rule wins, Allow beats Disallow on a tie, wildcards and $, own bot name, Sitemap lines', () => {
    const r = parseRobots('User-agent: Googlebot\nDisallow: /g\n\nUser-agent: *\nDisallow: /private\nAllow: /private/open\nDisallow: /*.pdf$\nSitemap: https://a.com/s.xml')
    expect(r.sitemaps).toEqual(['https://a.com/s.xml'])
    expect(robotsAllows(r, 'https://a.com/private/x')).toBe(false)
    expect(robotsAllows(r, 'https://a.com/private/open/x')).toBe(true)
    expect(robotsAllows(r, 'https://a.com/doc.pdf')).toBe(false)
    expect(robotsAllows(r, 'https://a.com/g')).toBe(true) // that group is for another bot
    expect(robotsAllows(parseRobots('User-agent: *\nDisallow: /'), 'https://a.com/x')).toBe(false)
    expect(robotsAllows(parseRobots(''), 'https://a.com/x')).toBe(true)
  })

  it('XML: escapes & < > and quotes; options switch lastmod / changefreq / priority', () => {
    const xml = buildXml([{ loc: 'https://a.com/?a=1&b=<2>', depth: 0, lastmod: '2026-01-02' }, { loc: 'https://a.com/x', depth: 3 }], { lastmod: true, changefreq: 'weekly', priority: true })
    expect(xml).toContain('<loc>https://a.com/?a=1&amp;b=&lt;2&gt;</loc>')
    expect(xml).toContain('<lastmod>2026-01-02</lastmod>')
    expect(xml).toContain('<changefreq>weekly</changefreq>')
    expect(xml).toContain('<priority>1.0</priority>')
    expect(xml).toContain('<priority>0.5</priority>')
    const bare = buildXml([{ loc: 'https://a.com/', depth: 0, lastmod: '2026-01-02' }], { lastmod: false, changefreq: 'none', priority: false })
    expect(bare).not.toMatch(/lastmod|changefreq|priority/)
  })

  it('crawls a site: follows internal links, skips external links, files, mailto and duplicates; home first', async () => {
    const { fetchImpl } = site('a.com', {
      '/': html(['/about', '/about/', '/about#team', '/blog?utm_source=x', 'https://other.com/x', '/file.pdf', 'mailto:a@a.com', '/img.png', 'tel:1']),
      '/about': html(['/', '/team']),
      '/team': html([]),
      '/blog': html(['/blog/post-1']),
      '/blog/post-1': html([]),
    })
    const r = await crawlSite('a.com', {}, fetchImpl)
    expect(r.urls.map((u) => u.loc)).toEqual(['https://a.com/', 'https://a.com/blog', 'https://a.com/about', 'https://a.com/team', 'https://a.com/blog/post-1'])
    expect(r.urls[0]!.depth).toBe(0)
    expect(r.stats.crawled).toBe(5)
    expect(r.xml.startsWith('<?xml')).toBe(true)
  })

  it('obeys robots.txt (Disallow) and noindex; uses the page canonical; ignores nofollow pages\' links', async () => {
    const { fetchImpl, calls } = site('a.com', {
      '/robots.txt': { body: 'User-agent: *\nDisallow: /admin', type: 'text/plain' },
      '/': html(['/admin/login', '/hidden', '/dup', '/nf']),
      '/hidden': html([], '<meta name="robots" content="noindex">'),
      '/dup': html([], '<link rel="canonical" href="https://a.com/real">'),
      '/nf': html(['/behind'], '<meta name="robots" content="nofollow">'),
      '/behind': html([]),
    })
    const r = await crawlSite('a.com', {}, fetchImpl)
    const locs = r.urls.map((u) => u.loc)
    expect(locs).toContain('https://a.com/real')
    expect(locs).not.toContain('https://a.com/dup')
    expect(locs).not.toContain('https://a.com/hidden')
    expect(locs.some((l) => l.includes('/admin'))).toBe(false)
    expect(calls.some((c) => c.includes('/admin'))).toBe(false)
    expect(calls.some((c) => c.includes('/behind'))).toBe(false)
    expect(r.stats.skipped).toMatchObject({ robots: 1, noindex: 1 })
  })

  it('uses the site\'s own sitemap (and a sitemap index) to reach pages no link points to', async () => {
    const { fetchImpl } = site('a.com', {
      '/': html([]),
      '/sitemap.xml': { body: '<sitemapindex><sitemap><loc>https://a.com/s1.xml</loc></sitemap></sitemapindex>', type: 'application/xml' },
      '/s1.xml': { body: '<urlset><url><loc>https://a.com/orphan?x=1&amp;y=2</loc></url><url><loc>https://elsewhere.com/no</loc></url></urlset>', type: 'application/xml' },
      '/orphan?x=1&y=2': html([]),
    })
    const r = await crawlSite('https://a.com', {}, fetchImpl)
    expect(r.urls.map((u) => u.loc)).toContain('https://a.com/orphan?x=1&y=2')
    expect(r.urls.some((u) => u.loc.includes('elsewhere'))).toBe(false)
    expect(r.stats.foundSitemap).toBe(true)
  })

  it('stops at the page cap and says it was cut short; follows www / https redirects of the home page', async () => {
    const pages: Record<string, Page | string> = { '/': html(Array.from({ length: 30 }, (_, i) => `/p${i}`)) }
    for (let i = 0; i < 30; i++) pages[`/p${i}`] = html([])
    const { fetchImpl } = site('www.a.com', pages)
    const r = await crawlSite('http://www.a.com', { maxPages: 10 }, fetchImpl)
    expect(r.urls).toHaveLength(10)
    expect(r.stats.truncated).toBe(true)
    const { fetchImpl: f2 } = site('www.a.com', { '/': html(['/x']), '/x': html([]) })
    const redirecting = async (u: string, init: Parameters<typeof f2>[1]) => (new URL(u).hostname === 'a.com' ? new Response(null, { status: 301, headers: { location: 'https://www.a.com/' } }) : f2(u, init))
    const r2 = await crawlSite('a.com', {}, redirecting as never)
    expect(r2.site).toBe('https://www.a.com')
    expect(r2.urls.map((u) => u.loc)).toEqual(['https://www.a.com/', 'https://www.a.com/x'])
  })

  it('records Last-Modified; drops non-HTML pages; keeps working when some pages fail', async () => {
    const { fetchImpl } = site('a.com', {
      '/': html(['/a', '/broken', '/data']),
      '/a': { body: html([]), headers: { 'last-modified': 'Wed, 21 Oct 2026 07:28:00 GMT' } },
      '/broken': { status: 500 },
      '/data': { body: '{}', type: 'application/json' },
    })
    const r = await crawlSite('a.com', { lastmod: true }, fetchImpl)
    expect(r.urls.find((u) => u.loc.endsWith('/a'))!.lastmod).toBe('2026-10-21')
    expect(r.urls.map((u) => u.loc)).not.toContain('https://a.com/broken')
    expect(r.urls.map((u) => u.loc)).not.toContain('https://a.com/data')
    expect(r.stats.failed).toBe(1)
    expect(r.xml).toContain('<lastmod>2026-10-21</lastmod>')
  })

  it('refuses private / local addresses and unreachable sites with a plain sentence', async () => {
    await expect(crawlSite('http://localhost', {})).rejects.toThrow(/not allowed/)
    await expect(crawlSite('http://example.com:4000', {})).rejects.toThrow(/port/)
    await expect(crawlSite('http://169.254.169.254/latest', {})).rejects.toThrow(/not allowed/)
    await expect(crawlSite('ftp://a.com', {})).rejects.toThrow(/http/)
    await expect(crawlSite('a.com', {}, (async () => new Response('x', { status: 404 })) as never)).rejects.toThrow(/could not open/)
  })

  it('stops after the time budget instead of running forever', async () => {
    const pages: Record<string, Page | string> = { '/': html(Array.from({ length: 40 }, (_, i) => `/p${i}`)) }
    for (let i = 0; i < 40; i++) pages[`/p${i}`] = html([])
    const { fetchImpl } = site('a.com', pages)
    let t = 0
    const r = await crawlSite('a.com', { maxPages: 200 }, fetchImpl, () => (t += 9_000))
    expect(r.stats.slow).toBe(true)
    expect(r.urls.length).toBeGreaterThan(0)
  })
})
