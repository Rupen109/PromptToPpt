/**
 * Verifies the configured AI provider end to end WITHOUT touching the database:
 *   pnpm --filter @prompttoppt/api ai:check
 * Pings every model in the fast + quality chains with a tiny prompt and prints status, latency, tokens and cost.
 */
import { AI_STUDIO, GeminiProvider, ModelRegistry, VERTEX, computeCostUsd, geminiModels, routingFromEnv } from '@prompttoppt/ai'

const key = process.env['GEMINI_API_KEY']
if (!key) {
  console.error('GEMINI_API_KEY is not set (services/api/.env).')
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
