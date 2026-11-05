import { AIGateway, AI_STUDIO, GeminiProvider, MockProvider, OllamaProvider, OpenRouterProvider, ProviderLimiter, VERTEX, limitsFromMap, type AIProvider, type LimitConfig } from '@prompttoppt/ai'
import { env } from '../env.ts'
import { recordUsage } from './ledger.ts'
import { mockImage, mockRespond } from './mock-model.ts'
import { withLatency } from './mock-latency.ts'
import { loadCatalog } from './registry-db.ts'

/**
 * Exactly one backend serves the catalogue per deployment (mock serves all, for tests/key-less dev):
 *   local dev → vertex | gemini     production → openrouter     load tests → ollama (open models, covered by the Ollama plan)
 * Catalogue rows on any other provider are simply not offered.
 */
function buildProviders(): Record<string, AIProvider> {
  if (env.AI_PROVIDER === 'mock') {
    const mock = new MockProvider(mockRespond, mockImage)
    const served: AIProvider = env.MOCK_AI_LATENCY === 'realistic' ? withLatency(mock, { capacity: env.MOCK_AI_CAPACITY, refuseRate: env.MOCK_AI_REFUSE_RATE, scale: env.MOCK_AI_SCALE }) : mock
    return { gemini: served, vertex: served, openrouter: served }
  }
  if (env.AI_PROVIDER === 'openrouter') {
    return env.OPENROUTER_API_KEY ? { openrouter: new OpenRouterProvider({ apiKey: env.OPENROUTER_API_KEY, appUrl: env.WEB_URL, appName: 'SlidesDone' }) } : {}
  }
  if (env.AI_PROVIDER === 'ollama') {
    const local = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(env.OLLAMA_BASE_URL)
    return env.OLLAMA_API_KEY || local ? { ollama: new OllamaProvider({ apiKey: local ? '' : env.OLLAMA_API_KEY!, baseUrl: env.OLLAMA_BASE_URL, ...(env.OLLAMA_MODEL_OVERRIDE ? { modelOverride: env.OLLAMA_MODEL_OVERRIDE } : {}) }) } : {}
  }
  if (!env.GEMINI_API_KEY) return {} // API still boots; AI endpoints answer AI_NOT_CONFIGURED
  if (env.AI_PROVIDER === 'vertex') return { vertex: new GeminiProvider(env.GEMINI_API_KEY, VERTEX) }
  // AI Studio (a key made at aistudio.google.com): the catalogue's local-dev Gemini rows are filed under "vertex" (same model ids), so this backend serves them too
  const studio = new GeminiProvider(env.GEMINI_API_KEY, AI_STUDIO)
  return { gemini: studio, vertex: studio }
}

const providers = buildProviders()
export const configuredProviders = new Set(Object.keys(providers))
export const aiConfigured = configuredProviders.size > 0

export const catalog = () => loadCatalog(configuredProviders)

/** every model call takes its turn here: steady admission, back-off on a 429, a cap on retries (packages/ai/src/limiter.ts) */
export const limiter = new ProviderLimiter({ limits: limitsFromMap(JSON.parse(env.AI_LIMITS) as Record<string, LimitConfig>) })

export const gateway = new AIGateway({
  providers,
  limiter,
  registry: async () => (await catalog()).registry,
  recordUsage,
  onFallback: (from, to, reason) => console.warn(`[ai] fallback ${from} -> ${to}: ${reason}`),
})
