/**
 * Real-internet probe for "get brand from a website" (docs/BRAND_FROM_WEBSITE_FLOWS.md).
 * usage: tsx scripts/brand-probe.ts <qa-email> [filter]   — QA only; writes JSON to $PROBE_OUT (default /private/tmp/brand-probe.json)
 * The expected colours were written down before the first run. `exp` = the brand's well-known colour (or null when it has none worth testing).
 */
import { writeFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.ts'
import { user } from '../src/db/schema.ts'
import { isProd } from '../src/env.ts'
import { findBrand } from '../src/brand/find.ts'
if (isProd) { console.error('Refusing to run in production'); process.exit(1) }

const SITES: { url: string; exp: string | null; note?: string }[] = [
  { url: 'stripe.com', exp: '#635BFF' }, { url: 'spotify.com', exp: '#1DB954' }, { url: 'airbnb.com', exp: '#FF385C' }, { url: 'slack.com', exp: '#4A154B' },
  { url: 'mailchimp.com', exp: '#FFE01B' }, { url: 'shopify.com', exp: '#008060' }, { url: 'zerodha.com', exp: '#387ED1' }, { url: 'flipkart.com', exp: '#2874F0' },
  { url: 'swiggy.com', exp: '#FC8019' }, { url: 'dropbox.com', exp: '#0061FF' }, { url: 'netflix.com', exp: '#E50914' }, { url: 'infosys.com', exp: '#007CC3' },
  { url: 'nasa.gov', exp: '#0B3D91' }, { url: 'wordpress.org', exp: '#3858E9' }, { url: 'canva.com', exp: '#7D2AE8' }, { url: 'hubspot.com', exp: '#FF4800' }, // corrected from #FF7A59: HubSpot's own current logo file is #ff2f00-ish, so the old orange was a stale expectation
  { url: 'asana.com', exp: '#F06A6A' }, { url: 'trello.com', exp: '#0052CC' }, { url: 'atlassian.com', exp: '#0052CC' }, { url: 'zoom.us', exp: '#0B5CFF' },
  { url: 'duolingo.com', exp: '#58CC02' }, { url: 'pinterest.com', exp: '#E60023' }, { url: 'rakuten.co.jp', exp: '#BF0000' },
  { url: 'linear.app', exp: '#5E6AD2', note: 'script-rendered' }, { url: 'twitch.tv', exp: '#9146FF', note: 'script-rendered' }, { url: 'baidu.com', exp: '#2932E1', note: 'script-heavy' },
  { url: 'notion.so', exp: null }, { url: 'vercel.com', exp: null }, { url: 'github.com', exp: null }, { url: 'figma.com', exp: null }, { url: 'google.com', exp: null }, { url: 'bbc.com', exp: null },
  { url: 'example.com', exp: null, note: 'no brand colours expected' }, { url: 'wikipedia.org', exp: null, note: 'no brand colours expected' },
]
const ERRORS: { url: string; kind: 'error' | 'blocked' }[] = [
  { url: 'this-domain-should-not-exist-98127.com', kind: 'error' }, { url: 'https://example.com/this/page/does/not/exist', kind: 'error' },
  { url: 'linkedin.com', kind: 'error' }, { url: 'instagram.com', kind: 'error' },
  { url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', kind: 'error' },
  { url: 'https://httpbin.org/bytes/3000000', kind: 'error' }, { url: 'https://httpbin.org/delay/15', kind: 'error' },
  { url: 'http://127.0.0.1', kind: 'blocked' }, { url: 'http://localhost:4000', kind: 'blocked' }, { url: 'http://[::1]/', kind: 'blocked' }, { url: 'http://2130706433/', kind: 'blocked' },
  { url: 'http://0x7f.0.0.1/', kind: 'blocked' }, { url: 'http://169.254.169.254/latest/meta-data/', kind: 'blocked' }, { url: 'http://metadata.google.internal/', kind: 'blocked' },
  { url: 'http://10.0.0.1/', kind: 'blocked' }, { url: 'http://192.168.1.1/', kind: 'blocked' }, { url: 'http://localtest.me/', kind: 'blocked' }, { url: 'http://127.0.0.1.nip.io/', kind: 'blocked' },
  { url: 'https://httpbin.org/redirect-to?url=http://127.0.0.1/', kind: 'blocked' }, { url: 'https://httpbin.org/redirect-to?url=http://169.254.169.254/', kind: 'blocked' },
]
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const dist = (a: string, b: string) => { const x = rgb(a), y = rgb(b); return Math.round(Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!)) }

const [email, filter] = process.argv.slice(2)
const [u] = await db.select().from(user).where(eq(user.email, email!))
if (!u) { console.error('no such user'); process.exit(1) }
const norm = (x: string) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(x) ? x : `https://${x}`)

async function run(url: string) {
  const t = Date.now()
  try { const b = await findBrand(u!.id, norm(url)); return { url, ms: Date.now() - t, ok: true as const, b } }
  catch (e) { return { url, ms: Date.now() - t, ok: false as const, err: `${(e as Error).constructor.name}: ${(e as Error).message}`.slice(0, 160) } }
}
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: n }, async () => { for (;;) { const k = i++; if (k >= items.length) return; out[k] = await fn(items[k]!) } }))
  return out
}

const sites = SITES.filter((s) => !filter || s.url.includes(filter))
const errs = ERRORS.filter((s) => !filter || s.url.includes(filter))
const siteRes = await pool(sites, 4, async (s) => ({ s, r: await run(s.url) }))
const errRes = await pool(errs, 4, async (s) => ({ s, r: await run(s.url) }))

let withExp = 0, matched = 0, wrongFlagged = 0, wrong = 0, logos = 0, fonts = 0, names = 0, okCount = 0
const times: number[] = []
console.log('\n=== SITES ===')
for (const { s, r } of siteRes) {
  times.push(r.ms)
  if (!r.ok) { console.log(`✗ ${s.url.padEnd(20)} ERROR ${r.err} (${r.ms}ms)`); continue }
  okCount++; const b = r.b
  const cands = [b.colors.primary, b.colors.accent, ...b.colors.palette.slice(0, 4)].filter((x): x is string => !!x)
  const best = s.exp && cands.length ? Math.min(...cands.map((c) => dist(c, s.exp!))) : null
  const hit = best !== null && best <= 75
  if (s.exp) { withExp++; if (hit) matched++; else { wrong++; if (b.confidence === 'low' || !b.colors.primary) wrongFlagged++ } }
  if (b.logo) logos++; if (b.fonts.heading) fonts++; if (b.name) names++
  console.log(`${s.exp ? (hit ? '✓' : '✗') : '·'} ${s.url.padEnd(20)} P:${b.colors.primary ?? '-'} A:${b.colors.accent ?? '-'}${b.colors.accentDerived ? '*' : ' '} exp:${s.exp ?? '-'}${best !== null ? ` Δ${best}` : ''} conf:${b.confidence} logo:${b.logo ? b.logo.aspect : '-'} H:${b.fonts.heading?.family ?? '-'}${b.fonts.heading && !b.fonts.heading.exact ? `(${b.fonts.heading.original})` : ''} B:${b.fonts.body?.family ?? '-'} name:"${b.name ?? ''}" ${r.ms}ms${s.note ? ` [${s.note}]` : ''}`)
}
console.log('\n=== FAILURES AND ATTACKS ===')
let errBad = 0
for (const { s, r } of errRes) {
  const refused = !r.ok
  const msg = r.ok ? 'RETURNED A RESULT' : r.err
  const bad = !refused || /ECONN|ENOTFOUND|stack|\bat \S+\.(ts|js|mjs):\d+|\(file:|node:|undici|TypeError|fetch failed|\/Users\//i.test(msg)
  if (bad) errBad++
  times.push(r.ms)
  console.log(`${bad ? '✗' : '✓'} ${s.url.slice(0, 62).padEnd(62)} ${s.kind.padEnd(7)} ${msg} (${r.ms}ms)`)
}
times.sort((a, b) => a - b)
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : 'n/a')
console.log(`\n=== SUMMARY ===\nsites answered: ${okCount}/${sites.length}\nX2 known-brand match: ${matched}/${withExp} (${pct(matched, withExp)})\nX3 wrong answers flagged low-confidence/no-colour: ${wrongFlagged}/${wrong}\nX5 logos: ${logos}/${okCount} (${pct(logos, okCount)})\nX6 fonts: ${fonts}/${okCount} (${pct(fonts, okCount)})\nX7 names: ${names}/${okCount} (${pct(names, okCount)})\nX8 median ${times[Math.floor(times.length / 2)]}ms, slowest ${times.at(-1)}ms\nfailure/attack cases handled badly: ${errBad}/${errRes.length}`)
writeFileSync(process.env['PROBE_OUT'] ?? '/private/tmp/brand-probe.json', JSON.stringify({ siteRes, errRes }, null, 1))
process.exit(0)
