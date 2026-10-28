import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { presentationSchema } from '@prompttoppt/validation'
import { app } from '../app.ts'
import { recordUsage } from '../ai/ledger.ts'
import { db } from '../db/index.ts'
import { aiUsageEvent, generationJob } from '../db/schema.ts'
import { setPlan } from '../test-utils.ts'
import { processOne } from './worker.ts'
import { runGeneration } from './pipeline.ts'

const origin = process.env['WEB_URL'] ?? 'http://localhost:3000'
const rid = () => Math.random().toString(36).slice(2, 10)

async function signUp() {
  const res = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ email: `g-${rid()}@example.com`, password: 'password123', name: 'G' }) })
  const body = (await res.json()) as { user: { id: string } }
  return { cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '), id: body.user.id }
}
const post = (path: string, cookie: string, body?: unknown) => app.request(`/api/v1/generation${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) })
const j = async (r: Response) => (await r.json()) as any
const ledgerFor = (userId: string) => db.select().from(aiUsageEvent).where(eq(aiUsageEvent.userId, userId))

/** Drain the queue until this job is terminal (other tests' jobs may be ahead of it). */
async function drain(jobId: string) {
  for (let i = 0; i < 20; i++) {
    const [job] = await db.select().from(generationJob).where(eq(generationJob.id, jobId))
    if (['completed', 'failed', 'cancelled'].includes(job!.status)) return job!
    await processOne()
  }
  throw new Error('job did not finish')
}

describe('analyze', () => {
  it('requires auth', async () => {
    expect((await app.request('/api/v1/generation/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"prompt":"hello there"}' })).status).toBe(401)
  })

  it('broad topic → 3–4 directions; both model calls are in the ledger for this user', async () => {
    const u = await signUp()
    const body = await j(await post('/analyze', u.cookie, { prompt: 'Salesforce Agentforce' }))
    expect(body.data.mode).toBe('broad')
    expect(body.data.directions.length).toBeGreaterThanOrEqual(3)
    expect(body.data.directions.length).toBeLessThanOrEqual(4)
    const types = (await ledgerFor(u.id)).map((e) => e.requestType).sort()
    expect(types).toEqual(['direction_suggestion', 'prompt_analysis'])
  })

  it('detailed prompt → straight through, no directions', async () => {
    const u = await signUp()
    const body = await j(await post('/analyze', u.cookie, { prompt: 'Create a 7 slide deck for our sales leadership about Q3 pipeline risks and the mitigation plan we will propose next quarter' }))
    expect(body.data.mode).toBe('detailed')
    expect(body.data.directions).toBeUndefined()
    expect(body.data.suggestedSlideCount).toBe(7)
  })

  it('rejects oversized prompts', async () => {
    const u = await signUp()
    expect((await post('/analyze', u.cookie, { prompt: 'x'.repeat(4001) })).status).toBe(400)
  })
})

describe('generation job', () => {
  it('end to end: idempotent create → worker → valid persisted deck → ledger → ownership', async () => {
    const u = await signUp()
    await setPlan(u.id, 'pro')
    const req = { prompt: 'Create an 8 slide overview of our onboarding process for new customers', slideCount: 8, idempotencyKey: `key-${rid()}-${rid()}` }

    const first = await post('/jobs', u.cookie, req)
    const second = await post('/jobs', u.cookie, req)
    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    const jobId = (await j(first)).data.id
    expect((await j(second)).data.id).toBe(jobId)

    const done = await drain(jobId)
    expect(done.status).toBe('completed')
    expect(done.progress).toBe(100)

    const view = await j(await app.request(`/api/v1/generation/jobs/${jobId}`, { headers: { Cookie: u.cookie } }))
    expect(view.data.presentationId).toBeTruthy()

    const deck = await j(await app.request(`/api/v1/presentations/${view.data.presentationId}`, { headers: { Cookie: u.cookie } }))
    const parsed = presentationSchema.safeParse(deck.data.document)
    expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3))).toBe(true)
    expect(deck.data.document.slides).toHaveLength(8)
    expect(deck.data.document.slides[0].layoutId).toBe('title')
    expect(deck.data.document.slides.every((s: any) => s.validation.status !== 'failed')).toBe(true)

    // every model call for this job is in the ledger with cost + job linkage
    const events = (await ledgerFor(u.id)).filter((e) => e.jobId === jobId)
    expect(events.map((e) => e.requestType)).toEqual(expect.arrayContaining(['prompt_analysis', 'outline_generation', 'slide_content']))
    expect(events.every((e) => e.status === 'success' && e.pricingSnapshotId && Number(e.providerCostUsd) > 0 && e.environment === 'development')).toBe(true)

    // re-running a finished job does nothing: no second deck, no new AI spend
    const before = (await ledgerFor(u.id)).length
    await runGeneration(jobId)
    expect((await ledgerFor(u.id)).length).toBe(before)

    // another user cannot see the job or the deck
    const other = await signUp()
    expect((await app.request(`/api/v1/generation/jobs/${jobId}`, { headers: { Cookie: other.cookie } })).status).toBe(404)
    expect((await app.request(`/api/v1/presentations/${view.data.presentationId}`, { headers: { Cookie: other.cookie } })).status).toBe(404)
  })

  it('a 12-slide deck (three batches generated side by side) keeps the outline order and makes exactly one slide_content call per batch', async () => {
    const u = await signUp()
    await setPlan(u.id, 'pro')
    const created = await post('/jobs', u.cookie, { prompt: 'Create a 12 slide overview of our onboarding process for new customers', slideCount: 12, idempotencyKey: `key-${rid()}-${rid()}` })
    const jobId = (await j(created)).data.id
    expect((await drain(jobId)).status).toBe('completed')
    const [job] = await db.select().from(generationJob).where(eq(generationJob.id, jobId))
    const cp = job!.checkpoint as { outline: { slides: { title: string }[] }; contents: { title?: string }[] }
    expect(cp.contents).toHaveLength(12)
    // slide i of the finished work is the one written for outline entry i, whichever batch finished first
    cp.contents.forEach((c, i) => { if (c.title) expect(c.title).toBe(cp.outline.slides[i]!.title) })
    const calls = (await ledgerFor(u.id)).filter((e) => e.jobId === jobId && e.requestType === 'slide_content')
    expect(calls).toHaveLength(3) // 12 slides ÷ batches of 4 — parallel batches do not add model calls
    const view = await j(await app.request(`/api/v1/generation/jobs/${jobId}`, { headers: { Cookie: u.cookie } }))
    const deck = await j(await app.request(`/api/v1/presentations/${view.data.presentationId}`, { headers: { Cookie: u.cookie } }))
    expect(deck.data.document.slides).toHaveLength(12)
  })

  it('numeric layouts are never produced without numbers in the request', async () => {
    const u = await signUp()
    await setPlan(u.id, 'pro')
    const job = await j(await post('/jobs', u.cookie, { prompt: 'An introduction to our company culture and values', slideCount: 8, idempotencyKey: `key-${rid()}-${rid()}` }))
    await drain(job.data.id)
    const [row] = await db.select().from(generationJob).where(eq(generationJob.id, job.data.id))
    const deck = await j(await app.request(`/api/v1/presentations/${row!.presentationId}`, { headers: { Cookie: u.cookie } }))
    expect(deck.data.document.slides.some((s: any) => s.layoutId === 'chart' || s.layoutId === 'metrics')).toBe(false)
  })

  it('cancelled jobs are not processed', async () => {
    const u = await signUp()
    const job = await j(await post('/jobs', u.cookie, { prompt: 'Something to cancel quickly please', idempotencyKey: `key-${rid()}-${rid()}` }))
    expect((await post(`/jobs/${job.data.id}/cancel`, u.cookie)).status).toBe(200)
    const [row] = await db.select().from(generationJob).where(eq(generationJob.id, job.data.id))
    expect(row!.status).toBe('cancelled')
    await runGeneration(job.data.id)
    expect((await ledgerFor(u.id)).length).toBe(0)
  })

  it('enforces the daily limit server-side', async () => {
    const u = await signUp()
    await setPlan(u.id, 'gold')
    const { env } = await import('../env.ts')
    for (let i = 0; i < env.GENERATION_DAILY_LIMIT; i++) await post('/jobs', u.cookie, { prompt: `Prompt number ${i} for limits`, idempotencyKey: `lim-${rid()}-${i}-aaaa` })
    const over = await post('/jobs', u.cookie, { prompt: 'One more than allowed', idempotencyKey: `lim-${rid()}-over-aaaa` })
    expect(over.status).toBe(429)
    await db.update(generationJob).set({ status: 'cancelled' }).where(and(eq(generationJob.userId, u.id)))
  })
})

describe('usage ledger', () => {
  const base = { provider: 'gemini', model: 'gemini-2.5-flash', requestType: 'outline_generation' as const, usage: { inputTokens: 1000, cachedTokens: 0, outputTokens: 500, reasoningTokens: 0, imageCount: 0 }, latencyMs: 12, pricing: { inputPerMTokUsd: 0.3, outputPerMTokUsd: 2.5, sourceUrl: 'https://example.test', verifiedOn: '2026-10-02' } }

  it('records failed calls too', async () => {
    const userId = `ledger-${rid()}`
    await recordUsage({ ...base, userId, status: 'error', errorCode: 'http_503', providerCostUsd: 0 })
    const [row] = await ledgerFor(userId)
    expect(row).toMatchObject({ status: 'error', errorCode: 'http_503' })
  })

  it('is append-only at the database level', async () => {
    const userId = `ledger-${rid()}`
    await recordUsage({ ...base, userId, status: 'success', providerCostUsd: 0.0016 })
    await expect(db.update(aiUsageEvent).set({ providerCostUsd: '0' }).where(eq(aiUsageEvent.userId, userId))).rejects.toThrow()
    await expect(db.delete(aiUsageEvent).where(eq(aiUsageEvent.userId, userId))).rejects.toThrow()
  })
})
