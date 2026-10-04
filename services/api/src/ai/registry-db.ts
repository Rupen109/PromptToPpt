import { eq } from 'drizzle-orm'
import { ModelRegistry, type AccessTier, type ModelDefinition, type RoutingConfig } from '@prompttoppt/ai'
import { db } from '../db/index.ts'
import { modelCatalog } from '../db/schema.ts'
import { env } from '../env.ts'

const num = (v: string | null) => (v === null ? undefined : Number(v))

export type CatalogRow = typeof modelCatalog.$inferSelect

export function toDefinition(r: CatalogRow): ModelDefinition {
  return {
    id: r.id, displayName: r.displayName, vendor: r.vendor, description: r.description, accessTier: r.accessTier as AccessTier,
    provider: r.provider, model: r.modelId, tier: r.kind === 'image' ? 'image' : r.routeFast !== null ? 'fast' : 'quality',
    capabilities: { text: r.kind === 'text', vision: true, structuredOutput: true, toolUse: false, imageGeneration: r.kind === 'image', contextWindow: r.contextWindow },
    pricing: {
      inputPerMTokUsd: Number(r.inputPerMTokUsd), outputPerMTokUsd: Number(r.outputPerMTokUsd),
      ...(r.cachedInputPerMTokUsd !== null ? { cachedInputPerMTokUsd: num(r.cachedInputPerMTokUsd)! } : {}),
      ...(r.perImageUsd !== null ? { perImageUsd: num(r.perImageUsd)! } : {}),
      sourceUrl: r.pricingSourceUrl, verifiedOn: r.pricingVerifiedOn, ...(r.pricingNote ? { note: r.pricingNote } : {}),
    },
  }
}

/** Rows this deployment may serve: enabled, allowed in this environment, and on a provider we actually have credentials for. */
export async function listCatalog(providers: Set<string>): Promise<CatalogRow[]> {
  const rows = await db.select().from(modelCatalog).where(eq(modelCatalog.enabled, true)).orderBy(modelCatalog.sortOrder)
  return rows.filter((r) => r.environments.includes(env.APP_ENV) && providers.has(r.provider))
}

export function buildRegistry(rows: CatalogRow[]): ModelRegistry {
  const byRoute = (key: 'routeFast' | 'routeQuality') =>
    rows.filter((r) => r[key] !== null && r.kind === 'text').sort((a, b) => a[key]! - b[key]!).map((r) => r.id)
  const routing: RoutingConfig = { chains: { fast: byRoute('routeFast'), quality: byRoute('routeQuality') } }
  return new ModelRegistry(rows.map(toDefinition), routing)
}

let cache: { at: number; registry: ModelRegistry; rows: CatalogRow[] } | null = null
const TTL_MS = 30_000

/** Cached for 30 s so a catalogue edit (price/tier/enabled) goes live without a deploy, but we don't hit the DB per AI call. */
export async function loadCatalog(providers: Set<string>) {
  if (cache && Date.now() - cache.at < TTL_MS) return cache
  const rows = await listCatalog(providers)
  cache = { at: Date.now(), rows, registry: buildRegistry(rows) }
  return cache
}
export const invalidateCatalog = () => {
  cache = null
}
