import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../db/index.ts'
import { creditBalance, creditLedger, generationJob, presentation } from '../db/schema.ts'
import { api, json, rid, setPlan, signUp } from '../test-utils.ts'
import { refundCredits, reserveCredits } from './credits.ts'
import { assertAiEdits, assertExport, assertModelTier, getEntitlements } from './entitlements.ts'
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

describe('plan catalogue (matches the product spec)', () => {
  it('Starter / Pro / Gold have exactly the agreed features', async () => {
    const res = await json(await app_get('/plans'))
    const [starter, pro, gold] = res.data.plans
    expect(res.data.plans.map((p: any) => p.id)).toEqual(['starter', 'pro', 'gold'])
    expect(starter).toMatchObject({ monthlyCredits: 100, maxSlides: 20, maxImagesPerPresentation: 3, maxImagesPerMonth: 6, features: { watermark: true, exportFormats: [], aiEdits: true, advancedEditor: false, advancedSharing: false, modelTiers: ['starter'] } })
    expect(pro).toMatchObject({ monthlyCredits: 3000, maxPresentationsPerMonth: 50, maxImagesPerPresentation: 10, features: { watermark: false, aiEdits: true, advancedEditor: true, premiumTemplates: true, advancedSharing: true, exportFormats: ['pptx', 'pdf', 'png', 'jpg', 'html'], modelTiers: ['starter', 'premium'], support: 'whatsapp' } })
    expect(gold).toMatchObject({ monthlyCredits: 10000, features: { modelTiers: ['starter', 'premium', 'frontier'], brandKit: true, knowledgeBase: true, speed: 'ultra' } })
  })

  it('prices come from the DB and follow the server-detected country, not a client value', async () => {
    const usd = await json(await app_get('/plans'))
    expect(usd.data.currency).toBe('USD')
    expect(usd.data.plans[1].prices).toEqual([{ interval: 'month', amountMinor: 1500, currency: 'USD' }, { interval: 'year', amountMinor: 14400, currency: 'USD' }]) // $15/mo or $144/yr
    expect(usd.data.plans[2].prices).toEqual([{ interval: 'month', amountMinor: 3000, currency: 'USD' }, { interval: 'year', amountMinor: 28800, currency: 'USD' }])
    const inr = await json(await app_get('/plans', { 'x-debug-country': 'IN' }))
    expect(inr.data.currency).toBe('INR')
    expect(inr.data.plans[1].prices).toEqual([{ interval: 'month', amountMinor: 49900, currency: 'INR' }, { interval: 'year', amountMinor: 479000, currency: 'INR' }]) // ₹499/mo
    expect(inr.data.plans[2].prices[0]).toEqual({ interval: 'month', amountMinor: 120000, currency: 'INR' }) // ₹1,200/mo
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
    const u = await signUp('ent')
    await getEntitlements(u.id)
    await setPlan(u.id, 'pro')
    const ent = await getEntitlements(u.id)
    expect(ent.plan.id).toBe('pro')
    expect(ent.credits.balance).toBe(3000)
    expect(ent.features.watermark).toBe(false)
  })

  it('an expired subscription falls back to Starter', async () => {
    const u = await signUp('ent')
    await setPlan(u.id, 'pro')
    const future = new Date(Date.now() + 40 * 864e5)
    expect((await getEntitlements(u.id, future)).plan.id).toBe('starter')
  })

  it('Starter cannot export — through the API; Pro passes the gate', async () => {
    const free = await signUp('gate')
    const res = await api(free.cookie, 'POST', '/exports', { presentationId: 'x', format: 'pptx' })
    expect(res.status).toBe(403)
    expect((await json(res)).error.code).toBe('UPGRADE_REQUIRED')

    const pro = await signUp('gate')
    await setPlan(pro.id, 'pro')
    // allowed → real behaviour: PPTX is built server-side, the other formats are authorised for in-browser rendering
    const created = await json(await api(pro.cookie, 'POST', '/presentations', { templateId: 'pitch-launchpad', title: 'Export test' }))
    const deckId = created.data.id as string
    const html = await api(pro.cookie, 'POST', '/exports', { presentationId: deckId, format: 'html' })
    expect(html.status).toBe(200)
    expect((await json(html)).data).toMatchObject({ mode: 'client', format: 'html', title: 'Export test' })
    const pptx = await api(pro.cookie, 'POST', '/exports', { presentationId: deckId, format: 'pptx' })
    expect(pptx.status).toBe(200)
    expect(pptx.headers.get('content-type')).toContain('presentationml.presentation')
    expect(pptx.headers.get('content-disposition')).toContain('Export-test.pptx')
    const bytes = new Uint8Array(await pptx.arrayBuffer())
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]) // a zip (.pptx)
    expect((await api(pro.cookie, 'POST', '/exports', { presentationId: 'does-not-exist', format: 'html' })).status).toBe(404)
    expect((await api(free.cookie, 'POST', '/exports', { presentationId: deckId, format: 'pptx' })).status).toBe(403) // not theirs and not their plan
  })

  it('model tier, AI edits and export formats are gated per plan', async () => {
    const free = await signUp('gate'), pro = await signUp('gate'), gold = await signUp('gate')
    await setPlan(pro.id, 'pro'); await setPlan(gold.id, 'gold')
    const [f, p, g] = await Promise.all([free, pro, gold].map((u) => getEntitlements(u.id)))
    expect((await gate(() => assertModelTier(f!, 'premium')))?.code).toBe('UPGRADE_REQUIRED')
    expect(await gate(() => assertModelTier(p!, 'premium'))).toBeNull()
    expect((await gate(() => assertModelTier(p!, 'frontier')))?.code).toBe('UPGRADE_REQUIRED')
    expect(await gate(() => assertModelTier(g!, 'frontier'))).toBeNull()
    expect(await gate(() => assertAiEdits(f!))).toBeNull() // Starter may use AI edits on its credits
    expect(await gate(() => assertAiEdits(p!))).toBeNull()
    expect((await gate(() => assertAiEdits({ ...f!, features: { ...f!.features, aiEdits: false } })))?.code).toBe('UPGRADE_REQUIRED') // the flag still works if the owner turns it off
    expect(await gate(() => assertExport(g!, 'png'))).toBeNull()
  })

  it('Starter is capped at 20 slides; Pro can go higher', async () => {
    const free = await signUp('cap')
    const body = (n: number) => ({ prompt: 'A long deck about our product roadmap and strategy', slideCount: n, idempotencyKey: `k-${rid()}-${rid()}` })
    const over = await api(free.cookie, 'POST', '/generation/jobs', body(21))
    expect(over.status).toBe(403)
    expect((await json(over)).error.code).toBe('UPGRADE_REQUIRED')
    expect((await api(free.cookie, 'POST', '/generation/jobs', body(20))).status).toBe(201)
    const pro = await signUp('cap'); await setPlan(pro.id, 'pro')
    expect((await api(pro.cookie, 'POST', '/generation/jobs', body(30))).status).toBe(201)
  })

  it('Pro is capped at 50 presentations per month', async () => {
    const u = await signUp('quota'); await setPlan(u.id, 'pro')
    await db.insert(presentation).values(Array.from({ length: 50 }, () => ({ id: nanoid(), userId: u.id, title: 'x' })))
    const res = await api(u.cookie, 'POST', '/generation/jobs', { prompt: 'One more deck than allowed', idempotencyKey: `k-${rid()}-${rid()}` })
    expect(res.status).toBe(429)
    expect((await json(res)).error.code).toBe('LIMIT_REACHED')
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
    const mk = (n: number) => api(u.cookie, 'POST', '/generation/jobs', { prompt: 'A 20 slide deck about onboarding customers', slideCount: n, idempotencyKey: `k-${rid()}-${rid()}` })
    const a = await mk(20) // 20 slides × 2 credits (Starter) = 40
    const b = await mk(20)
    expect([a.status, b.status]).toEqual([201, 201])
    expect(await balance(u.id)).toBe(20)
    expect((await mk(20)).status).toBe(429) // at most two presentations in progress per account: the queue is shared
    await db.update(generationJob).set({ status: 'completed' }).where(eq(generationJob.id, (await json(b)).data.id)) // b finishes: a slot frees up
    const c = await mk(20)
    expect(c.status).toBe(402)
    expect((await json(c)).error).toMatchObject({ code: 'INSUFFICIENT_CREDITS', details: { needed: 40, balance: 20 } })

    const jobId = (await json(a)).data.id
    expect((await api(u.cookie, 'POST', `/generation/jobs/${jobId}/cancel`)).status).toBe(200)
    expect(await balance(u.id)).toBe(60) // refunded
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
