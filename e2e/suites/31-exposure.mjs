import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { API, EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { api, newDeck, person, tsx } from '../kits-lib.mjs'

/**
 * D1–D5 of docs/FULL_SECURITY_LOAD_CTA_TEST_PLAN.md — nothing sensitive in the network tab or in the shipped code.
 * Run against the PRODUCTION builds (web `next start`, editor `vite preview`, API `dist`), not the dev servers.
 * It never prints a secret: findings name the file / URL and the kind of secret only.
 */
const root = new URL('../..', import.meta.url).pathname

/** every secret VALUE configured for the server (names that look like credentials), read from the .env files, never printed */
function secretValues() {
  const out = []
  for (const f of ['services/api/.env', '.env', 'apps/web/.env.local', 'apps/editor/.env.local']) {
    const p = join(root, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (!m) continue
      const [, name, raw] = m
      const value = raw.replace(/^["']|["']$/g, '').trim()
      if (value.length < 8) continue
      if (!/SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE|CREDENTIAL|DATABASE_URL|WEBHOOK|ACCESS_KEY|_KEY$/.test(name)) continue
      if (/^NEXT_PUBLIC_|^VITE_/.test(name)) continue
      if (/^(true|false|http|https):?\/*$/i.test(value)) continue
      out.push({ name, value })
    }
  }
  return out
}
const SECRETS = secretValues()
/** shapes of credentials from the providers we use (a hit is a leak whatever the .env says) */
const PATTERNS = [
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/], ['OpenAI/OpenRouter-style key', /sk-(or-)?[A-Za-z0-9_-]{24,}/], ['Razorpay LIVE key', /rzp_live_[A-Za-z0-9]{10,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/], ['database URL', /postgres(ql)?:\/\/[^\s"'<>]+:[^\s"'<>@]+@/], ['AWS access key', /AKIA[0-9A-Z]{16}/], ['Slack token', /xox[abp]-[0-9A-Za-z-]{10,}/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{30,}/], ['Resend key', /re_[A-Za-z0-9]{20,}/], ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
]
const scanText = (label, text) => {
  const hits = []
  for (const s of SECRETS) if (text.includes(s.value)) hits.push(`${label}: contains the value of ${s.name}`)
  for (const [n, re] of PATTERNS) if (re.test(text)) hits.push(`${label}: looks like a ${n}`)
  return hits
}
const walk = (dir, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); statSync(p).isDirectory() ? walk(p, out) : out.push(p) } return out }

export default async function () {
  const s = suite('31-exposure')
  console.log(`  (checking ${SECRETS.length} configured secret values + ${PATTERNS.length} key shapes; nothing is printed)`)

  // ─── D2: the shipped code ──────────────────────────────────────────────────
  await s.check('D2: the editor bundle (dist) contains no secret values, key shapes or source maps', null, async () => {
    const files = walk(join(root, 'apps/editor/dist'))
    const maps = files.filter((f) => f.endsWith('.map'))
    expect(maps.length === 0, `${maps.length} source map(s) are shipped (e.g. ${maps[0]?.split('/dist/')[1]}) — the original source would be downloadable`)
    const hits = files.filter((f) => /\.(js|css|html|json|svg|txt|webmanifest)$/.test(f)).flatMap((f) => scanText(f.split('/dist/')[1], readFileSync(f, 'utf8')))
    expect(hits.length === 0, hits.slice(0, 5).join(' | '))
  })
  await s.check('D2: the website browser bundle (.next/static) and public files contain no secrets or source maps', null, async () => {
    const files = [...walk(join(root, 'apps/web/.next/static')), ...walk(join(root, 'apps/web/public'))]
    const maps = files.filter((f) => f.endsWith('.map'))
    expect(maps.length === 0, `${maps.length} source map(s) shipped (e.g. ${maps[0]?.split('/.next/')[1]})`)
    const hits = files.filter((f) => /\.(js|css|html|json|txt|svg|webmanifest|xml)$/.test(f)).flatMap((f) => scanText(f.replace(root, ''), readFileSync(f, 'utf8')))
    expect(hits.length === 0, hits.slice(0, 5).join(' | '))
  })
  await s.check('D2: server-rendered website pages (HTML as served) contain no secrets', null, async () => {
    const hits = []
    for (const path of ['/', '/pricing', '/templates', '/login', '/signup', '/free-tools', '/templates/pitch-launchpad']) {
      const r = await fetch(WEB + path); hits.push(...scanText(`${WEB}${path}`, await r.text()))
    }
    expect(hits.length === 0, hits.join(' | '))
  })

  // ─── D1: a full browsing session ───────────────────────────────────────────
  const b = await launch()
  const A = await person(b, 'expo', 'pro')
  const traffic = []
  const record = (page) => {
    page.on('response', async (r) => {
      const req = r.request()
      const ct = r.headers()['content-type'] ?? ''
      let body = ''
      if (/json|text|javascript|html|xml/.test(ct) && r.status() < 600) { try { body = (await r.text()).slice(0, 400_000) } catch { /* redirect / streamed */ } }
      traffic.push({ method: req.method(), url: req.url(), status: r.status(), reqBody: req.postData() ?? '', headers: r.headers(), reqHeaders: req.headers(), body, ct })
    })
  }
  const p = A.p
  record(p)
  await p.goto(WEB + '/', { waitUntil: 'networkidle' })
  await p.goto(WEB + '/pricing', { waitUntil: 'networkidle' })
  await p.goto(WEB + '/templates', { waitUntil: 'networkidle' })
  await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
  await p.goto(EDITOR + '/billing', { waitUntil: 'networkidle' }).catch(() => {})
  await p.goto(EDITOR + '/create', { waitUntil: 'networkidle' }).catch(() => {})
  const deck = await newDeck(A, 'Exposure deck')
  await api.post(A, `/presentations/${deck}/share`, {})
  await api.post(A, '/brand/kits', { name: 'Expo kit', primary: '#112233', accent: '#445566' })
  await p.goto(`${EDITOR}/edit/${deck}`, { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: /Share/ }).first().click().catch(() => {})
  await p.waitForTimeout(800)
  await p.keyboard.press('Escape')
  await p.getByRole('button', { name: /Comments/ }).first().click().catch(() => {})
  await p.waitForTimeout(800)
  // the admin screens as a normal user (must be refused) and as the owner (must work but only for the owner)
  await p.goto(EDITOR + '/admin', { waitUntil: 'networkidle' }).catch(() => {})
  const email = A.email
  const cookieHeader = (await A.ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
  await s.check(`D1: ${'(journey recorded)'} — landing, pricing, templates, editor home, billing, create, deck, share, comments, admin attempt`, null, async () => {
    expect(traffic.length > 40, `only ${traffic.length} responses recorded`)
  })
  await s.check('D1: no secret value or key shape appears in ANY request or response of the journey', null, async () => {
    const hits = traffic.flatMap((t) => [...scanText(`${t.method} ${t.url.slice(0, 100)} (response)`, t.body), ...scanText(`${t.method} ${t.url.slice(0, 100)} (request)`, t.reqBody + JSON.stringify(t.reqHeaders)), ...scanText(`${t.url.slice(0, 100)} (url)`, t.url)])
    expect(hits.length === 0, hits.slice(0, 6).join(' | '))
  })
  await s.check('D1: no stack trace, file path, SQL or internal host name in any response', null, async () => {
    const bad = []
    for (const t of traffic) {
      if (/\.(js|css|map)(\?|$)/.test(t.url) || !t.body) continue
      if (/\bat [\w.<>$ ]+ \((\/|file:|node:)/.test(t.body) || /\/Users\/|\/home\/\w+\/|node_modules\/|C:\\\\/.test(t.body) || /\b(select\s+[\w*,."\s]{1,80}\s+from\s+"?\w+|insert\s+into\s+"?\w+|delete\s+from\s+"?\w+)/i.test(t.body) || /ECONN(REFUSED|RESET)|ENOTFOUND|relation "[^"]*" does not exist|syntax error at or near|DrizzleQueryError|PostgresError/i.test(t.body)) bad.push(`${t.method} ${t.url.slice(0, 90)} → ${t.status}`)
    }
    expect(bad.length === 0, bad.slice(0, 6).join(' | '))
  })
  await s.check('D1: tokens never travel in a URL (query strings are free of token / key / password / session values)', null, async () => {
    const bad = traffic.filter((t) => { const q = new URL(t.url).search; return /[?&](token|key|secret|password|session|auth|apikey|api_key|access_token)=/i.test(q) }).map((t) => t.url.slice(0, 120))
    expect(bad.length === 0, [...new Set(bad)].slice(0, 5).join(' | '))
  })
  await s.check('D1: the session cookie is never readable by page scripts and never echoed in a response body', null, async () => {
    const token = (await A.ctx.cookies()).find((c) => /session_token/.test(c.name))
    expect(!!token, 'no session cookie found')
    expect(token.httpOnly, 'session cookie is not HttpOnly')
    const visible = await p.evaluate(() => document.cookie)
    expect(!/session_token/.test(visible), 'the session cookie is visible to page scripts')
    const raw = decodeURIComponent(token.value).split('.')[0]
    const echoed = traffic.filter((t) => t.body.includes(raw) && !/\/api\/auth\/(sign-up|sign-in)/.test(t.url)).map((t) => t.url.slice(0, 100))
    expect(echoed.length === 0, `session token appears in: ${echoed.slice(0, 3).join(' | ')}`)
  })
  await s.check('D1: no response carries another person\'s e-mail address (only this account\'s own)', null, async () => {
    const mine = email.toLowerCase()
    const bad = []
    for (const t of traffic) {
      if (!t.body || /\.(js|css)(\?|$)/.test(t.url) || t.url.startsWith(WEB) && /text\/html/.test(t.ct)) continue
      for (const m of t.body.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) { const e = m[0].toLowerCase(); if (e !== mine && !/@(example\.(com|org)|prompttoppt\.|sentry|w3\.org|schema\.org)/.test(e) && !/\.(png|jpg|svg|webp|woff2?)$/.test(e)) bad.push(`${t.url.slice(0, 80)}: ${e}`) }
    }
    expect(bad.length === 0, [...new Set(bad)].slice(0, 5).join(' | '))
  })
  await s.check('D1: the API calls the browser makes all go to our own API (no third-party host receives user data)', null, async () => {
    const hosts = new Set(traffic.map((t) => new URL(t.url).host))
    const allowed = [new URL(WEB).host, new URL(EDITOR).host, new URL(API).host, 'fonts.googleapis.com', 'fonts.gstatic.com', 'images.unsplash.com']
    const odd = [...hosts].filter((h) => !allowed.includes(h) && !/^data:/.test(h))
    const withBody = traffic.filter((t) => odd.includes(new URL(t.url).host) && t.reqBody).map((t) => t.url.slice(0, 80))
    expect(withBody.length === 0, `data sent to: ${withBody.join(' | ')}`)
    console.log(`      (hosts contacted: ${[...hosts].join(', ')})`)
  })

  // ─── D3: response shapes ───────────────────────────────────────────────────
  const DENY = /(^|_)(costUsd|costMicro|rawCost|providerCost|margin|providerPriceId|providerRef|providerSubscriptionId|passwordHash|password|hash|salt|secret|apiKey|api_key|webhookSecret|idempotencyKey|stripe|openrouter|vertex|gemini|ledgerId)$/i
  const keysDeep = (o, path = '', out = []) => { if (Array.isArray(o)) o.slice(0, 5).forEach((x, i) => keysDeep(x, `${path}[]`, out)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { out.push(`${path}.${k}`); keysDeep(v, `${path}.${k}`, out) } return out }
  await s.check('D3: what a signed-in customer receives from /me, entitlements, plans, models, billing and decks has no costs, margins, provider ids or credentials', null, async () => {
    const bad = []
    for (const [path] of [['/me'], ['/me/entitlements'], ['/plans'], ['/models'], ['/billing/subscription'], ['/presentations'], [`/presentations/${deck}`], ['/brand/kits'], ['/projects'], ['/sources']]) {
      const r = await api.get(A, path)
      if (r.status >= 500) { bad.push(`${path} → ${r.status}`); continue }
      for (const k of keysDeep(r.body)) { const last = k.split('.').pop(); if (DENY.test(last)) bad.push(`${path}: ${k}`) }
      if (/"(password|passwordHash|accessToken|refreshToken|idToken)"/.test(JSON.stringify(r.body))) bad.push(`${path}: credential field`)
    }
    expect(bad.length === 0, bad.slice(0, 8).join(' | '))
  })
  await s.check('D3: the sign-in response and /me give this account only: no password hash, no other accounts, no internal columns', null, async () => {
    const me = await api.get(A, '/me')
    const keys = Object.keys(me.data ?? {})
    console.log(`      (/me fields: ${keys.join(', ')})`)
    expect(!keys.some((k) => /password|hash|canonical|stripe|razorpay/i.test(k)), `fields: ${keys.join(', ')}`)
    const list = await A.ctx.request.get(`${API}/api/auth/list-sessions`)
    const body = await list.text()
    expect(!/password/i.test(body), 'password mentioned in the session list')
  })
  await s.check('D3: the admin API refuses a normal customer on every section (and its error says nothing about the data)', null, async () => {
    const bad = []
    for (const path of ['/admin/overview', '/admin/users', '/admin/margin', '/admin/cloud', '/admin/audit', '/admin/models', '/admin/flags', '/admin/images', '/admin/exports']) {
      const r = await A.ctx.request.get(`${API}/api/v1${path}`)
      const t = await r.text()
      if (![401, 403, 404].includes(r.status())) bad.push(`${path} → ${r.status()}`)
      else if (t.length > 300 || /stack|select |table/i.test(t)) bad.push(`${path}: verbose refusal`)
    }
    expect(bad.length === 0, bad.join(' | '))
  })

  // ─── D4: headers ───────────────────────────────────────────────────────────
  await s.check('D4: the website, the editor and the API send the security headers (CSP, frame-ancestors, nosniff, referrer, permissions) and no X-Powered-By / server banner', null, async () => {
    const bad = []
    for (const [name, url] of [['website', WEB + '/'], ['website pricing', WEB + '/pricing'], ['editor', EDITOR + '/'], ['API', API + '/health'], ['API error', API + '/api/v1/nope']]) {
      const h = (await fetch(url)).headers
      if (h.get('x-content-type-options') !== 'nosniff') bad.push(`${name}: nosniff`)
      if (h.get('x-powered-by')) bad.push(`${name}: X-Powered-By ${h.get('x-powered-by')}`)
      if (/^(nginx|apache|express|hono)/i.test(h.get('server') ?? '')) bad.push(`${name}: Server ${h.get('server')}`)
      if (!h.get('referrer-policy')) bad.push(`${name}: Referrer-Policy`)
      if (name !== 'API' && name !== 'API error') {
        const csp = h.get('content-security-policy') ?? ''
        if (!/frame-ancestors 'none'/.test(csp)) bad.push(`${name}: frame-ancestors`)
        if (!/default-src/.test(csp)) bad.push(`${name}: default-src`)
        if (/script-src[^;]*'unsafe-eval'/.test(csp)) bad.push(`${name}: script-src allows unsafe-eval`)
        if (!h.get('permissions-policy')) bad.push(`${name}: Permissions-Policy`)
      }
    }
    expect(bad.length === 0, bad.join(' | '))
  })
  await s.check('D4: private API answers are never cached (Cache-Control: no-store) and public ones say so deliberately', null, async () => {
    const bad = []
    for (const path of ['/me', '/me/entitlements', '/presentations', '/billing/subscription', '/brand/kits']) {
      const r = await A.ctx.request.get(`${API}/api/v1${path}`)
      const cc = r.headers()['cache-control'] ?? ''
      if (!/no-store|private/.test(cc)) bad.push(`${path}: Cache-Control "${cc}"`)
    }
    expect(bad.length === 0, bad.join(' | '))
  })
  await s.check('D4: CORS: only our own sites get credentialed access; an evil origin gets none', null, async () => {
    const evil = await fetch(API + '/api/v1/me', { headers: { Origin: 'https://evil.example', Cookie: cookieHeader } })
    expect(!evil.headers.get('access-control-allow-origin') || evil.headers.get('access-control-allow-origin') !== 'https://evil.example', 'evil origin allowed')
    const wild = evil.headers.get('access-control-allow-origin')
    expect(wild !== '*', 'wildcard CORS')
    const ours = await fetch(API + '/api/v1/me', { headers: { Origin: EDITOR, Cookie: cookieHeader } })
    expect(ours.headers.get('access-control-allow-origin') === EDITOR && ours.headers.get('access-control-allow-credentials') === 'true', 'our own editor is not allowed')
  })

  // ─── D5: discovery ─────────────────────────────────────────────────────────
  await s.check('D5: common discovery / leak paths return nothing useful on the website, editor and API', null, async () => {
    const paths = ['/.env', '/.env.local', '/.git/config', '/.git/HEAD', '/package.json', '/pnpm-lock.yaml', '/tsconfig.json', '/node_modules/', '/src/main.tsx', '/vite.config.ts', '/.DS_Store', '/server.js', '/docs', '/openapi.json', '/swagger.json', '/swagger', '/api-docs', '/metrics', '/actuator/health', '/debug', '/graphql', '/phpinfo.php', '/wp-admin/', '/.well-known/security.txt.bak', '/assets/', '/_next/static/', '/_next/data/', '/api/v1/', '/api/v1/dev', '/api/v1/debug', '/api/v1/internal', '/api/auth/', '/api/auth/openapi', '/api/auth/reference']
    const bad = []
    for (const base of [WEB, EDITOR, API]) {
      for (const path of paths) {
        const r = await fetch(base + path, { redirect: 'manual' })
        const t = await r.text()
        const leak = scanText(base + path, t)
        const html = /<!doctype html|<html/i.test(t)
        // the editor is a single-page app: unknown paths legitimately return its empty shell (index.html) — that is fine as long as it is the shell
        const shell = base === EDITOR && html && r.status === 200
        if (leak.length) bad.push(`${base}${path}: ${leak[0]}`)
        else if (!shell && r.status === 200 && t.length > 0 && !(base === WEB && path === '/api/v1/')) {
          if (/^(DATABASE|NEXT_PUBLIC|AUTH_SECRET|\[core\]|"name":|openapi|swagger)/i.test(t.trimStart()) || /"openapi"|swagger-ui|^\s*[A-Z_]{3,}=/m.test(t.slice(0, 2000))) bad.push(`${base}${path}: ${r.status} looks like internal content`)
        }
      }
    }
    expect(bad.length === 0, bad.slice(0, 6).join(' | '))
  })
  await s.check('D5: error pages (404, malformed URLs, 500-style probes) are plain: no stack, framework banner, paths or SQL', null, async () => {
    const bad = []
    const probes = [WEB + '/this-page-does-not-exist', WEB + '/templates/%00', WEB + '/%ff%fe', WEB + '/templates/' + 'a'.repeat(5000), EDITOR + '/edit/%00', API + '/api/v1/presentations/%00', API + '/api/v1/presentations/' + "' OR 1=1 --", API + '/api/v1/%', API + '/api/auth/%00', API + '/' + 'a'.repeat(9000)]
    for (const u of probes) {
      let r; try { r = await fetch(u, { redirect: 'manual' }) } catch { continue }
      const t = await r.text()
      if (r.status >= 500) bad.push(`${u.slice(0, 70)} → ${r.status}`)
      if (/\bat [\w.<>$ ]+ \((\/|file:|node:)|\/Users\/|\/node_modules\/|ECONN(REFUSED|RESET)|syntax error at or near|\bselect\s+[\w*,."\s]{1,80}\s+from\s+"?\w+|DrizzleQueryError|"stack"\s*:/i.test(t)) bad.push(`${u.slice(0, 70)}: verbose body`)
    }
    expect(bad.length === 0, bad.join(' | '))
  })
  await s.check('D5: the API root and unknown routes do not list routes or versions', null, async () => {
    for (const path of ['/', '/api', '/api/v1', '/api/v1/unknown']) {
      const r = await fetch(API + path); const t = await r.text()
      expect(!/"routes"|presentations|billing|admin/i.test(t) || r.status === 401, `${path}: ${t.slice(0, 120)}`)
    }
  })

  await b.close()
  return s.done()
}
