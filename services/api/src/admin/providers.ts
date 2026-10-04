import { sql } from 'drizzle-orm'
import { configuredProviders } from '../ai/gateway.ts'
import { razorpayEnabled, razorpayTestMode } from '../billing/razorpay.ts'
import { db } from '../db/index.ts'
import { env } from '../env.ts'
import { num, rangeOf, rangeSchema } from './range.ts'

/** Columns are `timestamp` (no tz) written as UTC by drizzle; bind range ends as UTC literals so the server's/driver's local zone never shifts the window. */
const ts = (d: Date) => sql`${d.toISOString()}::timestamp`

/** Per-provider health, spend reconciliation, catalogue state and a booleans-only integrations panel. Never returns a secret or key fragment. */

export const providersQuery = rangeSchema
export type ProvidersQuery = ReturnType<typeof rangeSchema.parse>

export const PRICING_STALE_DAYS = 30
export const RECONCILE_TOLERANCE = 0.05
const DAY = 864e5
const rate = (a: number, b: number) => (b > 0 ? a / b : 0)
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null)

/** Reconciliation over the calls where the provider reported a cost: delta = reported − computed. */
export function reconcile(computedOnReported: number, reported: number, reportedCalls: number) {
  if (reportedCalls === 0) return { comparable: false, delta: 0, deltaPct: 0, flagged: false }
  const delta = reported - computedOnReported
  const base = Math.max(computedOnReported, reported)
  const deltaPct = base > 0 ? delta / base : 0
  return { comparable: true, delta, deltaPct, flagged: Math.abs(deltaPct) > RECONCILE_TOLERANCE }
}

export async function providers(q: ProvidersQuery) {
  const { from, to } = rangeOf(q)
  const w = sql`e.created_at >= ${ts(from)} AND e.created_at < ${ts(to)}`
  const [agg, models, lastOk, lastErr, catalogRows, snaps] = await Promise.all([
    db.execute(sql`SELECT e.provider, count(*)::int AS calls, count(*) FILTER (WHERE e.status = 'success')::int AS ok, count(*) FILTER (WHERE e.status = 'error')::int AS failed,
        coalesce(avg(e.latency_ms),0)::float8 AS avg_ms, coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY e.latency_ms),0)::float8 AS p95_ms,
        coalesce(sum(e.provider_cost_usd),0)::float8 AS cost, coalesce(sum(e.provider_reported_cost_usd),0)::float8 AS reported,
        coalesce(sum(e.provider_cost_usd) FILTER (WHERE e.provider_reported_cost_usd IS NOT NULL),0)::float8 AS cost_on_reported,
        count(*) FILTER (WHERE e.provider_reported_cost_usd IS NOT NULL)::int AS reported_calls,
        coalesce(sum(e.input_tokens + e.output_tokens + e.reasoning_tokens),0)::float8 AS tokens, coalesce(sum(e.image_count),0)::float8 AS images
        FROM ai_usage_event e WHERE ${w} GROUP BY 1`),
    db.execute(sql`SELECT e.provider, e.model, count(*)::int AS calls, count(*) FILTER (WHERE e.status = 'error')::int AS failed, coalesce(sum(e.provider_cost_usd),0)::float8 AS cost
        FROM ai_usage_event e WHERE ${w} GROUP BY 1, 2 ORDER BY calls DESC`),
    db.execute(sql`SELECT e.provider, max(e.created_at) AS at FROM ai_usage_event e WHERE e.status = 'success' GROUP BY 1`),
    db.execute(sql`SELECT DISTINCT ON (e.provider) e.provider, e.error_code, e.created_at AS at FROM ai_usage_event e WHERE e.status = 'error' ORDER BY e.provider, e.created_at DESC`),
    db.execute(sql`SELECT id, provider, model_id, display_name, kind, access_tier, enabled, environments, pricing_verified_on FROM model_catalog ORDER BY provider, sort_order, model_id`),
    db.execute(sql`SELECT provider, model, max(captured_at) AS at FROM model_pricing_snapshot GROUP BY 1, 2`),
  ])
  const now = Date.now()
  const snapAt = new Map(snaps.rows.map((x) => [`${x['provider']}|${x['model']}`, new Date(x['at'] as string).getTime()]))
  const aggBy = new Map(agg.rows.map((x) => [String(x['provider']), x]))
  const okAt = new Map(lastOk.rows.map((x) => [String(x['provider']), iso(x['at'])]))
  const errBy = new Map(lastErr.rows.map((x) => [String(x['provider']), x]))
  const usedBy = new Map<string, Record<string, unknown>[]>()
  for (const m of models.rows) usedBy.set(String(m['provider']), [...(usedBy.get(String(m['provider'])) ?? []), m])

  const names = new Set<string>([...aggBy.keys(), ...okAt.keys(), ...errBy.keys(), ...catalogRows.rows.map((r) => String(r['provider'])), ...configuredProviders])
  const cards = [...names].sort().map((name) => {
    const a = aggBy.get(name)
    const calls = num(a?.['calls']), failed = num(a?.['failed'])
    const rec = reconcile(num(a?.['cost_on_reported']), num(a?.['reported']), num(a?.['reported_calls']))
    const e = errBy.get(name)
    const catalog = catalogRows.rows.filter((r) => String(r['provider']) === name).map((r) => {
      const at = snapAt.get(`${name}|${r['model_id']}`)
      const ageDays = at === undefined ? null : Math.floor((now - at) / DAY)
      return { id: String(r['id']), model: String(r['model_id']), displayName: String(r['display_name']), kind: String(r['kind']), accessTier: String(r['access_tier']), enabled: !!r['enabled'], environments: (r['environments'] as string[]) ?? [], pricingVerifiedOn: String(r['pricing_verified_on']), snapshotAgeDays: ageDays, pricingStale: ageDays === null ? true : ageDays > PRICING_STALE_DAYS }
    })
    return {
      provider: name, configured: configuredProviders.has(name), active: env.AI_PROVIDER === name,
      calls, successRate: rate(num(a?.['ok']), calls), errorRate: rate(failed, calls), failed,
      avgLatencyMs: Math.round(num(a?.['avg_ms'])), p95LatencyMs: Math.round(num(a?.['p95_ms'])),
      costUsd: num(a?.['cost']), reportedCostUsd: num(a?.['reported']), reportedCalls: num(a?.['reported_calls']), reconciliation: rec,
      tokens: num(a?.['tokens']), images: num(a?.['images']),
      lastSuccessAt: okAt.get(name) ?? null, lastError: e ? { code: (e['error_code'] as string | null) ?? 'unknown', at: iso(e['at']) } : null,
      modelsUsed: (usedBy.get(name) ?? []).map((m) => ({ model: String(m['model']), calls: num(m['calls']), failed: num(m['failed']), costUsd: num(m['cost']) })),
      catalog,
      enabledModels: catalog.filter((c) => c.enabled).length, disabledModels: catalog.filter((c) => !c.enabled).length,
      stalePricingModels: catalog.filter((c) => c.pricingStale).length,
    }
  })
  return { staleAfterDays: PRICING_STALE_DAYS, reconcileTolerance: RECONCILE_TOLERANCE, providers: cards, integrations: integrations() }
}

/** Booleans and names only. Anything secret-shaped is reduced to "configured yes/no". */
export function integrations() {
  const s3 = env.ASSET_STORAGE === 's3'
  return {
    ai: { active: env.AI_PROVIDER, configured: configuredProviders.size > 0, configuredProviders: [...configuredProviders].sort(), mock: env.AI_PROVIDER === 'mock', imagesEnabled: env.IMAGES_ENABLED },
    imageStorage: { driver: env.ASSET_STORAGE, configured: s3 ? !!env.ASSET_BUCKET && !!env.ASSET_REGION : true },
    payments: { provider: 'razorpay', configured: razorpayEnabled(), mode: razorpayEnabled() ? (razorpayTestMode() ? 'test' : 'live') : null, internationalEnabled: env.RAZORPAY_INTERNATIONAL, webhookConfigured: !!env.RAZORPAY_WEBHOOK_SECRET },
    email: { provider: null as string | null, configured: false, note: 'No transactional email provider is integrated yet.' },
    googleSignIn: { configured: !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET },
    environment: env.APP_ENV,
  }
}
