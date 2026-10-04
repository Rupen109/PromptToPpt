import { and, desc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { ModelRegistry, UsageRecord } from '@prompttoppt/ai'
import { db } from '../db/index.ts'
import { aiUsageEvent, modelPricingSnapshot } from '../db/schema.ts'
import { env } from '../env.ts'

const same = (a: string | null, b: number | undefined) => (a === null ? b === undefined : b !== undefined && Math.abs(Number(a) - b) < 1e-9)

/**
 * Ensures the DB holds a pricing snapshot equal to the registry's current price and returns its id.
 * A changed price inserts a NEW row (old rows are never edited), so any past ledger entry still points at
 * the exact price it was computed with.
 */
const snapshotCache = new Map<string, string>()
export async function ensurePricingSnapshot(provider: string, model: string, p: UsageRecord['pricing']): Promise<string> {
  const key = `${provider}/${model}/${p.inputPerMTokUsd}/${p.outputPerMTokUsd}/${p.cachedInputPerMTokUsd ?? ''}/${p.perImageUsd ?? ''}`
  const hit = snapshotCache.get(key)
  if (hit) return hit

  const [latest] = await db
    .select()
    .from(modelPricingSnapshot)
    .where(and(eq(modelPricingSnapshot.provider, provider), eq(modelPricingSnapshot.model, model)))
    .orderBy(desc(modelPricingSnapshot.capturedAt))
    .limit(1)
  if (latest && same(latest.inputPerMTokUsd, p.inputPerMTokUsd) && same(latest.outputPerMTokUsd, p.outputPerMTokUsd) && same(latest.cachedInputPerMTokUsd, p.cachedInputPerMTokUsd) && same(latest.perImageUsd, p.perImageUsd)) {
    snapshotCache.set(key, latest.id)
    return latest.id
  }
  const id = nanoid()
  await db.insert(modelPricingSnapshot).values({
    id, provider, model,
    inputPerMTokUsd: String(p.inputPerMTokUsd), outputPerMTokUsd: String(p.outputPerMTokUsd),
    cachedInputPerMTokUsd: p.cachedInputPerMTokUsd === undefined ? null : String(p.cachedInputPerMTokUsd),
    perImageUsd: p.perImageUsd === undefined ? null : String(p.perImageUsd),
    sourceUrl: p.sourceUrl,
  })
  snapshotCache.set(key, id)
  return id
}

/** Gateway sink: one immutable row per model attempt (success or error). */
export async function recordUsage(r: UsageRecord): Promise<void> {
  const pricingSnapshotId = await ensurePricingSnapshot(r.provider, r.model, r.pricing)
  await db.insert(aiUsageEvent).values({
    id: nanoid(),
    userId: r.userId ?? null,
    presentationId: r.presentationId ?? null,
    jobId: r.jobId ?? null,
    provider: r.provider,
    model: r.model,
    modelVersion: r.modelVersion ?? null,
    requestType: r.requestType,
    inputTokens: r.usage.inputTokens,
    cachedTokens: r.usage.cachedTokens,
    outputTokens: r.usage.outputTokens,
    reasoningTokens: r.usage.reasoningTokens,
    imageCount: r.usage.imageCount,
    latencyMs: r.latencyMs,
    status: r.status,
    errorCode: r.errorCode ?? null,
    providerCostUsd: r.providerCostUsd.toFixed(8),
    providerReportedCostUsd: r.reportedCostUsd === undefined ? null : r.reportedCostUsd.toFixed(8),
    pricingSnapshotId,
    environment: env.APP_ENV,
  })
}

export type { ModelRegistry }
