import { afterEach, describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import { resetBudgetCache } from '../ai/budget.ts'
import { db } from '../db/index.ts'
import { aiUsageEvent } from '../db/schema.ts'
import { env } from '../env.ts'
import { api, json, setPlan, signUp } from '../test-utils.ts'

const saved = { hour: env.AI_BUDGET_USD_HOUR, day: env.AI_BUDGET_USD_DAY, user: env.AI_USER_USD_DAY }
const spend = async (userId: string | null, usd: number) => {
  const id = nanoid()
  await db.insert(aiUsageEvent).values({ id, userId, provider: 'mock', model: 'm', requestType: 'slide_content', latencyMs: 1, status: 'success', providerCostUsd: String(usd), environment: 'development' })
}
afterEach(async () => {
  env.AI_BUDGET_USD_HOUR = saved.hour; env.AI_BUDGET_USD_DAY = saved.day; env.AI_USER_USD_DAY = saved.user
  // the usage ledger is append-only (a DB trigger forbids deletes): the small test rows stay and are harmless under the default budgets
  resetBudgetCache()
})

const analyze = (cookie: string) => api(cookie, 'POST', '/generation/analyze', { prompt: 'A short deck about coffee roasting for a local shop owner', sourceIds: [] })

describe('AI spend circuit breaker (security S3)', () => {
  it('a single account that has burned its daily budget is stopped (429) while others keep working', async () => {
    const abuser = await signUp('brk'); await setPlan(abuser.id, 'pro')
    const honest = await signUp('brk'); await setPlan(honest.id, 'pro')
    env.AI_USER_USD_DAY = 0.5
    await spend(abuser.id, 0.6)
    resetBudgetCache()
    const r = await analyze(abuser.cookie)
    expect(r.status).toBe(429)
    expect((await json(r)).error.code).toBe('DAILY_AI_LIMIT')
    expect((await analyze(honest.cookie)).status).toBe(200)
  })
  it('when the shared budget is exhausted AI pauses for everyone (503 AI_PAUSED) on every costly route, however many accounts exist', async () => {
    const u = await signUp('brk'); await setPlan(u.id, 'pro')
    await spend(null, 1)
    env.AI_BUDGET_USD_DAY = 0.5
    resetBudgetCache()
    for (const [method, path, body] of [
      ['POST', '/generation/analyze', { prompt: 'A short deck about coffee roasting for a local shop', sourceIds: [] }],
      ['POST', '/generation/jobs', { prompt: 'A short deck about coffee roasting for a local shop', idempotencyKey: nanoid(), slideCount: 5 }],
    ] as const) {
      const r = await api(u.cookie, method, path, body)
      expect(r.status, path).toBe(503)
      expect((await json(r)).error.code).toBe('AI_PAUSED')
    }
  })
  it('stays out of the way under budget', async () => {
    const u = await signUp('brk'); await setPlan(u.id, 'pro')
    expect((await analyze(u.cookie)).status).toBe(200)
  })
})
