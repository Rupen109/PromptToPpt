import { and, gte, like, sql } from 'drizzle-orm'
import type { MiddlewareHandler } from 'hono'
import { db } from '../db/index.ts'
import { aiUsageEvent } from '../db/schema.ts'
import { checkBudget } from '../ai/budget.ts'
import { env } from '../env.ts'
import { clientIp, rateLimit } from '../middleware/rate-limit.ts'

/**
 * Cost guard for the public free tools. They call a paid model for visitors who have not signed up, so three independent caps apply:
 *  1. per visitor: a short burst limit and a daily call cap (per IP, in memory);
 *  2. all free tools together: at most FREE_TOOLS_USD_DAY of provider spend in any rolling 24h, read from the usage ledger
 *     (`free_*` request types) — a botnet with many IPs can still only burn that much;
 *  3. the app-wide AI circuit breaker, which also pauses free tools.
 * When any cap trips the tool says it is busy; signed-in customers are never affected by 1 or 2.
 */
const TTL_MS = 15_000
let cache: { at: number; usd: number } | null = null
let cap = env.FREE_TOOLS_USD_DAY
/** tests only: the ledger is immutable, so a test cannot add a huge cost row without poisoning the next run */
export const setFreeToolsCap = (usd: number = env.FREE_TOOLS_USD_DAY) => { cap = usd; cache = null }
export const resetFreeToolsCache = () => { cache = null; daily.clear() }

export async function freeToolsSpendDay(now = Date.now()): Promise<number> {
  if (cache && now - cache.at < TTL_MS) return cache.usd
  const [row] = await db.select({ s: sql<string>`coalesce(sum(${aiUsageEvent.providerCostUsd}), 0)` }).from(aiUsageEvent)
    .where(and(gte(aiUsageEvent.createdAt, new Date(now - 86_400_000)), like(aiUsageEvent.requestType, 'free\\_%')))
  cache = { at: now, usd: Number(row?.s ?? 0) }
  return cache.usd
}

const daily = new Map<string, { day: number; n: number }>()
const busy = (c: Parameters<MiddlewareHandler>[0]) => c.json({ success: false, error: { code: 'BUSY', message: 'The free tools are very busy right now. Please try again in a little while — or sign up for instant access.' } }, 503)

export const freeToolBurst = rateLimit({ windowMs: 60_000, max: 6 })

export const freeToolGuard: MiddlewareHandler = async (c, next) => {
  const ip = clientIp(c)
  const day = Math.floor(Date.now() / 86_400_000)
  const hit = daily.get(ip)
  const entry = hit && hit.day === day ? hit : { day, n: 0 }
  if (entry.n >= env.FREE_TOOLS_IP_DAY) return c.json({ success: false, error: { code: 'DAILY_LIMIT', message: "You've used today's free runs. Sign up free to keep going, or come back tomorrow." } }, 429)
  if ((await freeToolsSpendDay()) >= cap || !(await checkBudget(undefined)).ok) return busy(c)
  entry.n++ // counted before the model call so a failing request cannot be retried for free forever
  daily.set(ip, entry)
  if (daily.size > 20_000) daily.clear()
  await next()
}
