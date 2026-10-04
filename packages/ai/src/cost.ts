import type { ModelPricing, Usage } from './types'

/**
 * USD cost from normalised usage and a pricing snapshot.
 * Gemini semantics: promptTokenCount INCLUDES cached tokens; thinking tokens are billed at the output rate.
 */
export function computeCostUsd(usage: Usage, p: Pick<ModelPricing, 'inputPerMTokUsd' | 'outputPerMTokUsd' | 'cachedInputPerMTokUsd' | 'perImageUsd'>): number {
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedTokens)
  const cachedRate = p.cachedInputPerMTokUsd ?? p.inputPerMTokUsd
  const cost =
    (uncachedInput * p.inputPerMTokUsd) / 1e6 +
    (usage.cachedTokens * cachedRate) / 1e6 +
    ((usage.outputTokens + usage.reasoningTokens) * p.outputPerMTokUsd) / 1e6 +
    usage.imageCount * (p.perImageUsd ?? 0)
  return Math.round(cost * 1e8) / 1e8
}
