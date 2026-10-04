import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { aiUsageEvent, auditLog, user } from '../db/schema.ts'
import { api, json, origin, rid, signUp } from '../test-utils.ts'

async function adminUser() {
  const u = await signUp('adm')
  await db.update(user).set({ role: 'admin' }).where(eq(user.id, u.id))
  return u
}
const ev = (userId: string, o: Partial<typeof aiUsageEvent.$inferInsert> = {}): typeof aiUsageEvent.$inferInsert => ({
  id: nanoid(), userId, provider: 'openrouter', model: 'anthropic/claude-sonnet-4.6', requestType: 'slide_content',
  inputTokens: 1000, cachedTokens: 100, outputTokens: 500, reasoningTokens: 0, latencyMs: 2000, status: 'success',
  providerCostUsd: '0.01', providerReportedCostUsd: '0.0105', environment: 'development', ...o,
})

describe('admin access control', () => {
  it('anonymous → 401, normal user → 403 on every admin route', async () => {
    const u = await signUp('adm')
    for (const path of ['/admin/usage/summary', '/admin/usage/timeseries', '/admin/usage/breakdown?by=model']) {
      expect((await app.request(`/api/v1${path}`)).status).toBe(401)
      expect((await api(u.cookie, 'GET', path)).status).toBe(403)
    }
  })
  it('a client cannot make itself admin (role is not an input)', async () => {
    const res = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ email: `x-${rid()}@example.com`, password: 'password123', name: 'X', role: 'admin' }) })
    const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
    expect((await api(cookie, 'GET', '/admin/usage/summary')).status).toBe(403)
  })
})

describe('usage analytics are exact sums of the ledger', () => {
  it('summary, breakdown and timeseries match the raw rows (isolated by userId filter)', async () => {
    const admin = await adminUser()
    const uid = `analytics-${rid()}`
    await db.insert(aiUsageEvent).values([
      ev(uid),
      ev(uid, { model: 'google/gemini-3.6-flash', provider: 'openrouter', inputTokens: 2000, outputTokens: 1000, reasoningTokens: 300, providerCostUsd: '0.02', providerReportedCostUsd: null }),
      ev(uid, { status: 'error', inputTokens: 0, outputTokens: 0, cachedTokens: 0, providerCostUsd: '0', providerReportedCostUsd: null, jobId: 'job-x' }),
    ])
    const s = (await json(await api(admin.cookie, 'GET', `/admin/usage/summary?userId=${uid}`))).data
    expect(s).toMatchObject({ calls: 3, successCalls: 2, failedCalls: 1, inputTokens: 3000, outputTokens: 1500, cachedTokens: 200, reasoningTokens: 300, totalTokens: 4800, activeUsers: 1 })
    expect(s.failureRate).toBeCloseTo(1 / 3, 5)
    expect(s.costUsd).toBeCloseTo(0.03, 8)
    expect(s.reportedCostUsd).toBeCloseTo(0.0105, 8)
    expect(s.reportedCalls).toBe(1)

    const b = (await json(await api(admin.cookie, 'GET', `/admin/usage/breakdown?by=model&userId=${uid}`))).data
    expect(b.map((r: any) => r.key).sort()).toEqual(['anthropic/claude-sonnet-4.6', 'google/gemini-3.6-flash'])
    expect(b.find((r: any) => r.key === 'google/gemini-3.6-flash')).toMatchObject({ calls: 1, totalTokens: 3300 })
    expect(b.reduce((a: number, r: any) => a + r.calls, 0)).toBe(3)

    const t = (await json(await api(admin.cookie, 'GET', `/admin/usage/timeseries?bucket=day&userId=${uid}`))).data
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ calls: 3, inputTokens: 3000, outputTokens: 1500, failed: 1 })
  })

  it('filters: provider, model, status, request type, environment, date range', async () => {
    const admin = await adminUser()
    const uid = `filters-${rid()}`
    await db.insert(aiUsageEvent).values([ev(uid, { provider: 'vertex' }), ev(uid, { provider: 'openrouter' }), ev(uid, { status: 'error' }), ev(uid, { requestType: 'ai_edit' }), ev(uid, { environment: 'production' }), ev(uid, { createdAt: new Date(Date.now() - 90 * 864e5) })])
    const count = async (q: string) => (await json(await api(admin.cookie, 'GET', `/admin/usage/summary?userId=${uid}&${q}`))).data.calls
    expect(await count('')).toBe(5) // the 90-day-old row is outside the default 30-day window
    expect(await count('provider=vertex')).toBe(1)
    expect(await count('status=error')).toBe(1)
    expect(await count('requestType=ai_edit')).toBe(1)
    expect(await count('environment=production')).toBe(1)
    expect(await count(`from=${new Date(Date.now() - 120 * 864e5).toISOString()}`)).toBe(6)
  })

  it('country comes from the signup edge header and can be filtered/grouped', async () => {
    const admin = await adminUser()
    const res = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'x-debug-country': 'IN' }, body: JSON.stringify({ email: `in-${rid()}@example.com`, password: 'password123', name: 'Indian User' }) })
    const indian = ((await res.json()) as { user: { id: string } }).user.id
    await db.insert(aiUsageEvent).values([ev(indian), ev(indian)])
    const s = (await json(await api(admin.cookie, 'GET', `/admin/usage/summary?userId=${indian}&country=IN`))).data
    expect(s.calls).toBe(2)
    const none = (await json(await api(admin.cookie, 'GET', `/admin/usage/summary?userId=${indian}&country=US`))).data
    expect(none.calls).toBe(0)
    const b = (await json(await api(admin.cookie, 'GET', `/admin/usage/breakdown?by=country&userId=${indian}`))).data
    expect(b[0]).toMatchObject({ key: 'IN', calls: 2 })
  })

  it('is injection-safe: hostile filter values match nothing; unknown dimensions are rejected', async () => {
    const admin = await adminUser()
    const evil = encodeURIComponent("x' OR '1'='1")
    expect((await json(await api(admin.cookie, 'GET', `/admin/usage/summary?model=${evil}`))).data.calls).toBe(0)
    expect((await api(admin.cookie, 'GET', `/admin/usage/breakdown?by=${encodeURIComponent('model; DROP TABLE ai_usage_event')}`)).status).toBe(400)
  })

  it('every admin read is audited', async () => {
    const admin = await adminUser()
    await api(admin.cookie, 'GET', '/admin/usage/summary')
    await new Promise((r) => setTimeout(r, 200))
    const rows = await db.select().from(auditLog).where(eq(auditLog.actorUserId, admin.id))
    expect(rows.some((r) => r.action === 'admin.usage/summary')).toBe(true)
    await expect(db.delete(auditLog).where(eq(auditLog.actorUserId, admin.id))).rejects.toThrow() // append-only
  })
})
