import { db } from '../db/index.ts'
import { modelCatalog } from '../db/schema.ts'

type Row = typeof modelCatalog.$inferInsert
const GEMINI_URL = 'https://ai.google.dev/gemini-api/docs/pricing'
const OR_URL = 'https://openrouter.ai/api/v1/models'
const VERIFIED = '2026-10-02'
const VERTEX_URL = 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing'
const VERTEX_VERIFIED = '2026-10-06'
/** Gemini 3.6/3.7/3.8 Flash: introductory $0.75/$3.75 through 2026-12-31, standard $1.50/$7.50 from 2027-01-01 (Vertex pricing page). Re-run `pnpm catalog:vertex -- --apply` after the switch date. */
const FLASH_PROMO_ENDS = Date.UTC(2027, 0, 1)
const flashPrice = (now = Date.now()) => (now < FLASH_PROMO_ENDS ? ([0.75, 3.75] as const) : ([1.5, 7.5] as const))
const FLASH_NOTE = 'Introductory price $0.75/$3.75 through 2026-12-31; standard $1.50/$7.50 from 2027-01-01 (pricing doubles — re-run catalog:vertex then).'
const OLLAMA_URL = 'https://ollama.com/api/tags'
const DEV = ['development', 'staging']
const PROD = ['staging', 'production']
/** Gemini direct (AI Studio) is the MAIN route everywhere, production included (owner 2026-11-24); its rows are filed under "vertex" (same model ids, served by the AI Studio key too) */
const EVERYWHERE = ['development', 'staging', 'production']
const STUDIO = { pricingSourceUrl: 'https://aistudio.google.com/docs/pricing', pricingVerifiedOn: '2026-11-24', environments: EVERYWHERE }
/** switched off: customers get Gemini models only (owner 2026-11-24); rows kept for a later decision */
const OFF = { enabled: false, pricingNote: 'Switched off 2026-11-24: customers get Gemini models only (owner decision); kept for a later decision.' }

const vertex = (modelId: string, displayName: string, tier: Row['accessTier'], inUsd: number, outUsd: number, o: Partial<Row> = {}): Row => ({
  id: `vertex:${modelId}`, provider: 'vertex', modelId, displayName, vendor: 'Google', accessTier: tier, contextWindow: 1_000_000,
  inputPerMTokUsd: String(inUsd), outputPerMTokUsd: String(outUsd), pricingSourceUrl: VERTEX_URL, pricingVerifiedOn: VERTEX_VERIFIED,
  pricingNote: 'Vertex list price, global endpoint, ≤200K input tokens (checked against the Vertex pricing page 2026-10-06).',
  environments: DEV, ...o,
  // Vertex bills cached input at 10% of the input rate (text models); image models list their own rates.
  ...(o.kind === 'image' ? {} : { cachedInputPerMTokUsd: String(Math.round(inUsd * 0.1 * 1e6) / 1e6) }),
})
const or = (modelId: string, displayName: string, vendor: string, tier: Row['accessTier'], inUsd: number, outUsd: number, o: Partial<Row> = {}): Row => ({
  id: `openrouter:${modelId}`, provider: 'openrouter', modelId, displayName, vendor, accessTier: tier, contextWindow: 1_000_000,
  inputPerMTokUsd: String(inUsd), outputPerMTokUsd: String(outUsd), pricingSourceUrl: OR_URL, pricingVerifiedOn: VERIFIED,
  environments: PROD, ...o,
})

/**
 * Initial catalogue. Inserted only if missing (owner edits survive restarts); `pnpm catalog:sync` refreshes OpenRouter prices.
 * CREDIT CLASSES (the tier of a model sets what a slide costs, docs/PLANS_AND_FEATURES_V5.md): starter = the Gemini Flash models (2 credits a slide), premium = Haiku 4.5 and GLM-5.2 (3), frontier = the Studio picture model (Sonnet/Opus are switched off). Gemini 3.1 Pro is premium (5 a slide).
 * The plans Starter, Pro and Gold write with fixed Gemini models (`fixedModels` in the plan); only Premium picks from the rest.
 * LOCAL (Vertex): the models your key can reach (probed 2026-10-02; gemini-2.5-pro is not available in this project/region).
 * MAIN ROUTE everywhere: Gemini direct (AI Studio). OpenRouter = the backup with the same Gemini models (owner 2026-11-24). Tier placement is a PRODUCT decision — change it in
 * the table, no deploy needed. OpenRouter prices verified 2026-10-02 against the public OpenRouter catalogue.
 */
export const CATALOG_SEED: Row[] = [
  // ── local / development (Vertex) ──
  vertex('gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite', 'starter', 0.25, 1.5, { freeTier: true, description: 'Fast, low-cost starter model.', routeFast: 0, sortOrder: 10, ...STUDIO }),
  // closed to new Google accounts ("no longer available to new users"): kept for old accounts that still have it, switched off here so no call is wasted on it
  vertex('gemini-2.5-flash', 'Gemini 2.5 Flash', 'starter', 0.3, 2.5, { description: 'Reliable all-rounder.', routeFast: 1, sortOrder: 11, enabled: false }),
  vertex('gemini-3.6-flash', 'Gemini 3.6 Flash', 'starter', flashPrice()[0], flashPrice()[1], { freeTier: true, description: 'High-quality writing and structure.', routeQuality: 0, sortOrder: 20, ...STUDIO, pricingNote: FLASH_NOTE }),
  vertex('gemini-3.8-flash', 'Gemini 3.8 Flash', 'starter', flashPrice()[0], flashPrice()[1], { freeTier: true, description: 'Newest Flash generation.', routeQuality: 1, sortOrder: 21, ...STUDIO, pricingNote: FLASH_NOTE }),
  // Premium's "Pro AI model": credit class premium (5 credits a slide, 2.5x Flash; about 3x Flash's cost). Refuses thinking 0 (probed 2026-11-24), 128 works.
  vertex('gemini-3.1-pro-preview', 'Gemini 3.1 Pro (preview)', 'premium', 2, 12, { description: 'Google\'s most capable model: deeper reasoning for complex decks.', sortOrder: 30, minThinkingBudget: 128, ...STUDIO }),
  // not on Google's AI Studio pricing page (checked 2026-11-24): development only
  vertex('gemini-3.5-flash', 'Gemini 3.5 Flash', 'frontier', 1.5, 9, { description: 'Premium Flash with extra depth.', sortOrder: 31 }),
  // images — probed OK on the local key 2026-10-02 (≈1,120 image tokens per 16:9 image). perImageUsd is a CONSERVATIVE 1K estimate (Google prices by resolution).
  vertex('gemini-3.1-flash-lite-image', 'Fast images', 'starter', 0.25, 1.5, { kind: 'image', perImageUsd: '0.0336', contextWindow: 32000, description: 'Quick, clean illustrations. Cheapest.', sortOrder: 90, ...STUDIO }),
  vertex('gemini-3.1-flash-image', 'Balanced images', 'premium', 0.5, 3, { kind: 'image', perImageUsd: '0.067', contextWindow: 131000, description: 'Sharper detail and better prompt-following.', sortOrder: 91, ...STUDIO }),
  vertex('gemini-3-pro-image', 'Studio images (Nano Banana Pro)', 'frontier', 2, 12, { kind: 'image', perImageUsd: '0.134', contextWindow: 131000, description: 'Highest quality, best text and detail.', sortOrder: 92, ...STUDIO }),

  // ── load tests (Ollama cloud, AI_PROVIDER=ollama): usage is covered by the Ollama plan, so the price is 0 and the cost the ledger shows is NOT a real bill. In both
  //    chains, so every route (fast and quality) works with this one model; starter tier so every plan may use it. Development only: never offered in production.
  { id: 'ollama:glm-5.3-flash', provider: 'ollama', modelId: 'glm-5.3-flash', displayName: 'GLM-5.3 Flash (Ollama, load tests)', vendor: 'Z.ai', accessTier: 'starter', contextWindow: 128000,
    inputPerMTokUsd: '0', outputPerMTokUsd: '0', pricingSourceUrl: OLLAMA_URL, pricingVerifiedOn: '2026-11-03', pricingNote: 'Covered by the Ollama plan (flat): priced at 0 so load tests do not distort the cost numbers.',
    description: 'Open model for load tests.', environments: ['development'], routeFast: 0, routeQuality: 0, sortOrder: 5 },

  // ── OpenRouter: the BACKUP behind Gemini direct (AI_BACKUP_PROVIDER=openrouter). Only its Gemini rows are used, as twins of the main Gemini models (registry-db buildRegistry);
  //    the other makers' rows are kept switched off (owner 2026-11-24: Gemini models only).
  or('google/gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite', 'Google', 'starter', 0.25, 1.5, { description: 'Fast, low-cost starter model.', routeFast: 0, sortOrder: 10, environments: EVERYWHERE }),
  or('z-ai/glm-5.3-flash', 'GLM-5.3 Flash', 'Z.ai', 'starter', 0.15, 0.5, { description: 'Very low-cost starter model.', routeFast: 1, sortOrder: 11, ...OFF }),
  or('anthropic/claude-haiku-4.5', 'Claude Haiku 4.5', 'Anthropic', 'premium', 1, 5, { contextWindow: 200000, description: 'Fast and sharp.', sortOrder: 20, ...OFF }),
  or('z-ai/glm-5.2', 'GLM-5.2', 'Z.ai', 'premium', 0.41, 3.99, { description: 'Strong open-weight model.', sortOrder: 21, ...OFF }),
  or('anthropic/claude-sonnet-4.6', 'Claude Sonnet 4.6', 'Anthropic', 'frontier', 3, 15, { description: 'Best balance of quality and speed.', sortOrder: 22, ...OFF }),
  or('google/gemini-3.6-flash', 'Gemini 3.6 Flash', 'Google', 'starter', 0.75, 3.75, { description: 'High-quality writing and structure.', routeQuality: 0, sortOrder: 23, pricingNote: 'Google promo price through 2026-12-31.', environments: EVERYWHERE }),
  or('google/gemini-3.8-flash', 'Gemini 3.8 Flash', 'Google', 'starter', 0.825, 4.125, { description: 'Newest Flash generation.', routeQuality: 1, sortOrder: 24, environments: EVERYWHERE }),
  or('google/gemini-2.5-flash', 'Gemini 2.5 Flash', 'Google', 'starter', 0.3, 2.5, { description: 'Reliable all-rounder.', routeFast: 2, sortOrder: 12, ...OFF }),
  or('anthropic/claude-opus-4.6', 'Claude Opus 4.6', 'Anthropic', 'frontier', 5, 25, { description: 'Deep, careful writing.', sortOrder: 33, ...OFF }),
  or('anthropic/claude-opus-4.8', 'Claude Opus 4.8', 'Anthropic', 'frontier', 5, 25, { description: 'Top-tier Opus quality.', sortOrder: 34, ...OFF }),
  or('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5', 'Anthropic', 'frontier', 2, 10, { description: 'Latest-generation Sonnet.', sortOrder: 30, ...OFF }),
  or('anthropic/claude-opus-5.5', 'Claude Opus 5.5', 'Anthropic', 'frontier', 4, 20, { description: 'Latest-generation Opus.', sortOrder: 31, ...OFF }),
  or('google/gemini-3.1-pro-preview', 'Gemini 3.1 Pro (preview)', 'Google', 'premium', 2, 12, { description: 'Google\'s most capable model: deeper reasoning for complex decks.', sortOrder: 32, minThinkingBudget: 128, environments: EVERYWHERE }),
  or('google/gemini-3.1-flash-lite-image', 'Fast images', 'Google', 'starter', 0.25, 1.5, { kind: 'image', perImageUsd: '0.0336', contextWindow: 65536, description: 'Quick, clean illustrations. Cheapest.', sortOrder: 90, environments: EVERYWHERE }),
  or('google/gemini-3.1-flash-image', 'Balanced images', 'Google', 'premium', 0.5, 3, { kind: 'image', perImageUsd: '0.067', contextWindow: 131072, description: 'Sharper detail and better prompt-following.', sortOrder: 91, environments: EVERYWHERE }),
  or('google/gemini-3-pro-image', 'Studio images (Nano Banana Pro)', 'Google', 'frontier', 2, 12, { kind: 'image', perImageUsd: '0.134', contextWindow: 131072, description: 'Highest quality, best text and detail.', sortOrder: 92, environments: EVERYWHERE }),
]

export async function seedCatalog(): Promise<void> {
  await db.insert(modelCatalog).values(CATALOG_SEED).onConflictDoNothing()
}
