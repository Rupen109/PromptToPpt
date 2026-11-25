/**
 * Verifies the configured AI provider end to end WITHOUT touching the database:
 *   pnpm --filter @prompttoppt/api ai:check
 * Pings every model in the fast + quality chains with a tiny prompt and prints status, latency, tokens and cost.
 */
import { AI_STUDIO, GeminiProvider, ModelRegistry, VERTEX, computeCostUsd, geminiModels, routingFromEnv } from '@prompttoppt/ai'

// the same choice as the app (src/env.ts): IS_QA=true checks the free key, otherwise the paid one
const e = process.env
const key = e['IS_QA'] === 'true' ? (e['GEMINI_API_KEY_QA'] || e['GEMINI_API_KEY_LOCAL'] || e['GEMINI_API_KEY']) : (e['GEMINI_API_KEY_PAID'] || e['GEMINI_API_KEY'])
console.log(`Checking the ${e['IS_QA'] === 'true' ? 'FREE (IS_QA=true)' : 'PAID'} Gemini key`)
if (!key) {
  console.error('No Gemini key is set for this mode (services/api/.env: IS_QA=true uses GEMINI_API_KEY_QA or _LOCAL, otherwise GEMINI_API_KEY_PAID or GEMINI_API_KEY).')
  process.exit(1)
}
const vertex = process.env['AI_PROVIDER'] === 'vertex'
const provider = new GeminiProvider(key, vertex ? VERTEX : AI_STUDIO)
console.log(`backend: ${provider.id}\n`)
const registry = new ModelRegistry(geminiModels(vertex ? 'vertex' : 'gemini'), routingFromEnv({ fast: process.env['GEMINI_MODEL_FAST'], quality: process.env['GEMINI_MODEL_QUALITY'] }))
const models = [...new Set([...registry.chain('fast'), ...registry.chain('quality')].map((m) => m.model))]

let ok = 0
for (const model of models) {
  const def = registry.get(model)!
  const t0 = Date.now()
  try {
    const r = await provider.generateText({ model, system: 'Reply with JSON only.', prompt: 'Return {"pong":true}', json: true, maxOutputTokens: 200, thinkingBudget: 0, signal: AbortSignal.timeout(30_000) })
    const cost = computeCostUsd(r.usage, def.pricing)
    console.log(`✅ ${model.padEnd(28)} ${String(Date.now() - t0).padStart(5)}ms  in=${r.usage.inputTokens} out=${r.usage.outputTokens} think=${r.usage.reasoningTokens}  $${cost.toFixed(6)}  ${r.text.trim().slice(0, 40)}`)
    ok++
  } catch (e) {
    console.log(`❌ ${model.padEnd(28)} ${(e as Error).message}`)
  }
}
console.log(`\n${ok}/${models.length} models usable`)
process.exit(ok > 0 ? 0 : 1)
