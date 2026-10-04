import { sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.ts'
import { num, rangeOf, type RangeQuery } from './range.ts'

/**
 * Timestamps are `timestamp without time zone` holding UTC (drizzle writes ISO/UTC). node-pg would serialise a raw Date in
 * the server's LOCAL zone, shifting every range, so dates go in as ISO strings cast to timestamp, and come out `AT TIME ZONE 'UTC'`.
 */
const ts = (d: Date) => sql`${d.toISOString()}::timestamp`

/**
 * Owner sales analytics over the `payment` table. Amounts are minor units (paise/cents) and are ALWAYS grouped by
 * currency — INR and USD are never added together. Revenue only counts status = 'captured'; refunds are reported
 * separately (the table records them as their own rows with status = 'refunded').
 * Every filter is a bound parameter; the only raw fragments come from the fixed whitelists below.
 */

/** `p` = payment, `u` = user (left join: payments outlive users). */
const paymentWhere = (q: RangeQuery): SQL => {
  const { from, to } = rangeOf(q)
  return sql`p.paid_at >= ${ts(from)} AND p.paid_at < ${ts(to)}`
}
const FROM = sql`FROM payment p LEFT JOIN "user" u ON u.id = p.user_id`

export async function summary(q: RangeQuery) {
  const r = await db.execute(sql`
    SELECT p.currency,
           coalesce(sum(p.amount_minor) FILTER (WHERE p.status = 'captured'),0)::float8 AS gross,
           count(*) FILTER (WHERE p.status = 'captured')::int AS captured,
           coalesce(sum(p.amount_minor) FILTER (WHERE p.status = 'refunded'),0)::float8 AS refunds,
           count(*) FILTER (WHERE p.status = 'refunded')::int AS refund_count,
           count(*) FILTER (WHERE p.status = 'failed')::int AS failed,
           count(DISTINCT p.user_id) FILTER (WHERE p.status = 'captured')::int AS payers
    ${FROM} WHERE ${paymentWhere(q)} GROUP BY p.currency ORDER BY p.currency`)
  const currencies = r.rows.map((x) => {
    const gross = num(x['gross']), captured = num(x['captured']), failed = num(x['failed']), payers = num(x['payers']), refunds = num(x['refunds'])
    const attempts = captured + failed
    return {
      currency: String(x['currency']), grossMinor: gross, refundsMinor: refunds, netMinor: gross - refunds, refundCount: num(x['refund_count']),
      paymentCount: captured, failedCount: failed, failureRate: attempts ? failed / attempts : 0,
      payingCustomers: payers, arppuMinor: payers ? gross / payers : 0, avgOrderMinor: captured ? gross / captured : 0,
    }
  })
  return { currencies, mrr: await recurring() }
}

/**
 * MRR/ARR estimate from subscriptions that are `active` right now, priced from `plan_price` (yearly ÷ 12), per currency.
 * It is an estimate of list price: discounts or manual (non-provider) subscriptions with no matching price count as 0.
 */
export async function recurring() {
  const r = await db.execute(sql`
    SELECT s.currency,
           count(*)::int AS subs,
           coalesce(sum(CASE WHEN s.interval = 'year' THEN pp.amount_minor / 12.0 ELSE pp.amount_minor END),0)::float8 AS mrr
    FROM subscription s
    LEFT JOIN plan_price pp ON pp.plan_id = s.plan_id AND pp.currency = s.currency AND pp.interval = s.interval
    WHERE s.status = 'active' GROUP BY s.currency ORDER BY s.currency`)
  return r.rows.map((x) => ({ currency: String(x['currency']), activeSubscriptions: num(x['subs']), mrrMinor: Math.round(num(x['mrr'])), arrMinor: Math.round(num(x['mrr']) * 12) }))
}

const BUCKETS = { day: sql`'day'`, week: sql`'week'`, month: sql`'month'` } as const
export const salesBucketSchema = z.enum(['day', 'week', 'month']).default('day')

export async function timeseries(q: RangeQuery, bucket: keyof typeof BUCKETS) {
  const r = await db.execute(sql`
    SELECT date_trunc(${BUCKETS[bucket]}, p.paid_at) AT TIME ZONE 'UTC' AS t, p.currency,
           coalesce(sum(p.amount_minor) FILTER (WHERE p.status = 'captured'),0)::float8 AS revenue,
           count(*) FILTER (WHERE p.status = 'captured')::int AS payments,
           coalesce(sum(p.amount_minor) FILTER (WHERE p.status = 'refunded'),0)::float8 AS refunds
    ${FROM} WHERE ${paymentWhere(q)} GROUP BY 1, 2 ORDER BY 1, 2`)
  return r.rows.map((x) => ({ t: new Date(x['t'] as string).toISOString(), currency: String(x['currency']), revenueMinor: num(x['revenue']), payments: num(x['payments']), refundsMinor: num(x['refunds']) }))
}

const DIMENSIONS = {
  plan: sql`coalesce(p.plan_id, '(none)')`,
  interval: sql`coalesce(p.interval, '(none)')`,
  method: sql`coalesce(p.method, '(unknown)')`,
} as const
export const salesDimensionSchema = z.enum(Object.keys(DIMENSIONS) as [keyof typeof DIMENSIONS, ...(keyof typeof DIMENSIONS)[]])

export async function breakdown(q: RangeQuery, by: keyof typeof DIMENSIONS) {
  const r = await db.execute(sql`
    SELECT ${DIMENSIONS[by]} AS key, p.currency,
           coalesce(sum(p.amount_minor),0)::float8 AS revenue, count(*)::int AS payments, count(DISTINCT p.user_id)::int AS customers
    ${FROM} WHERE ${paymentWhere(q)} AND p.status = 'captured' GROUP BY 1, 2 ORDER BY 2, 3 DESC`)
  return r.rows.map((x) => ({ key: String(x['key']), currency: String(x['currency']), revenueMinor: num(x['revenue']), payments: num(x['payments']), customers: num(x['customers']) }))
}

export const paymentsQuerySchema = z.object({
  status: z.enum(['captured', 'failed', 'refunded']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
})

export async function payments(q: RangeQuery, o: z.infer<typeof paymentsQuerySchema>) {
  const where = o.status ? sql`${paymentWhere(q)} AND p.status = ${o.status}` : paymentWhere(q)
  const [rows, total] = await Promise.all([
    db.execute(sql`
      SELECT p.id, u.email, u.name, p.user_id, p.plan_id, p.interval, p.currency, p.amount_minor, p.status, p.method, p.failure_reason, p.provider, p.paid_at AT TIME ZONE 'UTC' AS paid_at
      ${FROM} WHERE ${where} ORDER BY p.paid_at DESC, p.id LIMIT ${o.limit} OFFSET ${o.offset}`),
    db.execute(sql`SELECT count(*)::int AS n ${FROM} WHERE ${where}`),
  ])
  return {
    total: num(total.rows[0]?.['n']), limit: o.limit, offset: o.offset,
    rows: rows.rows.map((x) => ({
      id: String(x['id']), userId: String(x['user_id']), email: (x['email'] as string | null) ?? null, name: (x['name'] as string | null) ?? null,
      planId: (x['plan_id'] as string | null) ?? null, interval: (x['interval'] as string | null) ?? null, currency: String(x['currency']),
      amountMinor: num(x['amount_minor']), status: String(x['status']), method: (x['method'] as string | null) ?? null,
      failureReason: (x['failure_reason'] as string | null) ?? null, provider: String(x['provider']), paidAt: new Date(x['paid_at'] as string).toISOString(),
    })),
  }
}

export async function topCustomers(q: RangeQuery, limit: number) {
  const r = await db.execute(sql`
    SELECT p.user_id, max(u.email) AS email, p.currency,
           sum(p.amount_minor)::float8 AS revenue, count(*)::int AS payments, max(p.paid_at) AT TIME ZONE 'UTC' AS last_paid
    ${FROM} WHERE ${paymentWhere(q)} AND p.status = 'captured'
    GROUP BY p.user_id, p.currency ORDER BY 4 DESC LIMIT ${limit}`)
  return r.rows.map((x) => ({ userId: String(x['user_id']), email: (x['email'] as string | null) ?? null, currency: String(x['currency']), revenueMinor: num(x['revenue']), payments: num(x['payments']), lastPaidAt: new Date(x['last_paid'] as string).toISOString() }))
}
