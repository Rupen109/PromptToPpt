import { sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.ts'

/**
 * Owner analytics over the immutable `ai_usage_event` ledger (spec §14). The ledger — not any provider dashboard —
 * is the source of truth; provider-reported cost is stored beside our computed cost for reconciliation.
 * All filters are bound parameters; the only raw SQL fragments come from fixed whitelists below.
 */

export const filtersSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  provider: z.string().max(40).optional(),
  model: z.string().max(120).optional(),
  requestType: z.string().max(40).optional(),
  environment: z.enum(['development', 'staging', 'production']).optional(),
  status: z.enum(['success', 'error']).optional(),
  userId: z.string().max(64).optional(),
  country: z.string().length(2).toUpperCase().optional(),
})
export type UsageFilters = z.infer<typeof filtersSchema>

const DAY = 864e5
export function resolveRange(f: UsageFilters, now = new Date()) {
  const to = f.to ?? new Date(now.getTime() + 1000)
  const from = f.from ?? new Date(to.getTime() - 30 * DAY)
  return { from, to }
}

/** `e` = ai_usage_event, `u` = user (left join: the ledger outlives users). */
function where(f: UsageFilters): SQL {
  const { from, to } = resolveRange(f)
  const c: SQL[] = [sql`e.created_at >= ${from} AND e.created_at < ${to}`]
  if (f.provider) c.push(sql`e.provider = ${f.provider}`)
  if (f.model) c.push(sql`e.model = ${f.model}`)
  if (f.requestType) c.push(sql`e.request_type = ${f.requestType}`)
  if (f.environment) c.push(sql`e.environment = ${f.environment}`)
  if (f.status) c.push(sql`e.status = ${f.status}`)
  if (f.userId) c.push(sql`e.user_id = ${f.userId}`)
  if (f.country) c.push(sql`u.country = ${f.country}`)
  return sql.join(c, sql` AND `)
}
const FROM = sql`FROM ai_usage_event e LEFT JOIN "user" u ON u.id = e.user_id`

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))

export async function summary(f: UsageFilters) {
  const r = await db.execute(sql`
    SELECT count(*)::int AS calls,
           count(*) FILTER (WHERE e.status = 'success')::int AS ok,
           count(*) FILTER (WHERE e.status = 'error')::int AS failed,
           coalesce(sum(e.input_tokens),0)::float8 AS input_tokens,
           coalesce(sum(e.output_tokens),0)::float8 AS output_tokens,
           coalesce(sum(e.cached_tokens),0)::float8 AS cached_tokens,
           coalesce(sum(e.reasoning_tokens),0)::float8 AS reasoning_tokens,
           coalesce(sum(e.image_count),0)::float8 AS images,
           coalesce(sum(e.provider_cost_usd),0)::float8 AS cost_usd,
           coalesce(sum(e.provider_reported_cost_usd),0)::float8 AS reported_cost_usd,
           count(*) FILTER (WHERE e.provider_reported_cost_usd IS NOT NULL)::int AS reported_calls,
           coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY e.latency_ms),0)::float8 AS p50_ms,
           coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY e.latency_ms),0)::float8 AS p95_ms,
           count(DISTINCT e.user_id)::int AS users,
           count(DISTINCT e.job_id)::int AS jobs
    ${FROM} WHERE ${where(f)}`)
  const x = r.rows[0] as Record<string, unknown>
  const inT = num(x['input_tokens']), outT = num(x['output_tokens']), reaT = num(x['reasoning_tokens'])
  const total = inT + outT + reaT
  const jobs = num(x['jobs'])
  const calls = num(x['calls'])
  return {
    calls, successCalls: num(x['ok']), failedCalls: num(x['failed']), failureRate: calls ? num(x['failed']) / calls : 0,
    inputTokens: inT, outputTokens: outT, cachedTokens: num(x['cached_tokens']), reasoningTokens: reaT, totalTokens: total, images: num(x['images']),
    costUsd: num(x['cost_usd']), reportedCostUsd: num(x['reported_cost_usd']), reportedCalls: num(x['reported_calls']),
    p50LatencyMs: Math.round(num(x['p50_ms'])), p95LatencyMs: Math.round(num(x['p95_ms'])),
    activeUsers: num(x['users']), jobs,
    avgTokensPerJob: jobs ? Math.round(total / jobs) : 0, costPerJobUsd: jobs ? num(x['cost_usd']) / jobs : 0,
  }
}

const BUCKETS = { hour: sql`'hour'`, day: sql`'day'`, week: sql`'week'`, month: sql`'month'` } as const
export const bucketSchema = z.enum(['hour', 'day', 'week', 'month']).default('day')

export async function timeseries(f: UsageFilters, bucket: keyof typeof BUCKETS) {
  const r = await db.execute(sql`
    SELECT date_trunc(${BUCKETS[bucket]}, e.created_at) AS t,
           count(*)::int AS calls,
           coalesce(sum(e.input_tokens),0)::float8 AS input_tokens,
           coalesce(sum(e.output_tokens),0)::float8 AS output_tokens,
           coalesce(sum(e.cached_tokens),0)::float8 AS cached_tokens,
           coalesce(sum(e.reasoning_tokens),0)::float8 AS reasoning_tokens,
           coalesce(sum(e.provider_cost_usd),0)::float8 AS cost_usd,
           count(*) FILTER (WHERE e.status = 'error')::int AS failed
    ${FROM} WHERE ${where(f)} GROUP BY 1 ORDER BY 1`)
  return r.rows.map((x) => ({
    t: new Date(x['t'] as string).toISOString(), calls: num(x['calls']), inputTokens: num(x['input_tokens']), outputTokens: num(x['output_tokens']),
    cachedTokens: num(x['cached_tokens']), reasoningTokens: num(x['reasoning_tokens']), costUsd: num(x['cost_usd']), failed: num(x['failed']),
  }))
}

/** Whitelisted GROUP BY dimensions (never interpolate user input into SQL). */
const DIMENSIONS = {
  model: sql`e.model`,
  provider: sql`e.provider`,
  requestType: sql`e.request_type`,
  user: sql`coalesce(e.user_id, '(none)')`,
  country: sql`coalesce(u.country, 'unknown')`,
  status: sql`e.status`,
  environment: sql`e.environment`,
} as const
export const dimensionSchema = z.enum(Object.keys(DIMENSIONS) as [keyof typeof DIMENSIONS, ...(keyof typeof DIMENSIONS)[]])

export async function breakdown(f: UsageFilters, by: keyof typeof DIMENSIONS, limit = 20) {
  const r = await db.execute(sql`
    SELECT ${DIMENSIONS[by]} AS key,
           ${by === 'user' ? sql`max(u.email)` : sql`NULL`} AS label,
           count(*)::int AS calls,
           coalesce(sum(e.input_tokens),0)::float8 AS input_tokens,
           coalesce(sum(e.output_tokens),0)::float8 AS output_tokens,
           coalesce(sum(e.cached_tokens),0)::float8 AS cached_tokens,
           coalesce(sum(e.reasoning_tokens),0)::float8 AS reasoning_tokens,
           coalesce(sum(e.provider_cost_usd),0)::float8 AS cost_usd,
           count(*) FILTER (WHERE e.status = 'error')::int AS failed,
           coalesce(avg(e.latency_ms),0)::float8 AS avg_ms
    ${FROM} WHERE ${where(f)} GROUP BY 1 ORDER BY (coalesce(sum(e.input_tokens),0) + coalesce(sum(e.output_tokens),0) + coalesce(sum(e.reasoning_tokens),0)) DESC LIMIT ${limit}`)
  return r.rows.map((x) => {
    const i = num(x['input_tokens']), o = num(x['output_tokens']), re = num(x['reasoning_tokens'])
    return { key: String(x['key']), label: (x['label'] as string | null) ?? null, calls: num(x['calls']), inputTokens: i, outputTokens: o, cachedTokens: num(x['cached_tokens']), reasoningTokens: re, totalTokens: i + o + re, costUsd: num(x['cost_usd']), failed: num(x['failed']), avgLatencyMs: Math.round(num(x['avg_ms'])) }
  })
}
