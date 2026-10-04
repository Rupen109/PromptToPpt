import type { Context } from 'hono'
import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { aiUsageEvent } from '../db/schema.ts'
import { env } from '../env.ts'

/**
 * Automatic spend circuit breaker. The usage ledger records the real provider cost of every AI call; before any new costly request
 * we compare the last hour / last 24 hours (all users) and the last 24 hours (this user) with budgets from the environment.
 *  · global budget exceeded → AI is paused for everyone (503 AI_PAUSED) until the window slides — the owner's cloud bill has a ceiling no
 *    matter how many accounts an attacker creates;
 *  · per-user budget exceeded → that account is paused (429 DAILY_AI_LIMIT) — one abuser cannot spend the shared budget.
 * Results are cached for a few seconds so the check costs one query per few seconds, not per request.
 */
const TTL_MS = 15_000
let globalCache: { at: number; hour: number; day: number } | null = null
const userCache = new Map<string, { at: number; day: number }>()
let lastAlert = 0

export const resetBudgetCache = () => { globalCache = null; userCache.clear(); lastAlert = 0 }


async function sumSince(since: Date, userId?: string): Promise<number> {
  const [row] = await db
    .select({ s: sql<string>`coalesce(sum(${aiUsageEvent.providerCostUsd}), 0)` })
    .from(aiUsageEvent)
    .where(userId ? and(gte(aiUsageEvent.createdAt, since), eq(aiUsageEvent.userId, userId)) : gte(aiUsageEvent.createdAt, since))
  return Number(row?.s ?? 0)
}

export interface Spend { hour: number; day: number; user: number }
export async function currentSpend(userId?: string, now = Date.now()): Promise<Spend> {
  if (!globalCache || now - globalCache.at > TTL_MS) {
    const [hour, day] = await Promise.all([sumSince(new Date(now - 3_600_000)), sumSince(new Date(now - 86_400_000))])
    globalCache = { at: now, hour, day }
  }
  let user = 0
  if (userId) {
    const hit = userCache.get(userId)
    if (hit && now - hit.at <= TTL_MS) user = hit.day
    else {
      user = await sumSince(new Date(now - 86_400_000), userId)
      if (userCache.size > 5000) userCache.clear()
      userCache.set(userId, { at: now, day: user })
    }
  }
  return { hour: globalCache.hour, day: globalCache.day, user }
}

export type BudgetVerdict = { ok: true } | { ok: false; scope: 'global' | 'user'; spend: Spend }
export async function checkBudget(userId: string | undefined, now = Date.now()): Promise<BudgetVerdict> {
  const spend = await currentSpend(userId, now)
  if (spend.hour >= env.AI_BUDGET_USD_HOUR || spend.day >= env.AI_BUDGET_USD_DAY) {
    if (now - lastAlert > 3_600_000) {
      lastAlert = now
      console.error(`[budget] AI spend circuit breaker TRIPPED: $${spend.hour.toFixed(2)}/h (cap ${env.AI_BUDGET_USD_HOUR}), $${spend.day.toFixed(2)}/24h (cap ${env.AI_BUDGET_USD_DAY}). AI is paused until the window slides; raise the budget or investigate usage in the owner dashboard.`)
    }
    return { ok: false, scope: 'global', spend }
  }
  if (userId && spend.user >= env.AI_USER_USD_DAY) return { ok: false, scope: 'user', spend }
  return { ok: true }
}

/** Route guard: the standard refusal Response when over budget, else null. Call it before reserving credits. */
export async function refuseIfOverBudget(c: Context, userId: string): Promise<Response | null> {
  const v = await checkBudget(userId)
  if (v.ok) return null
  if (v.scope === 'user') return c.json({ success: false, error: { code: 'DAILY_AI_LIMIT', message: "You've reached today's AI usage limit. It resets within 24 hours — your work is safe." } }, 429)
  return c.json({ success: false, error: { code: 'AI_PAUSED', message: "AI generation is at capacity right now. Please try again a little later — your work is safe." } }, 503)
}
