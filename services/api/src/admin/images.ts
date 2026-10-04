import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.ts'
import { bucketOf, num, rangeOf, rangeSchema } from './range.ts'

/**
 * Owner "Images" section: AI pictures from `generated_asset` (+ the `ai_usage_event` ledger for failures).
 * Failed generations delete their pending asset row, so "failed" can only come from the ledger. The plan shown is the
 * user's CURRENT plan (not the plan at generation time). All inputs are bound; raw fragments come from whitelists.
 */

export const imagesQuery = rangeSchema.extend({ bucket: bucketOf })
export const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) })
export const limitSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) })
export const imageBreakdownSchema = rangeSchema.extend({ by: z.enum(['model', 'plan']) })
export const quotaSchema = z.object({ threshold: z.coerce.number().min(0.1).max(1).default(0.8), limit: z.coerce.number().int().min(1).max(50).default(20), /** optional: only these users (comma-separated ids, ≤ 50) */ userIds: z.string().max(2000).optional() })

const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Record<string, unknown>[]
const BUCKETS = { hour: sql`'hour'`, day: sql`'day'`, week: sql`'week'`, month: sql`'month'` } as const
/** a = generated_asset, u = user (left join), s = the user's live subscription, plan id in `plan_id`. */
const FROM_ASSETS = sql`FROM generated_asset a
  LEFT JOIN "user" u ON u.id = a.user_id
  LEFT JOIN subscription s ON s.user_id = a.user_id AND s.status IN ('active','trialing','past_due') AND s.current_period_end > now()`
const PLAN = sql`coalesce(s.plan_id, 'starter')`
const inRange = (r: { from: Date; to: Date }) => sql`a.created_at >= ${r.from} AND a.created_at < ${r.to}`
const div = (a: number, b: number) => (b > 0 ? a / b : 0)

export async function summary(q: z.infer<typeof rangeSchema>) {
  const r = rangeOf(q)
  const [a] = await rows(sql`
    SELECT count(*) FILTER (WHERE a.status = 'ready')::int AS ready,
           count(*) FILTER (WHERE a.status = 'pending' AND a.created_at > now() - interval '5 minutes')::int AS pending,
           count(*) FILTER (WHERE a.status = 'pending' AND a.created_at <= now() - interval '5 minutes')::int AS stale,
           count(*) FILTER (WHERE a.status = 'ready' AND a.deleted_at IS NOT NULL)::int AS deleted,
           coalesce(sum(a.provider_cost_usd) FILTER (WHERE a.status = 'ready'),0)::float8 AS cost,
           coalesce(sum(a.bytes) FILTER (WHERE a.status = 'ready'),0)::float8 AS bytes,
           coalesce(sum(a.bytes) FILTER (WHERE a.status = 'ready' AND a.deleted_at IS NULL),0)::float8 AS live_bytes,
           count(DISTINCT a.user_id)::int AS users,
           count(DISTINCT a.presentation_id)::int AS decks
    FROM generated_asset a WHERE ${inRange(r)}`)
  const [l] = await rows(sql`
    SELECT count(*) FILTER (WHERE status = 'error')::int AS failed, count(*)::int AS attempts,
           coalesce(sum(image_count) FILTER (WHERE status = 'success'),0)::float8 AS ledger_images
    FROM ai_usage_event WHERE request_type = 'image_generation' AND created_at >= ${r.from} AND created_at < ${r.to}`)
  const ready = num(a?.['ready']), cost = num(a?.['cost']), failed = num(l?.['failed']), attempts = num(l?.['attempts'])
  return {
    ready, pending: num(a?.['pending']), stalePending: num(a?.['stale']), deleted: num(a?.['deleted']), failed, ledgerAttempts: attempts, ledgerImages: num(l?.['ledger_images']),
    failureRate: div(failed, attempts), costUsd: cost, avgCostUsd: div(cost, ready), storageBytes: num(a?.['bytes']), liveStorageBytes: num(a?.['live_bytes']),
    avgBytes: div(num(a?.['bytes']), ready), activeUsers: num(a?.['users']), decksWithImages: num(a?.['decks']), imagesPerDeck: div(ready, num(a?.['decks'])),
  }
}

export async function timeseries(q: z.infer<typeof imagesQuery>) {
  const r = rangeOf(q)
  const out = await rows(sql`
    SELECT date_trunc(${BUCKETS[q.bucket]}, a.created_at) AS t, count(*)::int AS images,
           coalesce(sum(a.provider_cost_usd),0)::float8 AS cost, coalesce(sum(a.bytes),0)::float8 AS bytes
    FROM generated_asset a WHERE a.status = 'ready' AND ${inRange(r)} GROUP BY 1 ORDER BY 1`)
  return out.map((x) => ({ t: new Date(x['t'] as string).toISOString(), images: num(x['images']), costUsd: num(x['cost']), bytes: num(x['bytes']) }))
}

const DIMS = { model: sql`a.model`, plan: PLAN } as const
export async function breakdown(q: z.infer<typeof imageBreakdownSchema>) {
  const r = rangeOf(q)
  const out = await rows(sql`
    SELECT ${DIMS[q.by]} AS key, count(*)::int AS images, coalesce(sum(a.provider_cost_usd),0)::float8 AS cost,
           coalesce(sum(a.bytes),0)::float8 AS bytes, count(DISTINCT a.user_id)::int AS users
    ${FROM_ASSETS} WHERE a.status = 'ready' AND ${inRange(r)} GROUP BY 1 ORDER BY images DESC, key LIMIT 50`)
  return out.map((x) => ({ key: String(x['key']), images: num(x['images']), costUsd: num(x['cost']), avgCostUsd: div(num(x['cost']), num(x['images'])), bytes: num(x['bytes']), users: num(x['users']) }))
}

/** Ready images per presentation, bucketed. Assets without a deck are ignored. */
export async function perDeck(q: z.infer<typeof rangeSchema>) {
  const r = rangeOf(q)
  const out = await rows(sql`
    SELECT CASE WHEN n = 1 THEN '1' WHEN n = 2 THEN '2' WHEN n = 3 THEN '3' WHEN n <= 5 THEN '4-5' WHEN n <= 10 THEN '6-10' ELSE '11+' END AS bucket,
           min(n)::int AS lo, count(*)::int AS decks
    FROM (SELECT count(*) AS n FROM generated_asset a WHERE a.status = 'ready' AND a.presentation_id IS NOT NULL AND ${inRange(r)} GROUP BY a.presentation_id) d
    GROUP BY 1 ORDER BY lo`)
  return out.map((x) => ({ bucket: String(x['bucket']), decks: num(x['decks']) }))
}

export async function topUsers(q: z.infer<typeof rangeSchema>, limit: number) {
  const r = rangeOf(q)
  const out = await rows(sql`
    SELECT a.user_id AS id, max(u.email) AS email, max(${PLAN}) AS plan, count(*)::int AS images, coalesce(sum(a.provider_cost_usd),0)::float8 AS cost
    ${FROM_ASSETS} WHERE a.status = 'ready' AND ${inRange(r)} GROUP BY a.user_id ORDER BY images DESC, cost DESC LIMIT ${limit}`)
  return out.map((x) => ({ userId: String(x['id']), email: (x['email'] as string | null) ?? null, plan: String(x['plan']), images: num(x['images']), costUsd: num(x['cost']) }))
}

/** Users whose CURRENT allowance period usage is at/near the plan's per-month image limit (same counting rule as the quota gate). */
export async function quota(q: z.infer<typeof quotaSchema>, now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const ids = (q.userIds ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50)
  const cte = sql`
    WITH use AS (
      SELECT a.user_id, max(u.email) AS email, coalesce(max(s.plan_id), 'starter') AS plan_id, max(p.max_images_per_month) AS lim, count(*)::int AS used
      FROM generated_asset a
      LEFT JOIN "user" u ON u.id = a.user_id
      LEFT JOIN subscription s ON s.user_id = a.user_id AND s.status IN ('active','trialing','past_due') AND s.current_period_end > now()
      JOIN plan p ON p.id = coalesce(s.plan_id, 'starter')
      WHERE (a.status = 'ready' OR a.created_at > now() - interval '5 minutes')
        AND a.kind <> 'stock'
        ${ids.length ? sql`AND a.user_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql``}
        AND a.created_at >= CASE WHEN s.id IS NULL THEN ${monthStart}::timestamp ELSE s.current_period_start END
      GROUP BY a.user_id HAVING max(p.max_images_per_month) > 0)`
  const [t] = await rows(sql`${cte} SELECT count(*)::int AS users, count(*) FILTER (WHERE used >= lim)::int AS at_limit, count(*) FILTER (WHERE used < lim AND used::float8 >= lim * ${q.threshold}::float8)::int AS near FROM use`)
  const top = await rows(sql`${cte} SELECT * FROM use WHERE used::float8 >= lim * ${q.threshold}::float8 ORDER BY used::float8 / lim DESC, used DESC LIMIT ${q.limit}`)
  return {
    threshold: q.threshold, usersWithImages: num(t?.['users']), atLimit: num(t?.['at_limit']), nearLimit: num(t?.['near']),
    users: top.map((x) => ({ userId: String(x['user_id']), email: (x['email'] as string | null) ?? null, plan: String(x['plan_id']), used: num(x['used']), limit: num(x['lim']), ratio: div(num(x['used']), num(x['lim'])) })),
  }
}

export async function recent(q: z.infer<typeof rangeSchema> & z.infer<typeof pageSchema>) {
  const r = rangeOf(q)
  const [c] = await rows(sql`SELECT count(*)::int AS n FROM generated_asset a WHERE a.status = 'ready' AND ${inRange(r)}`)
  const out = await rows(sql`
    SELECT a.id, u.email, a.model, left(a.prompt, 120) AS prompt, length(a.prompt) > 120 AS truncated, a.provider_cost_usd::float8 AS cost, a.bytes, a.created_at, a.deleted_at IS NOT NULL AS deleted
    ${FROM_ASSETS} WHERE a.status = 'ready' AND ${inRange(r)} ORDER BY a.created_at DESC, a.id LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`)
  return {
    total: num(c?.['n']), page: q.page, pageSize: q.pageSize,
    rows: out.map((x) => ({ id: String(x['id']), email: (x['email'] as string | null) ?? null, model: String(x['model']), prompt: String(x['prompt']) + (x['truncated'] ? '…' : ''), costUsd: num(x['cost']), bytes: num(x['bytes']), createdAt: new Date(x['created_at'] as string).toISOString(), deleted: Boolean(x['deleted']) })),
  }
}
