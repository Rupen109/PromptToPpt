import { parseHTML } from 'linkedom'
import { hexToHsl } from '@prompttoppt/theme'

/**
 * Reads a website's brand from its static HTML + CSS: colours, fonts, name and logo candidates. Nothing here runs the page's
 * JavaScript and nothing calls a model, so it is cheap and predictable. Pure functions: the network part is in find.ts.
 */

export interface BrandDraft {
  name: string | null
  /** best colours first, with how sure we are (higher = used by buttons / theme variables / meta tags) */
  palette: { hex: string; score: number }[]
  primary: string | null
  accent: string | null
  /** accent was not on the page (it only used one brand colour), so it was derived from the primary */
  accentDerived: boolean
  fonts: { heading: string | null; body: string | null; detected: string[] }
  /** absolute URLs, best first (structured data, header images called "logo", touch icons) */
  logoCandidates: string[]
}

// ─── colours ─────────────────────────────────────────────────────────────────

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase()

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)) }
  return [f(0) * 255, f(8) * 255, f(4) * 255]
}

/** One CSS colour value → #RRGGBB (or null: keywords, var(), gradients, transparent). */
export function parseColor(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  let m = /^#([0-9a-f]{3,8})$/.exec(v)
  if (m) {
    const h = m[1]!
    if (h.length === 3 || h.length === 4) return toHex(parseInt(h[0]! + h[0]!, 16), parseInt(h[1]! + h[1]!, 16), parseInt(h[2]! + h[2]!, 16))
    if (h.length === 6 || h.length === 8) return toHex(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16))
    return null
  }
  m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v)
  if (m) {
    const ch = (s: string) => (s.endsWith('%') ? (parseFloat(s) / 100) * 255 : parseFloat(s))
    if (m[4] !== undefined && (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) < 0.5) return null // mostly transparent: not a brand colour
    return toHex(ch(m[1]!), ch(m[2]!), ch(m[3]!))
  }
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v)
  if (m) {
    if (m[4] !== undefined && (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) < 0.5) return null
    const [r, g, b] = hslToRgb(parseFloat(m[1]!) % 360, parseFloat(m[2]!) / 100, parseFloat(m[3]!) / 100)
    return toHex(r, g, b)
  }
  return null
}

/** Whites, blacks and greys are page furniture, not brand colours. */
export function isBrandable(hex: string): boolean {
  const [, s, l] = hexToHsl(hex)
  return s >= 0.22 && l >= 0.12 && l <= 0.88
}

const hueGap = (a: string, b: string) => { const d = Math.abs(hexToHsl(a)[0] - hexToHsl(b)[0]); return Math.min(d, 360 - d) }

const COLOR_PROPS = /^(color|background|background-color|border-color|border-top-color|border-bottom-color|fill|stroke|outline-color|--[\w-]+)$/
const COLOR_TOKEN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g

/** How much a CSS rule's colour says about the brand: buttons / calls to action / headers speak louder than body text. */
function selectorWeight(sel: string): number {
  const s = sel.toLowerCase()
  if (/(^|[\s.#,>])(btn|button|cta|primary|brand|hero)/.test(s) || /button|\.btn|cta/.test(s)) return 3
  if (/(^|[\s,>])(a|a:hover|nav|header|\.link|\.nav|\.header|h1|h2)([\s.:,{[#>]|$)/.test(s)) return 1.6
  return 0.5
}
/** Custom-property names that name a brand colour. */
function varWeight(name: string): number {
  const n = name.toLowerCase()
  if (/primary|brand/.test(n)) return 9
  if (/accent|secondary|highlight|cta/.test(n)) return 5
  if (/theme|main|color-?\d|colou?r/.test(n)) return 2
  return 0.5
}

export function scoreColors(css: string, html: string): { hex: string; score: number }[] {
  const score = new Map<string, number>()
  const add = (hex: string | null, w: number) => { if (hex && isBrandable(hex)) score.set(hex, (score.get(hex) ?? 0) + w) }

  // meta tags
  for (const m of html.matchAll(/<meta[^>]+name=["'](theme-color|msapplication-TileColor)["'][^>]*>/gi)) {
    const c = /content=["']([^"']+)["']/i.exec(m[0])?.[1]
    add(c ? parseColor(c) : null, m[1]!.toLowerCase() === 'theme-color' ? 10 : 6)
  }
  // style blocks inside the HTML count like linked CSS
  const allCss = css + '\n' + [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n')
  const stripped = allCss.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const rule of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const w = selectorWeight(rule[1]!)
    for (const decl of rule[2]!.split(';')) {
      const i = decl.indexOf(':')
      if (i < 0) continue
      const prop = decl.slice(0, i).trim().toLowerCase()
      if (!COLOR_PROPS.test(prop)) continue
      const wp = prop.startsWith('--') ? varWeight(prop) : w
      for (const tok of decl.slice(i + 1).match(COLOR_TOKEN) ?? []) add(parseColor(tok), wp)
    }
  }
  // inline style="…" on buttons / links
  for (const m of html.matchAll(/<(?:a|button)[^>]+style=["']([^"']+)["']/gi)) for (const tok of m[1]!.match(COLOR_TOKEN) ?? []) add(parseColor(tok), 2)
  return [...score].map(([hex, s]) => ({ hex, score: Math.round(s * 10) / 10 })).sort((a, b) => b.score - a.score)
}

/** Primary = the strongest brand colour; accent = the strongest one whose hue is clearly different (else derived from the primary). */
export function pickPrimaryAccent(palette: { hex: string; score: number }[]): { primary: string | null; accent: string | null; derived: boolean } {
  const primary = palette[0]?.hex ?? null
  if (!primary) return { primary: null, accent: null, derived: false }
  const other = palette.slice(1).find((c) => hueGap(c.hex, primary) >= 28 && c.score >= Math.max(1, palette[0]!.score * 0.08))
  if (other) return { primary, accent: other.hex, derived: false }
  const [h, s, l] = hexToHsl(primary)
  const [r, g, b] = hslToRgb((h + 32) % 360, Math.min(0.85, Math.max(0.55, s)), Math.min(0.6, Math.max(0.45, l)))
  return { primary, accent: toHex(r, g, b), derived: true }
}

// ─── fonts ───────────────────────────────────────────────────────────────────

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'inherit', 'initial', 'unset', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'roboto', 'helvetica neue', 'apple color emoji', 'segoe ui emoji', 'noto sans', 'noto color emoji', 'oxygen', 'ubuntu', 'cantarell', 'fira sans', 'droid sans', 'emoji', 'sans', 'icon'])
/** letters, digits, spaces and dashes only, starting with a letter and without CSS units (22px, 2.5rem, 0em) */
const REAL_FONT_NAME = /^[A-Za-z][A-Za-z0-9 _-]{1,38}$/
const firstFont = (decl: string): string | null => {
  for (const part of decl.split(',')) {
    const f = part.trim().replace(/^["']|["']$/g, '').replace(/\s*!important$/i, '').trim()
    if (!f || f.startsWith('var(') || GENERIC.has(f.toLowerCase()) || /icon|awesome|material|glyph|symbol|katex|mono|code|courier|consolas/i.test(f)) continue
    if (!REAL_FONT_NAME.test(f) || /^(normal|bold|italic|oblique|lighter|bolder|small-caps)\b/i.test(f)) continue // sizes, weights, calc() and other CSS leftovers are not font names
    return f
  }
  return null
}

export function detectFonts(css: string, html: string): BrandDraft['fonts'] {
  const stripped = (css + '\n' + [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n')).replace(/\/\*[\s\S]*?\*\//g, '')
  let heading: string | null = null, body: string | null = null
  const counts = new Map<string, number>()
  for (const rule of stripped.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const sel = rule[1]!.trim().toLowerCase()
    for (const decl of rule[2]!.split(';')) {
      const i = decl.indexOf(':')
      if (i < 0) continue
      const prop = decl.slice(0, i).trim().toLowerCase()
      const val = decl.slice(i + 1)
      const isVar = /^--.*font/.test(prop)
      if (prop !== 'font-family' && !isVar && prop !== 'font') continue
      const f = firstFont(prop === 'font' ? val.replace(/^[^,]*?(?=[A-Za-z"'][^,]*(,|$))/, '') : val)
      if (!f) continue
      counts.set(f, (counts.get(f) ?? 0) + 1)
      if (/(^|[\s,>])h[1-3]([\s.:,{#>[]|$)|heading|title|display/.test(sel) || /heading|title|display/.test(prop)) heading ??= f
      if (/(^|[\s,])(body|html|:root)([\s.:,{#>[]|$)/.test(sel) || /(^|-)(body|text|sans|base)(-|$)/.test(prop)) body ??= f
    }
  }
  // Google Fonts <link>s name the families a site really loads
  const google: string[] = []
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'<>\s]+)/gi)) {
    for (const fam of m[1]!.replace(/&amp;/g, '&').matchAll(/family=([^&:]+)/g)) google.push(decodeURIComponent(fam[1]!.replace(/\+/g, ' ')))
  }
  for (const g of google) counts.set(g, (counts.get(g) ?? 0) + 1)
  const ranked = [...counts].sort((a, b) => b[1] - a[1]).map(([f]) => f)
  const detected = [...new Set([heading, body, ...google, ...ranked].filter((x): x is string => !!x))].slice(0, 6)
  heading ??= google[0] ?? ranked[0] ?? null
  body ??= google.find((g) => g !== heading) ?? ranked.find((f) => f !== heading) ?? heading
  return { heading, body, detected }
}

// ─── name + logo ─────────────────────────────────────────────────────────────

function absolutize(u: string | null | undefined, base: string): string | null {
  if (!u) return null
  try { const url = new URL(u.trim(), base); return /^https?:$/.test(url.protocol) ? url.toString() : null } catch { return null }
}

/** customer / partner / review-site logos are not the company's own */
const NOT_OURS = /partner|customer|client|trusted|badge|review|award|capterra|g2[-_]|trustradius|integration|testimonial|press|featured/i

/** the little of the DOM we use (the API build has no DOM typings) */
type El = { getAttribute(n: string): string | null; closest(s: string): unknown }

export function findLogoCandidates(html: string, baseUrl: string): { name: string | null; logos: string[] } {
  const { document } = parseHTML(html)
  const logos: string[] = []
  let name: string | null = null
  const push = (u: string | null | undefined) => { const a = absolutize(u, baseUrl); if (a && !logos.includes(a)) logos.push(a) }

  // 1. structured data (Organization / WebSite logo)
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const walk = (n: unknown) => {
        if (Array.isArray(n)) return n.forEach(walk)
        if (!n || typeof n !== 'object') return
        const o = n as Record<string, unknown>
        if (typeof o['name'] === 'string' && /Organization|Corporation|Company|WebSite|LocalBusiness/.test(String(o['@type'])) && !name) name = o['name'].slice(0, 80)
        const logo = o['logo']
        push(typeof logo === 'string' ? logo : (logo as { url?: string } | undefined)?.url)
        Object.values(o).forEach(walk)
      }
      walk(JSON.parse(s.textContent ?? '{}'))
    } catch { /* malformed JSON-LD: skip */ }
  }
  // 2. images in the page header that call themselves a logo
  const imgs = [...document.querySelectorAll('img')] as unknown as El[]
  const text = (i: El) => `${i.getAttribute('class') ?? ''} ${i.getAttribute('id') ?? ''} ${i.getAttribute('alt') ?? ''} ${i.getAttribute('src') ?? ''}`
  const isLogo = (i: El) => /logo|brand|wordmark/i.test(text(i)) && !NOT_OURS.test(text(i))
  const inHeader = (i: El) => !!i.closest('header, nav, [class*="header"], [class*="navbar"], [id*="header"]')
  const srcOf = (i: El) => i.getAttribute('src') ?? i.getAttribute('data-src') ?? i.getAttribute('srcset')?.split(/[\s,]+/)[0]
  for (const i of imgs.filter((x) => isLogo(x) && inHeader(x)).slice(0, 4)) push(srcOf(i))
  // 3. touch icons and large favicons (square, usually the mark itself)
  const icons = [...document.querySelectorAll('link[rel~="apple-touch-icon"], link[rel~="icon"], link[rel="shortcut icon"]')] as unknown as El[]
  const size = (l: El) => parseInt((l.getAttribute('sizes') ?? '0').split('x')[0] ?? '0', 10) || 0
  for (const l of icons.sort((a, b) => size(b) - size(a))) push(l.getAttribute('href'))
  // 4. last resort: a logo-looking image elsewhere on the page (never one of a partner, customer, review or award badge)
  for (const i of imgs.filter((x) => isLogo(x) && !inHeader(x)).slice(0, 2)) push(srcOf(i))

  const fromHost = () => { const h = new URL(baseUrl).hostname.replace(/^www\./, '').split('.')[0] ?? ''; return h ? h[0]!.toUpperCase() + h.slice(1) : null }
  name ??= document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')?.slice(0, 80)
    ?? document.querySelector('meta[name="application-name"]')?.getAttribute('content')?.slice(0, 80)
    ?? (document.title ? String(document.title).split(/\s[|\-–—·•:]\s/).map((x: string) => x.trim()).filter(Boolean).sort((a: string, b: string) => a.length - b.length)[0] : null) ?? null
  // a tagline instead of a name ("Online Shopping Site for Mobiles, …"): fall back to the site's own domain
  if (!name || name.length > 40 || name.trim().split(/\s+/).length > 5) name = fromHost()
  return { name, logos: logos.slice(0, 10) }
}

/** Stylesheets the page links to (same rules as pages: public URLs only, checked by the caller). */
export function findStylesheets(html: string, baseUrl: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel=["']?stylesheet/i.test(m[0])) continue
    const href = /href=["']([^"']+)["']/i.exec(m[0])?.[1]
    const abs = absolutize(href, baseUrl)
    if (abs && !/fonts\.googleapis\.com|fontawesome|cdnjs\.cloudflare\.com\/ajax\/libs\/font/i.test(abs) && !out.includes(abs)) out.push(abs)
  }
  return out
}

export function extractBrand(html: string, css: string, baseUrl: string): BrandDraft {
  const palette = scoreColors(css, html).slice(0, 8)
  const { primary, accent, derived } = pickPrimaryAccent(palette)
  const { name, logos } = findLogoCandidates(html, baseUrl)
  return { name, palette, primary, accent, accentDerived: derived, fonts: detectFonts(css, html), logoCandidates: logos }
}
