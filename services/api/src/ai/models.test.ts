import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../db/index.ts'
import { aiUsageEvent, creditBalance, generationJob, modelCatalog } from '../db/schema.ts'
import { processOne } from '../generation/worker.ts'
import { api, json, rid, setPlan, signUp } from '../test-utils.ts'
import { invalidateCatalog } from './registry-db.ts'

const jobBody = (extra: Record<string, unknown> = {}) => ({ prompt: 'A 6 slide overview of our onboarding process for new customers', slideCount: 6, idempotencyKey: `k-${rid()}-${rid()}`, ...extra })
const balance = async (id: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, id)))[0]!.balance
async function drain(jobId: string) {
  for (let i = 0; i < 20; i++) {
    const [j] = await db.select().from(generationJob).where(eq(generationJob.id, jobId))
    if (['completed', 'failed', 'cancelled'].includes(j!.status)) return j!
    await processOne()
  }
  throw new Error('job did not finish')
}

describe('GET /models', () => {
  it('lists text models with plan locks; image models are not offered', async () => {
    const free = await signUp('m')
    const res = await json(await api(free.cookie, 'GET', '/models'))
    const byTier = (t: string) => res.data.models.filter((m: any) => m.tier === t)
    expect(byTier('starter').length).toBeGreaterThan(0)
    expect(byTier('premium').length).toBeGreaterThan(0)
    expect(byTier('frontier').length).toBeGreaterThan(0)
    expect(byTier('starter').every((m: any) => m.allowed)).toBe(true)
    expect([...byTier('premium'), ...byTier('frontier')].every((m: any) => !m.allowed)).toBe(true)
    expect(res.data.models.every((m: any) => !/image/i.test(m.id))).toBe(true)
    expect(res.data.models.find((m: any) => m.id === res.data.default).tier).toBe('starter')
    expect(res.data.models.find((m: any) => m.tier === 'premium').creditsPerSlide).toBe(5)
  })

  it('Pro defaults to a premium model; Gold can use frontier', async () => {
    const pro = await signUp('m'); await setPlan(pro.id, 'pro')
    const gold = await signUp('m'); await setPlan(gold.id, 'gold')
    const p = await json(await api(pro.cookie, 'GET', '/models'))
    expect(p.data.models.find((m: any) => m.id === p.data.default).tier).toBe('premium')
    expect(p.data.models.filter((m: any) => m.tier === 'frontier').every((m: any) => !m.allowed)).toBe(true)
    const g = await json(await api(gold.cookie, 'GET', '/models'))
    expect(g.data.models.every((m: any) => m.allowed)).toBe(true)
  })
})

describe('choosing a model', () => {
  it('Starter cannot pick a premium/frontier model (server-enforced); unknown models are rejected', async () => {
    const free = await signUp('m')
    const models = (await json(await api(free.cookie, 'GET', '/models'))).data.models
    const premium = models.find((m: any) => m.tier === 'premium').id
    const r = await api(free.cookie, 'POST', '/generation/jobs', jobBody({ model: premium }))
    expect(r.status).toBe(403)
    expect((await json(r)).error.code).toBe('UPGRADE_REQUIRED')
    expect((await api(free.cookie, 'POST', '/generation/jobs', jobBody({ model: 'vertex:does-not-exist' }))).status).toBe(400)
    expect(await balance(free.id)).toBe(100) // refused requests cost nothing
  })

  it('the picked model is the one that runs: ledger shows it, and the tier price is charged', async () => {
    const pro = await signUp('m'); await setPlan(pro.id, 'pro')
    const models = (await json(await api(pro.cookie, 'GET', '/models'))).data.models
    const picked = models.filter((m: any) => m.tier === 'premium')[1] // not the default one
    const res = await api(pro.cookie, 'POST', '/generation/jobs', jobBody({ model: picked.id }))
    expect(res.status).toBe(201)
    expect(await balance(pro.id)).toBe(3000 - 6 * 5) // 6 slides × 5 credits (premium)
    const jobId = (await json(res)).data.id
    expect((await drain(jobId)).status).toBe('completed')
    const events = (await db.select().from(aiUsageEvent).where(eq(aiUsageEvent.jobId, jobId))).filter((e) => e.requestType === 'outline_generation' || e.requestType === 'slide_content')
    expect(events.length).toBeGreaterThan(0)
    expect(new Set(events.map((e) => `${e.provider}:${e.model}`))).toEqual(new Set([picked.id]))
  })

  it('Gold frontier is charged at the frontier rate', async () => {
    const gold = await signUp('m'); await setPlan(gold.id, 'gold')
    const models = (await json(await api(gold.cookie, 'GET', '/models'))).data.models
    const frontier = models.find((m: any) => m.tier === 'frontier')
    const res = await api(gold.cookie, 'POST', '/generation/jobs', jobBody({ model: frontier.id }))
    expect(res.status).toBe(201)
    expect(await balance(gold.id)).toBe(10000 - 6 * 12)
    await api(gold.cookie, 'POST', `/generation/jobs/${(await json(res)).data.id}/cancel`)
  })

  it('production-style OpenRouter rows work through the same path (ledger records provider + provider model id)', async () => {
    const id = `openrouter:test/model-${rid()}`
    await db.insert(modelCatalog).values({ id, provider: 'openrouter', modelId: `test/model-${rid()}`, displayName: 'Test Model', vendor: 'Test', accessTier: 'premium', inputPerMTokUsd: '3', outputPerMTokUsd: '15', pricingSourceUrl: 'https://openrouter.ai/api/v1/models', pricingVerifiedOn: '2026-10-02', environments: ['development'], sortOrder: 999 })
    invalidateCatalog()
    try {
      const pro = await signUp('m'); await setPlan(pro.id, 'pro')
      const res = await api(pro.cookie, 'POST', '/generation/jobs', jobBody({ model: id }))
      expect(res.status).toBe(201)
      const jobId = (await json(res)).data.id
      expect((await drain(jobId)).status).toBe('completed')
      const e = (await db.select().from(aiUsageEvent).where(eq(aiUsageEvent.jobId, jobId))).find((x) => x.requestType === 'slide_content')!
      expect(e.provider).toBe('openrouter')
      expect(e.model).toMatch(/^test\/model-/)
      expect(Number(e.providerCostUsd)).toBeGreaterThan(0) // priced from the catalogue snapshot
    } finally {
      await db.delete(modelCatalog).where(eq(modelCatalog.id, id))
      invalidateCatalog()
    }
  })

  it('a disabled model disappears from the list within a cache refresh and cannot be picked', async () => {
    const id = `openrouter:test/off-${rid()}`
    await db.insert(modelCatalog).values({ id, provider: 'openrouter', modelId: `test/off-${rid()}`, displayName: 'Off', vendor: 'Test', accessTier: 'starter', inputPerMTokUsd: '1', outputPerMTokUsd: '1', pricingSourceUrl: 'x', pricingVerifiedOn: 'x', environments: ['development'], enabled: false })
    invalidateCatalog()
    try {
      const u = await signUp('m')
      expect((await json(await api(u.cookie, 'GET', '/models'))).data.models.some((m: any) => m.id === id)).toBe(false)
      expect((await api(u.cookie, 'POST', '/generation/jobs', jobBody({ model: id }))).status).toBe(400)
    } finally {
      await db.delete(modelCatalog).where(eq(modelCatalog.id, id))
      invalidateCatalog()
    }
  })
})
