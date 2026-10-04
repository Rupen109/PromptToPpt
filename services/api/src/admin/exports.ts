import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.ts'
import { bucketOf, num, rangeOf, rangeSchema } from './range.ts'
import { limitSchema, pageSchema } from './images.ts'

/**
 * Owner "Exports" section over `export_event`. PPTX is built on the server (exact); PDF/PNG/JPG/HTML render in the browser and
 * report back, so a `started` row older than 15 minutes is treated as "abandoned" (tab closed / report never arrived).
 * Plan = the user's CURRENT plan. All inputs are bound; raw fragments come from whitelists.
 */

export const exportsSeriesSchema = rangeSchema.extend({ bucket: bucketOf })
export const exportsBreakdownSchema = rangeSchema.extend({ by: z.enum(['format', 'mode', 'plan']) })
export const exportsRecentSchema = rangeSchema.merge(pageSchema).extend({
  status: z.enum(['success', 'failed', 'started', 'abandoned']).optional(),
  format: z.enum(['pptx', 'pdf', 'png', 'jpg', 'html']).optional(),
})
export { limitSchema, pageSchema }

const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Record<string, unknown>[]
const BUCKETS = { hour: sql`'hour'`, day: sql`'day'`, week: sql`'week'`, month: sql`'month'` } as const
/** e = export_event, u = user (left join), s = live subscription. */
const FROM = sql`FROM export_event e
  LEFT JOIN "user" u ON u.id = e.user_id
  LEFT JOIN subscription s ON s.user_id = e.user_id AND s.status IN ('active','trialing','past_due') AND s.current_period_end > now()`
const STATE = sql`(CASE WHEN e.status = 'started' AND e.created_at < now() - interval '15 minutes' THEN 'abandoned' ELSE e.status END)`
const inRange = (r: { from: Date; to: Date }) => sql`e.created_at >= ${r.from} AND e.created_at < ${r.to}`
const div = (a: number, b: number) => (b > 0 ? a / b : 0)

export async function summary(q: z.infer<typeof rangeSchema>) {
  const r = rangeOf(q)
  const [x] = await rows(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE ${STATE} = 'success')::int AS ok,
           count(*) FILTER (WHERE ${STATE} = 'failed')::int AS failed,
           count(*) FILTER (WHERE ${STATE} = 'abandoned')::int AS abandoned,
           count(*) FILTER (WHERE ${STATE} = 'started')::int AS in_progress,
           coalesce(avg(e.duration_ms) FILTER (WHERE e.status = 'success'),0)::float8 AS avg_ms,
           coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY e.duration_ms) FILTER (WHERE e.status = 'success'),0)::float8 AS p95_ms,
           coalesce(avg(e.bytes) FILTER (WHERE e.status = 'success'),0)::float8 AS avg_bytes,
           coalesce(avg(e.slide_count),0)::float8 AS avg_slides,
           count(DISTINCT e.user_id)::int AS users,
           count(DISTINCT e.presentation_id)::int AS decks
    FROM export_event e WHERE ${inRange(r)}`)
  const total = num(x?.['total']), ok = num(x?.['ok']), failed = num(x?.['failed']), abandoned = num(x?.['abandoned'])
  const finished = ok + failed + abandoned // in-progress exports have no outcome yet
  return {
    total, success: ok, failed, abandoned, inProgress: num(x?.['in_progress']),
    successRate: div(ok, finished), failureRate: div(failed, finished), abandonedRate: div(abandoned, finished),
    avgDurationMs: Math.round(num(x?.['avg_ms'])), p95DurationMs: Math.round(num(x?.['p95_ms'])), avgBytes: Math.round(num(x?.['avg_bytes'])),
    avgSlides: num(x?.['avg_slides']), activeUsers: num(x?.['users']), decks: num(x?.['decks']),
  }
}

export async function timeseries(q: z.infer<typeof exportsSeriesSchema>) {
  const r = rangeOf(q)
  const out = await rows(sql`
    SELECT date_trunc(${BUCKETS[q.bucket]}, e.created_at) AS t, count(*)::int AS total,
           count(*) FILTER (WHERE ${STATE} = 'success')::int AS ok, count(*) FILTER (WHERE ${STATE} = 'failed')::int AS failed,
           count(*) FILTER (WHERE ${STATE} = 'abandoned')::int AS abandoned
    FROM export_event e WHERE ${inRange(r)} GROUP BY 1 ORDER BY 1`)
  return out.map((x) => ({ t: new Date(x['t'] as string).toISOString(), total: num(x['total']), success: num(x['ok']), failed: num(x['failed']), abandoned: num(x['abandoned']) }))
}

const DIMS = { format: sql`e.format`, mode: sql`e.mode`, plan: sql`coalesce(s.plan_id, 'starter')` } as const
export async function breakdown(q: z.infer<typeof exportsBreakdownSchema>) {
  const r = rangeOf(q)
  const out = await rows(sql`
    SELECT ${DIMS[q.by]} AS key, count(*)::int AS total,
           count(*) FILTER (WHERE ${STATE} = 'success')::int AS ok, count(*) FILTER (WHERE ${STATE} = 'failed')::int AS failed,
           count(*) FILTER (WHERE ${STATE} = 'abandoned')::int AS abandoned,
           coalesce(avg(e.duration_ms) FILTER (WHERE e.status = 'success'),0)::float8 AS avg_ms,
           coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY e.duration_ms) FILTER (WHERE e.status = 'success'),0)::float8 AS p95_ms,
           coalesce(avg(e.bytes) FILTER (WHERE e.status = 'success'),0)::float8 AS avg_bytes,
           coalesce(avg(e.slide_count),0)::float8 AS avg_slides
    ${FROM} WHERE ${inRange(r)} GROUP BY 1 ORDER BY total DESC, key LIMIT 50`)
  return out.map((x) => {
    const ok = num(x['ok']), failed = num(x['failed']), abandoned = num(x['abandoned'])
    return { key: String(x['key']), total: num(x['total']), success: ok, failed, abandoned, successRate: div(ok, ok + failed + abandoned), avgDurationMs: Math.round(num(x['avg_ms'])), p95DurationMs: Math.round(num(x['p95_ms'])), avgBytes: Math.round(num(x['avg_bytes'])), avgSlides: num(x['avg_slides']) }
  })
}

export async function errors(q: z.infer<typeof rangeSchema>, limit: number) {
  const r = rangeOf(q)
  const out = await rows(sql`
    SELECT left(e.error, 200) AS message, count(*)::int AS n, array_agg(DISTINCT e.format) AS formats, max(e.created_at) AS last_at
    FROM export_event e WHERE e.status = 'failed' AND e.error IS NOT NULL AND e.error <> '' AND ${inRange(r)}
    GROUP BY 1 ORDER BY n DESC, message LIMIT ${limit}`)
  return out.map((x) => ({ message: String(x['message']), count: num(x['n']), formats: ((x['formats'] as string[]) ?? []).slice().sort(), lastAt: new Date(x['last_at'] as string).toISOString() }))
}

/** Slides per export, bucketed (exports without a slide count are skipped). */
export async function slides(q: z.infer<typeof rangeSchema>) {
  const r = rangeOf(q)
  const out = await rows(sql`
    SELECT CASE WHEN e.slide_count <= 5 THEN '1-5' WHEN e.slide_count <= 10 THEN '6-10' WHEN e.slide_count <= 20 THEN '11-20' WHEN e.slide_count <= 40 THEN '21-40' ELSE '41+' END AS bucket,
           min(e.slide_count)::int AS lo, count(*)::int AS n
    FROM export_event e WHERE e.slide_count IS NOT NULL AND e.slide_count > 0 AND ${inRange(r)} GROUP BY 1 ORDER BY lo`)
  return out.map((x) => ({ bucket: String(x['bucket']), exports: num(x['n']) }))
}

export async function topUsers(q: z.infer<typeof rangeSchema>, limit: number) {
  const r = rangeOf(q)
  const out = await rows(sql`
    SELECT e.user_id AS id, max(u.email) AS email, max(coalesce(s.plan_id, 'starter')) AS plan, count(*)::int AS total,
           count(*) FILTER (WHERE ${STATE} = 'failed')::int AS failed
    ${FROM} WHERE ${inRange(r)} GROUP BY e.user_id ORDER BY total DESC, e.user_id LIMIT ${limit}`)
  return out.map((x) => ({ userId: String(x['id']), email: (x['email'] as string | null) ?? null, plan: String(x['plan']), exports: num(x['total']), failed: num(x['failed']) }))
}

export async function recent(q: z.infer<typeof exportsRecentSchema>) {
  const r = rangeOf(q)
  const where = sql`${inRange(r)}${q.status ? sql` AND ${STATE} = ${q.status}` : sql``}${q.format ? sql` AND e.format = ${q.format}` : sql``}`
  const [c] = await rows(sql`SELECT count(*)::int AS n FROM export_event e WHERE ${where}`)
  const out = await rows(sql`
    SELECT e.id, u.email, e.presentation_id, e.format, e.mode, ${STATE} AS state, e.bytes, e.duration_ms, left(e.error, 300) AS error, e.created_at
    ${FROM} WHERE ${where} ORDER BY e.created_at DESC, e.id LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`)
  return {
    total: num(c?.['n']), page: q.page, pageSize: q.pageSize,
    rows: out.map((x) => ({
      id: String(x['id']), email: (x['email'] as string | null) ?? null, presentationId: String(x['presentation_id']), format: String(x['format']), mode: String(x['mode']), status: String(x['state']),
      bytes: x['bytes'] === null ? null : num(x['bytes']), durationMs: x['duration_ms'] === null ? null : num(x['duration_ms']), error: (x['error'] as string | null) ?? null, createdAt: new Date(x['created_at'] as string).toISOString(),
    })),
  }
}
