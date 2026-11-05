/**
 * Sends ONE real request to Ollama's cloud API through the app's own code path (the gateway, the catalogue row `ollama:glm-5.3-flash`, the usage log) and prints the reply.
 *   cd services/api && npx tsx --env-file=.env scripts/ollama-check.ts
 * Needs OLLAMA_API_KEY in services/api/.env. Dev only (the usage row it writes is real: it shows in the admin usage views).
 *   401 the key is wrong or missing · 402 add usage credits · 404 the model name is wrong · 429 a usage limit was reached.
 */
import { z } from 'zod'

process.env['AI_PROVIDER'] = 'ollama' // this script always tests Ollama, whatever the app's own setting is
if (!process.env['OLLAMA_API_KEY']) {
  console.error('OLLAMA_API_KEY is not set. Save your key in services/api/.env as a line  OLLAMA_API_KEY=<your key>  (the key only, no quotes), then run this again.')
  process.exit(2)
}
const { gateway, catalog } = await import('../src/ai/gateway.ts')
const { seedCatalog } = await import('../src/ai/catalog-seed.ts')
const { pool } = await import('../src/db/index.ts')
await seedCatalog() // inserts the Ollama row if it is missing (never overwrites an edited row)
const rows = (await catalog()).rows.filter((r) => r.provider === 'ollama')
console.log(`catalogue rows for Ollama: ${rows.map((r) => r.id).join(', ') || 'none'}`)
const t0 = Date.now()
try {
  const out = await gateway.run({ route: 'fast', requestType: 'validation', system: 'Reply with JSON only.', prompt: 'Return {"reply":"<one short sentence saying why the sky is blue>"}', schema: z.object({ reply: z.string() }), ctx: {}, maxOutputTokens: 300, thinkingBudget: 0 })
  console.log(`reply from Ollama (${Date.now() - t0} ms): ${out.reply}`)
} catch (e) {
  const err = e as { message?: string; causes?: string[] }
  console.error(`request failed: ${err.message}${err.causes?.length ? ` | ${err.causes.join(' | ').slice(0, 400)}` : ''}`)
  process.exitCode = 1
}
await pool.end()
