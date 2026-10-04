import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { aiUsageEvent, exportEvent, generationJob, user } from '../db/schema.ts'
import { env } from '../env.ts'
import { api, json, origin, rid, signUp } from '../test-utils.ts'
import { classifyPrompt, topPhrases } from './prompts.ts'
import { verdictOf } from './performance.ts'
import { reconcile } from './providers.ts'

async function adminUser() {
  const u = await signUp('ops')
  await db.update(user).set({ role: 'admin' }).where(eq(user.id, u.id))
  return u
}
/** The test DB persists between runs, so each test works in its own random 1-hour window in 2000–2020 and filters by it. */
function win() {
  const start = new Date(Date.UTC(2000, 0, 1) + Math.floor(Math.random() * 20 * 365 * 24) * 3600_000)
  const qs = `from=${start.toISOString()}&to=${new Date(start.getTime() + 3600_000).toISOString()}`
  return { start, qs, at: (minutes: number) => new Date(start.getTime() + minutes * 60_000) }
}
const ev = (o: Partial<typeof aiUsageEvent.$inferInsert> & { createdAt: Date }): typeof aiUsageEvent.$inferInsert => ({
  id: nanoid(), userId: null, provider: 'openrouter', model: 'm', requestType: 'outline_generation', latencyMs: 100, status: 'success', environment: 'development', ...o,
})
const job = (userId: string, o: Partial<typeof generationJob.$inferInsert> & { createdAt: Date }): typeof generationJob.$inferInsert => ({
  id: nanoid(), userId, prompt: 'p', options: {}, idempotencyKey: nanoid(), status: 'completed', updatedAt: o.createdAt, ...o,
})

describe('owner ops sections: access control', () => {
  it('anonymous → 401, normal user → 403', async () => {
    const u = await signUp('ops')
    for (const p of ['/admin/prompts/overview', '/admin/prompts/recent', '/admin/performance/overview', '/admin/performance/queue', '/admin/providers/overview']) {
      expect((await app.request(`/api/v1${p}`, { headers: { Origin: origin } })).status).toBe(401)
      expect((await api(u.cookie, 'GET', p)).status).toBe(403)
    }
  })
})

describe('prompts', () => {
  it('classifier maps known prompts to the 10 categories, else other', () => {
    expect(classifyPrompt('Investor pitch for my seed startup')).toBe('pitch')
    expect(classifyPrompt('Quarterly sales report with KPIs')).toBe('reports')
    expect(classifyPrompt('Lesson plan for students on fractions')).toBe('education')
    expect(classifyPrompt('Kubernetes security architecture review')).toBe('tech')
    expect(classifyPrompt('Employee onboarding and company culture')).toBe('team')
    expect(classifyPrompt('A case study on our consulting engagement')).toBe('case-studies')
    expect(classifyPrompt('Banana smoothie')).toBe('other')
  })
  it('keywords drop stop-words and find bigrams', () => {
    const r = topPhrases(['Create a presentation about climate change policy', 'climate change and the economy', 'The climate'])
    expect(r.keywords[0]).toEqual({ term: 'climate', count: 3 })
    expect(r.keywords.find((k) => k.term === 'the' || k.term === 'presentation')).toBeUndefined()
    expect(r.phrases[0]).toEqual({ term: 'climate change', count: 2 })
  })

  it('overview, use cases and recent are exact; recent leaks no email, name or user id', async () => {
    const admin = await adminUser()
    const w = win()
    const email = `priv-${rid()}@example.com`
    const res = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'x-debug-country': 'IN' }, body: JSON.stringify({ email, password: 'password123', name: 'Zelda Quillfeather' }) })
    const uid = ((await res.json()) as { user: { id: string } }).user.id
    const long = `Investor pitch ${'x'.repeat(300)}`
    await db.insert(generationJob).values([
      job(uid, { createdAt: w.at(1), prompt: long, options: { analysis: { topic: 'T', tone: 'Bold', audience: 'Investors', language: 'en' }, direction: { id: 'd' }, slideCount: 10, model: 'm1', themeId: 'forest', sourceIds: ['a', 'b'] } }),
      job(uid, { createdAt: w.at(2), prompt: 'Quarterly sales report with KPIs', status: 'failed', options: { slideCount: 4 } }),
      job(uid, { createdAt: w.at(3), prompt: 'Lesson plan for students', status: 'cancelled', options: { analysis: { language: 'hi' } } }),
      job(uid, { createdAt: w.at(4), prompt: 'Banana smoothie', options: { slideCount: 4 } }),
    ])
    await db.insert(aiUsageEvent).values([ev({ createdAt: w.at(1), requestType: 'prompt_analysis' }), ev({ createdAt: w.at(2), requestType: 'prompt_analysis', status: 'error' }), ev({ createdAt: w.at(3), requestType: 'prompt_analysis' })])

    const o = (await json(await api(admin.cookie, 'GET', `/admin/prompts/overview?${w.qs}`))).data
    expect(o).toMatchObject({ jobs: 4, users: 1, completed: 2, failed: 1, cancelled: 1, completionRate: 0.5 })
    expect(o.funnel.map((f: any) => f.count)).toEqual([3, 4, 2])
    expect(o.funnel[1].rateFromPrevious).toBeCloseTo(4 / 3, 5)
    expect(o.slideCount).toEqual([{ key: '3-5', count: 2 }, { key: '9-12', count: 1 }, { key: 'auto', count: 1 }])
    expect(o.mode).toEqual(expect.arrayContaining([{ key: 'broad', count: 1 }, { key: 'specific', count: 3 }]))
    expect(o.sources).toEqual(expect.arrayContaining([{ key: 'with sources', count: 1 }]))
    expect(o.language).toEqual(expect.arrayContaining([{ key: 'en', count: 1 }, { key: 'hi', count: 1 }, { key: 'unknown', count: 2 }]))
    expect(o.tone[0]).toEqual({ key: '(not set)', count: 3 })
    expect(o.theme).toEqual(expect.arrayContaining([{ key: 'forest', count: 1 }, { key: 'cobalt', count: 3 }]))

    const uc = (await json(await api(admin.cookie, 'GET', `/admin/prompts/use-cases?${w.qs}`))).data
    const by = Object.fromEntries(uc.useCases.map((x: any) => [x.key, x.count]))
    expect(by).toMatchObject({ pitch: 1, reports: 1, education: 1, other: 1 })
    expect(uc.sampled).toBe(4)
    expect(uc.perDay).toHaveLength(1)
    expect(uc.perDay[0].total).toBe(4)

    const kw = (await json(await api(admin.cookie, 'GET', `/admin/prompts/keywords?${w.qs}`))).data
    expect(kw.keywords.some((k: any) => k.term === 'investor')).toBe(true)

    const rr = await api(admin.cookie, 'GET', `/admin/prompts/recent?${w.qs}&pageSize=3&page=1`)
    const raw = await rr.text()
    const rec = JSON.parse(raw).data
    expect(rec.total).toBe(4)
    expect(rec.rows).toHaveLength(3)
    const longRow = JSON.parse(raw).data.rows[0] // newest first: smoothie
    expect(longRow.prompt).toBe('Banana smoothie')
    const page2 = (await json(await api(admin.cookie, 'GET', `/admin/prompts/recent?${w.qs}&pageSize=3&page=2`))).data.rows
    expect(page2).toHaveLength(1)
    expect(page2[0].prompt.length).toBeLessThanOrEqual(140)
    expect(page2[0].truncated).toBe(true)
    expect(page2[0].country).toBe('IN')
    for (const secret of [email, email.split('@')[0]!, 'Zelda', 'Quillfeather', uid]) expect(raw + JSON.stringify(page2)).not.toContain(secret)
    expect(rec.rows[0].user).toMatch(/^[0-9a-f]{10}$/)
  })
})

describe('performance', () => {
  it('verdict rule', () => {
    expect(verdictOf(0, 0, 0, 0).status).toBe('ok')
    expect(verdictOf(100, 0.06, 100, 0).status).toBe('degraded')
    expect(verdictOf(100, 0.01, 40_000, 0).status).toBe('degraded')
    expect(verdictOf(100, 0.01, 100, 2).status).toBe('degraded')
    expect(verdictOf(100, 0.6, 100, 0).status).toBe('down')
    expect(verdictOf(2, 1, 100, 0).status).toBe('ok') // too few calls to judge
  })

  it('percentiles, error rate, slowest, time series, generation durations and exports are exact', async () => {
    const admin = await adminUser()
    const w = win()
    const model = `perf-${rid()}`
    await db.insert(aiUsageEvent).values([
      ...Array.from({ length: 10 }, (_, i) => ev({ model, latencyMs: (i + 1) * 100, createdAt: w.at(i) })),
      ev({ model, latencyMs: 50, status: 'error', errorCode: 'RATE_LIMIT', createdAt: w.at(20) }),
      ev({ model, requestType: 'prompt_analysis', latencyMs: 50, status: 'error', errorCode: 'RATE_LIMIT', createdAt: w.at(21) }),
    ])
    const o = (await json(await api(admin.cookie, 'GET', `/admin/performance/overview?${w.qs}`))).data
    expect(o.calls).toBe(12)
    expect(o.failed).toBe(2)
    expect(o.errorRate).toBeCloseTo(2 / 12, 8)
    const m = o.byModel.find((x: any) => x.key === model)
    expect(m).toMatchObject({ calls: 12, failed: 2 })
    // overall latency set: 50,50,100..1000 (12 values)
    expect(o.latency.p50).toBe(450) // sorted index 5.5 → between 400 and 500
    expect(o.slowest[0].latencyMs).toBe(1000)
    expect(o.slowest).toHaveLength(12)
    expect(Object.keys(o.slowest[0]).sort()).toEqual(['createdAt', 'id', 'latencyMs', 'model', 'requestType', 'status'])
    expect(o.topErrors[0]).toMatchObject({ code: 'RATE_LIMIT', count: 2, share: 1 })
    expect(o.health.status).toBe('degraded') // 16.7% > 5%
    expect(o.health.rules.degradedErrorRate).toBe(0.05)
    expect(o.byRequestType.map((x: any) => x.key).sort()).toEqual(['outline_generation', 'prompt_analysis'])

    const clean = win()
    const m2 = `perf2-${rid()}`
    await db.insert(aiUsageEvent).values(Array.from({ length: 10 }, (_, i) => ev({ model: m2, latencyMs: (i + 1) * 100, createdAt: clean.at(i) })))
    const c = (await json(await api(admin.cookie, 'GET', `/admin/performance/overview?${clean.qs}`))).data
    expect(c.latency).toEqual({ p50: 550, p90: 910, p95: 955, p99: 991 })
    expect(c.errorRate).toBe(0)
    expect(c.health.reasons.filter((r: string) => !r.includes('stuck'))).toEqual([]) // stuck jobs are global (the queue test leaves one behind)

    const ts = (await json(await api(admin.cookie, 'GET', `/admin/performance/timeseries?${clean.qs}&bucket=hour`))).data
    expect(ts).toHaveLength(1)
    expect(ts[0]).toMatchObject({ calls: 10, p50: 550, p95: 955, errorRate: 0 })

    // generation durations (completed only) + exports
    const g = win()
    const u = await signUp('ops')
    await db.insert(generationJob).values([60, 120, 180].map((s, i) => job(u.id, { createdAt: g.at(i), updatedAt: new Date(g.at(i).getTime() + s * 1000), options: { slideCount: 4 } })))
    await db.insert(generationJob).values(job(u.id, { createdAt: g.at(10), updatedAt: new Date(g.at(10).getTime() + 999_000), status: 'failed', options: { slideCount: 15 }, attempts: 3 }))
    await db.insert(exportEvent).values([1000, 2000, 3000].map((d, i) => ({ id: nanoid(), userId: u.id, presentationId: 'x', format: 'pptx', mode: 'server', status: 'success', durationMs: d, createdAt: g.at(i) })))
    const gen = (await json(await api(admin.cookie, 'GET', `/admin/performance/generation?${g.qs}`))).data
    expect(gen.completedJobs).toBe(3)
    expect(gen.duration.p50).toBe(120_000)
    expect(gen.bySlideCount).toEqual([expect.objectContaining({ key: '3-5', jobs: 3, p50: 120_000 })])
    expect(gen.exports).toEqual([expect.objectContaining({ format: 'pptx', count: 3, p50: 2000, failed: 0 })])
    const qh = (await json(await api(admin.cookie, 'GET', `/admin/performance/queue?${g.qs}`))).data
    expect(qh.retries).toBe(1)
    for (const k of ['queued', 'running', 'stuck', 'failedLast24h']) expect(Number.isFinite(qh[k])).toBe(true)
  })

  it('queue health counts stuck and queued jobs right now', async () => {
    const admin = await adminUser()
    const u = await signUp('ops')
    const read = async () => (await json(await api(admin.cookie, 'GET', '/admin/performance/queue'))).data
    const before = await read()
    const old = new Date(Date.now() - 30 * 60_000)
    await db.insert(generationJob).values([
      job(u.id, { createdAt: old, updatedAt: old, status: 'generating' }),
      job(u.id, { createdAt: new Date(), updatedAt: new Date(), status: 'queued' }),
      job(u.id, { createdAt: new Date(), updatedAt: new Date(), status: 'failed' }),
    ])
    const after = await read()
    expect(after.stuck - before.stuck).toBeGreaterThanOrEqual(1)
    expect(after.queued - before.queued).toBeGreaterThanOrEqual(1)
    expect(after.running - before.running).toBeGreaterThanOrEqual(1)
    expect(after.failedLast24h - before.failedLast24h).toBeGreaterThanOrEqual(1)
  })
})

describe('providers', () => {
  it('reconcile math guards division and flags >5%', () => {
    expect(reconcile(0, 0, 0)).toEqual({ comparable: false, delta: 0, deltaPct: 0, flagged: false })
    expect(reconcile(0, 0, 3).flagged).toBe(false)
    expect(reconcile(1, 1.04, 2).flagged).toBe(false)
    expect(reconcile(1, 1.2, 2)).toMatchObject({ flagged: true, comparable: true })
  })

  it('card numbers are exact and the response never contains a secret', async () => {
    const admin = await adminUser()
    const w = win()
    const p = `prov-${rid()}`
    await db.insert(aiUsageEvent).values([
      ev({ provider: p, model: 'a', latencyMs: 100, providerCostUsd: '0.10', providerReportedCostUsd: '0.12', inputTokens: 1000, outputTokens: 500, createdAt: w.at(1) }),
      ev({ provider: p, model: 'a', latencyMs: 300, providerCostUsd: '0.10', providerReportedCostUsd: '0.12', imageCount: 2, createdAt: w.at(2) }),
      ev({ provider: p, model: 'b', latencyMs: 200, providerCostUsd: '0.05', createdAt: w.at(3) }),
      ev({ provider: p, model: 'b', latencyMs: 400, status: 'error', errorCode: 'TIMEOUT', createdAt: w.at(4) }),
    ])
    const res = await api(admin.cookie, 'GET', `/admin/providers/overview?${w.qs}`)
    const raw = await res.text()
    const d = JSON.parse(raw).data
    const card = d.providers.find((x: any) => x.provider === p)
    expect(card).toMatchObject({ calls: 4, failed: 1, successRate: 0.75, errorRate: 0.25, avgLatencyMs: 250, tokens: 1500, images: 2, reportedCalls: 2, configured: false, active: false })
    expect(card.costUsd).toBeCloseTo(0.25, 8)
    expect(card.reportedCostUsd).toBeCloseTo(0.24, 8)
    expect(card.reconciliation.delta).toBeCloseTo(0.04, 8)
    expect(card.reconciliation.flagged).toBe(true)
    expect(card.lastError.code).toBe('TIMEOUT')
    expect(card.lastSuccessAt).not.toBeNull()
    expect(card.modelsUsed.map((m: any) => m.model).sort()).toEqual(['a', 'b'])
    expect(d.integrations.payments).toHaveProperty('configured')
    expect(d.integrations.imageStorage.driver).toBe(env.ASSET_STORAGE)
    expect(d.integrations.ai.active).toBe(env.AI_PROVIDER)
    const secrets = [env.AUTH_SECRET, env.OPENROUTER_API_KEY, env.GEMINI_API_KEY, env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET, env.RAZORPAY_WEBHOOK_SECRET, env.GOOGLE_CLIENT_SECRET, env.ASSET_BUCKET].filter((s): s is string => !!s)
    for (const s of secrets) expect(raw).not.toContain(s)
  })
})
