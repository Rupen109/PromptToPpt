import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../db/index.ts'
import { aiUsageEvent, creditBalance, generationJob, modelCatalog } from '../db/schema.ts'
import { processOne } from '../generation/worker.ts'
import { api, json, rid, setPlan, signUp } from '../test-utils.ts'
import { chooseModel } from '../routes/models.ts'
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

const stems = (rows: { modelId: string }[]) => rows.map((r) => r.modelId.split('/').pop())

describe('GET /models', () => {
  it('Starter is never asked: no choice, the plan\'s own Gemini model is the default; other tiers are listed locked; image models are not offered', async () => {
    const free = await signUp('m')
    const res = await json(await api(free.cookie, 'GET', '/models'))
    const byTier = (t: string) => res.data.models.filter((m: any) => m.tier === t)
    expect(res.data.choice).toBe(false)
    expect(byTier('starter').length).toBeGreaterThan(0)
    expect(byTier('frontier').length).toBeGreaterThan(0)
    expect(byTier('starter').every((m: any) => m.allowed)).toBe(true)
    expect([...byTier('premium'), ...byTier('frontier')].every((m: any) => !m.allowed)).toBe(true)
    expect(res.data.models.every((m: any) => !/image/i.test(m.id))).toBe(true)
    const def = res.data.models.find((m: any) => m.id === res.data.default)
    expect(def.tier).toBe('starter')
    expect(def.id.split(':')[1]).toBe('gemini-3.6-flash') // Starter: Gemini 3.6 (2.5 is its fallback)
    expect(def.creditsPerSlide).toBe(2) // the Gemini Flash credit class
    expect(byTier('frontier')[0].creditsPerSlide).toBe(12)
  })

  it('Pro and Gold are never asked either (Gemini 3.6, then 3.8); only Premium picks, and every model is open to it', async () => {
    const pro = await signUp('m'); await setPlan(pro.id, 'pro')
    const gold = await signUp('m'); await setPlan(gold.id, 'gold')
    const premium = await signUp('m'); await setPlan(premium.id, 'premium')
    for (const u of [pro, gold]) {
      const r = await json(await api(u.cookie, 'GET', '/models'))
      expect(r.data.choice).toBe(false)
      expect(r.data.models.find((m: any) => m.id === r.data.default).id.split(':')[1]).toBe('gemini-3.6-flash')
      expect(r.data.models.filter((m: any) => m.tier !== 'starter').every((m: any) => !m.allowed)).toBe(true)
    }
    const pr = await json(await api(premium.cookie, 'GET', '/models'))
    expect(pr.data.choice).toBe(true)
    expect(pr.data.models.every((m: any) => m.allowed)).toBe(true)
  })
})

describe('chooseModel: the one rule for which model a request runs on', () => {
  const row = (id: string, tier: string, o: Record<string, unknown> = {}) => ({ id, provider: id.split(':')[0], modelId: id.split(':')[1], kind: 'text', accessTier: tier, routeQuality: null, sortOrder: 100, ...o }) as never
  const feats = (o: Record<string, unknown>) => ({ features: { modelTiers: ['starter'], modelChoice: false, fixedModels: ['gemini-3.6-flash', 'gemini-2.5-flash'], ...o } }) as never
  const all = [row('vertex:gemini-2.5-flash', 'starter'), row('vertex:gemini-3.6-flash', 'starter'), row('vertex:gemini-3.5-flash', 'frontier')]

  it('a plan without model choice uses its own models, best first, and ignores a model sent by an old client', () => {
    expect(chooseModel(feats({}), all)?.id).toBe('vertex:gemini-3.6-flash')
    expect(chooseModel(feats({}), all, 'vertex:gemini-3.5-flash')?.id).toBe('vertex:gemini-3.6-flash') // not asked, cannot choose
    expect(chooseModel(feats({}), all, 'vertex:does-not-exist')?.id).toBe('vertex:gemini-3.6-flash')
  })
  it('the same model is found whatever the provider calls it, and the next fixed model is used when the first is not served', () => {
    expect(chooseModel(feats({}), [row('openrouter:google/gemini-3.6-flash', 'starter')])?.id).toBe('openrouter:google/gemini-3.6-flash')
    expect(chooseModel(feats({}), [row('openrouter:google/gemini-2.5-flash', 'starter')])?.id).toBe('openrouter:google/gemini-2.5-flash')
    expect(chooseModel(feats({ fixedModels: ['gemini-3.6-flash', 'gemini-3.8-flash'] }), [row('vertex:gemini-3.8-flash', 'starter')])?.id).toBe('vertex:gemini-3.8-flash')
  })
  it('a fixed model the plan\'s tiers do not allow is skipped; when none is served (load-test or key-less setups) the plan\'s best allowed model is used', () => {
    const fallback = chooseModel(feats({ fixedModels: ['gemini-3.5-flash'] }), all) // the listed model is frontier, which this plan may not use: another allowed model runs, never the frontier one
    expect(fallback?.accessTier).toBe('starter')
    expect(chooseModel(feats({}), [row('ollama:glm-5.3-flash', 'starter')])?.id).toBe('ollama:glm-5.3-flash')
    expect(chooseModel(feats({}), [])).toBeUndefined()
  })
  it('Premium (model choice) gets the model it names, and an unknown or non-text model gives nothing', () => {
    const premium = feats({ modelChoice: true, modelTiers: ['starter', 'premium', 'frontier'], fixedModels: [] })
    expect(chooseModel(premium, all, 'vertex:gemini-3.5-flash')?.id).toBe('vertex:gemini-3.5-flash')
    expect(chooseModel(premium, all, 'vertex:does-not-exist')).toBeUndefined()
    expect(chooseModel(premium, [row('vertex:img', 'starter', { kind: 'image' })], 'vertex:img')).toBeUndefined()
    expect(chooseModel(premium, all)?.id).toBeTruthy() // no choice made: the default
  })
  it('the real catalogue serves every model name a plan lists (or falls back), so a plan is never left without a model', async () => {
    const { PLAN_SEED } = await import('../billing/seed.ts')
    const { CATALOG_SEED } = await import('./catalog-seed.ts')
    for (const provider of ['vertex', 'openrouter']) {
      const served = CATALOG_SEED.filter((r) => r.provider === provider && (r.kind ?? 'text') === 'text')
      for (const p of PLAN_SEED.filter((x) => x.features.fixedModels.length)) {
        const have = stems(served)
        expect(p.features.fixedModels.some((m) => have.includes(m)), `${p.id} on ${provider}`).toBe(true)
        // every model of the plan sits in a tier the plan may use (otherwise it would be skipped)
        for (const m of p.features.fixedModels) { const r = served.find((x) => x.modelId.split('/').pop() === m); if (r) expect((p.features.modelTiers as readonly string[]).includes(r.accessTier), `${p.id}: ${m}`).toBe(true) }
      }
    }
  })
})

describe('choosing a model', () => {
  it('Starter cannot choose: a model it sends is ignored, the plan\'s own model runs, and the Gemini Flash class price is charged', async () => {
    const free = await signUp('m')
    const frontier = (await json(await api(free.cookie, 'GET', '/models'))).data.models.find((m: any) => m.tier === 'frontier').id
    const r = await api(free.cookie, 'POST', '/generation/jobs', jobBody({ model: frontier }))
    expect(r.status).toBe(201)
    expect(await balance(free.id)).toBe(100 - 6 * 2) // 6 slides × 2 credits, not 12 × 6
    const jobId = (await json(r)).data.id
    expect((await drain(jobId)).status).toBe('completed')
    const events = (await db.select().from(aiUsageEvent).where(eq(aiUsageEvent.jobId, jobId))).filter((e) => e.requestType === 'outline_generation' || e.requestType === 'slide_content')
    expect(events.length).toBeGreaterThan(0)
    expect([...new Set(events.map((e) => e.model))]).toEqual(['gemini-3.6-flash'])
    expect((await api(free.cookie, 'POST', '/generation/jobs', jobBody({ model: 'vertex:does-not-exist' }))).status).toBe(201) // not asked, not an error
  })

  it('Premium picks a model: it is the one that runs, ledgered, and its credit class is charged; an unknown model is refused for free', async () => {
    const premium = await signUp('m'); await setPlan(premium.id, 'premium')
    const models = (await json(await api(premium.cookie, 'GET', '/models'))).data.models
    const picked = models.filter((m: any) => m.tier === 'frontier')[0] // not the plan's default
    const res = await api(premium.cookie, 'POST', '/generation/jobs', jobBody({ model: picked.id }))
    expect(res.status).toBe(201)
    expect(await balance(premium.id)).toBe(3700 - 6 * 12) // 6 slides × 12 credits (frontier class)
    const jobId = (await json(res)).data.id
    expect((await drain(jobId)).status).toBe('completed')
    const events = (await db.select().from(aiUsageEvent).where(eq(aiUsageEvent.jobId, jobId))).filter((e) => e.requestType === 'outline_generation' || e.requestType === 'slide_content')
    expect(events.length).toBeGreaterThan(0)
    expect(new Set(events.map((e) => `${e.provider}:${e.model}`))).toEqual(new Set([picked.id]))
    const before = await balance(premium.id)
    expect((await api(premium.cookie, 'POST', '/generation/jobs', jobBody({ model: 'vertex:does-not-exist' }))).status).toBe(400)
    expect(await balance(premium.id)).toBe(before) // refused requests cost nothing
  })

  it('production-style OpenRouter rows work through the same path (ledger records provider + provider model id)', async () => {
    const id = `openrouter:test/model-${rid()}`
    await db.insert(modelCatalog).values({ id, provider: 'openrouter', modelId: `test/model-${rid()}`, displayName: 'Test Model', vendor: 'Test', accessTier: 'premium', inputPerMTokUsd: '3', outputPerMTokUsd: '15', pricingSourceUrl: 'https://openrouter.ai/api/v1/models', pricingVerifiedOn: '2026-10-02', environments: ['development'], sortOrder: 999 })
    invalidateCatalog()
    try {
      const pro = await signUp('m'); await setPlan(pro.id, 'premium')
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
      const u = await signUp('m'); await setPlan(u.id, 'premium')
      expect((await json(await api(u.cookie, 'GET', '/models'))).data.models.some((m: any) => m.id === id)).toBe(false)
      expect((await api(u.cookie, 'POST', '/generation/jobs', jobBody({ model: id }))).status).toBe(400)
    } finally {
      await db.delete(modelCatalog).where(eq(modelCatalog.id, id))
      invalidateCatalog()
    }
  })
})
