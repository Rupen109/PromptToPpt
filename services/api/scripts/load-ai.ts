/**
 * Full-product load test WITH the real AI (dev only; costs real money). Three steps, each in the package whose code it needs:
 *   1. accounts (here: the server's auth and database)      tsx --env-file-if-exists=.env scripts/load-ai.ts accounts     env: USERS=1500
 *   2. people   (apps/editor/scripts/load-ai-people.ts: the editor's own commands apply and save every assistant answer)
 *   3. report   (here: the usage ledger for the run's users)  tsx --env-file-if-exists=.env scripts/load-ai.ts report
 * Plan mix 40% Starter / 40% Pro / 20% Gold. Needs extra generation workers while step 2 runs (scripts/worker-pool.ts).
 * Everything goes through RUN_FILE, so a restart never repeats paid work.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

// accounts are created in-process with e-mail confirmation off (set BEFORE the server settings load; the API process keeps its own setting)
process.env['REQUIRE_EMAIL_VERIFICATION'] = 'false'
const { isProd } = await import('../src/env.ts')
if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const USERS = Number(process.env['USERS'] ?? 1500)
const RUN_FILE = process.env['RUN_FILE'] ?? '/private/tmp/claude-502/load-ai-run.json'
const pct = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((a.length * p) / 100))]! : 0)

interface Account { email: string; cookie: string; plan: 'starter' | 'pro' | 'gold' }
interface EditRec { family: string; say: string; ok: boolean; ms: number; status: number; code?: string; credits: number }
interface UserRec { email: string; plan: string; deck: { ok: boolean; ms: number; slides: number; status: string; error?: string } | null; edits: EditRec[]; asked?: { ok: boolean; ms: number; status: number; code?: string }; shared?: boolean; exported?: { ok: boolean; ms: number }; saves: { ok: number; conflicts: number; failed: number } }
interface Run { startedAt: string; accounts: Account[]; done: Record<string, UserRec> }
const run: Run = existsSync(RUN_FILE) ? JSON.parse(readFileSync(RUN_FILE, 'utf8')) : { startedAt: new Date().toISOString(), accounts: [], done: {} }
const save = () => writeFileSync(RUN_FILE, JSON.stringify(run))

/** accounts: created in-process (bypasses the sign-up throttle, as the load-app test does), plan mix 40% Starter / 40% Pro / 20% Gold */
async function accounts() {
  if (run.accounts.length >= USERS) return
  const { auth } = await import('../src/auth.ts')
  const { db } = await import('../src/db/index.ts')
  const { subscription, user } = await import('../src/db/schema.ts')
  const { eq } = await import('drizzle-orm')
  console.log(`creating ${USERS - run.accounts.length} accounts…`)
  let next = run.accounts.length
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < USERS) {
      const i = next++
      const plan = i % 5 < 2 ? 'starter' : i % 5 < 4 ? 'pro' : 'gold'
      const email = `loadai-${run.startedAt.slice(0, 10)}-${i}-${randomUUID().slice(0, 6)}@example.com`
      const res = await auth.api.signUpEmail({ body: { email, password: 'Passw0rd!load-ai', name: `Load AI ${i}` }, asResponse: true })
      const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
      const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email))
      if (!cookie || !u) { console.error('sign-up failed', res.status); continue }
      await db.update(user).set({ emailVerified: true }).where(eq(user.id, u.id))
      if (plan !== 'starter') { const now = new Date(); await db.insert(subscription).values({ id: randomUUID(), userId: u.id, planId: plan, status: 'active', currency: 'INR', interval: 'month', currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 864e5), provider: 'manual' }) }
      run.accounts[i] = { email, cookie, plan }
      if (i % 100 === 0) { save(); console.log(`  ${i} accounts`) }
    }
  }))
  run.accounts = run.accounts.filter(Boolean)
  save()
  console.log(`${run.accounts.length} accounts ready in ${RUN_FILE}`)
  const { pool } = await import('../src/db/index.ts'); await pool.end()
}


async function report() {
  const { db, pool } = await import('../src/db/index.ts')
  const { sql } = await import('drizzle-orm')
  const all = Object.values(run.done)
  const emails = all.map((u) => u.email)
  if (!emails.length) { console.log('no finished people in the run file yet'); return }
  const q = async (s: any) => { const r: any = await db.execute(s); return r.rows ?? r }
  const usage = await q(sql`SELECT e.request_type, e.model, count(*)::int AS calls, count(*) FILTER (WHERE e.status = 'error')::int AS errors, coalesce(sum(e.input_tokens),0)::bigint AS input, coalesce(sum(e.cached_tokens),0)::bigint AS cached, coalesce(sum(e.output_tokens),0)::bigint AS output, coalesce(sum(e.provider_cost_usd),0)::float8 AS usd, round(avg(e.latency_ms))::int AS avg_ms
    FROM ai_usage_event e JOIN "user" u ON u.id = e.user_id WHERE u.email IN ${emails} GROUP BY 1, 2 ORDER BY usd DESC`)
  const credits = await q(sql`SELECT coalesce(-sum(l.delta) FILTER (WHERE l.reason IN ('reserve','refund')),0)::int AS used FROM credit_ledger l JOIN "user" u ON u.id = l.user_id WHERE u.email IN ${emails}`)
  const edits = all.flatMap((u) => u.edits)
  const fam = [...new Set(edits.map((e) => e.family))].map((f) => { const xs = edits.filter((e) => e.family === f); return { family: f, n: xs.length, right: xs.filter((e) => e.ok).length, errors: xs.filter((e) => e.status !== 200).length, p50: pct(xs.map((e) => e.ms), 50), p95: pct(xs.map((e) => e.ms), 95) } })
  const decks = all.map((u) => u.deck).filter(Boolean) as NonNullable<UserRec['deck']>[]
  const usd = usage.reduce((a: number, r: any) => a + Number(r.usd), 0)
  const out = {
    window: { from: run.startedAt, to: new Date().toISOString() },
    people: all.length, byPlan: Object.fromEntries(['starter', 'pro', 'gold'].map((p) => [p, all.filter((u) => u.plan === p).length])),
    decks: { created: decks.filter((d) => d.ok).length, failed: decks.filter((d) => !d.ok).length, slides: decks.reduce((a, d) => a + d.slides, 0), p50s: Math.round(pct(decks.filter((d) => d.ok).map((d) => d.ms), 50) / 1000), p95s: Math.round(pct(decks.filter((d) => d.ok).map((d) => d.ms), 95) / 1000), failures: [...new Set(decks.filter((d) => !d.ok).map((d) => `${d.status}: ${d.error ?? ''}`))].slice(0, 10) },
    edits: { total: edits.length, right: edits.filter((e) => e.ok).length, errors: edits.filter((e) => e.status !== 200).length, errorCodes: Object.fromEntries([...new Set(edits.filter((e) => e.status !== 200).map((e) => `${e.status} ${e.code ?? ''}`))].map((k) => [k, edits.filter((e) => `${e.status} ${e.code ?? ''}` === k).length])), byFamily: fam, wrong: edits.filter((e) => !e.ok && e.status === 200).slice(0, 40).map((e) => `${e.family}: ${e.say}`) },
    saves: all.reduce((a, u) => ({ ok: a.ok + u.saves.ok, conflicts: a.conflicts + u.saves.conflicts, failed: a.failed + u.saves.failed }), { ok: 0, conflicts: 0, failed: 0 }),
    askDeck: { n: all.filter((u) => u.asked).length, ok: all.filter((u) => u.asked?.ok).length, refused: Object.fromEntries([...new Set(all.flatMap((u) => (u.asked && !u.asked.ok ? [`${u.plan} ${u.asked.status} ${u.asked.code ?? ''}`] : [])))].map((k) => [k, all.filter((u) => u.asked && !u.asked.ok && `${u.plan} ${u.asked.status} ${u.asked.code ?? ''}` === k).length])) }, shared: all.filter((u) => u.shared).length, exports: { n: all.filter((u) => u.exported).length, ok: all.filter((u) => u.exported?.ok).length, p95ms: pct(all.flatMap((u) => (u.exported ? [u.exported.ms] : [])), 95) },
    cost: { usd: Math.round(usd * 100) / 100, perPerson: Math.round((usd / Math.max(1, all.length)) * 10000) / 10000, perDeck: Math.round((usage.filter((r: any) => !['assist_understand', 'assist_write', 'ask_deck', 'ai_assist'].includes(r.request_type)).reduce((a: number, r: any) => a + Number(r.usd), 0) / Math.max(1, decks.filter((d) => d.ok).length)) * 10000) / 10000, perEdit: Math.round((usage.filter((r: any) => ['assist_understand', 'assist_write'].includes(r.request_type)).reduce((a: number, r: any) => a + Number(r.usd), 0) / Math.max(1, edits.length)) * 100000) / 100000, creditsUsed: credits[0]?.used ?? 0, byRequestType: usage },
  }
  writeFileSync(RUN_FILE.replace(/\.json$/, '-report.json'), JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
  await pool.end()
}


if (process.argv[2] === 'accounts') await accounts()
else if (process.argv[2] === 'report') await report()
else console.error('usage: load-ai.ts accounts | report')
process.exit(0)
