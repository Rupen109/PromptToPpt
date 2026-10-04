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
 * Owner subscription analytics. `subscription` holds ONE live row per user (no event history), so "cancellations"
 * are rows currently cancelled / set to cancel at period end, dated by `updated_at` (the last time the row changed —
 * a close proxy for when it was cancelled, but not exact if a cancelled row is touched again).
 * "Paid" = a subscription in active, trialing or past_due (the user still holds the plan).
 */

const PAID = sql`('active','trialing','past_due')`
const SUB_STATUSES = ['active', 'trialing', 'past_due', 'cancelled', 'incomplete'] as const

export async function summary(q: RangeQuery) {
  const { from, to } = rangeOf(q)
  const now = new Date()
  const in7 = new Date(now.getTime() + 7 * 864e5), in30 = new Date(now.getTime() + 30 * 864e5)
  const [matrix, users, period, churn, renew, conv] = await Promise.all([
    db.execute(sql`SELECT s.plan_id, s.status, count(*)::int AS n FROM subscription s GROUP BY 1, 2 ORDER BY 1, 2`),
    db.execute(sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM subscription s WHERE s.user_id = u.id AND s.status IN ${PAID}))::int AS paid FROM "user" u`),
    db.execute(sql`
      SELECT count(*) FILTER (WHERE s.created_at >= ${ts(from)} AND s.created_at < ${ts(to)})::int AS created,
             count(*) FILTER (WHERE (s.status = 'cancelled' OR s.cancel_at_period_end) AND s.updated_at >= ${ts(from)} AND s.updated_at < ${ts(to)})::int AS cancelled,
             count(*) FILTER (WHERE s.cancel_at_period_end AND s.status IN ${PAID})::int AS cancelling
      FROM subscription s`),
    // churn = of the subscriptions alive at the start of the range, how many are now cancelled (changed within the range)
    db.execute(sql`
      SELECT count(*) FILTER (WHERE s.created_at < ${ts(from)} AND (s.status <> 'cancelled' OR s.updated_at >= ${ts(from)}))::int AS opening,
             count(*) FILTER (WHERE s.created_at < ${ts(from)} AND s.status = 'cancelled' AND s.updated_at >= ${ts(from)} AND s.updated_at < ${ts(to)})::int AS churned
      FROM subscription s`),
    db.execute(sql`
      SELECT s.currency,
             count(*) FILTER (WHERE s.current_period_end < ${ts(in7)})::int AS n7,
             count(*) FILTER (WHERE s.current_period_end < ${ts(in30)})::int AS n30,
             coalesce(sum(pp.amount_minor) FILTER (WHERE s.current_period_end < ${ts(in7)}),0)::float8 AS amt7,
             coalesce(sum(pp.amount_minor) FILTER (WHERE s.current_period_end < ${ts(in30)}),0)::float8 AS amt30
      FROM subscription s LEFT JOIN plan_price pp ON pp.plan_id = s.plan_id AND pp.currency = s.currency AND pp.interval = s.interval
      WHERE s.status = 'active' AND NOT s.cancel_at_period_end AND s.current_period_end >= ${ts(now)} AND s.current_period_end < ${ts(in30)}
      GROUP BY s.currency ORDER BY s.currency`),
    db.execute(sql`
      SELECT count(*)::int AS signups,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM subscription s WHERE s.user_id = u.id AND s.status = 'active'))::int AS converted
      FROM "user" u WHERE u.created_at >= ${ts(from)} AND u.created_at < ${ts(to)}`),
  ])
  const byPlan = new Map<string, Record<string, number>>()
  for (const x of matrix.rows) {
    const plan = String(x['plan_id'])
    byPlan.set(plan, { ...(byPlan.get(plan) ?? {}), [String(x['status'])]: num(x['n']) })
  }
  const plans = [...byPlan].map(([planId, c]) => ({ planId, counts: Object.fromEntries(SUB_STATUSES.map((s) => [s, c[s] ?? 0])) as Record<(typeof SUB_STATUSES)[number], number>, total: Object.values(c).reduce((a, b) => a + b, 0) }))
  const totalUsers = num(users.rows[0]?.['total']), paidUsers = num(users.rows[0]?.['paid'])
  const p = period.rows[0] ?? {}
  const opening = num(churn.rows[0]?.['opening']), churned = num(churn.rows[0]?.['churned'])
  const signups = num(conv.rows[0]?.['signups']), converted = num(conv.rows[0]?.['converted'])
  return {
    plans, statuses: SUB_STATUSES,
    users: { total: totalUsers, paid: paidUsers, free: Math.max(0, totalUsers - paidUsers), paidShare: totalUsers ? paidUsers / totalUsers : 0 },
    newSubscriptions: num(p['created']), cancellations: num(p['cancelled']), cancelAtPeriodEnd: num(p['cancelling']),
    churn: { openingSubscriptions: opening, churned, rate: opening ? churned / opening : null },
    renewals: renew.rows.map((x) => ({ currency: String(x['currency']), next7: num(x['n7']), next30: num(x['n30']), amount7Minor: num(x['amt7']), amount30Minor: num(x['amt30']) })),
    conversion: { signups, converted, rate: signups ? converted / signups : null },
  }
}

const BUCKETS = { day: sql`'day'`, week: sql`'week'`, month: sql`'month'` } as const
export const subsBucketSchema = z.enum(['day', 'week', 'month']).default('day')

export async function timeseries(q: RangeQuery, bucket: keyof typeof BUCKETS) {
  const { from, to } = rangeOf(q)
  const [created, cancelled] = await Promise.all([
    db.execute(sql`SELECT date_trunc(${BUCKETS[bucket]}, s.created_at) AT TIME ZONE 'UTC' AS t, count(*)::int AS n FROM subscription s WHERE s.created_at >= ${ts(from)} AND s.created_at < ${ts(to)} GROUP BY 1`),
    db.execute(sql`SELECT date_trunc(${BUCKETS[bucket]}, s.updated_at) AT TIME ZONE 'UTC' AS t, count(*)::int AS n FROM subscription s WHERE (s.status = 'cancelled' OR s.cancel_at_period_end) AND s.updated_at >= ${ts(from)} AND s.updated_at < ${ts(to)} GROUP BY 1`),
  ])
  const m = new Map<string, { t: string; created: number; cancelled: number }>()
  for (const [rows, k] of [[created.rows, 'created'], [cancelled.rows, 'cancelled']] as const) {
    for (const x of rows) {
      const t = new Date(x['t'] as string).toISOString()
      const e = m.get(t) ?? { t, created: 0, cancelled: 0 }
      e[k] = num(x['n'])
      m.set(t, e)
    }
  }
  return [...m.values()].sort((a, b) => a.t.localeCompare(b.t))
}

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(SUB_STATUSES).optional(),
  plan: z.string().max(40).optional(),
  cancelling: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
})

export async function list(o: z.infer<typeof listQuerySchema>) {
  const c: SQL[] = [sql`true`]
  if (o.q) {
    // escape LIKE wildcards in the user's text; the pattern itself is a bound parameter
    const pat = `%${o.q.replace(/[\\%_]/g, '\\$&')}%`
    c.push(sql`(u.email ILIKE ${pat} OR u.name ILIKE ${pat})`)
  }
  if (o.status) c.push(sql`s.status = ${o.status}`)
  if (o.plan) c.push(sql`s.plan_id = ${o.plan}`)
  if (o.cancelling) c.push(sql`s.cancel_at_period_end = ${o.cancelling === 'true'}`)
  const where = sql.join(c, sql` AND `)
  const FROM = sql`FROM subscription s JOIN "user" u ON u.id = s.user_id`
  const [rows, total] = await Promise.all([
    db.execute(sql`
      SELECT s.id, s.user_id, u.email, u.name, s.plan_id, s.status, s.interval, s.currency, s.current_period_end AT TIME ZONE 'UTC' AS current_period_end, s.provider, s.cancel_at_period_end, s.created_at AT TIME ZONE 'UTC' AS created_at
      ${FROM} WHERE ${where} ORDER BY s.current_period_end ASC, s.id LIMIT ${o.limit} OFFSET ${o.offset}`),
    db.execute(sql`SELECT count(*)::int AS n ${FROM} WHERE ${where}`),
  ])
  return {
    total: num(total.rows[0]?.['n']), limit: o.limit, offset: o.offset,
    rows: rows.rows.map((x) => ({
      id: String(x['id']), userId: String(x['user_id']), email: String(x['email']), name: String(x['name']), planId: String(x['plan_id']), status: String(x['status']),
      interval: String(x['interval']), currency: String(x['currency']), currentPeriodEnd: new Date(x['current_period_end'] as string).toISOString(),
      provider: String(x['provider']), cancelAtPeriodEnd: Boolean(x['cancel_at_period_end']), createdAt: new Date(x['created_at'] as string).toISOString(),
    })),
  }
}
