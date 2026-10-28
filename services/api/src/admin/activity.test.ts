import { eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../db/index.ts'
import { aiUsageEvent, user } from '../db/schema.ts'
import { env } from '../env.ts'
import { api, json, signUp } from '../test-utils.ts'

/** Private window (random per run) so sums are exact on the shared test DB. It lives in the 1970s; the other admin tests use the 1990s and 2000+, so two files can never share a window. */
const DAY = 864e5
const base = Date.UTC(1970, 0, 1) + Math.floor(Math.random() * 3000) * DAY
const at = (h: number) => new Date(base + h * 3600e3)
let admin: { id: string; cookie: string }, customer: { id: string }
const events: string[] = []

beforeAll(async () => {
  admin = await signUp('act-admin'); customer = await signUp('act-user')
  await db.update(user).set({ role: 'admin' }).where(eq(user.id, admin.id))
  await db.update(user).set({ email: `${customer.id}@customer.test` }).where(eq(user.id, customer.id)) // @example.com accounts are treated as automated tests and left out of the report
})
afterAll(async () => {
  if (events.length) await db.delete(aiUsageEvent).where(inArray(aiUsageEvent.id, events)).catch(() => {}) // immutable ledger: best effort
  await db.delete(user).where(inArray(user.id, [admin.id, customer.id]))
})

const ev = async (o: { userId: string | null; requestType: string; cost: string; jobId?: string; images?: number }) => {
  const id = nanoid(); events.push(id)
  await db.insert(aiUsageEvent).values({ id, userId: o.userId, jobId: o.jobId ?? null, provider: 'vertex', model: 'm', requestType: o.requestType, imageCount: o.images ?? 0, latencyMs: 1, status: 'success', providerCostUsd: o.cost, environment: 'development', createdAt: at(2) })
}

describe('owner activity cost report', () => {
  it('splits spend into deck creation, edits, images and internal (no-user) work', async () => {
    await ev({ userId: customer.id, requestType: 'slide_content', cost: '0.10', jobId: 'job-x' })
    await ev({ userId: customer.id, requestType: 'outline_generation', cost: '0.05', jobId: 'job-x' })
    await ev({ userId: customer.id, requestType: 'ai_edit', cost: '0.02' })
    await ev({ userId: customer.id, requestType: 'image_generation', cost: '0.04', images: 1 })
    await ev({ userId: null, requestType: 'image_generation', cost: '1.00', images: 1 }) // template-photo script: not a customer action

    const r = (await json(await api(admin.cookie, 'GET', `/admin/margin/activity?from=${at(0).toISOString()}&to=${at(5).toISOString()}`))).data
    const by = (a: string) => r.byAction.find((x: { action: string }) => x.action === a)
    expect(by('deck_generation').costUsd).toBeCloseTo(0.15, 6)
    expect(by('deck_generation').jobs).toBe(1)
    expect(by('ai_edit').costInr).toBeCloseTo(0.02 * env.INR_PER_USD, 6)
    expect(by('image').images).toBe(1)
    expect(by('internal').costUsd).toBeCloseTo(1.0, 6)
    expect(r.totalCostUsd).toBeCloseTo(1.21, 6)
    expect(r.recentJobs[0].costUsd).toBeCloseTo(0.15, 6)
  })

  it('is owner-only and the plan economics never divide by zero', async () => {
    expect((await api(customer.id ? (await signUp('act-plain')).cookie : '', 'GET', '/admin/margin/activity')).status).toBe(403)
    const e = (await json(await api(admin.cookie, 'GET', '/admin/margin/plan-economics'))).data
    expect(e.plans.length).toBeGreaterThan(0)
    for (const p of e.plans) for (const v of [p.revenueInrPerCredit, p.marginInrIfFullyUsed]) expect(v === null || Number.isFinite(v)).toBe(true)
  })
})
