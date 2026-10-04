import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.ts'
import { env } from '../env.ts'
import { num, rangeOf, type RangeQuery } from './range.ts'

/**
 * Timestamps are `timestamp without time zone` holding UTC (drizzle writes ISO/UTC). node-pg would serialise a raw Date in
 * the server's LOCAL zone, shifting every range, so dates go in as ISO strings cast to timestamp, and come out `AT TIME ZONE 'UTC'`.
 */
const ts = (d: Date) => sql`${d.toISOString()}::timestamp`

/**
 * Owner cost-vs-revenue view. Revenue = captured payments converted to USD at the fixed `INR_PER_USD` rate (an
 * assumption, not a market rate); cost = provider USD cost from the immutable `ai_usage_event` ledger.
 *
 * Images: every picture goes through the AI gateway, so it is ALREADY a row in `ai_usage_event` (image_count > 0) and
 * is inside the total AI cost. `generated_asset.provider_cost_usd` repeats that same cost on the stored asset, so it is
 * reported only as a reconciliation figure and is never added to the total.
 * Every division is guarded: a zero denominator yields null (shown as "—"), never NaN/Infinity.
 */

const fx = () => env.INR_PER_USD
const ratio = (a: number, b: number) => (b > 0 ? a / b : null)
/** payment `p` amount in USD (unknown currencies contribute 0 rather than a wrong number) */
const usdOf = () => sql`(CASE p.currency WHEN 'USD' THEN p.amount_minor / 100.0 WHEN 'INR' THEN p.amount_minor / 100.0 / ${fx()}::float8 ELSE 0 END)`
const PAID = sql`('active','trialing','past_due')`

export async function summary(q: RangeQuery) {
  const { from, to } = rangeOf(q)
  const [cost, assets, rev, credits] = await Promise.all([
    db.execute(sql`
      SELECT count(*)::int AS calls, coalesce(sum(e.provider_cost_usd),0)::float8 AS cost,
             coalesce(sum(e.provider_cost_usd) FILTER (WHERE e.image_count > 0),0)::float8 AS image_cost,
             coalesce(sum(e.image_count),0)::int AS images
      FROM ai_usage_event e WHERE e.created_at >= ${ts(from)} AND e.created_at < ${ts(to)}`),
    db.execute(sql`
      SELECT count(*)::int AS n, coalesce(sum(a.provider_cost_usd),0)::float8 AS cost
      FROM generated_asset a WHERE a.status = 'ready' AND a.deleted_at IS NULL AND a.created_at >= ${ts(from)} AND a.created_at < ${ts(to)}`),
    db.execute(sql`
      SELECT count(*) FILTER (WHERE p.status = 'captured')::int AS payments,
             coalesce(sum(${usdOf()}) FILTER (WHERE p.status = 'captured'),0)::float8 AS revenue,
             coalesce(sum(${usdOf()}) FILTER (WHERE p.status = 'refunded'),0)::float8 AS refunds
      FROM payment p WHERE p.paid_at >= ${ts(from)} AND p.paid_at < ${ts(to)}`),
    db.execute(sql`
      SELECT coalesce(sum(l.delta) FILTER (WHERE l.delta > 0 AND l.reason IN ('plan_grant','topup')),0)::float8 AS granted,
             coalesce(-sum(l.delta) FILTER (WHERE l.reason = 'reserve'),0)::float8 AS reserved,
             coalesce(sum(l.delta) FILTER (WHERE l.reason = 'refund'),0)::float8 AS refunded
      FROM credit_ledger l WHERE l.created_at >= ${ts(from)} AND l.created_at < ${ts(to)}`),
  ])
  const c = cost.rows[0] ?? {}, a = assets.rows[0] ?? {}, r = rev.rows[0] ?? {}, k = credits.rows[0] ?? {}
  const aiCost = num(c['cost']), revenue = num(r['revenue']), refunds = num(r['refunds'])
  const consumed = Math.max(0, num(k['reserved']) - num(k['refunded']))
  const net = revenue - refunds
  return {
    fx: { inrPerUsd: fx(), note: `INR payments converted to USD at a fixed ${fx()} INR per USD (INR_PER_USD).` },
    aiCostUsd: aiCost, aiCalls: num(c['calls']), imageCostUsd: num(c['image_cost']), images: num(c['images']),
    assetCostUsd: num(a['cost']), assetCount: num(a['n']),
    revenueUsd: revenue, refundsUsd: refunds, netRevenueUsd: net, paymentCount: num(r['payments']),
    grossMarginUsd: net - aiCost, grossMarginPct: ratio(net - aiCost, net),
    costShareOfRevenue: ratio(aiCost, net),
    credits: { granted: num(k['granted']), consumed, refunded: num(k['refunded']), impliedCostPerCreditUsd: ratio(aiCost, consumed), consumedShareOfGranted: ratio(consumed, num(k['granted'])) },
    sparse: { noPayments: num(r['payments']) === 0, noUsage: num(c['calls']) === 0 },
  }
}

/** Per current plan: users on it, revenue + AI cost of those users in the range. Free users have no paid subscription ('starter'). */
export async function plans(q: RangeQuery) {
  const { from, to } = rangeOf(q)
  const r = await db.execute(sql`
    WITH up AS (
      SELECT u.id, coalesce(s.plan_id, 'starter') AS plan, (s.id IS NOT NULL) AS paid
      FROM "user" u LEFT JOIN subscription s ON s.user_id = u.id AND s.status IN ${PAID}
    ), cost AS (
      SELECT e.user_id, sum(e.provider_cost_usd)::float8 AS c FROM ai_usage_event e WHERE e.created_at >= ${ts(from)} AND e.created_at < ${ts(to)} GROUP BY 1
    ), rev AS (
      SELECT p.user_id, sum(${usdOf()})::float8 AS r FROM payment p WHERE p.status = 'captured' AND p.paid_at >= ${ts(from)} AND p.paid_at < ${ts(to)} GROUP BY 1
    )
    SELECT up.plan, bool_or(up.paid) AS paid, count(*)::int AS users,
           count(*) FILTER (WHERE cost.c IS NOT NULL)::int AS active_users,
           count(*) FILTER (WHERE rev.r IS NOT NULL)::int AS payers,
           coalesce(sum(rev.r),0)::float8 AS revenue, coalesce(sum(cost.c),0)::float8 AS cost
    FROM up LEFT JOIN cost ON cost.user_id = up.id LEFT JOIN rev ON rev.user_id = up.id
    GROUP BY up.plan ORDER BY up.plan`)
  const rows = r.rows.map((x) => {
    const revenue = num(x['revenue']), cost = num(x['cost']), users = num(x['users'])
    return { planId: String(x['plan']), paid: Boolean(x['paid']), users, activeUsers: num(x['active_users']), payers: num(x['payers']), revenueUsd: revenue, aiCostUsd: cost, marginUsd: revenue - cost, marginPct: ratio(revenue - cost, revenue), costPerUserUsd: ratio(cost, users) }
  })
  const sum = (paid: boolean) => rows.filter((p) => p.paid === paid).reduce((s, p) => ({ users: s.users + p.users, active: s.active + p.activeUsers, cost: s.cost + p.aiCostUsd }), { users: 0, active: 0, cost: 0 })
  const paid = sum(true), free = sum(false)
  return {
    plans: rows,
    perUser: {
      paying: { users: paid.users, activeUsers: paid.active, aiCostUsd: paid.cost, costPerUserUsd: ratio(paid.cost, paid.users), costPerActiveUserUsd: ratio(paid.cost, paid.active) },
      free: { users: free.users, activeUsers: free.active, aiCostUsd: free.cost, costPerUserUsd: ratio(free.cost, free.users), costPerActiveUserUsd: ratio(free.cost, free.active) },
    },
  }
}

export const topUsersSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) })

export async function topUsers(q: RangeQuery, limit: number) {
  const { from, to } = rangeOf(q)
  const r = await db.execute(sql`
    WITH cost AS (
      SELECT e.user_id, sum(e.provider_cost_usd)::float8 AS c, count(*)::int AS calls
      FROM ai_usage_event e WHERE e.user_id IS NOT NULL AND e.created_at >= ${ts(from)} AND e.created_at < ${ts(to)} GROUP BY 1 ORDER BY 2 DESC LIMIT ${limit}
    )
    SELECT cost.user_id, u.email, coalesce(s.plan_id, 'starter') AS plan, cost.c AS cost, cost.calls,
           (SELECT coalesce(sum(${usdOf()}),0)::float8 FROM payment p WHERE p.user_id = cost.user_id AND p.status = 'captured' AND p.paid_at >= ${ts(from)} AND p.paid_at < ${ts(to)}) AS revenue
    FROM cost LEFT JOIN "user" u ON u.id = cost.user_id LEFT JOIN subscription s ON s.user_id = cost.user_id AND s.status IN ${PAID}
    ORDER BY cost.c DESC`)
  return r.rows.map((x) => {
    const cost = num(x['cost']), revenue = num(x['revenue'])
    return { userId: String(x['user_id']), email: (x['email'] as string | null) ?? null, planId: String(x['plan']), aiCostUsd: cost, calls: num(x['calls']), revenueUsd: revenue, marginUsd: revenue - cost }
  })
}

const BUCKETS = { day: sql`'day'`, week: sql`'week'`, month: sql`'month'` } as const
export const marginBucketSchema = z.enum(['day', 'week', 'month']).default('day')

export async function timeseries(q: RangeQuery, bucket: keyof typeof BUCKETS) {
  const { from, to } = rangeOf(q)
  const [cost, rev] = await Promise.all([
    db.execute(sql`SELECT date_trunc(${BUCKETS[bucket]}, e.created_at) AT TIME ZONE 'UTC' AS t, sum(e.provider_cost_usd)::float8 AS v FROM ai_usage_event e WHERE e.created_at >= ${ts(from)} AND e.created_at < ${ts(to)} GROUP BY 1`),
    db.execute(sql`SELECT date_trunc(${BUCKETS[bucket]}, p.paid_at) AT TIME ZONE 'UTC' AS t, sum(${usdOf()})::float8 AS v FROM payment p WHERE p.status = 'captured' AND p.paid_at >= ${ts(from)} AND p.paid_at < ${ts(to)} GROUP BY 1`),
  ])
  const m = new Map<string, { t: string; aiCostUsd: number; revenueUsd: number }>()
  for (const [rows, k] of [[cost.rows, 'aiCostUsd'], [rev.rows, 'revenueUsd']] as const) {
    for (const x of rows) {
      const t = new Date(x['t'] as string).toISOString()
      const e = m.get(t) ?? { t, aiCostUsd: 0, revenueUsd: 0 }
      e[k] = num(x['v'])
      m.set(t, e)
    }
  }
  return [...m.values()].sort((a, b) => a.t.localeCompare(b.t))
}
