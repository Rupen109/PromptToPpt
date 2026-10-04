import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.ts'
import { bucketOf, num, rangeOf, rangeSchema } from './range.ts'

/** Columns are `timestamp` (no tz) written as UTC by drizzle; bind range ends as UTC literals so the server's/driver's local zone never shifts the window. */
const ts = (d: Date) => sql`${d.toISOString()}::timestamp`

/** Latency, errors, generation duration, queue health and export speed. No prompts or user data are returned here. */

export const perfQuery = rangeSchema
export const timeseriesQuery = rangeSchema.extend({ bucket: bucketOf })
export type PerfQuery = z.infer<typeof rangeSchema>

/** Health rule (shown verbatim on the page). */
export const HEALTH_RULES = { degradedErrorRate: 0.05, downErrorRate: 0.5, degradedP95Ms: 30_000, minCalls: 5, stuckMinutes: 10 } as const

const BUCKETS = { hour: sql`'hour'`, day: sql`'day'`, week: sql`'week'`, month: sql`'month'` } as const
const rate = (a: number, b: number) => (b > 0 ? a / b : 0)
const pcts = (p: string) => sql.raw(`coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY ${p}),0)::float8 AS p50, coalesce(percentile_cont(0.9) WITHIN GROUP (ORDER BY ${p}),0)::float8 AS p90, coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY ${p}),0)::float8 AS p95, coalesce(percentile_cont(0.99) WITHIN GROUP (ORDER BY ${p}),0)::float8 AS p99`)
const P = (x: Record<string, unknown>) => ({ p50: Math.round(num(x['p50'])), p90: Math.round(num(x['p90'])), p95: Math.round(num(x['p95'])), p99: Math.round(num(x['p99'])) })
const inRange = (q: PerfQuery, col: string) => { const { from, to } = rangeOf(q); return sql`${sql.raw(col)} >= ${ts(from)} AND ${sql.raw(col)} < ${ts(to)}` }

export type Verdict = 'ok' | 'degraded' | 'down'
export function verdictOf(calls: number, errorRate: number, p95Ms: number, stuckJobs: number): { status: Verdict; reasons: string[] } {
  const R = HEALTH_RULES
  const reasons: string[] = []
  if (calls >= R.minCalls && errorRate > R.downErrorRate) return { status: 'down', reasons: [`error rate ${(errorRate * 100).toFixed(1)}% is above ${R.downErrorRate * 100}%`] }
  if (calls >= R.minCalls && errorRate > R.degradedErrorRate) reasons.push(`error rate ${(errorRate * 100).toFixed(1)}% is above ${R.degradedErrorRate * 100}%`)
  if (calls > 0 && p95Ms > R.degradedP95Ms) reasons.push(`p95 latency ${(p95Ms / 1000).toFixed(1)}s is above ${R.degradedP95Ms / 1000}s`)
  if (stuckJobs > 0) reasons.push(`${stuckJobs} job(s) stuck for over ${R.stuckMinutes} minutes`)
  return { status: reasons.length ? 'degraded' : 'ok', reasons }
}

export async function overview(q: PerfQuery) {
  const w = inRange(q, 'e.created_at')
  const [all, byModel, byType, errors, slowest, stuck] = await Promise.all([
    db.execute(sql`SELECT count(*)::int AS calls, count(*) FILTER (WHERE e.status = 'error')::int AS failed, ${pcts('e.latency_ms')} FROM ai_usage_event e WHERE ${w}`),
    db.execute(sql`SELECT e.model AS key, count(*)::int AS calls, count(*) FILTER (WHERE e.status = 'error')::int AS failed, ${pcts('e.latency_ms')} FROM ai_usage_event e WHERE ${w} GROUP BY 1 ORDER BY calls DESC LIMIT 30`),
    db.execute(sql`SELECT e.request_type AS key, count(*)::int AS calls, count(*) FILTER (WHERE e.status = 'error')::int AS failed, ${pcts('e.latency_ms')} FROM ai_usage_event e WHERE ${w} GROUP BY 1 ORDER BY calls DESC LIMIT 30`),
    db.execute(sql`SELECT coalesce(e.error_code, 'unknown') AS code, count(*)::int AS n, max(e.created_at) AS last_at FROM ai_usage_event e WHERE ${w} AND e.status = 'error' GROUP BY 1 ORDER BY n DESC, 1 LIMIT 10`),
    db.execute(sql`SELECT e.id, e.model, e.request_type, e.latency_ms, e.status, e.created_at FROM ai_usage_event e WHERE ${w} ORDER BY e.latency_ms DESC, e.id LIMIT 20`),
    db.execute(sql`SELECT count(*)::int AS n FROM generation_job WHERE status NOT IN ('completed','failed','cancelled') AND updated_at < (now() AT TIME ZONE 'utc') - make_interval(mins => ${HEALTH_RULES.stuckMinutes})`),
  ])
  const a = all.rows[0] as Record<string, unknown>
  const calls = num(a['calls']), failed = num(a['failed'])
  const lat = P(a)
  const group = (rows: Record<string, unknown>[]) => rows.map((x) => ({ key: String(x['key']), calls: num(x['calls']), failed: num(x['failed']), errorRate: rate(num(x['failed']), num(x['calls'])), ...P(x) }))
  return {
    health: { ...verdictOf(calls, rate(failed, calls), lat.p95, num((stuck.rows[0] as Record<string, unknown>)['n'])), rules: HEALTH_RULES },
    calls, failed, errorRate: rate(failed, calls), latency: lat,
    byModel: group(byModel.rows), byRequestType: group(byType.rows),
    topErrors: errors.rows.map((x) => ({ code: String(x['code']), count: num(x['n']), lastAt: new Date(x['last_at'] as string).toISOString(), share: rate(num(x['n']), failed) })),
    slowest: slowest.rows.map((x) => ({ id: String(x['id']), model: String(x['model']), requestType: String(x['request_type']), latencyMs: num(x['latency_ms']), status: String(x['status']), createdAt: new Date(x['created_at'] as string).toISOString() })),
  }
}

export async function timeseries(q: PerfQuery, bucket: keyof typeof BUCKETS) {
  const r = await db.execute(sql`SELECT date_trunc(${BUCKETS[bucket]}, e.created_at) AS t, count(*)::int AS calls, count(*) FILTER (WHERE e.status = 'error')::int AS failed,
      coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY e.latency_ms),0)::float8 AS p50, coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY e.latency_ms),0)::float8 AS p95
      FROM ai_usage_event e WHERE ${inRange(q, 'e.created_at')} GROUP BY 1 ORDER BY 1`)
  return r.rows.map((x) => ({ t: new Date(x['t'] as string).toISOString(), calls: num(x['calls']), failed: num(x['failed']), errorRate: rate(num(x['failed']), num(x['calls'])), p50: Math.round(num(x['p50'])), p95: Math.round(num(x['p95'])) }))
}

/** Generation end-to-end duration (job created → last update, completed jobs only) and export durations. */
export async function generation(q: PerfQuery) {
  const dur = sql`extract(epoch FROM (j.updated_at - j.created_at)) * 1000`
  const [bySlides, exp] = await Promise.all([
    db.execute(sql`SELECT CASE WHEN j.options->>'slideCount' !~ '^[0-9]+$' OR j.options->>'slideCount' IS NULL THEN 'auto'
        WHEN (j.options->>'slideCount')::int <= 5 THEN '3-5' WHEN (j.options->>'slideCount')::int <= 8 THEN '6-8' WHEN (j.options->>'slideCount')::int <= 12 THEN '9-12'
        WHEN (j.options->>'slideCount')::int <= 20 THEN '13-20' ELSE '21+' END AS key, count(*)::int AS n,
        coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY ${dur}),0)::float8 AS p50, coalesce(percentile_cont(0.9) WITHIN GROUP (ORDER BY ${dur}),0)::float8 AS p90,
        coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY ${dur}),0)::float8 AS p95, coalesce(percentile_cont(0.99) WITHIN GROUP (ORDER BY ${dur}),0)::float8 AS p99
        FROM generation_job j WHERE ${inRange(q, 'j.created_at')} AND j.status = 'completed' GROUP BY 1`),
    db.execute(sql`SELECT x.format AS key, count(*)::int AS n, count(*) FILTER (WHERE x.status = 'failed')::int AS failed, ${pcts('x.duration_ms')}
        FROM export_event x WHERE ${inRange(q, 'x.created_at')} AND x.duration_ms IS NOT NULL GROUP BY 1 ORDER BY n DESC`),
  ])
  const total = await db.execute(sql`SELECT count(*)::int AS n,
      coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY ${dur}),0)::float8 AS p50, coalesce(percentile_cont(0.9) WITHIN GROUP (ORDER BY ${dur}),0)::float8 AS p90,
      coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY ${dur}),0)::float8 AS p95, coalesce(percentile_cont(0.99) WITHIN GROUP (ORDER BY ${dur}),0)::float8 AS p99
      FROM generation_job j WHERE ${inRange(q, 'j.created_at')} AND j.status = 'completed'`)
  const t = total.rows[0] as Record<string, unknown>
  const ORDER = ['3-5', '6-8', '9-12', '13-20', '21+', 'auto']
  return {
    completedJobs: num(t['n']), duration: P(t),
    bySlideCount: bySlides.rows.map((x) => ({ key: String(x['key']), jobs: num(x['n']), ...P(x) })).sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key)),
    exports: exp.rows.map((x) => ({ format: String(x['key']), count: num(x['n']), failed: num(x['failed']), ...P(x) })),
  }
}

/** Queue health right now (not range-scoped, except `retries`, which counts jobs created in the range). */
export async function queue(q: PerfQuery) {
  const r = await db.execute(sql`SELECT
      count(*) FILTER (WHERE status = 'queued')::int AS queued,
      count(*) FILTER (WHERE status NOT IN ('queued','completed','failed','cancelled'))::int AS running,
      count(*) FILTER (WHERE status NOT IN ('completed','failed','cancelled') AND updated_at < (now() AT TIME ZONE 'utc') - make_interval(mins => ${HEALTH_RULES.stuckMinutes}))::int AS stuck,
      count(*) FILTER (WHERE status = 'failed' AND updated_at >= (now() AT TIME ZONE 'utc') - interval '24 hours')::int AS failed_24h,
      coalesce(extract(epoch FROM (now() AT TIME ZONE 'utc') - min(created_at) FILTER (WHERE status = 'queued')), 0)::float8 AS oldest_queued_s
      FROM generation_job`)
  const rt = await db.execute(sql`SELECT count(*)::int AS n FROM generation_job j WHERE ${inRange(q, 'j.created_at')} AND j.attempts > 1`)
  const x = r.rows[0] as Record<string, unknown>
  return { queued: num(x['queued']), running: num(x['running']), stuck: num(x['stuck']), failedLast24h: num(x['failed_24h']), oldestQueuedSeconds: Math.round(num(x['oldest_queued_s'])), retries: num((rt.rows[0] as Record<string, unknown>)['n']), stuckMinutes: HEALTH_RULES.stuckMinutes }
}
