import { db } from '../db/index.ts'
import { modelCatalog } from '../db/schema.ts'

type Row = typeof modelCatalog.$inferInsert
const GEMINI_URL = 'https://ai.google.dev/gemini-api/docs/pricing'
const OR_URL = 'https://openrouter.ai/api/v1/models'
const VERIFIED = '2026-10-02'
const DEV = ['development', 'staging']
const PROD = ['staging', 'production']

const vertex = (modelId: string, displayName: string, tier: Row['accessTier'], inUsd: number, outUsd: number, o: Partial<Row> = {}): Row => ({
  id: `vertex:${modelId}`, provider: 'vertex', modelId, displayName, vendor: 'Google', accessTier: tier, contextWindow: 1_000_000,
  inputPerMTokUsd: String(inUsd), outputPerMTokUsd: String(outUsd), pricingSourceUrl: GEMINI_URL, pricingVerifiedOn: VERIFIED,
  pricingNote: 'ESTIMATE: AI Studio list price assumed for Vertex (Vertex pricing page not retrievable). Reconcile with Cloud Billing.',
  environments: DEV, ...o,
})
const or = (modelId: string, displayName: string, vendor: string, tier: Row['accessTier'], inUsd: number, outUsd: number, o: Partial<Row> = {}): Row => ({
  id: `openrouter:${modelId}`, provider: 'openrouter', modelId, displayName, vendor, accessTier: tier, contextWindow: 1_000_000,
  inputPerMTokUsd: String(inUsd), outputPerMTokUsd: String(outUsd), pricingSourceUrl: OR_URL, pricingVerifiedOn: VERIFIED,
  environments: PROD, ...o,
})

/**
 * Initial catalogue. Inserted only if missing (owner edits survive restarts); `pnpm catalog:sync` refreshes OpenRouter prices.
 * LOCAL (Vertex): the models your key can reach (probed 2026-10-02; gemini-2.5-pro is not available in this project/region).
 * PRODUCTION (OpenRouter): the models you named + current equivalents. Tier placement is a PRODUCT decision — change it in
 * the table, no deploy needed. Prices verified 2026-10-02 against the public OpenRouter catalogue.
 */
export const CATALOG_SEED: Row[] = [
  // ── local / development (Vertex) ──
  vertex('gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite', 'starter', 0.25, 1.5, { description: 'Fast, low-cost starter model.', routeFast: 0, sortOrder: 10 }),
  vertex('gemini-2.5-flash', 'Gemini 2.5 Flash', 'starter', 0.3, 2.5, { description: 'Reliable all-rounder.', routeFast: 1, sortOrder: 11 }),
  vertex('gemini-3.6-flash', 'Gemini 3.6 Flash', 'premium', 0.75, 3.75, { description: 'High-quality writing and structure.', routeQuality: 0, sortOrder: 20, pricingNote: 'ESTIMATE (AI Studio price); promotional through 2026-12-31, rises 2027-01-01.' }),
  vertex('gemini-3.8-flash', 'Gemini 3.8 Flash', 'premium', 0.75, 3.75, { description: 'Newest Flash generation.', routeQuality: 1, sortOrder: 21, pricingNote: 'ESTIMATE (AI Studio price); promotional through 2026-12-31, rises 2027-01-01.' }),
  vertex('gemini-3.1-pro-preview', 'Gemini 3.1 Pro (preview)', 'frontier', 2, 12, { description: 'Deepest reasoning for complex decks.', sortOrder: 30 }),
  vertex('gemini-3.5-flash', 'Gemini 3.5 Flash', 'frontier', 1.5, 9, { description: 'Premium Flash with extra depth.', sortOrder: 31 }),
  // images — probed OK on the local key 2026-10-02 (≈1,120 image tokens per 16:9 image). perImageUsd is a CONSERVATIVE 1K estimate (Google prices by resolution).
  vertex('gemini-3.1-flash-lite-image', 'Fast images', 'starter', 0.25, 1.5, { kind: 'image', perImageUsd: '0.0336', contextWindow: 32000, description: 'Quick, clean illustrations. Cheapest.', sortOrder: 90 }),
  vertex('gemini-3.1-flash-image', 'Balanced images', 'premium', 0.5, 3, { kind: 'image', perImageUsd: '0.067', contextWindow: 131000, description: 'Sharper detail and better prompt-following.', sortOrder: 91 }),
  vertex('gemini-3-pro-image', 'Studio images (Nano Banana Pro)', 'frontier', 2, 12, { kind: 'image', perImageUsd: '0.134', contextWindow: 131000, description: 'Highest quality, best text and detail.', sortOrder: 92 }),

  // ── production (OpenRouter) ──
  or('google/gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite', 'Google', 'starter', 0.25, 1.5, { description: 'Fast, low-cost starter model.', routeFast: 0, sortOrder: 10 }),
  or('z-ai/glm-5.3-flash', 'GLM-5.3 Flash', 'Z.ai', 'starter', 0.15, 0.5, { description: 'Very low-cost starter model.', routeFast: 1, sortOrder: 11 }),
  or('anthropic/claude-haiku-4.5', 'Claude Haiku 4.5', 'Anthropic', 'premium', 1, 5, { contextWindow: 200000, description: 'Fast and sharp.', sortOrder: 20 }),
  or('z-ai/glm-5.2', 'GLM-5.2', 'Z.ai', 'premium', 0.41, 3.99, { description: 'Strong open-weight model.', sortOrder: 21 }),
  or('anthropic/claude-sonnet-4.6', 'Claude Sonnet 4.6', 'Anthropic', 'premium', 3, 15, { description: 'Best balance of quality and speed.', routeQuality: 0, sortOrder: 22 }),
  or('google/gemini-3.6-flash', 'Gemini 3.6 Flash', 'Google', 'premium', 0.75, 3.75, { description: 'High-quality writing and structure.', routeQuality: 1, sortOrder: 23, pricingNote: 'Google promo price through 2026-12-31.' }),
  or('anthropic/claude-opus-4.6', 'Claude Opus 4.6', 'Anthropic', 'frontier', 5, 25, { description: 'Deep, careful writing.', sortOrder: 33, pricingNote: 'Moved to Gold: at 5 credits/slide Opus-class cost exceeds revenue on India Pro (docs/PRICING_MODEL.md).' }),
  or('anthropic/claude-opus-4.8', 'Claude Opus 4.8', 'Anthropic', 'frontier', 5, 25, { description: 'Top-tier Opus quality.', sortOrder: 34, pricingNote: 'Moved to Gold: see docs/PRICING_MODEL.md.' }),
  or('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5', 'Anthropic', 'frontier', 2, 10, { description: 'Latest-generation Sonnet.', sortOrder: 30 }),
  or('anthropic/claude-opus-5.5', 'Claude Opus 5.5', 'Anthropic', 'frontier', 4, 20, { description: 'Latest-generation Opus.', sortOrder: 31 }),
  or('google/gemini-3.1-pro-preview', 'Gemini 3.1 Pro (preview)', 'Google', 'frontier', 2, 12, { description: 'Deepest reasoning for complex decks.', sortOrder: 32 }),
  or('google/gemini-3.1-flash-lite-image', 'Fast images', 'Google', 'starter', 0.25, 1.5, { kind: 'image', perImageUsd: '0.0336', contextWindow: 65536, description: 'Quick, clean illustrations. Cheapest.', sortOrder: 90 }),
  or('google/gemini-3.1-flash-image', 'Balanced images', 'Google', 'premium', 0.5, 3, { kind: 'image', perImageUsd: '0.067', contextWindow: 131072, description: 'Sharper detail and better prompt-following.', sortOrder: 91 }),
  or('google/gemini-3-pro-image', 'Studio images (Nano Banana Pro)', 'Google', 'frontier', 2, 12, { kind: 'image', perImageUsd: '0.134', contextWindow: 131072, description: 'Highest quality, best text and detail.', sortOrder: 92 }),
]

export async function seedCatalog(): Promise<void> {
  await db.insert(modelCatalog).values(CATALOG_SEED).onConflictDoNothing()
}
