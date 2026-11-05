import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../db/index.ts'
import { creditBalance, creditLedger, generationJob, presentation } from '../db/schema.ts'
import { api, json, rid, setPlan, signUp } from '../test-utils.ts'
import { refundCredits, reserveCredits } from './credits.ts'
import { assertAiEdits, assertExport, assertLivePreview, assertModelTier, getEntitlements } from './entitlements.ts'
import { GateError } from './errors.ts'
import { nanoid } from 'nanoid'

const balance = async (id: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, id)))[0]!.balance
const gate = async (fn: () => unknown) => {
  try {
    await fn()
  } catch (e) {
    if (e instanceof GateError) return e
    throw e
  }
  return null
}

describe('plan catalogue (matches the owner\'s spec, docs/PLANS_AND_FEATURES_V5.md)', () => {
  it('Starter / Pro / Gold / Premium have exactly the agreed limits and features', async () => {
    const res = await json(await app_get('/plans'))
    const [starter, pro, gold, premium] = res.data.plans
    expect(res.data.plans.map((p: any) => p.id)).toEqual(['starter', 'pro', 'gold', 'premium'])
    // Starter: free, 5 decks of 10 slides, watermark, no export, no AI edits, no live preview (no present / share), no model choice
    expect(starter).toMatchObject({ monthlyCredits: 100, maxSlides: 10, maxPresentationsPerMonth: 5, maxImagesPerPresentation: 0, maxImagesPerMonth: 0, features: { watermark: true, exportFormats: [], aiEdits: false, advancedEditor: true, advancedSharing: false, livePreview: false, modelChoice: false, modelTiers: ['starter'], fixedModels: ['gemini-3.6-flash', 'gemini-3.1-flash-lite'] } })
    expect(pro).toMatchObject({ monthlyCredits: 900, maxSlides: 15, maxPresentationsPerMonth: 15, features: { watermark: false, aiEdits: true, advancedEditor: true, premiumTemplates: true, advancedSharing: true, livePreview: true, exportFormats: ['pdf', 'pptx', 'jpg'], modelChoice: false, modelTiers: ['starter'], fixedModels: ['gemini-3.6-flash', 'gemini-3.8-flash'], support: 'whatsapp' } })
    expect(gold).toMatchObject({ monthlyCredits: 2000, maxSlides: 25, maxPresentationsPerMonth: 50, features: { exportFormats: ['pptx', 'pdf', 'png', 'jpg', 'html'], livePreview: true, modelChoice: false, modelTiers: ['starter'], brandKit: true, knowledgeBase: true, speed: 'ultra', fixedModels: ['gemini-3.6-flash', 'gemini-3.8-flash'] } })
    expect(premium).toMatchObject({ monthlyCredits: 3700, maxSlides: 60, maxPresentationsPerMonth: 50, features: { exportFormats: ['pptx', 'pdf', 'png', 'jpg', 'html'], livePreview: true, modelChoice: true, modelTiers: ['starter', 'premium', 'frontier'], aiEdits: true } })
  })

  it('prices come from the DB and follow the server-detected country, not a client value', async () => {
    const usd = await json(await app_get('/plans'))
    expect(usd.data.currency).toBe('USD')
    // the US-dollar and the annual prices are provisional (not yet decided by the owner): $10 / $19 / $35 a month, annual = monthly × 12 × 0.80
    expect(usd.data.plans[1].prices).toEqual([{ interval: 'month', amountMinor: 1000, currency: 'USD' }, { interval: 'year', amountMinor: 9600, currency: 'USD' }])
    expect(usd.data.plans[2].prices).toEqual([{ interval: 'month', amountMinor: 1900, currency: 'USD' }, { interval: 'year', amountMinor: 18240, currency: 'USD' }])
    expect(usd.data.plans[3].prices[0]).toEqual({ interval: 'month', amountMinor: 3500, currency: 'USD' })
    const inr = await json(await app_get('/plans', { 'x-debug-country': 'IN' }))
    expect(inr.data.currency).toBe('INR')
    expect(inr.data.plans[1].prices).toEqual([{ interval: 'month', amountMinor: 30000, currency: 'INR' }, { interval: 'year', amountMinor: 288000, currency: 'INR' }]) // ₹300/mo
    expect(inr.data.plans[2].prices[0]).toEqual({ interval: 'month', amountMinor: 65000, currency: 'INR' }) // ₹650/mo
    expect(inr.data.plans[3].prices[0]).toEqual({ interval: 'month', amountMinor: 120000, currency: 'INR' }) // ₹1,200/mo
    // a query-string "currency" is simply ignored
    const spoof = await json(await app_get('/plans?currency=INR'))
    expect(spoof.data.currency).toBe('USD')
  })
})

describe('entitlements & gates', () => {
  it('new users are Starter with 100 credits, granted exactly once', async () => {
    const u = await signUp('ent')
    const a = await getEntitlements(u.id)
    const b = await getEntitlements(u.id)
    expect(a.plan.id).toBe('starter')
    expect(a.credits.balance).toBe(100)
    expect(b.credits.balance).toBe(100)
    expect((await db.select().from(creditLedger).where(eq(creditLedger.userId, u.id))).filter((r) => r.reason === 'plan_grant')).toHaveLength(1)
  })

  it('upgrading grants the new plan allowance and removes the watermark', async () => {
    for (const [plan, credits] of [['pro', 900], ['gold', 2000], ['premium', 3700]] as const) {
      const u = await signUp('ent')
      await getEntitlements(u.id)
      await setPlan(u.id, plan)
      const ent = await getEntitlements(u.id)
      expect(ent.plan.id).toBe(plan)
      expect(ent.credits.balance).toBe(credits)
      expect(ent.features.watermark).toBe(false)
    }
  })

  it('an expired subscription falls back to Starter', async () => {
    const u = await signUp('ent')
    await setPlan(u.id, 'pro')
    const future = new Date(Date.now() + 40 * 864e5)
    expect((await getEntitlements(u.id, future)).plan.id).toBe('starter')
  })

  it('Starter cannot export — through the API; Pro passes the gate for its own formats only', async () => {
    const free = await signUp('gate')
    const res = await api(free.cookie, 'POST', '/exports', { presentationId: 'x', format: 'pptx' })
    expect(res.status).toBe(403)
    expect((await json(res)).error.code).toBe('UPGRADE_REQUIRED')

    const pro = await signUp('gate')
    await setPlan(pro.id, 'pro')
    // allowed → real behaviour: PPTX is built server-side, the other formats are authorised for in-browser rendering
    const created = await json(await api(pro.cookie, 'POST', '/presentations', { templateId: 'pitch-launchpad', title: 'Export test' }))
    const deckId = created.data.id as string
    const pdf = await api(pro.cookie, 'POST', '/exports', { presentationId: deckId, format: 'pdf' })
    expect(pdf.status).toBe(200)
    expect((await json(pdf)).data).toMatchObject({ mode: 'client', format: 'pdf', title: 'Export test' })
    const pptx = await api(pro.cookie, 'POST', '/exports', { presentationId: deckId, format: 'pptx' })
    expect(pptx.status).toBe(200)
    expect(pptx.headers.get('content-type')).toContain('presentationml.presentation')
    expect(pptx.headers.get('content-disposition')).toContain('Export-test.pptx')
    const bytes = new Uint8Array(await pptx.arrayBuffer())
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]) // a zip (.pptx)
    // Pro has PDF, PPTX and JPEG; PNG and HTML are Gold and above
    for (const format of ['png', 'html']) expect((await api(pro.cookie, 'POST', '/exports', { presentationId: deckId, format })).status, format).toBe(403)
    expect((await api(pro.cookie, 'POST', '/exports', { presentationId: 'does-not-exist', format: 'pdf' })).status).toBe(404)
    expect((await api(free.cookie, 'POST', '/exports', { presentationId: deckId, format: 'pptx' })).status).toBe(403) // not theirs and not their plan
    const gold = await signUp('gate'); await setPlan(gold.id, 'gold')
    const own = await json(await api(gold.cookie, 'POST', '/presentations', { templateId: 'pitch-launchpad', title: 'Gold deck' }))
    expect((await api(gold.cookie, 'POST', '/exports', { presentationId: own.data.id, format: 'html' })).status).toBe(200)
  })

  it('model tier, AI edits, live preview and export formats are gated per plan', async () => {
    const free = await signUp('gate'), pro = await signUp('gate'), gold = await signUp('gate'), premium = await signUp('gate')
    await setPlan(pro.id, 'pro'); await setPlan(gold.id, 'gold'); await setPlan(premium.id, 'premium')
    const [f, p, g, pr] = await Promise.all([free, pro, gold, premium].map((u) => getEntitlements(u.id)))
    // Starter, Pro and Gold use their own Gemini models (starter credit class); only Premium reaches the premium and frontier classes
    for (const e of [f!, p!, g!]) {
      expect((await gate(() => assertModelTier(e, 'premium')))?.code).toBe('UPGRADE_REQUIRED')
      expect((await gate(() => assertModelTier(e, 'frontier')))?.code).toBe('UPGRADE_REQUIRED')
    }
    expect(await gate(() => assertModelTier(pr!, 'premium'))).toBeNull()
    expect(await gate(() => assertModelTier(pr!, 'frontier'))).toBeNull()
    expect((await gate(() => assertAiEdits(f!)))?.code).toBe('UPGRADE_REQUIRED') // Starter has no AI edits
    expect(await gate(() => assertAiEdits(p!))).toBeNull()
    expect((await gate(() => assertLivePreview(f!)))?.code).toBe('UPGRADE_REQUIRED') // Starter cannot present or share
    for (const e of [p!, g!, pr!]) expect(await gate(() => assertLivePreview(e))).toBeNull()
    expect((await gate(() => assertExport(p!, 'png')))?.code).toBe('UPGRADE_REQUIRED')
    expect(await gate(() => assertExport(p!, 'jpg'))).toBeNull()
    expect(await gate(() => assertExport(g!, 'png'))).toBeNull()
    expect(await gate(() => assertExport(pr!, 'html'))).toBeNull()
  })

  it('slides per deck: Starter 10, Pro 15, Gold 25', async () => {
    const body = (n: number) => ({ prompt: 'A long deck about our product roadmap and strategy', slideCount: n, idempotencyKey: `k-${rid()}-${rid()}` })
    for (const [plan, cap] of [['starter', 10], ['pro', 15], ['gold', 25]] as const) {
      const u = await signUp('cap'); await setPlan(u.id, plan)
      const over = await api(u.cookie, 'POST', '/generation/jobs', body(cap + 1))
      expect(over.status, plan).toBe(403)
      expect((await json(over)).error.code).toBe('UPGRADE_REQUIRED')
      expect((await api(u.cookie, 'POST', '/generation/jobs', body(cap))).status, plan).toBe(201)
    }
  })

  it('presentations per month: Starter 5, Pro 15, Gold 50', async () => {
    for (const [plan, cap] of [['starter', 5], ['pro', 15], ['gold', 50]] as const) {
      const u = await signUp('quota'); await setPlan(u.id, plan)
      await db.insert(presentation).values(Array.from({ length: cap }, () => ({ id: nanoid(), userId: u.id, title: 'x' })))
      const res = await api(u.cookie, 'POST', '/generation/jobs', { prompt: 'One more deck than allowed', slideCount: 5, idempotencyKey: `k-${rid()}-${rid()}` })
      expect(res.status, plan).toBe(429)
      expect((await json(res)).error.code).toBe('LIMIT_REACHED')
    }
  })
})

describe('credits', () => {
  it('never overdraws under concurrency: 10 parallel reserves of 30 on 100 credits → exactly 3 succeed', async () => {
    const u = await signUp('cc')
    await getEntitlements(u.id)
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => reserveCredits(u.id, 30, 'job', `race-${u.id}-${i}`)))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3)
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    expect(rejected.every((r) => r.reason instanceof GateError && r.reason.code === 'INSUFFICIENT_CREDITS')).toBe(true)
    expect(await balance(u.id)).toBe(10)
  })

  it('reserve is idempotent per ref; refund restores once; refunding nothing is a no-op', async () => {
    const u = await signUp('cc')
    await getEntitlements(u.id)
    const ref = `j-${u.id}` // unique per run: ledger keys are global and permanent
    await reserveCredits(u.id, 40, 'job', ref)
    await reserveCredits(u.id, 40, 'job', ref) // retry of the same job
    expect(await balance(u.id)).toBe(60)
    await refundCredits(u.id, 'job', ref)
    await refundCredits(u.id, 'job', ref)
    expect(await balance(u.id)).toBe(100)
    await refundCredits(u.id, 'job', `never-${u.id}`)
    expect(await balance(u.id)).toBe(100)
  })

  it('the balance can never go negative, even if application code is wrong (CHECK constraint)', async () => {
    const u = await signUp('cc')
    await getEntitlements(u.id)
    await expect(db.update(creditBalance).set({ balance: -1 }).where(eq(creditBalance.userId, u.id))).rejects.toThrow()
  })

  it('credit ledger is append-only', async () => {
    const u = await signUp('cc')
    await getEntitlements(u.id)
    await expect(db.update(creditLedger).set({ delta: 999 }).where(eq(creditLedger.userId, u.id))).rejects.toThrow()
    await expect(db.delete(creditLedger).where(eq(creditLedger.userId, u.id))).rejects.toThrow()
  })

  it('jobs charge up front, refuse when short (402), and cancelling refunds', async () => {
    const u = await signUp('job')
    const mk = (n: number) => api(u.cookie, 'POST', '/generation/jobs', { prompt: 'A 10 slide deck about onboarding customers', slideCount: n, idempotencyKey: `k-${rid()}-${rid()}` })
    const a = await mk(10) // 10 slides × 2 credits (the Gemini Flash credit class) = 20
    const b = await mk(10)
    expect([a.status, b.status]).toEqual([201, 201])
    expect(await balance(u.id)).toBe(60)
    expect((await mk(10)).status).toBe(429) // at most two presentations in progress per account: the queue is shared
    await db.update(generationJob).set({ status: 'completed' }).where(eq(generationJob.id, (await json(b)).data.id)) // b finishes: a slot frees up
    await reserveCredits(u.id, 50, 'job', `drain-${u.id}`) // the person spent most of what was left
    const c = await mk(10)
    expect(c.status).toBe(402)
    expect((await json(c)).error).toMatchObject({ code: 'INSUFFICIENT_CREDITS', details: { needed: 20, balance: 10 } })

    const jobId = (await json(a)).data.id
    expect((await api(u.cookie, 'POST', `/generation/jobs/${jobId}/cancel`)).status).toBe(200)
    expect(await balance(u.id)).toBe(30) // 10 left + the 20 of the cancelled deck refunded
    await db.update(generationJob).set({ status: 'cancelled' }).where(eq(generationJob.userId, u.id))
  })

  it('a retried create request (same idempotency key) is charged once', async () => {
    const u = await signUp('idem')
    const body = { prompt: 'An 8 slide deck about security basics', slideCount: 8, idempotencyKey: `k-${rid()}-${rid()}` }
    await api(u.cookie, 'POST', '/generation/jobs', body)
    await api(u.cookie, 'POST', '/generation/jobs', body)
    expect(await balance(u.id)).toBe(100 - 16)
    await db.update(generationJob).set({ status: 'cancelled' }).where(eq(generationJob.userId, u.id))
  })
})

async function app_get(path: string, headers: Record<string, string> = {}) {
  const { app } = await import('../app.ts')
  return app.request(`/api/v1${path}`, { headers })
}
