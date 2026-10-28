import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { generatedAsset } from '../db/schema.ts'
import { api, json, setPlan, signUp } from '../test-utils.ts'
import { detectFonts as detectFontsFor, extractBrand, findLogoCandidates, parseColor, pickPrimaryAccent, scoreColors } from './extract.ts'
import { BrandReadError, findBrand, softRedirectTarget } from './find.ts'
import { mapFont } from './fonts.ts'

const CSS = `
:root{--brand-primary:#E4572E;--brand-accent:#17BEBB;--gray-900:#222222;--text:#333}
body{font-family:'Inter',system-ui,sans-serif;color:#333;background:#fff}
h1,h2{font-family:'Playfair Display',Georgia,serif;color:#111}
.btn-primary{background:#E4572E;color:#fff}
a{color:#E4572E}
.footer{background:#222222;color:#cccccc}
.tag{border-color:rgba(228,87,46,.9)}
`
const HTML = `<!doctype html><html><head><title>Acme Roasters | Specialty coffee</title>
<meta name="theme-color" content="#E4572E"><meta property="og:site_name" content="Acme Roasters">
<link rel="stylesheet" href="/static/site.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch.png">
<script type="application/ld+json">{"@type":"Organization","name":"Acme Roasters","logo":"https://acme.example/brand/logo.png"}</script>
</head><body><header><img class="site-logo" src="/img/header-mark.png" alt="Acme"></header><a class="btn-primary" href="/">Shop</a></body></html>`

describe('colour parsing and scoring', () => {
  it('reads hex, rgb and hsl, and ignores transparent or non-colours', () => {
    expect(parseColor('#e4572e')).toBe('#E4572E')
    expect(parseColor('#f60')).toBe('#FF6600')
    expect(parseColor('rgb(23, 190, 187)')).toBe('#17BEBB')
    expect(parseColor('hsl(210, 100%, 50%)')).toBe('#0080FF')
    expect(parseColor('rgba(0,0,0,0.1)')).toBeNull()
    expect(parseColor('var(--x)')).toBeNull()
    expect(parseColor('transparent')).toBeNull()
  })
  it('finds the brand colours and drops the greys and white', () => {
    const palette = scoreColors(CSS, HTML)
    expect(palette[0]!.hex).toBe('#E4572E') // theme-color, --brand-primary, button and links all agree
    expect(palette.map((p) => p.hex)).toContain('#17BEBB')
    for (const p of palette) expect(['#222222', '#333333', '#111111', '#FFFFFF', '#CCCCCC']).not.toContain(p.hex)
    const { primary, accent, derived } = pickPrimaryAccent(palette)
    expect([primary, accent, derived]).toEqual(['#E4572E', '#17BEBB', false])
  })
  it('a one-colour site gets a derived accent with a clearly different hue', () => {
    const p = pickPrimaryAccent(scoreColors('a{color:#E4572E}.btn{background:#E4572E}', ''))
    expect(p.primary).toBe('#E4572E'); expect(p.derived).toBe(true); expect(p.accent).not.toBe(p.primary)
  })
  it('no brand colours at all → nothing invented', () => {
    expect(pickPrimaryAccent(scoreColors('body{color:#333;background:#fff}', ''))).toEqual({ primary: null, accent: null, derived: false })
  })
})

describe('fonts, name and logo', () => {
  it('headings and body come from the CSS (system fonts ignored); Google Fonts links count', () => {
    const b = extractBrand(HTML, CSS, 'https://acme.example/')
    expect(b.fonts.heading).toBe('Playfair Display')
    expect(b.fonts.body).toBe('Inter')
    expect(b.fonts.detected).toEqual(expect.arrayContaining(['Playfair Display', 'Inter']))
    expect(b.name).toBe('Acme Roasters')
  })
  it('logo candidates: structured data first, then header images called logo, then touch icons — all absolute', () => {
    expect(findLogoCandidates(HTML, 'https://acme.example/').logos).toEqual(['https://acme.example/brand/logo.png', 'https://acme.example/img/header-mark.png', 'https://acme.example/apple-touch.png'])
  })
  it('maps website fonts to ones we can render', () => {
    expect(mapFont('inter')).toMatchObject({ family: 'Inter', exact: true })
    expect(mapFont('Proxima Nova')).toMatchObject({ family: 'Montserrat', exact: false })
    expect(mapFont('Garamond', 'heading').family).toBe('Playfair Display')
    expect(mapFont('Some Unknown Font', 'body')).toMatchObject({ family: 'Inter', exact: false })
  })
})

const png = (w: number, h: number) => { const b = Buffer.alloc(40); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b }
const res = (body: Buffer | string, type: string) => new Response(typeof body === 'string' ? body : new Uint8Array(body), { status: 200, headers: { 'content-type': type } })

describe('findBrand (network faked)', () => {
  const site = async (url: string) => {
    if (url === 'https://acme.example/') return res(HTML, 'text/html; charset=utf-8')
    if (url.endsWith('/static/site.css')) return res(CSS, 'text/css')
    if (url.endsWith('/brand/logo.png')) return res(png(400, 120), 'image/png')
    return new Response('nope', { status: 404 })
  }
  it('returns colours, mapped fonts and a logo that is saved on our side', async () => {
    const u = await signUp('br')
    const b = await findBrand(u.id, 'https://acme.example/', (url) => site(url))
    expect(b.colors).toMatchObject({ primary: '#E4572E', accent: '#17BEBB', accentDerived: false })
    expect(b.fonts.heading).toMatchObject({ family: 'Playfair Display', exact: true })
    expect(b.confidence).toBe('high')
    expect(b.logo!.aspect).toBeCloseTo(400 / 120, 2)
    expect(b.logo!.url).toMatch(/\/api\/v1\/assets\/[A-Za-z0-9_-]{32}$/)
    const rows = await db.select().from(generatedAsset).where(eq(generatedAsset.userId, u.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'logo', mime: 'image/png', status: 'ready' })
    expect((await json(await api(u.cookie, 'GET', '/me/entitlements'))).data.usage.imagesThisPeriod).toBe(0) // a saved logo is not one of the user's AI pictures
  })
  it('skips logos that are not real PNG/JPEG files, too small, or the wrong shape, and still returns the colours', async () => {
    const u = await signUp('br')
    const bad = async (url: string) => (url.endsWith('/brand/logo.png') ? res('<svg/>', 'image/png') : url.endsWith('/img/header-mark.png') ? res(png(20, 20), 'image/png') : url.endsWith('/apple-touch.png') ? res(png(900, 50), 'image/png') : site(url))
    const b = await findBrand(u.id, 'https://acme.example/', (url) => bad(url))
    expect(b.logo).toBeNull()
    expect(b.colors.primary).toBe('#E4572E')
  })
  it('refuses private and local addresses before any request is made', async () => {
    const u = await signUp('br')
    let calls = 0
    for (const url of ['http://127.0.0.1/', 'http://localhost:4000/', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.5/', 'file:///etc/passwd']) {
      await expect(findBrand(u.id, url, async () => { calls++; return new Response('x') })).rejects.toThrow()
    }
    expect(calls).toBe(0)
  })
})

describe('POST /brand/extract', () => {
  it('is for paid plans, needs a sign-in, and refuses private addresses with a clear code', async () => {
    const free = await signUp('br'), pro = await signUp('br')
    await setPlan(pro.id, 'pro')
    const denied = await api(free.cookie, 'POST', '/brand/extract', { url: 'acme.example' })
    expect(denied.status).toBe(403)
    expect((await json(denied)).error.code).toBe('UPGRADE_REQUIRED')
    expect((await api('', 'POST', '/brand/extract', { url: 'acme.example' })).status).toBe(401)
    const blocked = await api(pro.cookie, 'POST', '/brand/extract', { url: 'http://127.0.0.1:4000/' })
    expect(blocked.status).toBe(400)
    expect((await json(blocked)).error.code).toBe('URL_NOT_ALLOWED')
  })
})

const site2 = async (url: string) => {
  if (url === 'https://acme.example/') return res(HTML, 'text/html; charset=utf-8')
  if (url.endsWith('/static/site.css')) return res(CSS, 'text/css')
  if (url.endsWith('/brand/logo.png')) return res(png(400, 120), 'image/png')
  return new Response('nope', { status: 404 })
}

describe('findBrand — real-world hardening', () => {
  const page = (body: string, type = 'text/html') => async () => res(body, type)
  const fail = async (u: string, f: (url: string) => Promise<Response>) => findBrand(u, 'https://acme.example/', (url) => f(url)).then(() => null, (e: Error) => e)

  it('answers every failure in one plain sentence (never "fetch failed" or a code)', async () => {
    const u = await signUp('br')
    const cases: [(url: string) => Promise<Response>, RegExp][] = [
      [async () => new Response('x', { status: 404 }), /could not find that page/],
      [async () => new Response('x', { status: 403 }), /does not let automated tools/],
      [async () => new Response('x', { status: 503 }), /having trouble/],
      [page('%PDF', 'application/pdf'), /not a web page/],
      [async () => { throw new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo ENOTFOUND x'), { code: 'ENOTFOUND' }) }) }, /could not find that website/],
      [async () => { throw new TypeError('fetch failed', { cause: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }) }) }, /could not connect/],
      [async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError') }, /took too long/],
      [async () => { throw new Error('something internal at /Users/x/y.ts:1') }, /^We could not read that website/],
    ]
    for (const [f, re] of cases) {
      const e = await fail(u.id, f)
      expect(e).toBeInstanceOf(BrandReadError)
      expect(e!.message).toMatch(re)
      expect(e!.message).not.toMatch(/fetch failed|ENOTFOUND|ECONN|\/Users|TypeError/)
    }
  })

  it('refuses social networks and pages that only show a login form', async () => {
    const u = await signUp('br')
    let calls = 0
    for (const url of ['https://www.linkedin.com/company/x', 'https://instagram.com/x', 'https://facebook.com/x', 'https://twitter.com/x', 'https://x.com/x']) {
      await expect(findBrand(u.id, url, async () => { calls++; return res(HTML, 'text/html') })).rejects.toThrow(/Social networks/)
    }
    expect(calls).toBe(0)
    await expect(findBrand(u.id, 'https://acme.example/', async (url) => (url === 'https://acme.example/' ? new Response(null, { status: 302, headers: { location: 'https://acme.example/login?next=/' } }) : res(HTML, 'text/html')))).rejects.toThrow(/asks visitors to sign in/)
    // a deep link that needs a sign-in falls back to the public front page
    const deep = async (url: string) => (url === 'https://acme.example/app/dashboard' ? new Response(null, { status: 302, headers: { location: 'https://acme.example/login' } }) : url === 'https://acme.example/login' ? res('<html><title>Sign in</title></html>', 'text/html') : site2(url))
    expect((await findBrand(u.id, 'https://acme.example/app/dashboard', deep)).colors.primary).toBe('#E4572E')
  })

  it('an oversized page is read as far as the limit instead of being refused', async () => {
    const u = await signUp('br')
    const big = HTML.replace('</head>', '</head>') + '<!--' + 'x'.repeat(2.5 * 1024 * 1024) + '-->'
    const b = await findBrand(u.id, 'https://acme.example/', async (url) => (url === 'https://acme.example/' ? res(big, 'text/html') : site2(url)))
    expect(b.colors.primary).toBe('#E4572E')
  })

  it('follows pages that only bounce the visitor on (meta refresh, auto-submitted form)', async () => {
    const u = await signUp('br')
    const hop = async (url: string) => (url === 'https://acme.example/' ? res('<html><head><title>Redirecting</title></head><body onload="document.forms[0].submit()"><form method="POST" action="https://www.acme.example/v2/handoff"><input name=p value=1></form></body></html>', 'text/html') : url === 'https://www.acme.example/' ? res(HTML, 'text/html') : site2(url))
    expect((await findBrand(u.id, 'https://acme.example/', hop)).colors.primary).toBe('#E4572E')
    expect(softRedirectTarget('<meta http-equiv="refresh" content="0; url=/home">', 'https://a.example/')).toBe('https://a.example/home')
    expect(softRedirectTarget('<script>location.replace("https://b.example/x")</script>', 'https://a.example/')).toBe('https://b.example/x')
    expect(softRedirectTarget(HTML + 'x'.repeat(7000), 'https://a.example/')).toBeNull() // a real page is never treated as a bounce
  })

  it('uses the logo\'s colour to confirm the brand colour, and says "low confidence" when the logo disagrees', async () => {
    const u = await signUp('br')
    const html = HTML.replace('https://acme.example/brand/logo.png', 'https://acme.example/brand/logo.svg')
    const withLogo = (hex: string) => async (url: string) => (url === 'https://acme.example/' ? res(html, 'text/html') : url.endsWith('/brand/logo.svg') ? res(`<svg><path fill="${hex}"/></svg>`, 'image/svg+xml') : site2(url))
    const agree = await findBrand(u.id, 'https://acme.example/', withLogo('#E4572E'))
    expect(agree).toMatchObject({ confidence: 'high', colors: { primary: '#E4572E' } })
    const disagree = await findBrand(u.id, 'https://acme.example/', withLogo('#00AA33'))
    expect(disagree.confidence).toBe('low')
  })

  it('looking up the same site twice reuses the stored logo', async () => {
    const u = await signUp('br')
    const a = await findBrand(u.id, 'https://acme.example/', (url) => site2(url))
    const b = await findBrand(u.id, 'https://acme.example/', (url) => site2(url))
    expect(a.logo!.url).toBe(b.logo!.url)
    expect(await db.select().from(generatedAsset).where(eq(generatedAsset.userId, u.id))).toHaveLength(1)
  })

  it('fonts: CSS leftovers are never offered as font names; a tagline title falls back to the domain; partner logos are not ours', () => {
    const css = 'h1{font:700 2.5rem/1.1 inherit} h2{font-family:0em} h3{font-family:calc(1px + 2px)} body{font-family:"Real Font",sans-serif} .x{font-family:"IBM Plex Mono",monospace}'
    const f = detectFontsFor(css, '')
    expect(f.detected).not.toContain('0em')
    expect(f.detected.join()).not.toMatch(/calc|inherit|px|Mono/)
    expect(extractBrand('<html><head><title>Online Shopping Site for Mobiles, Electronics, Furniture, Grocery</title></head></html>', '', 'https://www.shopit.example/').name).toBe('Shopit')
    const logos = findLogoCandidates('<header><img src="/partner-logo.png" alt="Partner logo"><img src="/img/own-logo.png" alt="Acme logo"></header><img class="trusted-logo" src="/g2-badge-logo.png">', 'https://acme.example/').logos
    expect(logos).toEqual(['https://acme.example/img/own-logo.png'])
  })

  it('D4 a page that links a stylesheet and a logo on private addresses: those are never requested, the lookup still succeeds', async () => {
    const u = await signUp('br')
    const html = HTML.replace('<link rel="stylesheet" href="/static/site.css">', '<link rel="stylesheet" href="http://127.0.0.1/evil.css"><link rel="stylesheet" href="http://169.254.169.254/x.css">').replace('https://acme.example/brand/logo.png', 'http://10.0.0.5/logo.png')
    const asked: string[] = []
    const b = await findBrand(u.id, 'https://acme.example/', async (url) => { asked.push(url); return url === 'https://acme.example/' ? res(html, 'text/html') : new Response('nope', { status: 404 }) })
    expect(asked.filter((x) => /127\.0\.0\.1|169\.254|10\.0\.0\.5/.test(x))).toEqual([])
    expect(b.colors.primary).toBe('#E4572E') // the page's own theme-color still counts
  })
})
