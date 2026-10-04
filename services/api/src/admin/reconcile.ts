import { asc, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db/index.ts'
import { cloudBalanceCheckin } from '../db/schema.ts'
import { env } from '../env.ts'

/**
 * Reconciling our AI usage ledger with what the cloud provider really billed. The provider's remaining trial credit has no
 * public API, so the owner types in the console figure now and then; between two readings
 *   provider burn  = earlier reading − later reading
 *   we recorded    = Σ provider_cost_usd in the window × INR_PER_USD
 *   unexplained    = burn − recorded   (spend that never went through our gateway)
 * Coverage = recorded / burn. All money here is INR (the console currency); the ledger's USD is converted at INR_PER_USD.
 */
export interface Checkin { id: string; amount: number; kind: string; readAt: Date; note: string | null; createdBy: string }
export interface Window { from: Date; to: Date; providerBurnInr: number; ledgerInr: number; unexplainedInr: number; coverage: number | null; calls: number; images: number }

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))

export async function ledgerInrBetween(from: Date, to: Date): Promise<{ inr: number; calls: number; images: number }> {
  const r = await db.execute(sql`
    SELECT coalesce(sum(provider_cost_usd),0)::float8 AS usd, count(*)::int AS calls, coalesce(sum(image_count),0)::int AS images
    FROM ai_usage_event WHERE created_at > ${from.toISOString()}::timestamp AND created_at <= ${to.toISOString()}::timestamp AND environment <> 'test'`)
  const row = r.rows[0] as { usd: number; calls: number; images: number }
  return { inr: n(row.usd) * env.INR_PER_USD, calls: n(row.calls), images: n(row.images) }
}

export const listCheckins = async (): Promise<Checkin[]> =>
  (await db.select().from(cloudBalanceCheckin).where(eq(cloudBalanceCheckin.provider, 'google')).orderBy(asc(cloudBalanceCheckin.readAt))).map((r) => ({ id: r.id, amount: n(r.amount), kind: r.kind, readAt: r.readAt, note: r.note, createdBy: r.createdBy }))

/** burn between two readings: credit_remaining falls, cumulative_spend rises (readings of one kind are compared with each other only) */
export const burnOf = (a: Checkin, b: Checkin) => (a.kind === 'credit_remaining' ? a.amount - b.amount : b.amount - a.amount)

export async function reconcile(now = new Date()) {
  const all = await listCheckins()
  const kind = all.at(-1)?.kind
  const readings = all.filter((c) => c.kind === kind)
  const windows: Window[] = []
  for (let i = 1; i < readings.length; i++) {
    const a = readings[i - 1]!, b = readings[i]!
    const led = await ledgerInrBetween(a.readAt, b.readAt)
    const burn = burnOf(a, b)
    windows.push({ from: a.readAt, to: b.readAt, providerBurnInr: burn, ledgerInr: led.inr, unexplainedInr: burn - led.inr, coverage: burn > 0 ? Math.min(led.inr / burn, 9.99) : null, calls: led.calls, images: led.images })
  }
  const last = readings.at(-1) ?? null
  const since = last ? await ledgerInrBetween(last.readAt, now) : null
  const burn = windows.reduce((s, w) => s + w.providerBurnInr, 0)
  const rec = windows.reduce((s, w) => s + w.ledgerInr, 0)
  const coverage = burn > 0 ? Math.min(rec / burn, 9.99) : null
  return {
    checkins: [...all].reverse(),
    windows: [...windows].reverse(),
    totals: { providerBurnInr: burn, ledgerInr: rec, unexplainedInr: burn - rec, coverage, windows: windows.length },
    sinceLast: last && since ? { readAt: last.readAt, amount: last.amount, kind: last.kind, ledgerInr: since.inr, calls: since.calls, images: since.images, estimatedNow: last.kind === 'credit_remaining' ? last.amount - since.inr : last.amount + since.inr, estimatedNowAtCoverage: coverage && coverage > 0 ? (last.kind === 'credit_remaining' ? last.amount - since.inr / coverage : last.amount + since.inr / coverage) : null } : null,
    inrPerUsd: env.INR_PER_USD,
  }
}

export async function addCheckin(by: string, input: { amount: number; kind: 'credit_remaining' | 'cumulative_spend'; readAt?: Date | undefined; note?: string | undefined }) {
  const id = nanoid()
  await db.insert(cloudBalanceCheckin).values({ id, provider: 'google', currency: 'INR', amount: input.amount.toFixed(2), kind: input.kind, readAt: input.readAt ?? new Date(), note: input.note ?? null, createdBy: by })
  return id
}
export const removeCheckin = async (id: string) => (await db.delete(cloudBalanceCheckin).where(eq(cloudBalanceCheckin.id, id)).returning({ id: cloudBalanceCheckin.id })).length === 1
