import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { prettyJSON } from 'hono/pretty-json'

const app = new Hono()

// ─── Middleware ───────────────────────────────────────────────────────────
app.use('*', logger())
app.use('*', cors({
  origin: [
    'http://localhost:3000',  // Next.js web
    'http://localhost:3001',  // React editor
    process.env['ALLOWED_ORIGIN'] ?? '',
  ].filter(Boolean),
  credentials: true,
}))
app.use('*', prettyJSON())

// ─── Health Check ─────────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// ─── API Routes (stubs — will be filled in Phase 1+) ─────────────────────
app.get('/api/v1', (c) => c.json({ version: '1.0.0', name: 'promptToPpt API' }))

// TODO Phase 1: Auth routes
// TODO Phase 1: Presentation CRUD routes
// TODO Phase 2: Generation job routes
// TODO Phase 2: Source ingestion routes
// TODO Phase 3: Slide + element routes
// TODO Phase 3: AI edit routes
// TODO Phase 4: Export routes
// TODO Phase 4: Share link routes
// TODO Phase 5: Billing + webhook routes
// TODO Phase 6: Owner analytics routes

const port = parseInt(process.env['PORT'] ?? '4000')

export default {
  port,
  fetch: app.fetch,
}
