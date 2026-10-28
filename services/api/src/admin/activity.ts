import { sql } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { env } from '../env.ts'
import { listCheckins } from './reconcile.ts'
import { num } from './range.ts'

/**
 * Per-action cost report: what each kind of user action cost us at the provider, what the customer was charged in
 * credits (net of refunds), and — per plan — whether a fully used month of credits would still be profitable.
 *
 * Action buckets (from `ai_usage_event`): events carrying a `job_id` belong to a deck generation (prompt → deck); the rest
 * are keyed by request type (ai_edit, ai_assist, image…). Credits come from `credit_ledger` by `ref_type`
 * (job | ai_edit | ai_assist | image), reserves minus refunds. Test-environment rows and automated-test accounts (@example.com,
 * which the e2e suites create) are excluded from both sides so cost per credit compares like with like; `automatedCostInr` reports
 * what those accounts cost, so the total still ties to the provider's bill. `internal` = calls with no user (scripts such as
 * template-photo generation): real provider spend, but not a customer action, so it has no credits and is kept out of cost per credit.
 * Timestamps are UTC `timestamp without time zone`, so ranges go in as ISO strings (see margin.ts).
 */
const ts = (d: Date) => sql`${d.toISOString()}::timestamp`
const ACTIONS = ['deck_generation', 'ai_edit', 'ai_assist', 'image', 'other', 'free_tools', 'internal'] as const
type Action = (typeof ACTIONS)[number]
const CREDIT_REF: Record<string, Action> = { job: 'deck_generation', ai_edit: 'ai_edit', ai_assist: 'ai_assist', image: 'image' }
const ratio = (a: number, b: number) => (b > 0 ? a / b : null)

export async function activity(from: Date, to: Date) {
  const fx = env.INR_PER_USD
  const costRows = (await db.execute(sql`
    SELECT CASE WHEN request_type LIKE 'free\\_%' THEN 'free_tools' WHEN user_id IS NULL THEN 'internal' WHEN job_id IS NOT NULL THEN 'deck_generation'
                WHEN request_type IN ('ai_edit','ai_assist') THEN request_type
                WHEN request_type IN ('image','image_generation') THEN 'image' ELSE 'other' END AS action,
           count(*)::int AS calls, count(*) FILTER (WHERE status='error')::int AS errors,
           coalesce(sum(input_tokens),0)::float8 AS input_tokens, coalesce(sum(output_tokens),0)::float8 AS output_tokens,
           coalesce(sum(reasoning_tokens),0)::float8 AS reasoning_tokens, coalesce(sum(image_count),0)::int AS images,
           coalesce(sum(provider_cost_usd),0)::float8 AS usd, count(DISTINCT job_id)::int AS jobs
    FROM ai_usage_event WHERE created_at > ${ts(from)} AND created_at <= ${ts(to)} AND environment <> 'test' AND (user_id IS NULL OR user_id NOT IN (SELECT id FROM "user" WHERE email LIKE '%@example.com')) GROUP BY 1`)).rows as Array<Record<string, unknown>>
  const creditRows = (await db.execute(sql`
    SELECT ref_type, coalesce(sum(-delta) FILTER (WHERE reason='reserve'),0)::int AS charged,
           coalesce(sum(delta) FILTER (WHERE reason='refund'),0)::int AS refunded, count(*) FILTER (WHERE reason='reserve')::int AS actions
    FROM credit_ledger WHERE created_at > ${ts(from)} AND created_at <= ${ts(to)} AND reason IN ('reserve','refund')
      AND user_id NOT IN (SELECT id FROM "user" WHERE email LIKE '%@example.com') GROUP BY 1`)).rows as Array<Record<string, unknown>>

  const credits = new Map<Action, { charged: number; refunded: number; actions: number }>()
  for (const r of creditRows) {
    const a = CREDIT_REF[String(r['ref_type'])]
    if (!a) continue
    const cur = credits.get(a) ?? { charged: 0, refunded: 0, actions: 0 }
    credits.set(a, { charged: cur.charged + num(r['charged']), refunded: cur.refunded + num(r['refunded']), actions: cur.actions + num(r['actions']) })
  }
  const byAction = ACTIONS.map((action) => {
    const c = costRows.find((r) => r['action'] === action)
    const cr = credits.get(action) ?? { charged: 0, refunded: 0, actions: 0 }
    const usd = num(c?.['usd']), net = cr.charged - cr.refunded
    return {
      action, calls: num(c?.['calls']), errors: num(c?.['errors']), jobs: num(c?.['jobs']), actions: cr.actions, images: num(c?.['images']),
      inputTokens: num(c?.['input_tokens']), outputTokens: num(c?.['output_tokens']), reasoningTokens: num(c?.['reasoning_tokens']),
      costUsd: usd, costInr: usd * fx, creditsCharged: cr.charged, creditsRefunded: cr.refunded, creditsNet: net,
      costInrPerAction: ratio(usd * fx, cr.actions), costInrPerCredit: ratio(usd * fx, net),
    }
  })
  const totalUsd = byAction.reduce((s, a) => s + a.costUsd, 0)

  // Deck generations: one row per job with its cost, stage breakdown and what was charged.
  const jobRows = (await db.execute(sql`
    SELECT e.job_id, min(e.created_at AT TIME ZONE 'UTC') AS at, max(u.email) AS email, count(*)::int AS calls,
           coalesce(sum(e.provider_cost_usd),0)::float8 AS usd, coalesce(sum(e.image_count),0)::int AS images,
           coalesce(sum(e.provider_cost_usd) FILTER (WHERE e.request_type IN ('image','image_generation')),0)::float8 AS image_usd,
           max(j.status) AS status, coalesce(max((SELECT jsonb_array_length(v.document->'slides') FROM presentation_version v WHERE v.presentation_id = j.presentation_id AND v.created_by = 'generation' ORDER BY v.version LIMIT 1)),0)::int AS slides,
           coalesce(max(-l.delta) FILTER (WHERE l.reason='reserve'),0)::int AS charged, coalesce(max(l.delta) FILTER (WHERE l.reason='refund'),0)::int AS refunded
    FROM ai_usage_event e LEFT JOIN "user" u ON u.id = e.user_id LEFT JOIN generation_job j ON j.id = e.job_id
      LEFT JOIN credit_ledger l ON l.ref_type='job' AND l.ref_id = e.job_id
    WHERE e.job_id IS NOT NULL AND e.created_at > ${ts(from)} AND e.created_at <= ${ts(to)} AND e.environment <> 'test'
    GROUP BY e.job_id ORDER BY min(e.created_at) DESC LIMIT 25`)).rows as Array<Record<string, unknown>>
  const recentJobs = jobRows.map((r) => {
    const usd = num(r['usd']), slides = num(r['slides']), net = num(r['charged']) - num(r['refunded'])
    return {
      jobId: String(r['job_id']), at: r['at'] as string, email: (r['email'] as string | null) ?? null, status: (r['status'] as string | null) ?? null, calls: num(r['calls']),
      slides, images: num(r['images']), costUsd: usd, costInr: usd * fx, imageCostInr: num(r['image_usd']) * fx, creditsNet: net,
      costInrPerSlide: ratio(usd * fx, slides), costInrPerCredit: ratio(usd * fx, net),
    }
  })

  // Spend by model + request type (which stage burns the money).
  const stageRows = (await db.execute(sql`
    SELECT request_type, model, count(*)::int AS calls, coalesce(sum(provider_cost_usd),0)::float8 AS usd
    FROM ai_usage_event WHERE created_at > ${ts(from)} AND created_at <= ${ts(to)} AND environment <> 'test' AND (user_id IS NULL OR user_id NOT IN (SELECT id FROM "user" WHERE email LIKE '%@example.com')) GROUP BY 1,2 ORDER BY usd DESC LIMIT 20`)).rows as Array<Record<string, unknown>>
  const stages = stageRows.map((r) => ({ requestType: String(r['request_type']), model: String(r['model']), calls: num(r['calls']), costUsd: num(r['usd']), costInr: num(r['usd']) * fx, share: ratio(num(r['usd']), totalUsd) }))

  const auto = (await db.execute(sql`
    SELECT coalesce(sum(provider_cost_usd),0)::float8 AS usd FROM ai_usage_event WHERE created_at > ${ts(from)} AND created_at <= ${ts(to)} AND environment <> 'test'
      AND user_id IN (SELECT id FROM "user" WHERE email LIKE '%@example.com')`)).rows[0] as { usd: number }

  return { from, to, inrPerUsd: fx, automatedCostInr: num(auto.usd) * fx, totalCostUsd: totalUsd, totalCostInr: totalUsd * fx, byAction, recentJobs, stages }
}

/** Window the owner means by "since I last checked": last reading → now (or everything if there is none). */
export async function sinceLastCheckin(now = new Date()) {
  const all = await listCheckins()
  const last = all.at(-1)
  return { from: last?.readAt ?? new Date(0), to: new Date(now.getTime() + 1000), checkinAt: last?.readAt ?? null }
}

/**
 * Plan profitability: list price (INR, monthly) against the provider cost of using the whole credit grant. The cost per credit
 * is MEASURED from real spend (all net credits consumed vs all provider cost, all time) — not a guess — with a fallback
 * to null when nothing has been consumed yet. Image cost is included in that measured figure.
 */
export async function planEconomics() {
  const fx = env.INR_PER_USD
  const plans = (await db.execute(sql`
    SELECT p.id, p.name, p.monthly_credits, max(pp.amount_minor) FILTER (WHERE pp.currency='INR' AND pp.interval='month') AS inr_minor,
           max(pp.amount_minor) FILTER (WHERE pp.currency='USD' AND pp.interval='month') AS usd_minor
    FROM plan p LEFT JOIN plan_price pp ON pp.plan_id = p.id WHERE p.is_active GROUP BY p.id ORDER BY p.sort_order`)).rows as Array<Record<string, unknown>>
  const per = (await db.execute(sql`
    WITH c AS (
      SELECT CASE WHEN job_id IS NOT NULL THEN 'job' WHEN request_type IN ('image','image_generation') THEN 'image' ELSE request_type END AS ref, sum(provider_cost_usd)::float8 AS usd
      FROM ai_usage_event WHERE environment <> 'test' AND user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user" WHERE email LIKE '%@example.com') GROUP BY 1),
    k AS (
      SELECT ref_type AS ref, coalesce(sum(-delta) FILTER (WHERE reason='reserve'),0)::int - coalesce(sum(delta) FILTER (WHERE reason='refund'),0)::int AS net
      FROM credit_ledger WHERE reason IN ('reserve','refund') AND ref_type IN ('job','ai_edit','ai_assist','image')
        AND user_id NOT IN (SELECT id FROM "user" WHERE email LIKE '%@example.com') GROUP BY 1)
    SELECT k.ref, coalesce(c.usd,0)::float8 AS usd, k.net FROM k LEFT JOIN c USING (ref)`)).rows as Array<Record<string, unknown>>
  // Cost of non-job, non-image request types belongs to the edit/assist credits they ride on; picture_verify etc. run inside jobs.
  const byRef = per.map((r) => ({ ref: String(r['ref']), costInr: num(r['usd']) * fx, credits: num(r['net']) }))
  const perCredit = byRef.map((r) => ({ ...r, costInrPerCredit: ratio(r.costInr, r.credits) }))
  const totalCost = byRef.reduce((a, r) => a + r.costInr, 0), totalCredits = byRef.reduce((a, r) => a + r.credits, 0)
  const perCreditInr = ratio(totalCost, totalCredits)
  const known = perCredit.map((r) => r.costInrPerCredit).filter((v): v is number => v !== null)
  const worstPerCredit = known.length ? Math.max(...known) : null
  return {
    inrPerUsd: fx, measuredCostInrPerCredit: perCreditInr, worstCostInrPerCredit: worstPerCredit, creditsConsumed: totalCredits, byAction: perCredit,
    plans: plans.map((p) => {
      const priceInr = p['inr_minor'] !== null ? num(p['inr_minor']) / 100 : p['usd_minor'] !== null ? (num(p['usd_minor']) / 100) * fx : 0
      const credits = num(p['monthly_credits'])
      const worstCaseInr = perCreditInr === null ? null : perCreditInr * credits
      const worstInr = worstPerCredit === null ? null : worstPerCredit * credits
      return {
        planId: String(p['id']), name: String(p['name']), monthlyCredits: credits, priceInr, revenueInrPerCredit: ratio(priceInr, credits),
        costInrIfFullyUsed: worstCaseInr, marginInrIfFullyUsed: worstCaseInr === null ? null : priceInr - worstCaseInr,
        marginPctIfFullyUsed: worstCaseInr === null || priceInr === 0 ? null : ((priceInr - worstCaseInr) / priceInr) * 100,
        costInrIfAllWorstAction: worstInr, marginInrIfAllWorstAction: worstInr === null ? null : priceInr - worstInr,
        breakEvenCostInrPerCredit: ratio(priceInr, credits),
      }
    }),
  }
}
