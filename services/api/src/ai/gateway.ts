import { AIGateway, AI_STUDIO, GeminiProvider, MockProvider, OpenRouterProvider, VERTEX, type AIProvider } from '@prompttoppt/ai'
import { env } from '../env.ts'
import { recordUsage } from './ledger.ts'
import { mockImage, mockRespond } from './mock-model.ts'
import { loadCatalog } from './registry-db.ts'

/**
 * Exactly one backend serves the catalogue per deployment (mock serves all, for tests/key-less dev):
 *   local dev → vertex | gemini     production → openrouter
 * Catalogue rows on any other provider are simply not offered.
 */
function buildProviders(): Record<string, AIProvider> {
  if (env.AI_PROVIDER === 'mock') {
    const mock = new MockProvider(mockRespond, mockImage)
    return { gemini: mock, vertex: mock, openrouter: mock }
  }
  if (env.AI_PROVIDER === 'openrouter') {
    return env.OPENROUTER_API_KEY ? { openrouter: new OpenRouterProvider({ apiKey: env.OPENROUTER_API_KEY, appUrl: env.WEB_URL, appName: 'promptToPpt' }) } : {}
  }
  if (!env.GEMINI_API_KEY) return {} // API still boots; AI endpoints answer AI_NOT_CONFIGURED
  return { [env.AI_PROVIDER]: new GeminiProvider(env.GEMINI_API_KEY, env.AI_PROVIDER === 'vertex' ? VERTEX : AI_STUDIO) }
}

const providers = buildProviders()
export const configuredProviders = new Set(Object.keys(providers))
export const aiConfigured = configuredProviders.size > 0

export const catalog = () => loadCatalog(configuredProviders)

export const gateway = new AIGateway({
  providers,
  registry: async () => (await catalog()).registry,
  recordUsage,
  onFallback: (from, to, reason) => console.warn(`[ai] fallback ${from} -> ${to}: ${reason}`),
})
