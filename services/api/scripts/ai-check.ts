/**
 * Verifies the configured AI provider end to end WITHOUT touching the database:
 *   pnpm --filter @prompttoppt/api ai:check
 * Pings every model in the fast + quality chains with a tiny prompt and prints status, latency, tokens and cost.
 */
import { AI_STUDIO, GeminiProvider, ModelRegistry, VERTEX, computeCostUsd, geminiModels, routingFromEnv } from '@prompttoppt/ai'

// the same choice as the app (src/env.ts aiKeyFor): IS_QA=true checks every free key in its order, otherwise the paid one. Names are printed, never key values.
const { aiKeyFor } = await import('../src/env.ts')
const e = process.env
const { GEMINI_KEYS: keys } = aiKeyFor({ ...e, IS_QA: e['IS_QA'] === 'true' })
console.log(`Checking the ${e['IS_QA'] === 'true' ? `FREE keys (IS_QA=true), in order: ${keys.map((k) => k.name).join(' → ')}` : 'PAID Gemini key'}`)
if (!keys.length) {
  console.error('No Gemini key is set for this mode (services/api/.env: IS_QA=true uses GEMINI_API_KEY_LOCAL, _QA, _QA2, _QA3, _QA4; otherwise GEMINI_API_KEY_PAID or GEMINI_API_KEY).')
  process.exit(1)
}
const vertex = process.env['AI_PROVIDER'] === 'vertex'
const registry = new ModelRegistry(geminiModels(vertex ? 'vertex' : 'gemini'), routingFromEnv({ fast: process.env['GEMINI_MODEL_FAST'], quality: process.env['GEMINI_MODEL_QUALITY'] }))
const models = [...new Set([...registry.chain('fast'), ...registry.chain('quality')].map((m) => m.model))]

let ok = 0, tried = 0
for (const k of keys) {
  const provider = new GeminiProvider(k.key, vertex ? VERTEX : AI_STUDIO)
  console.log(`\nkey ${k.name} (backend ${provider.id})`)
  for (const model of models) {
    const def = registry.get(model)!
    const t0 = Date.now(); tried++
    try {
      const r = await provider.generateText({ model, system: 'Reply with JSON only.', prompt: 'Return {"pong":true}', json: true, maxOutputTokens: 200, thinkingBudget: 0, signal: AbortSignal.timeout(30_000) })
      const cost = computeCostUsd(r.usage, def.pricing)
      console.log(`✅ ${model.padEnd(28)} ${String(Date.now() - t0).padStart(5)}ms  in=${r.usage.inputTokens} out=${r.usage.outputTokens} think=${r.usage.reasoningTokens}  $${cost.toFixed(6)}  ${r.text.trim().slice(0, 40)}`)
      ok++
    } catch (err) {
      console.log(`❌ ${model.padEnd(28)} ${(err as Error).message.slice(0, 160)}`)
    }
  }
}
console.log(`\n${ok}/${tried} key × model checks usable`)
process.exit(ok > 0 ? 0 : 1)
