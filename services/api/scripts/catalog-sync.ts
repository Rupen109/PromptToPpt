/**
 * Refresh OpenRouter prices in `model_catalog` from OpenRouter's public catalogue (no API key needed).
 *   pnpm --filter @prompttoppt/api catalog:sync            # dry run: shows what would change
 *   pnpm --filter @prompttoppt/api catalog:sync -- --apply # writes
 * Reports models that vanished from OpenRouter (and with --apply disables them) so users can't pick a dead model.
 * Pricing changes take effect in the ledger automatically: a new price creates a new pricing snapshot row.
 */
import { and, eq } from 'drizzle-orm'
import { db, pool } from '../src/db/index.ts'
import { modelCatalog } from '../src/db/schema.ts'
import { invalidateCatalog } from '../src/ai/registry-db.ts'

const apply = process.argv.includes('--apply')
const res = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(30_000) })
if (!res.ok) throw new Error(`OpenRouter catalogue returned ${res.status}`)
type OR = { id: string; pricing: { prompt?: string; completion?: string; input_cache_read?: string; image?: string }; context_length?: number }
const live = new Map(((await res.json()) as { data: OR[] }).data.map((m) => [m.id, m]))
const perM = (v?: string) => (v === undefined ? undefined : Math.round(Number(v) * 1e6 * 1e6) / 1e6)
const today = new Date().toISOString().slice(0, 10)

let changed = 0
for (const row of await db.select().from(modelCatalog).where(eq(modelCatalog.provider, 'openrouter'))) {
  const m = live.get(row.modelId)
  if (!m) {
    console.log(`⚠️  ${row.id}: no longer on OpenRouter${apply && row.enabled ? ' → disabling' : ''}`)
    if (apply && row.enabled) await db.update(modelCatalog).set({ enabled: false, updatedAt: new Date() }).where(eq(modelCatalog.id, row.id))
    changed++
    continue
  }
  const next = { in: perM(m.pricing.prompt), out: perM(m.pricing.completion), cache: perM(m.pricing.input_cache_read) }
  const diff = next.in !== Number(row.inputPerMTokUsd) || next.out !== Number(row.outputPerMTokUsd)
  console.log(`${diff ? '✏️ ' : '✓ '} ${row.id.padEnd(48)} in $${row.inputPerMTokUsd}→$${next.in}  out $${row.outputPerMTokUsd}→$${next.out}`)
  if (diff) {
    changed++
    if (apply)
      await db.update(modelCatalog).set({ inputPerMTokUsd: String(next.in), outputPerMTokUsd: String(next.out), ...(next.cache !== undefined ? { cachedInputPerMTokUsd: String(next.cache) } : {}), pricingVerifiedOn: today, updatedAt: new Date() }).where(and(eq(modelCatalog.id, row.id)))
  }
}
if (apply) invalidateCatalog()
console.log(`\n${changed} change(s)${apply ? ' applied' : ' (dry run — pass --apply to write)'}`)
await pool.end()
