import type { ModelDefinition, RouteClass } from './types'

const GEMINI_PRICING_URL = 'https://ai.google.dev/gemini-api/docs/pricing'
const VERIFIED = '2026-10-02'

const text = (contextWindow: number) => ({ text: true, vision: true, structuredOutput: true, toolUse: true, imageGeneration: false, contextWindow })

/**
 * Model registry (spec §13). Prices are USD per 1M tokens from the official page on `verifiedOn`.
 * Pricing is also persisted as a snapshot row on first use so historical cost stays reproducible
 * after providers change prices.
 */
const GEMINI_BASE: ModelDefinition[] = [
  {
    provider: 'gemini', model: 'gemini-3.1-flash-lite', tier: 'fast', capabilities: text(1_000_000),
    pricing: { inputPerMTokUsd: 0.25, outputPerMTokUsd: 1.5, cachedInputPerMTokUsd: 0.025, sourceUrl: GEMINI_PRICING_URL, verifiedOn: VERIFIED },
  },
  {
    provider: 'gemini', model: 'gemini-2.5-flash-lite', tier: 'fast', capabilities: text(1_000_000),
    pricing: { inputPerMTokUsd: 0.1, outputPerMTokUsd: 0.4, cachedInputPerMTokUsd: 0.01, sourceUrl: GEMINI_PRICING_URL, verifiedOn: VERIFIED },
  },
  {
    provider: 'gemini', model: 'gemini-3.6-flash', tier: 'quality', capabilities: text(1_000_000),
    pricing: {
      inputPerMTokUsd: 0.75, outputPerMTokUsd: 3.75, cachedInputPerMTokUsd: 0.075, sourceUrl: GEMINI_PRICING_URL, verifiedOn: VERIFIED,
      note: 'Promotional price through 2026-12-31; Google raises it on 2027-01-01 — re-verify and add a new snapshot.',
    },
  },
  {
    provider: 'gemini', model: 'gemini-2.5-flash', tier: 'quality', capabilities: text(1_000_000),
    pricing: { inputPerMTokUsd: 0.3, outputPerMTokUsd: 2.5, cachedInputPerMTokUsd: 0.03, sourceUrl: GEMINI_PRICING_URL, verifiedOn: VERIFIED },
  },
  {
    provider: 'gemini', model: 'gemini-3.1-flash-lite-image', tier: 'image',
    capabilities: { text: false, vision: true, structuredOutput: false, toolUse: false, imageGeneration: true, contextWindow: 32_000 },
    pricing: { inputPerMTokUsd: 0.25, outputPerMTokUsd: 0, perImageUsd: 0.0168, sourceUrl: GEMINI_PRICING_URL, verifiedOn: VERIFIED, note: 'Per-image price varies by resolution ($0.0168–0.0336); lowest tier recorded. Needs a billing-enabled key.' },
  },
]

/**
 * The same models served by a given backend. Vertex list prices are assumed equal to the AI Studio paid tier
 * until verified against https://cloud.google.com/vertex-ai/generative-ai/pricing — costs recorded for 'vertex'
 * are therefore ESTIMATES; reconcile against the Cloud Billing report.
 */
export function geminiModels(provider: 'gemini' | 'vertex' = 'gemini'): ModelDefinition[] {
  return GEMINI_BASE.map((m) => ({
    ...m,
    provider,
    pricing: provider === 'vertex' ? { ...m.pricing, sourceUrl: 'https://cloud.google.com/vertex-ai/generative-ai/pricing', note: `ESTIMATE: AI Studio list price assumed for Vertex. ${m.pricing.note ?? ''}`.trim() } : m.pricing,
  }))
}
export const GEMINI_MODELS = geminiModels('gemini')

export interface RoutingConfig {
  /** e.g. { fast: ['gemini-3.1-flash-lite', ...], quality: [...] } — first is primary, rest are fallbacks */
  chains: Record<RouteClass, string[]>
}

export const DEFAULT_ROUTING: RoutingConfig = {
  chains: {
    fast: ['gemini-3.1-flash-lite', 'gemini-2.5-flash'],
    quality: ['gemini-3.6-flash', 'gemini-2.5-flash'],
  },
}

export class ModelRegistry {
  private readonly byModel = new Map<string, ModelDefinition>()
  constructor(
    models: ModelDefinition[] = GEMINI_MODELS,
    private readonly routing: RoutingConfig = DEFAULT_ROUTING,
  ) {
    for (const m of models) this.byModel.set(m.id ?? m.model, m)
  }
  /**
   * Chain for a model the user picked: that model first, then other text models of the SAME access tier.
   * Never silently downgrades to a cheaper tier — the user is charged for the tier they chose.
   */
  chainFor(modelId: string, max = 3): ModelDefinition[] {
    const picked = this.get(modelId)
    if (!picked || picked.tier === 'image') return []
    const same = [...this.byModel.values()].filter((m) => m !== picked && m.accessTier === picked.accessTier && m.tier !== 'image' && m.capabilities.text)
    return [picked, ...same].slice(0, max)
  }
  /** Same idea for pictures: the picked image model, then other image models of the SAME access tier (never a cheaper tier). */
  imageChainFor(modelId: string, max = 2): ModelDefinition[] {
    const picked = this.get(modelId)
    if (!picked || picked.tier !== 'image') return []
    const same = [...this.byModel.values()].filter((m) => m !== picked && m.tier === 'image' && m.accessTier === picked.accessTier)
    return [picked, ...same].slice(0, max)
  }
  get(model: string): ModelDefinition | undefined {
    return this.byModel.get(model) ?? [...this.byModel.values()].find((m) => m.id === model)
  }
  all(): ModelDefinition[] {
    return [...this.byModel.values()]
  }
  /** Ordered chain for a route class; models not in the registry are skipped (can't price → can't bill). */
  chain(route: RouteClass): ModelDefinition[] {
    return this.routing.chains[route].map((m) => this.get(m)).filter((m): m is ModelDefinition => !!m)
  }
}

/** Allow ops to re-point a class at different models without a deploy: GEMINI_MODEL_FAST / GEMINI_MODEL_QUALITY (comma list). */
export function routingFromEnv(env: { fast?: string | undefined; quality?: string | undefined }): RoutingConfig {
  const split = (v: string | undefined, d: string[]) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : d)
  return { chains: { fast: split(env.fast, DEFAULT_ROUTING.chains.fast), quality: split(env.quality, DEFAULT_ROUTING.chains.quality) } }
}
