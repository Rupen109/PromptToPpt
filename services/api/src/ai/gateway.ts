import { AIGateway, AI_STUDIO, GeminiProvider, KeyRingProvider, MockProvider, OllamaProvider, OpenRouterProvider, ProviderError, ProviderLimiter, VERTEX, limitsFromMap, type AIProvider, type LimitConfig } from '@prompttoppt/ai'
import { env } from '../env.ts'
import { recordUsage } from './ledger.ts'
import { mockImage, mockRespond } from './mock-model.ts'
import { withLatency } from './mock-latency.ts'
import { loadCatalog } from './registry-db.ts'

/**
 * ONE main backend serves the catalogue per deployment (mock serves all, for tests/key-less dev):
 *   local dev and the AWS servers → gemini (AI Studio; its rows are filed under "vertex" too)     openrouter only if AI_PROVIDER=openrouter     load tests → ollama
 * plus, behind Gemini, an optional BACKUP (AI_BACKUP_PROVIDER=openrouter) that serves the same Gemini models when Gemini refuses or is too busy (registry-db buildRegistry).
 * Catalogue rows on any other provider are simply not offered.
 */
const openRouter = () => new OpenRouterProvider({ apiKey: env.OPENROUTER_API_KEY!, appUrl: env.WEB_URL, appName: 'SlidesDone', ...(env.OPENROUTER_BASE_URL ? { baseUrl: env.OPENROUTER_BASE_URL } : {}) })
/** the switch-over test (development only, env.ts refuses it in production): the main provider refuses every call the way Gemini does */
function refusing(p: AIProvider, status: number): AIProvider {
  const no = () => Promise.reject(new ProviderError(status === 402 ? 'Your prepay credit balance is depleted. (test)' : status === 429 ? 'Resource exhausted (test)' : 'The service is currently unavailable. (test)', status === 503 ? 'UNAVAILABLE' : 'RESOURCE_EXHAUSTED', status !== 402, status))
  return { ...p, id: p.id, generateText: no, ...(p.generateImage ? { generateImage: no } : {}) } as AIProvider
}
function buildProviders(): Record<string, AIProvider> {
  const main = buildMain()
  if (env.AI_TEST_MAIN_REFUSAL) for (const k of Object.keys(main)) main[k] = refusing(main[k]!, Number(env.AI_TEST_MAIN_REFUSAL))
  if (backupProvider) main['openrouter'] = openRouter()
  return main
}
/** the backup is used only behind Gemini, with its key */
export const backupProvider = env.AI_BACKUP_PROVIDER === 'openrouter' && (env.AI_PROVIDER === 'gemini' || env.AI_PROVIDER === 'vertex') && env.OPENROUTER_API_KEY && env.GEMINI_API_KEY ? 'openrouter' : undefined
function buildMain(): Record<string, AIProvider> {
  if (env.AI_PROVIDER === 'mock') {
    const mock = new MockProvider(mockRespond, mockImage)
    const served: AIProvider = env.MOCK_AI_LATENCY === 'realistic' ? withLatency(mock, { capacity: env.MOCK_AI_CAPACITY, refuseRate: env.MOCK_AI_REFUSE_RATE, scale: env.MOCK_AI_SCALE }) : mock
    return { gemini: served, vertex: served, openrouter: served }
  }
  if (env.AI_PROVIDER === 'openrouter') {
    return env.OPENROUTER_API_KEY ? { openrouter: openRouter() } : {}
  }
  if (env.AI_PROVIDER === 'ollama') {
    const local = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(env.OLLAMA_BASE_URL)
    return env.OLLAMA_API_KEY || local ? { ollama: new OllamaProvider({ apiKey: local ? '' : env.OLLAMA_API_KEY!, baseUrl: env.OLLAMA_BASE_URL, ...(env.OLLAMA_MODEL_OVERRIDE ? { modelOverride: env.OLLAMA_MODEL_OVERRIDE } : {}) }) } : {}
  }
  if (!env.GEMINI_API_KEY) return {} // API still boots; AI endpoints answer AI_NOT_CONFIGURED
  if (env.AI_PROVIDER === 'vertex') return { vertex: geminiKeys(VERTEX) }
  // AI Studio (a key made at aistudio.google.com): the catalogue's local-dev Gemini rows are filed under "vertex" (same model ids), so this backend serves them too
  const studio = geminiKeys(AI_STUDIO)
  return { gemini: studio, vertex: studio }
}

/**
 * The Gemini key(s) IS_QA picked (env.ts aiKeyFor). One key: the provider itself. Several (local and QA: the free keys LOCAL → QA → QA2 → QA3 → QA4):
 * a key ring (packages/ai/src/key-ring.ts) that moves a call to the next key when a key's quota for that model is used up. Logs name keys, never show them.
 */
function geminiKeys(backend: typeof AI_STUDIO): AIProvider {
  const keys = env.GEMINI_KEYS.map((k) => ({ name: k.name, provider: new GeminiProvider(k.key, backend) }))
  if (keys.length === 1) return keys[0]!.provider
  console.info(`[ai] ${keys.length} Gemini keys, used in this order: ${keys.map((k) => k.name).join(' → ')}`)
  return new KeyRingProvider(keys, { onRest: (key, model, ms, why, next) => console.warn(`[ai] key ${key}: ${why} for ${model} (resting ${Math.round(ms / 60_000)} min) → ${next ? `using ${next}` : 'no key left for this model'}`) })
}

const providers = buildProviders()
export const configuredProviders = new Set(Object.keys(providers))
export const aiConfigured = configuredProviders.size > 0

export const catalog = () => loadCatalog(configuredProviders, backupProvider)

/** every model call takes its turn here: steady admission, back-off on a 429, a cap on retries (packages/ai/src/limiter.ts) */
/**
 * A free-tier key's per-minute caps (Google's AI Studio rate-limit page shows the project's exact numbers; these sit at or under the published free tier), so calls
 * wait their turn instead of being refused. AI_LIMITS overrides any of them. Paid keys start with no fixed caps (the limiter adapts to what the provider allows).
 */
const FREE_TIER_LIMITS: Record<string, LimitConfig> = { 'vertex:gemini-3.1-flash-lite': { rpm: 10 }, 'vertex:gemini-3.6-flash': { rpm: 5 }, 'vertex:gemini-3.8-flash': { rpm: 5 } }
const perKeys = (m: Record<string, LimitConfig>, n: number) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v, ...(v.rpm ? { rpm: v.rpm * Math.max(1, n) } : {}) }]))
export const limiter = new ProviderLimiter({
  // the caps are per key (per Google project): with several free keys the pace is that many times faster
  limits: limitsFromMap({ ...(env.AI_KEY_TIER === 'free' ? perKeys(FREE_TIER_LIMITS, env.GEMINI_KEYS.length) : {}), ...(JSON.parse(env.AI_LIMITS) as Record<string, LimitConfig>) }),
})

export const gateway = new AIGateway({
  providers,
  limiter,
  registry: async () => (await catalog()).registry,
  recordUsage,
  onFallback: (from, to, reason) => console.warn(`[ai] fallback ${from} -> ${to}: ${reason}`),
  ...(backupProvider ? { backupProvider, onBackup: backupAlert } : {}),
})

/**
 * The owner's signal that Gemini's own limits (tier, credit, an outage) were reached: an ALERT line, at most once every 10 minutes, with how many calls the backup answered
 * meanwhile (same pattern as the spend alert in budget.ts). The usage ledger records every one of them under provider "openrouter".
 */
let backupCalls = 0
let lastBackupAlert = 0
function backupAlert(used: { model: string }, why: string) {
  backupCalls++
  const now = Date.now()
  if (now - lastBackupAlert < 10 * 60_000) return
  console.error(`[ai] ALERT: the BACKUP (OpenRouter) answered ${backupCalls} call(s) since the last alert, latest on ${used.model}. Why Gemini did not: ${why}. Check the Gemini credit balance, tier limits and AI Studio status.`)
  lastBackupAlert = now
  backupCalls = 0
}
