import { Hono, type MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { auth } from './auth.ts'
import { env } from './env.ts'
import { BillingError, ConflictError, GateError } from './billing/errors.ts'
import { billing } from './routes/billing.ts'
import { images } from './routes/images.ts'
import { brand } from './routes/brand.ts'
import { comments } from './routes/comments.ts'
import { publicAnalytics, shareAnalytics } from './routes/share-analytics.ts'
import { db } from './db/index.ts'
import { generatedAsset } from './db/schema.ts'
import { getStorage } from './storage/index.ts'
import { and, eq, isNull } from 'drizzle-orm'
import { exportsRoute } from './routes/exports.ts'
import { models } from './routes/models.ts'
import { flagsPublic } from './routes/flags.ts'
import { admin } from './routes/admin.ts'
import { drafts } from './routes/drafts.ts'
import { generation } from './routes/generation.ts'
import { presentations } from './routes/presentations.ts'
import { projects } from './routes/projects.ts'
import { sources } from './routes/sources.ts'
import { invites, publicShare, shared, sharing } from './routes/sharing.ts'
import { live } from './live/routes.ts'
import { loadSession, requireAuth, type AppEnv } from './middleware/session.ts'
import { clientIp, rateLimit } from './middleware/rate-limit.ts'
import { freeTools } from './routes/free-tools.ts'
import { originCheck } from './middleware/origin-check.ts'
import { authGuard } from './security/auth-guard.ts'
import { bodyLimit } from 'hono/body-limit'

export const app = new Hono<AppEnv>()

app.use('*', logger())

/**
 * Generated pictures, served by capability URL (the id is 192 random bits — unguessable, so slides render for share-link
 * viewers and exports without a login). Registered BEFORE secureHeaders/CORS on purpose: it needs a cross-origin
 * resource policy (editor, website and share viewer all embed it), and nothing else here should. Content is
 * allow-listed image bytes served with nosniff + a sandbox CSP so even a hostile file cannot run script.
 */
app.get('/api/v1/assets/:id', async (c) => {
  const id = c.req.param('id')
  if (!/^[A-Za-z0-9_-]{32}$/.test(id)) return c.notFound()
  const [row] = await db.select().from(generatedAsset).where(and(eq(generatedAsset.id, id), eq(generatedAsset.status, 'ready'), isNull(generatedAsset.deletedAt)))
  if (!row) return c.notFound()
  const bytes = await (await getStorage()).get(row.storageKey)
  if (!bytes) return c.notFound()
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': row.mime, 'Content-Length': String(bytes.length), 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'cross-origin', 'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
})
app.use('*', secureHeaders({ crossOriginResourcePolicy: 'same-site' }))
app.use(
  '*',
  cors({
    origin: [env.WEB_URL, env.EDITOR_URL],
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-Share-Access', 'X-Session-User'],
    exposeHeaders: ['Content-Disposition'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
)

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// Better Auth owns /api/auth/* (sign-up, sign-in, sign-out, session, OAuth callbacks).
// Auth surface: tiny bodies, no CSRF from other origins, a generous bucket for session reads (the editor polls them), a tighter one for everything
// else, and the database-backed sign-up / sign-in / reset limits in `authGuard`.
const authBucket = rateLimit({ windowMs: 60_000, max: 60 })
const sessionBucket = rateLimit({ windowMs: 60_000, max: 300 })
app.use('/api/auth/*', bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ code: 'PAYLOAD_TOO_LARGE', message: 'Request too large' }, 413) }))
/**
 * The database cannot store a NUL character in text (it answers with an error that used to surface as a 500, also on sign-in and sign-up), and no real
 * input contains one: JSON bodies carrying one — raw or as the escape \\u0000 — are refused up front.
 */
const noNul: MiddlewareHandler = async (c, next) => {
  const ct = c.req.header('content-type') ?? ''
  // (webhooks are skipped: their signature is checked over the raw bytes, and their route reads the stream itself)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && /json|text\/plain/i.test(ct) && !c.req.path.startsWith('/api/v1/webhooks/')) {
    const text = await c.req.text().catch(() => '') // Hono caches the body, so the route's own parser still reads it
    if (text.includes('\u0000') || /\\u0000/i.test(text)) return c.json({ success: false, error: { code: 'INVALID_REQUEST', message: 'The request contains characters that are not allowed.' } }, 400)
    // whatever reads the raw request next (the auth library, a route's own size limit) needs an unread stream, so hand it a fresh request carrying the text we already read
    c.req.raw = new Request(c.req.raw.url, { method: c.req.method, headers: c.req.raw.headers, body: text })
  }
  return next()
}
app.use('/api/auth/*', noNul)
app.use('/api/auth/*', originCheck)
app.use('/api/auth/*', (c, next) => (new URL(c.req.url).pathname === '/api/auth/get-session' ? sessionBucket(c, next) : authBucket(c, next)))
app.use('/api/auth/*', authGuard)
/**
 * The session token lives in the HttpOnly cookie, where page scripts cannot read it. The auth library also repeats it in its JSON answers (sign-in, sign-up,
 * get-session, and EVERY token in list-sessions), which would let a script injected into a page copy it out and use it from anywhere: the answers are cleaned.
 * Auth answers are never cached.
 */
const withoutTokens = (v: unknown, depth = 0): unknown => {
  if (depth > 5 || v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map((x) => withoutTokens(x, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(v)) if (k !== 'token') out[k] = withoutTokens(val, depth + 1)
  // the web form needs to know whether sign-up opened a session (no session = "confirm your email first"), never the token itself
  if (depth === 0 && typeof (v as { token?: unknown }).token === 'string') out['hasSession'] = true
  return out
}
app.on(['GET', 'POST'], '/api/auth/*', async (c) => {
  const res = await auth.handler(c.req.raw)
  const headers = new Headers(res.headers)
  headers.set('Cache-Control', 'no-store')
  if (!/json/i.test(headers.get('content-type') ?? '')) return new Response(res.body, { status: res.status, headers })
  const text = await res.text()
  headers.delete('content-length')
  try { return new Response(JSON.stringify(withoutTokens(JSON.parse(text))), { status: res.status, headers }) } catch { return new Response(text, { status: res.status, headers }) }
})

// Every JSON body is small except these (they carry their own, larger, explicit limits): a global ceiling stops multi-megabyte junk before any parsing.
const OWN_BODY_LIMIT = /^\/api\/v1\/(presentations\/[^/]+|sources\/(pdf|file)|drafts\/attachments|brand\/kits\/[^/]+\/(logo|images)|webhooks\/.*)$/
const defaultBody = bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ success: false, error: { code: 'TOO_LARGE', message: 'Request is too large' } }, 413) })
app.use('/api/v1/*', (c, next) => (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) || OWN_BODY_LIMIT.test(new URL(c.req.url).pathname) ? next() : defaultBody(c, next)))
app.use('/api/v1/*', originCheck)
// private answers are never stored by a browser, proxy or CDN unless a route says otherwise (public catalogue and shared-asset routes set their own Cache-Control)
app.use('/api/v1/*', async (c, next) => { await next(); if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'private, no-store') })
app.use('/api/v1/*', noNul)
app.use('/api/v1/*', loadSession)
/** Defence in depth: whatever a route's own limit says, one signed-in person cannot make more than this many changing requests a minute (a script hammering any route is slowed, not just the costly ones). */
const userWrites = rateLimit({ windowMs: 60_000, max: 600, message: 'You are doing that very quickly. Please wait a moment and try again.', key: (c) => `writes:${(c.get('session') as { user: { id: string } } | null)?.user.id ?? clientIp(c)}` })
app.use('/api/v1/*', (c, next) => (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) || c.req.path.startsWith('/api/v1/webhooks/') || c.req.path.startsWith('/api/v1/public/') ? next() : userWrites(c, next)))
app.get('/api/v1', (c) => c.json({ version: '1.0.0', name: 'promptToPpt API' }))
app.get('/api/v1/me', requireAuth, (c) => {
  const { user } = c.get('session')!
  return c.json({ success: true, data: { id: user.id, email: user.email, name: user.name, image: user.image ?? null, role: (user as { role?: string }).role ?? 'user' } })
})
app.route('/api/v1/drafts', drafts)
app.route('/api/v1/free-tools', freeTools)
app.route('/api/v1/generation', generation)
app.route('/api/v1/presentations', sharing)
app.route('/api/v1/presentations', live)
app.route('/api/v1/presentations', comments)
app.route('/api/v1/presentations', shareAnalytics)
app.route('/api/v1/presentations', presentations)
app.route('/api/v1/invites', invites)
app.route('/api/v1/shared', shared)
app.route('/api/v1/public', publicShare)
app.route('/api/v1/public', publicAnalytics)
app.route('/api/v1/projects', projects)
app.route('/api/v1/sources', sources)
app.route('/api/v1/brand', brand)
app.route('/api/v1', billing)
app.route('/api/v1', images)
app.route('/api/v1/exports', exportsRoute)
app.route('/api/v1/models', models)
app.route('/api/v1/flags', flagsPublic)
app.route('/api/v1/admin', admin)

app.onError((err, c) => {
  if (err instanceof ConflictError) return c.json({ success: false, error: { code: 'CONFLICT', message: err.message, details: err.details } }, 409)
  if (err instanceof BillingError) return c.json({ success: false, error: { code: err.code, message: err.message } }, err.status)
  if (err instanceof GateError) return c.json({ success: false, error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } }, err.status)
  // errors the framework raises about the REQUEST itself (unreadable JSON, bad headers…) are the caller's mistake: they get their own 4xx, not a 500 and a stack trace
  if (err instanceof HTTPException && err.status >= 400 && err.status < 500) return c.json({ success: false, error: { code: err.status === 400 ? 'INVALID_REQUEST' : 'REQUEST_REFUSED', message: err.status === 400 ? 'The request could not be read. Check that it is valid and complete.' : 'The request was refused.' } }, err.status)
  console.error(err)
  return c.json({ success: false, error: { code: 'INTERNAL', message: 'Something went wrong' } }, 500)
})
app.notFound((c) => c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, 404))
