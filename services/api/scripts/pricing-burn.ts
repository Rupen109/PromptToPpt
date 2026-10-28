/**
 * Pricing calibration: a real customer per plan buys the plan (real checkout → confirm path, stand-in Razorpay, real signatures), then makes decks, edits them with
 * the AI, asks the assistant, adds pictures … until the plan's credits (or its other limits, or the spend cap) run out. Everything measured comes from the
 * ai_usage_event table and the credit ledger — what the server itself recorded — not from the script's own guesses.
 *   API must run with:  RAZORPAY_API_BASE=http://localhost:4902  GENERATION_DAILY_LIMIT=1000  TRUSTED_PROXY_HOPS=1   (and the real AI provider configured)
 *   tsx --env-file-if-exists=.env scripts/pricing-burn.ts        env: PLANS=pro,gold SPEND_CAP_USD=5 MAX_MIN=60 CONC=3 LABEL=gemini-dev
 */
import { writeFileSync } from 'node:fs'
import { and, eq, gte, sql } from 'drizzle-orm'
import { db, pool } from '../src/db/index.ts'
import { aiUsageEvent, creditLedger, planPrice } from '../src/db/schema.ts'
import { env, isProd } from '../src/env.ts'
import { startFakeRazorpay } from './lib/fake-razorpay.ts'

if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const API = process.env['API'] ?? 'http://localhost:4000'
const ORIGIN = process.env['ORIGIN'] ?? 'http://localhost:3001'
const PLANS = (process.env['PLANS'] ?? 'pro,gold').split(',')
const SPEND_CAP = Number(process.env['SPEND_CAP_USD'] ?? 5), MAX_MIN = Number(process.env['MAX_MIN'] ?? 60), CONC = Number(process.env['CONC'] ?? 3)
const LABEL = process.env['LABEL'] ?? 'run'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const rnd = () => Math.random().toString(36).slice(2, 10)
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!
const num = (x: unknown) => Number(x ?? 0)

/** net revenue per month after tax and payment fees (docs/PRICING_MODEL.md assumptions: 88 INR/USD, GST 18 % included, gateway fees) */
const NET_USD: Record<string, { india: number; intl: number }> = { pro: { india: 4.67, intl: 14.27 }, gold: { india: 11.23, intl: 28.83 } }
const TOPICS = ['Quarterly sales review for a SaaS company', 'Introduction to machine learning for managers', 'Pitch deck for a sustainable packaging startup', 'Onboarding guide for new engineers', 'The history of the Roman Empire for high-school students', 'Marketing plan for a mobile fitness app launch', 'Cybersecurity awareness training for employees', 'Annual report highlights for a non-profit', 'Product roadmap for an e-commerce platform', 'Climate change: causes, effects and solutions', 'Investor update for a fintech company', 'Customer success playbook for B2B accounts', 'Remote work best practices', 'Healthy eating habits for families', 'Introduction to blockchain and digital payments']
const EDITS = ['rewrite', 'shorten', 'expand', 'improve', 'change_tone', 'translate'] as const
const ASSISTS = ['make this deck feel more modern and use a calmer colour palette', 'shorten every slide to the three most important points', 'change the accent colour to teal', 'turn the second slide into a comparison', 'make the titles punchier', 'use a larger font for the body text']

interface Res { status: number; json: any }
async function call(cookie: string, method: string, path: string, body?: unknown, ip = '10.1.1.1'): Promise<Res> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`${API}${path}`, { method, headers: { Origin: ORIGIN, Cookie: cookie, 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(180_000) })
    const text = await r.text(); let json: any = null; try { json = JSON.parse(text) } catch { /* */ }
    if (r.status === 429 && /RATE_LIMITED|Too many requests|quickly/i.test(text) && attempt < 3) { await sleep(Math.max(2000, num(r.headers.get('retry-after')) * 1000 || 8000)); continue }
    return { status: r.status, json }
  }
  throw new Error('unreachable')
}

const fake = await startFakeRazorpay(4902)
// provider plan ids stored from earlier real test-mode use do not exist on the stand-in: park them, restore at the end
const savedPlanIds = (await db.select({ id: planPrice.id, p: planPrice.providerPriceId }).from(planPrice)).filter((r) => r.p)
await db.update(planPrice).set({ providerPriceId: null })
const restorePlans = async () => { await db.update(planPrice).set({ providerPriceId: null }); for (const r of savedPlanIds) await db.update(planPrice).set({ providerPriceId: r.p }).where(eq(planPrice.id, r.id)) }
process.on('SIGINT', () => void restorePlans().finally(() => process.exit(130)))
process.on('uncaughtException', (e) => { console.error(e); void restorePlans().finally(() => process.exit(1)) })
const reports: any[] = []

for (const planId of PLANS) {
  console.log(`\n════════ ${planId.toUpperCase()} ════════`)
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`
  const email = `burn${planId}${Date.now().toString(36)}@example.com`
  const su = await fetch(`${API}/api/auth/sign-up/email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Forwarded-For': ip }, body: JSON.stringify({ email, password: 'Passw0rd!burn-test', name: `Burn ${planId}` }) })
  if (!su.ok) throw new Error(`sign-up ${su.status} ${await su.text()}`)
  const cookie = su.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  const userId = ((await su.json()) as { user: { id: string } }).user.id

  // ── buy the plan the way a customer does ──
  const co = await call(cookie, 'POST', '/api/v1/billing/checkout', { planId, interval: 'month' }, ip)
  if (co.status !== 200) throw new Error(`checkout ${co.status} ${JSON.stringify(co.json)} — is the API running with RAZORPAY_API_BASE=http://localhost:4902?`)
  const paid = fake.customerPays(co.json.data.subscriptionId)
  const vf = await call(cookie, 'POST', '/api/v1/billing/verify', { razorpay_payment_id: paid.paymentId, razorpay_subscription_id: paid.subscriptionId, razorpay_signature: paid.signature }, ip)
  const ent0 = (await call(cookie, 'GET', '/api/v1/me/entitlements', undefined, ip)).json.data
  if (vf.status !== 200 || ent0.plan.id !== planId) throw new Error(`purchase failed: ${vf.status} plan=${ent0?.plan?.id}`)
  console.log(`bought ${planId}: ${paid.currency} ${(paid.amountMinor / 100).toFixed(2)} · credits ${ent0.credits.balance} · slides/deck ≤ ${ent0.limits.maxSlides} · decks/month ${ent0.limits.maxPresentationsPerMonth ?? '∞'} · images/month ${ent0.limits.maxImagesPerMonth}`)
  const since = new Date(Date.now() - 2000)

  // ── what this plan may use ──
  const tiers: string[] = ent0.features.modelTiers ?? ['starter']
  const textModels = ((await call(cookie, 'GET', '/api/v1/models', undefined, ip)).json.data?.models ?? []).filter((m: any) => tiers.includes(m.tier))
  // AI pictures (the paid "generate a picture" button) are NOT part of the test mix unless asked for: deck pictures come from Unsplash / the template library
  const imageModels: any[] = process.env['INCLUDE_AI_IMAGES'] === '1' ? ((await call(cookie, 'GET', '/api/v1/models?kind=image', undefined, ip)).json.data?.models ?? []).filter((m: any) => tiers.includes(m.tier)) : []
  console.log(`text models: ${textModels.map((m: any) => `${m.id}[${m.tier}]`).join(', ')}\nimage models: ${imageModels.map((m: any) => `${m.id}[${m.tier}]`).join(', ') || 'none'}`)
  const weighted = (ms: any[]) => { const w = (m: any) => (m.tier === 'starter' ? 6 : m.tier === 'premium' ? 3 : 1); const bag = ms.flatMap((m) => Array(w(m)).fill(m)); return pick(bag) as any }

  // ── the customer's session ──
  const decks: { id: string; slides: string[] }[] = []
  const log: { kind: string; ok: boolean; code?: string; ms: number }[] = []
  const refused: Record<string, number> = {}
  const disabled = new Set<string>()
  let stopReason = '', t0 = Date.now(), inFlight = 0

  const costSoFar = async () => num((await db.select({ c: sql<string>`coalesce(sum(${aiUsageEvent.providerCostUsd}),0)` }).from(aiUsageEvent).where(and(eq(aiUsageEvent.userId, userId), gte(aiUsageEvent.createdAt, since))))[0]!.c)
  const balance = async () => num((await call(cookie, 'GET', '/api/v1/me/entitlements', undefined, ip)).json.data.credits.balance)
  const note = (kind: string, r: Res, ms: number) => { const code = r.json?.error?.code; log.push({ kind, ok: r.status < 300, ...(code ? { code } : {}), ms }); if (r.status >= 300) { const k = `${kind}:${r.status}:${code ?? ''}`; refused[k] = (refused[k] ?? 0) + 1 } }
  const refuse = (kind: string, r: Res) => { const code = r.json?.error?.code ?? ''; if (r.status === 402 || /CREDIT|INSUFFICIENT/i.test(code)) return 'credits'; if (/being created|wait for one|quickly|try again/i.test(r.json?.error?.message ?? '')) return 'transient'; if (/LIMIT_REACHED|UPGRADE_REQUIRED/.test(code)) { disabled.add(kind); return code } return null }

  async function generate() {
    const body = { prompt: pick(TOPICS), idempotencyKey: `burn-${rnd()}${rnd()}`, slideCount: Math.min(ent0.limits.maxSlides, 6 + Math.floor(Math.random() * 9)), model: weighted(textModels)?.id, sourceIds: [] }
    const t = Date.now()
    const r = await call(cookie, 'POST', '/api/v1/generation/jobs', body, ip)
    if (r.status >= 300) { note('generate', r, Date.now() - t); return refuse('generate', r) }
    const id = r.json.data.id
    for (let i = 0; i < 240; i++) {
      await sleep(3000)
      const j = (await call(cookie, 'GET', `/api/v1/generation/jobs/${id}`, undefined, ip)).json?.data
      if (j?.status === 'completed' || j?.status === 'failed' || j?.status === 'cancelled') {
        note('generate', { status: j.status === 'completed' ? 200 : 500, json: { error: { code: j.error?.code ?? j.status } } }, Date.now() - t)
        if (j.status === 'completed' && j.presentationId) { const d = (await call(cookie, 'GET', `/api/v1/presentations/${j.presentationId}`, undefined, ip)).json?.data; const doc = d?.document ?? d; decks.push({ id: j.presentationId, slides: (doc?.slides ?? []).map((s: any) => s.id) }) }
        return null
      }
    }
    return null
  }
  async function edit() {
    const d = pick(decks); const slideId = pick(d.slides); const command = pick([...EDITS])
    const t = Date.now()
    const r = await call(cookie, 'POST', `/api/v1/presentations/${d.id}/ai-edit`, { slideId, command, ...(command === 'change_tone' ? { argument: 'friendly' } : command === 'translate' ? { argument: 'Spanish' } : {}), model: weighted(textModels)?.id, requestId: `burn-${rnd()}${rnd()}` }, ip)
    note('edit', r, Date.now() - t); return r.status >= 300 ? refuse('edit', r) : null
  }
  async function assist() {
    const d = pick(decks); const t = Date.now()
    const r = await call(cookie, 'POST', `/api/v1/presentations/${d.id}/ai-assist`, { instruction: pick(ASSISTS), scope: 'deck', model: weighted(textModels)?.id, requestId: `burn-${rnd()}${rnd()}` }, ip)
    note('assist', r, Date.now() - t); return r.status >= 300 ? refuse('assist', r) : null
  }
  async function image() {
    const d = pick(decks); const t = Date.now()
    const r = await call(cookie, 'POST', `/api/v1/presentations/${d.id}/images`, { prompt: `${pick(TOPICS)}, editorial illustration`, model: weighted(imageModels)?.id, requestId: `burn-${rnd()}${rnd()}` }, ip)
    note('image', r, Date.now() - t); return r.status >= 300 ? refuse('image', r) : null
  }
  async function manualSave() { // free work: editing by hand costs no credits
    const d = pick(decks); const cur = (await call(cookie, 'GET', `/api/v1/presentations/${d.id}`, undefined, ip)).json?.data; if (!cur) return null
    const r = await call(cookie, 'PUT', `/api/v1/presentations/${d.id}`, { baseRevision: cur.revision, document: { ...(cur.document ?? cur), title: `Edited ${rnd()}` } }, ip); note('manual-save', r, 0); return null
  }

  // generation is limited to a few at a time per account (like a real user): a small gate
  let genSlots = 2
  const gated = async <T,>(fn: () => Promise<T>): Promise<T> => { while (genSlots <= 0) await sleep(1500); genSlots--; try { return await fn() } finally { genSlots++ } }
  const limitsHit = async () => {
    if ((Date.now() - t0) / 60_000 > MAX_MIN) return `time cap ${MAX_MIN} min`
    if ((await balance()) < 2) return 'credits exhausted'
    if ((await costSoFar()) >= SPEND_CAP) return `spend cap $${SPEND_CAP}`
    return ''
  }
  /** one customer working session: make a deck, then polish it the way people do (edits, an assistant restyle, a picture, a few hand edits), then the next deck */
  async function worker(n: number) {
    while (!stopReason) {
      const why = await limitsHit(); if (why) { stopReason = why; break }
      inFlight++
      try { // (the loop may `break` from inside: the counter is always given back below)
        if (!disabled.has('generate')) { const g = await gated(generate); if (g === 'credits') { stopReason = 'credits exhausted (server refused)'; break } if (g === 'transient') { await sleep(5000) } }
        if (!decks.length) { if (disabled.has('generate')) { stopReason = 'decks cannot be created any more'; break } await sleep(3000); continue }
        const edits = 4 + Math.floor(Math.random() * 7)
        for (let k = 0; k < edits && !stopReason; k++) {
          const why2 = await limitsHit(); if (why2) { stopReason = why2; break }
          const roll = Math.random()
          const res = roll < 0.65 && !disabled.has('edit') ? await edit() : roll < 0.80 && !disabled.has('assist') ? await assist() : roll < 0.90 && imageModels.length && !disabled.has('image') ? await image() : await manualSave()
          if (res === 'credits') { stopReason = 'credits exhausted (server refused)'; break }
          if (res === 'transient') await sleep(4000)
        }
        if (disabled.has('generate') && disabled.has('edit') && disabled.has('assist')) stopReason ||= 'every AI feature hit a plan limit'
      } catch (e) { console.log(`   worker ${n}: ${(e as Error).message}`); await sleep(5000) } finally { inFlight-- }
      console.log(`   [${((Date.now() - t0) / 60000).toFixed(1)} min] credits ${await balance()} · decks ${decks.length} · actions ${log.length} · spend $${(await costSoFar()).toFixed(3)}`)
    }
  }
  await Promise.all(Array.from({ length: CONC }, (_, i) => worker(i)))
  while (inFlight > 0) await sleep(1000)
  const endBalance = await balance()
  console.log(`stopped: ${stopReason}; credits left ${endBalance}`)

  // ── at zero: is the customer stopped politely? ──
  let atZero: Record<string, string> = {}
  if (endBalance < 5) {
    const g = await call(cookie, 'POST', '/api/v1/generation/jobs', { prompt: 'One more deck about whales and oceans', idempotencyKey: `burn-zero-${rnd()}${rnd()}`, sourceIds: [], model: weighted(textModels)?.id }, ip)
    const e = decks.length ? await call(cookie, 'POST', `/api/v1/presentations/${decks[0]!.id}/ai-edit`, { slideId: decks[0]!.slides[0], command: 'shorten', requestId: `burn-zero-${rnd()}${rnd()}` }, ip) : { status: 0, json: null }
    atZero = { generate: `${g.status} ${g.json?.error?.code ?? ''} ${(g.json?.error?.message ?? '').slice(0, 90)}`, edit: `${e.status} ${e.json?.error?.code ?? ''} ${(e.json?.error?.message ?? '').slice(0, 90)}` }
    console.log('at zero credits →', atZero)
  }

  // ── what the server recorded ──
  const usage = await db.select({ type: aiUsageEvent.requestType, model: aiUsageEvent.model, n: sql<number>`count(*)::int`, ok: sql<number>`count(*) filter (where ${aiUsageEvent.status}='success')::int`, inTok: sql<number>`coalesce(sum(${aiUsageEvent.inputTokens}),0)::int`, outTok: sql<number>`coalesce(sum(${aiUsageEvent.outputTokens}+${aiUsageEvent.reasoningTokens}),0)::int`, images: sql<number>`coalesce(sum(${aiUsageEvent.imageCount}),0)::int`, cost: sql<string>`coalesce(sum(${aiUsageEvent.providerCostUsd}),0)`, reported: sql<string>`coalesce(sum(${aiUsageEvent.providerReportedCostUsd}),0)`, credits: sql<string>`coalesce(sum(${aiUsageEvent.creditCost}),0)`, ms: sql<number>`coalesce(avg(${aiUsageEvent.latencyMs}),0)::int` })
    .from(aiUsageEvent).where(and(eq(aiUsageEvent.userId, userId), gte(aiUsageEvent.createdAt, since))).groupBy(aiUsageEvent.requestType, aiUsageEvent.model)
  const ledger = await db.select({ reason: creditLedger.reason, n: sql<number>`count(*)::int`, delta: sql<number>`sum(${creditLedger.delta})::int` }).from(creditLedger).where(eq(creditLedger.userId, userId)).groupBy(creditLedger.reason)
  const totalCost = usage.reduce((a, u) => a + num(u.cost), 0), totalReported = usage.reduce((a, u) => a + num(u.reported), 0)
  const creditsSpent = ent0.credits.balance - endBalance
  const slidesMade = decks.reduce((a, d) => a + d.slides.length, 0)
  console.table(usage.map((u) => ({ type: u.type, model: u.model, calls: u.n, ok: u.ok, inTok: u.inTok, outTok: u.outTok, images: u.images, costUsd: +num(u.cost).toFixed(5), providerSaidUsd: +num(u.reported).toFixed(5), credits: +num(u.credits).toFixed(1), avgMs: u.ms })))
  console.log('credit ledger:', JSON.stringify(ledger))
  const net = NET_USD[planId]!
  const rep = {
    plan: planId, stopReason, startCredits: ent0.credits.balance, endCredits: endBalance, creditsSpent, decks: decks.length, slides: slidesMade, actions: log.length, refused,
    totalCostUsd: +totalCost.toFixed(4), providerReportedUsd: +totalReported.toFixed(4), costPer1000Credits: creditsSpent > 0 ? +((totalCost / creditsSpent) * 1000).toFixed(4) : null,
    costPerDeckUsd: decks.length ? +(totalCost / decks.length).toFixed(4) : null, minutes: +((Date.now() - t0) / 60000).toFixed(1), atZero, usage, ledger,
    extrapolatedFullAllowanceUsd: creditsSpent > 0 ? +((totalCost / creditsSpent) * ent0.credits.monthlyAllowance).toFixed(3) : null,
    marginIndia: creditsSpent > 0 ? +(1 - ((totalCost / creditsSpent) * ent0.credits.monthlyAllowance) / net.india).toFixed(3) : null,
    marginIntl: creditsSpent > 0 ? +(1 - ((totalCost / creditsSpent) * ent0.credits.monthlyAllowance) / net.intl).toFixed(3) : null,
    netUsd: net, limits: ent0.limits, monthlyAllowance: ent0.credits.monthlyAllowance,
  }
  reports.push(rep)
  console.log(JSON.stringify({ ...rep, usage: undefined, ledger: undefined }, null, 1))
}

writeFileSync(`/private/tmp/claude-502/pricing-burn-${LABEL}.json`, JSON.stringify({ label: LABEL, provider: env.AI_PROVIDER, reports }, null, 1))
fake.stop(); await restorePlans(); await pool.end()
console.log(`\nsaved /private/tmp/claude-502/pricing-burn-${LABEL}.json`)
process.exit(0)
