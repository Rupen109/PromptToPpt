/**
 * PRODUCTION-SHAPED load test over real HTTP. Costs nothing unless REAL=ollama.
 *
 *   USERS=1500 ARRIVE=60 API=2 WORKERS=8 SLOTS=200 CLIENTS=3 tsx --env-file=.env scripts/load-http.ts
 *
 * What runs, each as its own OS process, the way production runs them:
 *   · Postgres (the local one; a throw-away database `prompttoppt_load` is rebuilt every run, dev data is never touched)
 *   · API   processes (src/index.ts, no worker inside, live events through Postgres LISTEN/NOTIFY so any API process sees what any worker writes)
 *   · WORKER processes (src/worker-main.ts, SLOTS decks each)
 *   · CLIENT processes: USERS simulated browsers behaving like the editor: start a deck, open it, hold the live (SSE) connection, follow the build,
 *     then edit (autosave), list their decks and read their plan.  Requests go over HTTP to the API processes, round-robin (a stand-in load balancer).
 * The model is the stand-in with measured answer times (MOCK_AI_*), or REAL=ollama for the real model through a local Ollama.
 *
 *   USERS   simulated people (default 1500)         ARRIVE  seconds they arrive over (0 = everybody at the same instant, the worst case)
 *   MIX     starter,pro,gold shares (default 40,40,20)             SLIDES  slides per deck (default 10)
 *   API     API processes (default 2)               WORKERS worker processes (default 8)          SLOTS slots per worker (default 200)
 *   CLIENTS client processes (default 3: one process cannot honestly drive 1,500 browsers)
 *   CAPACITY / REFUSE / SCALE  the stand-in model's total capacity, random refusal share, speed multiplier (see load-decks.ts)
 * The report is the answer to: how long does a deck take per plan, how fast and how reliable is the API under that load, and what did it cost the machines.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import pg from 'pg'

const role = process.argv[2] ?? 'orchestrator'
const num = (k: string, d: number) => Number(process.env[k] ?? d)
const USERS = num('USERS', 1500), ARRIVE = num('ARRIVE', 60), APIS = num('API', 2), WORKERS = num('WORKERS', 8), SLOTS = num('SLOTS', 200), CLIENTS = num('CLIENTS', 3), SLIDES = num('SLIDES', 10)
const MIX = (process.env['MIX'] ?? '40,40,20').split(',').map(Number) as [number, number, number]
/** REAL=ollama | gemini: the real model instead of the stand-in. TARGET=dev: run against the DEV database and the dev stack (so the owner's own logged-in browser shares the queue and sees decks), with throw-away users named loadtest-*@example.com */
const REAL = process.env['REAL'] ?? ''
const TARGET_DEV = process.env['TARGET'] === 'dev'
const SPEND_CAP_USD = num('SPEND_CAP_USD', 0) // 0 = no real money is being spent
const OWNER_EMAIL = process.env['REAL_USER_EMAIL'] ?? ''
const DIR = process.env['LOAD_DIR'] ?? '/private/tmp/claude-502/load-http'
const API_PORT0 = 4100
type Plan = 'starter' | 'pro' | 'gold'
const pct = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((a.length * p) / 100))]! : 0)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Rec { label: string; ms: number; status: number }
interface UserOut { plan: Plan; ok: boolean; error?: string; clickToDeckMs?: number; firstSlideMs?: number; doneMs?: number; pushToSeeMs: number[]; sseOpen: boolean }

// ───────────────────────────── CLIENT: a slice of the simulated browsers ─────────────────────────────
if (role === 'client') {
  const slice = Number(process.argv[3]), of = Number(process.argv[4])
  const accounts = JSON.parse(readFileSync(`${DIR}/accounts.json`, 'utf8')) as { cookie: string; plan: Plan }[]
  const apis = Array.from({ length: APIS }, (_, i) => `http://127.0.0.1:${API_PORT0 + i}`)
  const lag = monitorEventLoopDelay({ resolution: 20 }); lag.enable()
  const recs: Rec[] = []
  const outs: UserOut[] = []
  const t00 = Date.now()
  const call = async (base: string, label: string, cookie: string, path: string, init: RequestInit = {}) => {
    const s = Date.now()
    let status = 0, json: any = null
    try {
      const res = await fetch(`${base}/api/v1${path}`, { ...init, headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: process.env['WEB_URL'] ?? 'http://localhost:3000', ...(init.headers ?? {}) } })
      status = res.status
      json = await res.json().catch(() => null)
    } catch { status = 0 }
    recs.push({ label, ms: Date.now() - s, status })
    return { status, json }
  }

  const user = async (idx: number): Promise<void> => {
    const a = accounts[idx]!
    const base = apis[idx % apis.length]!
    const out: UserOut = { plan: a.plan, ok: false, pushToSeeMs: [], sseOpen: false }
    outs.push(out)
    await sleep(ARRIVE ? (idx / USERS) * ARRIVE * 1000 : 0)
    const t0 = Date.now()
    const made = await call(base, 'POST /generation/jobs (start a deck)', a.cookie, '/generation/jobs', { method: 'POST', body: JSON.stringify({ prompt: `Create a ${SLIDES} slide overview of our onboarding process for new customers, part ${idx}`, slideCount: SLIDES, idempotencyKey: `k-${idx}-${randomUUID()}` }) })
    const deckId: string | undefined = made.json?.data?.presentationId
    if (made.status !== 201 || !deckId) { out.error = `start refused: ${made.status} ${JSON.stringify(made.json?.error ?? '').slice(0, 120)}`; return }
    const opened = await call(base, 'GET /presentations/:id (open the deck)', a.cookie, `/presentations/${deckId}`)
    out.clickToDeckMs = Date.now() - t0
    if (opened.status !== 200) { out.error = `open failed: ${opened.status}`; return }

    // the live channel, like the editor's: a revision pushed → fetch the deck
    let revSeenAt = 0, pulling = false, finished = false
    let known: number = opened.json?.data?.revision ?? 0 // like the editor: ask for the deck only if it changed since this revision
    const ac = new AbortController()
    const pull = async (viaPush: boolean) => {
      if (pulling || finished) return
      pulling = true
      const r = await call(base, viaPush ? 'GET /presentations/:id?since (after a live push)' : 'GET /presentations/:id?since (poll while writing)', a.cookie, `/presentations/${deckId}?since=${known}`)
      pulling = false
      if (r.json?.data?.unchanged) return
      known = r.json?.data?.revision ?? known
      const slides: { writing?: unknown; elements: unknown[] }[] = r.json?.data?.document?.slides ?? []
      if (!slides.length) return
      const written = slides.filter((s) => !s.writing && s.elements.length > 0).length
      if (written > 0 && out.firstSlideMs === undefined) out.firstSlideMs = Date.now() - t0
      if (viaPush && revSeenAt) out.pushToSeeMs.push(Date.now() - revSeenAt)
      if (slides.every((s) => !s.writing)) { out.doneMs = Date.now() - t0; finished = true }
    }
    void (async () => {
      try {
        const res = await fetch(`${base}/api/v1/presentations/${deckId}/live?client=c${idx}${randomUUID().slice(0, 8)}`, { headers: { Cookie: a.cookie, Origin: process.env['WEB_URL'] ?? 'http://localhost:3000', Accept: 'text/event-stream' }, signal: ac.signal })
        out.sseOpen = res.status === 200
        recs.push({ label: 'GET /presentations/:id/live (open the live stream)', ms: Date.now() - t0, status: res.status })
        const reader = res.body!.getReader(); const dec = new TextDecoder(); let buf = ''
        for (;;) {
          const { done, value } = await reader.read(); if (done) break
          buf += dec.decode(value, { stream: true })
          let i: number
          while ((i = buf.indexOf('\n\n')) >= 0) { const ev = buf.slice(0, i); buf = buf.slice(i + 2); if (/^event: rev/m.test(ev)) { revSeenAt = Date.now(); void pull(true) } }
        }
      } catch { /* closed by us at the end */ }
    })()
    const deadline = Date.now() + 15 * 60_000
    while (!finished && Date.now() < deadline) {
      // the editor's safety net: every 2 s without the live channel, every 10 s with it (the live channel is the feed)
      const every = out.sseOpen ? 10_000 : 2000
      for (let w = 0; w < every && !finished; w += 250) await sleep(250)
      if (finished) break
      const b = await call(base, 'GET /presentations/:id/build (poll while writing)', a.cookie, `/presentations/${deckId}/build`)
      if (b.json?.data && (b.json.data.status === 'failed' || b.json.data.status === 'cancelled')) { out.error = `job ${b.json.data.status}: ${b.json.data.error ?? ''}`; break }
      await pull(false)
    }
    ac.abort()
    if (!finished) { out.error ??= 'did not finish in 15 minutes'; return }

    // then the person works on the deck: autosave a few times, look at their library and plan
    let rev: number = (await call(base, 'GET /presentations/:id (open the deck)', a.cookie, `/presentations/${deckId}`)).json?.data?.revision ?? 1
    let doc = (await call(base, 'GET /presentations/:id (open the deck)', a.cookie, `/presentations/${deckId}`)).json?.data?.document
    for (let k = 0; k < 3 && doc; k++) {
      await sleep(1000 + Math.random() * 2000)
      const r = await call(base, 'PUT /presentations/:id (autosave)', a.cookie, `/presentations/${deckId}`, { method: 'PUT', body: JSON.stringify({ baseRevision: rev, document: { ...doc, title: `Edited ${idx}-${k}` } }) })
      if (r.status === 200) rev = r.json?.data?.revision ?? rev + 1
      else if (r.status === 409) { const g = await call(base, 'GET /presentations/:id (open the deck)', a.cookie, `/presentations/${deckId}`); rev = g.json?.data?.revision ?? rev; doc = g.json?.data?.document }
    }
    await call(base, 'GET /presentations (library)', a.cookie, '/presentations')
    await call(base, 'GET /me/entitlements (plan and credits)', a.cookie, '/me/entitlements')
    out.ok = true
  }

  const mine = Array.from({ length: USERS }, (_, i) => i).filter((i) => i % of === slice)
  await Promise.all(mine.map((i) => user(i).catch((e) => { outs.find((o) => !o.ok && !o.error)!.error = String(e).slice(0, 120) })))
  writeFileSync(`${DIR}/client-${slice}.json`, JSON.stringify({ recs, outs, lagP99Ms: lag.percentile(99) / 1e6, lagMaxMs: lag.max / 1e6, wallMs: Date.now() - t00 }))
  process.exit(0)
}

// ───────────────────────────── ORCHESTRATOR ─────────────────────────────
const base = new URL(process.env['DATABASE_URL'] ?? 'postgresql://prompttoppt:prompttoppt@localhost:5432/prompttoppt_dev')
if (!/localhost|127\.0\.0\.1/.test(base.hostname)) { console.error('Refusing: this test only runs against a local database'); process.exit(1) }
mkdirSync(DIR, { recursive: true })
let maxConnections = 100
if (TARGET_DEV) {
  const c = new pg.Client({ connectionString: base.toString() }); await c.connect()
  maxConnections = Number((await c.query('show max_connections')).rows[0].max_connections); await c.end()
} else {
  const admin = new pg.Client({ connectionString: base.toString() }); await admin.connect()
  await admin.query('drop database if exists prompttoppt_load with (force)'); await admin.query('create database prompttoppt_load')
  maxConnections = Number((await admin.query('show max_connections')).rows[0].max_connections)
  await admin.end()
  base.pathname = '/prompttoppt_load'
}
const envFor: Record<string, string> = {
  DATABASE_URL: base.toString(), AI_PROVIDER: REAL || 'mock', MOCK_AI_LATENCY: REAL ? 'off' : 'realistic', MOCK_AI_REFUSE_RATE: String(num('REFUSE', 0)), ...(process.env['SCALE'] ? { MOCK_AI_SCALE: process.env['SCALE'] } : {}),
  REQUIRE_EMAIL_VERIFICATION: 'false', APP_ENV: 'development', NODE_ENV: 'development', GENERATION_DAILY_LIMIT: '1000', LIVE_BUS: 'pg',
  AI_BUDGET_USD_HOUR: '1000000', AI_BUDGET_USD_DAY: '1000000', AI_USER_USD_DAY: '1000000', AUTH_SIGNUPS_PER_IP_HOUR: '1000000', AUTH_SIGNUPS_PER_IP_DAY: '1000000', PEXELS_API_KEY: '', UNSPLASH_ACCESS_KEY: '', UNPLASH_ACCESS_KEY: '',
  ...(TARGET_DEV ? {} : { WEB_URL: 'http://localhost:3000', EDITOR_URL: 'http://localhost:5173' }),
}
Object.assign(process.env, envFor, { DB_POOL_MAX: '15' })
const { isProd } = await import('../src/env.ts')
if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const { migrate } = await import('drizzle-orm/node-postgres/migrator')
const { drizzle } = await import('drizzle-orm/node-postgres')
{ const p = new pg.Pool({ connectionString: base.toString(), max: 1 }); await migrate(drizzle(p), { migrationsFolder: new URL('../drizzle', import.meta.url).pathname }); await p.end() }
const { auth } = await import('../src/auth.ts')
const { db, pool } = await import('../src/db/index.ts')
const { generationJob, subscription, user } = await import('../src/db/schema.ts')
const { seedBilling } = await import('../src/billing/seed.ts')
const { eq } = await import('drizzle-orm')
await seedBilling()

const planOf = (i: number): Plan => { const t = MIX[0] + MIX[1] + MIX[2]; const r = (((i * 37) % 100) / 100) * t; return r < MIX[0] ? 'starter' : r < MIX[0] + MIX[1] ? 'pro' : 'gold' }
console.log(`creating ${USERS} accounts…`)
const accounts: { cookie: string; plan: Plan }[] = []
{
  let next = 0
  await Promise.all(Array.from({ length: 16 }, async () => {
    while (next < USERS) {
      const i = next++, plan = planOf(i)
      const res = await auth.api.signUpEmail({ body: { email: `${TARGET_DEV ? 'loadtest' : 'http'}-${i}-${randomUUID().slice(0, 6)}@example.com`, password: 'Passw0rd!load-test', name: `Load ${i}` }, asResponse: true })
      const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
      const body = (await res.json()) as { user?: { id: string } }
      if (!cookie || !body.user) { console.error('sign-up failed', res.status); process.exit(1) }
      await db.update(user).set({ emailVerified: true }).where(eq(user.id, body.user.id))
      if (plan !== 'starter') { const now = new Date(); await db.insert(subscription).values({ id: randomUUID(), userId: body.user.id, planId: plan, status: 'active', currency: 'INR', interval: 'month', currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86400_000), providerRef: `load-${i}` }) }
      accounts[i] = { cookie, plan }
    }
  }))
}
writeFileSync(`${DIR}/accounts.json`, JSON.stringify(accounts))

// the processes
const procs: { name: string; p: ChildProcess }[] = []
const tsx = (file: string, args: string[], env: Record<string, string>, name: string) => {
  const p = spawn(process.execPath, ['--import', 'tsx', new URL(file, import.meta.url).pathname, ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'inherit'] })
  procs.push({ name, p }); return p
}
const dbShare = Math.max(2, Math.floor((maxConnections - 50) / (APIS + WORKERS)))
for (let i = 0; i < APIS; i++) tsx('../src/index.ts', [], { PORT: String(API_PORT0 + i), RUN_WORKER: 'false', DB_POOL_MAX: String(dbShare), API_URL: `http://127.0.0.1:${API_PORT0 + i}` }, `api-${i}`)
for (let i = 0; i < WORKERS; i++) tsx('../src/worker-main.ts', [], { RUN_WORKER: 'false', WORKER_SLOTS: String(SLOTS), DB_POOL_MAX: String(dbShare), MOCK_AI_CAPACITY: String(Math.max(1, Math.ceil(num('CAPACITY', 100000) / WORKERS))) }, `worker-${i}`)
for (let i = 0; i < APIS; i++) for (let t = 0; t < 60; t++) { try { if ((await fetch(`http://127.0.0.1:${API_PORT0 + i}/health`)).ok) break } catch { /* not up yet */ } await sleep(500) }
console.log(`${USERS} users (${MIX.join('/')} starter/pro/gold), ${APIS} API + ${WORKERS} worker processes x ${SLOTS} slots, ${CLIENTS} client processes, model: ${REAL ? `REAL ${REAL}` : 'stand-in'}, ${ARRIVE ? `arriving over ${ARRIVE}s` : 'all at the same instant'}`)

// resource sampler
const pids = procs.map((x) => ({ name: x.name, pid: x.p.pid! }))
const peak: Record<string, { rssMb: number; cpu: number }> = {}
let peakPgConns = 0
const sample = setInterval(async () => {
  try {
    const out = await new Promise<string>((res) => { let o = ''; const ps = spawn('ps', ['-o', 'pid=,rss=,pcpu=', '-p', pids.map((x) => x.pid).join(',')]); ps.stdout.on('data', (d) => (o += d)); ps.on('close', () => res(o)) })
    for (const line of out.trim().split('\n')) { const [pid, rss, cpu] = line.trim().split(/\s+/); const n = pids.find((x) => x.pid === Number(pid))?.name.replace(/-\d+$/, ''); if (!n) continue; const e = (peak[n] ??= { rssMb: 0, cpu: 0 }); e.rssMb = Math.max(e.rssMb, Number(rss) / 1024); e.cpu = Math.max(e.cpu, Number(cpu)) }
    const c = await pool.query("select count(*)::int n from pg_stat_activity where datname = current_database()"); peakPgConns = Math.max(peakPgConns, c.rows[0].n)
  } catch { /* sampling must never stop the test */ }
}, 2000)

const t0 = Date.now()
// spend guard and provider-block detector (real money only): stop everything the moment the ledger passes the cap or the provider starts refusing for billing / policy reasons
let aborted = ''
const T_START = new Date()
const testUsers = `select id from "user" where email like 'loadtest-%@example.com'`
const guard = SPEND_CAP_USD > 0 ? setInterval(async () => {
  try {
    const cost = Number((await pool.query(`select coalesce(sum(provider_cost_usd), 0)::float8 c from ai_usage_event where created_at >= $1 and user_id in (${testUsers})`, [T_START])).rows[0].c)
    const blocked = Number((await pool.query(`select count(*)::int n from ai_usage_event where created_at > now() - interval '20 seconds' and status = 'error' and error_detail ~* 'terms of use|prepayment|depleted|permission_denied|api key not valid|api_key_invalid|suspended|account.*(disabled|closed)' and user_id in (${testUsers})`)).rows[0].n)
    if (!aborted && cost > SPEND_CAP_USD) aborted = `spend cap reached: $${cost.toFixed(2)} > $${SPEND_CAP_USD}`
    if (!aborted && blocked >= 10) aborted = `the provider is refusing for billing or policy reasons (not a rate limit) (${blocked} refusals in 20 s)`
    if (aborted) { console.log(`\n!!! STOPPING: ${aborted}`); procs.forEach((x) => x.p.kill('SIGTERM')) }
  } catch { /* the next tick tries again */ }
}, 5000) : null
const clients = Array.from({ length: CLIENTS }, (_, i) => new Promise<void>((res) => { const p = tsx('./load-http.ts', ['client', String(i), String(CLIENTS)], { ...envFor, USERS: String(USERS), ARRIVE: String(ARRIVE), API: String(APIS), SLIDES: String(SLIDES), LOAD_DIR: DIR, MIX: MIX.join(',') }, `client-${i}`); p.on('close', () => res()) }))
const watch = setInterval(async () => { const r = (await db.select({ status: generationJob.status, at: generationJob.createdAt }).from(generationJob)).filter((x) => x.at >= T_START); const open = r.filter((x) => !['completed', 'failed', 'cancelled'].includes(x.status)).length; process.stdout.write(`\r  ${r.length} decks started, ${r.length - open} finished, ${open} open, ${((Date.now() - t0) / 1000).toFixed(0)} s   `) }, 3000)
await Promise.all(clients)
clearInterval(watch); clearInterval(sample); if (guard) clearInterval(guard)
console.log()

// ───────────────────────────── REPORT ─────────────────────────────
const results = aborted ? [] : Array.from({ length: CLIENTS }, (_, i) => JSON.parse(readFileSync(`${DIR}/client-${i}.json`, 'utf8')) as { recs: Rec[]; outs: UserOut[]; lagP99Ms: number; lagMaxMs: number })
const recs = results.flatMap((r) => r.recs), outs = results.flatMap((r) => r.outs)
const s1 = (ms: number) => (ms / 1000).toFixed(1).padStart(6)
console.log(`\n=== The person's view of a deck, per plan (seconds, as the browser sees it over HTTP) ===`)
console.log('plan      users  ok  failed | deck opens p95 | first slide p50 / p95 | whole deck p50 / p95 / max')
const plans: Plan[] = ['starter', 'pro', 'gold']
for (const plan of plans) {
  const o = outs.filter((x) => x.plan === plan); const f = (k: 'clickToDeckMs' | 'firstSlideMs' | 'doneMs') => o.map((x) => x[k]).filter((v): v is number => v !== undefined)
  console.log(`${plan.padEnd(9)} ${String(o.length).padStart(5)} ${String(o.filter((x) => x.ok).length).padStart(4)} ${String(o.filter((x) => !x.ok).length).padStart(6)} | ${s1(pct(f('clickToDeckMs'), 95))}       | ${s1(pct(f('firstSlideMs'), 50))} ${s1(pct(f('firstSlideMs'), 95))}       | ${s1(pct(f('doneMs'), 50))} ${s1(pct(f('doneMs'), 95))} ${s1(Math.max(0, ...f('doneMs')))}`)
}
const jobs = (await db.select().from(generationJob)).filter((j) => j.createdAt >= T_START) // this run only (the dev database holds older jobs too)
console.log(`\n=== Server side of the same decks (from the job milestones) ===\nplan      queue wait p50 / p95 / max | deck themed p95 | first slide p95 | job attempts > 1 | failed jobs`)
for (const plan of plans) {
  const ids = new Set<string>(); void ids
}
const laneOf = (l: number): Plan => (l === 0 ? 'gold' : l === 1 ? 'pro' : 'starter')
for (const plan of plans) {
  const js = jobs.filter((j) => laneOf(j.lane) === plan); const m = (k: string) => js.map((j) => (j.checkpoint as { marks?: Record<string, number> }).marks?.[k]).filter((v): v is number => v !== undefined)
  console.log(`${plan.padEnd(9)} ${s1(pct(m('start'), 50))} ${s1(pct(m('start'), 95))} ${s1(Math.max(0, ...m('start')))}      | ${s1(pct(m('skeleton'), 95))}        | ${s1(pct(m('firstSlide'), 95))}       | ${String(js.filter((j) => j.attempts > 1).length).padStart(8)}         | ${js.filter((j) => j.status === 'failed').length}`)
}
const byLabel = new Map<string, Rec[]>(); for (const r of recs) (byLabel.get(r.label) ?? byLabel.set(r.label, []).get(r.label)!).push(r)
console.log(`\n=== API under that load (every request the ${USERS} browsers made, ${recs.length} in all, ${(recs.length / ((Date.now() - t0) / 1000)).toFixed(0)} per second on average) ===`)
console.log('request'.padEnd(54) + 'count'.padStart(7) + '  p50 ms  p95 ms  p99 ms  max ms  errors')
let totalErr = 0
for (const [label, rs] of [...byLabel].sort((a, b) => b[1].length - a[1].length)) {
  const ms = rs.map((r) => r.ms), errs = rs.filter((r) => r.status === 0 || r.status >= 400 && r.status !== 409).length; totalErr += errs
  console.log(label.padEnd(54) + String(rs.length).padStart(7) + `${String(pct(ms, 50)).padStart(8)}${String(pct(ms, 95)).padStart(8)}${String(pct(ms, 99)).padStart(8)}${String(Math.max(...ms)).padStart(8)}  ${errs}`)
}
console.log(`\n=== What it cost the machines (peak) ===`)
for (const [n, v] of Object.entries(peak)) console.log(`${n.padEnd(8)} memory ${v.rssMb.toFixed(0)} MB (one process)  cpu ${v.cpu.toFixed(0)} % (of one core)`)
console.log(`postgres connections peak ${peakPgConns} of ${maxConnections}`)
console.log(`load generator health: event-loop delay p99 ${results.map((r) => r.lagP99Ms.toFixed(0)).join(' / ')} ms per client process (a high number means the TEST was the bottleneck, not the server)`)
const livePush = outs.flatMap((o) => o.pushToSeeMs)
console.log(`live stream: ${outs.filter((o) => o.sseOpen).length} of ${outs.length} connected; a pushed update reached the browser's screen data p50 ${pct(livePush, 50)} ms / p95 ${pct(livePush, 95)} ms`)
console.log(`\ntotal wall time ${((Date.now() - t0) / 1000).toFixed(0)} s; users that finished their whole session: ${outs.filter((o) => o.ok).length} of ${outs.length}; API errors: ${totalErr}`)
const bad = outs.filter((o) => !o.ok).slice(0, 5).map((o) => o.error); if (bad.length) console.log('first failures:', bad)
if (REAL) {
  const q = (text: string, params: unknown[] = []) => pool.query(text, params).then((r) => r.rows)
  const rows = await q(`select request_type, count(*)::int n, count(*) filter (where status = 'error')::int errors, coalesce(sum(provider_cost_usd), 0)::float8 cost, round(avg(latency_ms))::int avg_ms, max(latency_ms)::int max_ms from ai_usage_event where created_at >= $1 and user_id in (${testUsers}) group by 1 order by 4 desc`, [T_START])
  const total = rows.reduce((a: number, r: any) => a + r.cost, 0), finished = jobs.filter((j) => j.status === 'completed').length
  console.log(`\n=== What the real model cost (our ledger, ${REAL}) ===\nrequest type            calls  errors  cost USD  avg ms  max ms`)
  for (const r of rows) console.log(`${String(r.request_type).padEnd(22)}${String(r.n).padStart(7)}${String(r.errors).padStart(8)}${('$' + r.cost.toFixed(4)).padStart(10)}${String(r.avg_ms).padStart(8)}${String(r.max_ms).padStart(8)}`)
  console.log(`TOTAL $${total.toFixed(3)} (about ₹${(total * 88).toFixed(0)}) for ${finished} finished decks = $${(total / Math.max(1, finished)).toFixed(4)} a deck; Google's own billing page shows this a few hours later: compare the two`)
  const errs = await q(`select coalesce(error_code, '?') code, left(coalesce(error_detail, ''), 90) detail, count(*)::int n from ai_usage_event where created_at >= $1 and status = 'error' and user_id in (${testUsers}) group by 1, 2 order by 3 desc limit 6`, [T_START])
  if (errs.length) { console.log('refusals and errors from the provider:'); for (const e of errs) console.log(`  ${String(e.n).padStart(5)} x ${e.code}: ${e.detail}`) }
}
if (OWNER_EMAIL) {
  const mine = await pool.query(`select j.id, j.status, j.checkpoint->'marks' m, j.presentation_id from generation_job j join "user" u on u.id = j.user_id where u.email = $1 and j.created_at >= $2 order by j.created_at`, [OWNER_EMAIL, T_START])
  console.log(`\n=== Your own decks during the test (${OWNER_EMAIL}) ===`)
  for (const r of mine.rows) { const m = r.m ?? {}; console.log(`  ${r.status}  queue ${((m.start ?? 0) / 1000).toFixed(1)} s, themed ${((m.skeleton ?? 0) / 1000).toFixed(1)} s, first slide ${((m.firstSlide ?? 0) / 1000).toFixed(1)} s, whole ${((m.done ?? 0) / 1000).toFixed(1)} s  ->  /edit/${r.presentation_id}`) }
  if (!mine.rows.length) console.log('  none started during this run')
}
if (aborted) console.log(`\nRUN STOPPED EARLY: ${aborted}`)
procs.forEach((x) => x.p.kill('SIGTERM'))
await sleep(500); await pool.end(); process.exit(0)
