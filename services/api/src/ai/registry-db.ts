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
    ...(r.minThinkingBudget !== null ? { minThinkingBudget: r.minThinkingBudget } : {}),
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
  return rows.filter((r) => r.environments.includes(env.APP_ENV) && providers.has(r.provider) && (env.AI_KEY_TIER === 'paid' || r.freeTier))
}

/** A model's name without its provider: "google/gemini-3.6-flash" (OpenRouter) and "gemini-3.6-flash" (Gemini direct) are the same model. */
export const modelStem = (r: Pick<CatalogRow, 'modelId'>) => r.modelId.split('/').pop()!

/**
 * The registry from the MAIN provider's rows; rows on the `backup` provider become the backups of the main models they match (same model name and kind). A backup row
 * with no main twin is never used: the backup serves the SAME models through another door, never different ones.
 */
export function buildRegistry(rows: CatalogRow[], backup?: string, keyTier: 'paid' | 'free' = 'paid'): ModelRegistry {
  const main = backup ? rows.filter((r) => r.provider !== backup) : rows
  const byRoute = (key: 'routeFast' | 'routeQuality') =>
    main.filter((r) => r[key] !== null && r.kind === 'text').sort((a, b) => a[key]! - b[key]!).map((r) => r.id)
  const fast = byRoute('routeFast'), quality = byRoute('routeQuality')
  // A free-tier key: Google turns free traffic away first when a model is busy ("high demand", seen on QA 2026-11-24) and allows only ~20 calls a day on each Flash
  // model (~500 on Flash-Lite). So each route ends with the other route's models: a busy or used-up model never stops a deck while another free model can answer.
  const routing: RoutingConfig = keyTier === 'free'
    ? { chains: { fast: [...fast, ...quality.filter((id) => !fast.includes(id))], quality: [...quality, ...fast.filter((id) => !quality.includes(id))] } }
    : { chains: { fast, quality } }
  const backups = new Map<string, ModelDefinition>()
  if (backup) {
    const spare = rows.filter((r) => r.provider === backup)
    for (const m of main) {
      const twin = spare.find((b) => modelStem(b) === modelStem(m) && b.kind === m.kind)
      // the twin bills the person in the main model's credit class (same model); its own price is what the provider charges us
      if (twin) backups.set(m.id, { ...toDefinition(twin), accessTier: m.accessTier as AccessTier })
    }
  }
  return new ModelRegistry(main.map(toDefinition), routing, backups)
}

let cache: { at: number; registry: ModelRegistry; rows: CatalogRow[] } | null = null
const TTL_MS = 30_000

/**
 * Cached for 30 s so a catalogue edit (price/tier/enabled) goes live without a deploy, but we don't hit the DB per AI call.
 * `rows` are the models people see and plans choose from: the MAIN provider's only (backup rows live inside the registry, never shown, never picked).
 */
export async function loadCatalog(providers: Set<string>, backup?: string) {
  if (cache && Date.now() - cache.at < TTL_MS) return cache
  const all = await listCatalog(providers)
  cache = { at: Date.now(), rows: backup ? all.filter((r) => r.provider !== backup) : all, registry: buildRegistry(all, backup, env.AI_KEY_TIER) }
  return cache
}
export const invalidateCatalog = () => {
  cache = null
}
