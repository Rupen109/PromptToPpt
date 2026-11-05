/**
 * Deck-generation load test with a STAND-IN model (costs nothing): proves the speed targets of docs/DECK_GENERATION_SCALE_ARCHITECTURE.md section 4.
 *   DECKS=1000 WORKERS=8 SLOTS=200 CAPACITY=2000 tsx scripts/load-decks.ts
 *
 * It runs on its own throw-away database (prompttoppt_load, dropped and rebuilt every run), never the dev data. Real accounts are created through the app's
 * own sign-up, every deck is started through the real POST /generation/jobs (gates, credits, the deck row, the lane), and the real worker builds it.
 * The model is the mock with the measured answer times (MOCK_AI_LATENCY=realistic), a capacity above which it answers 429 (CAPACITY) and random refusals (REFUSE).
 * What is measured, per plan: queue wait, deck on screen, titled outline, first real slide, whole deck (p50 / p95 / max) and how many decks failed.
 *
 * One database connection serves many slots (a slot mostly waits for the model), but Postgres has a fixed number of connections: the workers share what is left
 *   DECKS    decks started (default 1000)            ARRIVE  seconds over which they arrive (0 = all at once, the worst case)
 *   MIX      "starter,pro,gold" shares (default 40,40,20)
 *   WORKERS  worker PROCESSES (each its own CPU), SLOTS slots each (default 4 x 24)
 *   CAPACITY calls the stand-in model serves at once IN TOTAL before it answers 429 (default unlimited; split evenly between the worker processes)       REFUSE  share of calls refused at random (default 0)
 *   SCALE    multiplies every model answer time (0.1 = ten times faster, to check the plumbing quickly)
 */
import { randomUUID } from 'node:crypto'
import pg from 'pg'

const num = (k: string, d: number) => Number(process.env[k] ?? d)
const DECKS = num('DECKS', 1000), ARRIVE = num('ARRIVE', 0), WORKERS = num('WORKERS', 4), SLOTS = num('SLOTS', 24)
const MIX = (process.env['MIX'] ?? '40,40,20').split(',').map(Number) as [number, number, number]
const SLIDES = num('SLIDES', 10)
/** REAL=ollama: the real model through a local Ollama (OLLAMA_BASE_URL, OLLAMA_MODEL_OVERRIDE) instead of the stand-in: a handful of decks to check the whole product and measure real answer times */
const REAL = process.env['REAL'] === 'ollama'

// a throw-away database, and the stand-in model, BEFORE any app code reads its settings
const base = new URL(process.env['DATABASE_URL'] ?? 'postgresql://prompttoppt:prompttoppt@localhost:5432/prompttoppt_dev')
if (!/localhost|127\.0\.0\.1/.test(base.hostname)) { console.error('Refusing: this test only runs against a local database'); process.exit(1) }
const NAME = 'prompttoppt_load'
let maxConnections = 100
{
  const admin = new pg.Client({ connectionString: base.toString() }); await admin.connect()
  await admin.query(`drop database if exists ${NAME} with (force)`); await admin.query(`create database ${NAME}`)
  maxConnections = Number((await admin.query('show max_connections')).rows[0].max_connections)
  await admin.end()
}
base.pathname = `/${NAME}`
Object.assign(process.env, {
  DATABASE_URL: base.toString(), DB_POOL_MAX: '15', AI_PROVIDER: REAL ? 'ollama' : 'mock', MOCK_AI_LATENCY: REAL ? 'off' : 'realistic', MOCK_AI_CAPACITY: String(num('CAPACITY', 100000)), MOCK_AI_REFUSE_RATE: String(num('REFUSE', 0)),
  REQUIRE_EMAIL_VERIFICATION: 'false', APP_ENV: 'development', NODE_ENV: 'development', GENERATION_DAILY_LIMIT: '1000',
  AI_BUDGET_USD_HOUR: '1000000', AI_BUDGET_USD_DAY: '1000000', AI_USER_USD_DAY: '1000000',
  AUTH_SIGNUPS_PER_IP_HOUR: '1000000', AUTH_SIGNUPS_PER_IP_DAY: '1000000', PEXELS_API_KEY: '', UNSPLASH_ACCESS_KEY: '', UNPLASH_ACCESS_KEY: '',
  ...(process.env['SCALE'] ? { MOCK_AI_SCALE: process.env['SCALE'] } : {}),
})
const { isProd } = await import('../src/env.ts')
if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const { migrate } = await import('drizzle-orm/node-postgres/migrator')
const { drizzle } = await import('drizzle-orm/node-postgres')
{ const p = new pg.Pool({ connectionString: base.toString(), max: 1 }); await migrate(drizzle(p), { migrationsFolder: new URL('../drizzle', import.meta.url).pathname }); await p.end() }

const { app } = await import('../src/app.ts')
const { auth } = await import('../src/auth.ts')
const { db, pool } = await import('../src/db/index.ts')
const { generationJob, subscription, user } = await import('../src/db/schema.ts')
const { seedBilling } = await import('../src/billing/seed.ts')
const { spawn } = await import('node:child_process')
const { eq } = await import('drizzle-orm')
await seedBilling()

const pct = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((a.length * p) / 100))]! : 0)
const plans = ['starter', 'pro', 'gold'] as const
const planOf = (i: number): (typeof plans)[number] => { const t = MIX[0] + MIX[1] + MIX[2]; const r = (((i * 37) % 100) / 100) * t; return r < MIX[0] ? 'starter' : r < MIX[0] + MIX[1] ? 'pro' : 'gold' }

console.log(`creating ${DECKS} accounts…`)
const accounts: { cookie: string; plan: (typeof plans)[number] }[] = []
{
  let next = 0
  await Promise.all(Array.from({ length: 16 }, async () => {
    while (next < DECKS) {
      const i = next++, plan = planOf(i)
      const res = await auth.api.signUpEmail({ body: { email: `load-${i}-${randomUUID().slice(0, 6)}@example.com`, password: 'Passw0rd!load-test', name: `Load ${i}` }, asResponse: true })
      const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
      const body = (await res.json()) as { user?: { id: string } }
      if (!cookie || !body.user) { console.error('sign-up failed', res.status); process.exit(1) }
      await db.update(user).set({ emailVerified: true }).where(eq(user.id, body.user.id))
      if (plan !== 'starter') { const now = new Date(); await db.insert(subscription).values({ id: randomUUID(), userId: body.user.id, planId: plan, status: 'active', currency: 'INR', interval: 'month', currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86400_000), providerRef: `load-${i}` }) }
      accounts[i] = { cookie, plan }
    }
  }))
}

// the workers are separate processes, like the production service: each has its own CPU and its own slots
const workers = Array.from({ length: WORKERS }, () => spawn(process.execPath, ['--import', 'tsx', new URL('../src/worker-main.ts', import.meta.url).pathname], { env: { ...process.env, MOCK_AI_CAPACITY: String(Math.max(1, Math.ceil(num('CAPACITY', 100000) / WORKERS))) /* the model's capacity is shared: each process gets its part */, RUN_WORKER: 'false', WORKER_SLOTS: String(SLOTS), DB_POOL_MAX: String(Math.max(2, Math.floor((maxConnections - 40) / WORKERS))) }, stdio: ['ignore', 'ignore', 'inherit'] }))
console.log(`${DECKS} decks (${MIX.join('/')} starter/pro/gold), ${WORKERS} worker processes x ${SLOTS} slots, model capacity ${process.env['MOCK_AI_CAPACITY']}, refusals ${process.env['MOCK_AI_REFUSE_RATE']}, ${ARRIVE ? `arriving over ${ARRIVE}s` : 'all at once'}`)
const t0 = Date.now()
const created: { id: string; plan: (typeof plans)[number]; at: number; clickMs: number; status: number }[] = []
await Promise.all(accounts.map(async (a, i) => {
  if (ARRIVE) await new Promise((r) => setTimeout(r, (i / DECKS) * ARRIVE * 1000))
  const at = Date.now(), s = Date.now()
  const res = await app.request('/api/v1/generation/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: a.cookie }, body: JSON.stringify({ prompt: `Create a ${SLIDES} slide overview of our onboarding process for new customers, part ${i}`, slideCount: SLIDES, idempotencyKey: `k-${i}-${randomUUID()}` }) })
  const j = (await res.json()) as { data?: { id: string } }
  created.push({ id: j.data?.id ?? '', plan: a.plan, at, clickMs: Date.now() - s, status: res.status })
}))
console.log(`all ${created.length} started in ${((Date.now() - t0) / 1000).toFixed(1)} s (${created.filter((c) => c.status !== 201).length} refused at creation)`)

// wait until every job is finished, printing progress
for (;;) {
  const rows = await db.select({ status: generationJob.status }).from(generationJob)
  const open = rows.filter((r) => !['completed', 'failed', 'cancelled'].includes(r.status)).length
  process.stdout.write(`\r  ${rows.length - open}/${rows.length} finished, ${open} open, ${((Date.now() - t0) / 1000).toFixed(0)} s   `)
  if (open === 0) break
  await new Promise((r) => setTimeout(r, 2000))
}
console.log()

const jobs = await db.select().from(generationJob)
type Marks = { start?: number; skeleton?: number; titles?: number; firstSlide?: number; done?: number }
const byPlan = new Map<string, { clicks: number[]; wait: number[]; skeleton: number[]; first: number[]; done: number[]; failed: number; total: number }>()
for (const c of created) {
  const j = jobs.find((x) => x.id === c.id)
  if (!j) continue
  const m = ((j.checkpoint as { marks?: Marks }).marks ?? {})
  const e = byPlan.get(c.plan) ?? { clicks: [], wait: [], skeleton: [], first: [], done: [], failed: 0, total: 0 }
  e.total++; e.clicks.push(c.clickMs)
  if (j.status === 'completed') { if (m.start !== undefined) e.wait.push(m.start); if (m.skeleton !== undefined) e.skeleton.push(m.skeleton); if (m.firstSlide !== undefined) e.first.push(m.firstSlide); if (m.done !== undefined) e.done.push(m.done) } else e.failed++
  byPlan.set(c.plan, e)
}
const s = (v: number) => (v / 1000).toFixed(1).padStart(6)
console.log('\nplan      decks failed | click→deck(ms) | queue wait p50/p95  | themed deck p95 | first slide p50/p95 | whole deck p50/p95/max  (seconds)')
for (const plan of plans) {
  const e = byPlan.get(plan); if (!e) continue
  console.log(`${plan.padEnd(9)} ${String(e.total).padStart(5)} ${String(e.failed).padStart(5)} | ${String(pct(e.clicks, 95)).padStart(10)}p95 | ${s(pct(e.wait, 50))} ${s(pct(e.wait, 95))}      | ${s(pct(e.skeleton, 95))}          | ${s(pct(e.first, 50))} ${s(pct(e.first, 95))}      | ${s(pct(e.done, 50))} ${s(pct(e.done, 95))} ${s(Math.max(0, ...e.done))}`)
}
console.log(`\ntotal wall time ${((Date.now() - t0) / 1000).toFixed(1)} s`)
workers.forEach((w) => w.kill('SIGTERM'))
await pool.end()
process.exit(0)
