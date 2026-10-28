/**
 * Apply the checked Vertex prices (catalog-seed.ts) to an EXISTING database — the seed itself only inserts missing rows.
 *   pnpm --filter @prompttoppt/api catalog:vertex [-- --apply]   (dry run without --apply)
 * A changed price starts a new pricing snapshot in the ledger; older usage rows keep the price they were charged at.
 */
import { eq } from 'drizzle-orm'
import { db, pool } from '../src/db/index.ts'
import { modelCatalog } from '../src/db/schema.ts'
import { CATALOG_SEED } from '../src/ai/catalog-seed.ts'
import { invalidateCatalog } from '../src/ai/registry-db.ts'

const apply = process.argv.includes('--apply')
for (const want of CATALOG_SEED.filter((r) => r.provider === 'vertex')) {
  const [have] = await db.select().from(modelCatalog).where(eq(modelCatalog.id, want.id))
  if (!have) continue
  const eq3 = (a?: string | null, b?: string | null) => (a == null ? null : Number(a)) === (b == null ? null : Number(b))
  const same = eq3(have.inputPerMTokUsd, want.inputPerMTokUsd) && eq3(have.outputPerMTokUsd, want.outputPerMTokUsd) && eq3(have.cachedInputPerMTokUsd, want.cachedInputPerMTokUsd)
  console.log(`${same ? '  =' : '  ≠'} ${want.id}: in ${have.inputPerMTokUsd}→${want.inputPerMTokUsd} out ${have.outputPerMTokUsd}→${want.outputPerMTokUsd} cached ${have.cachedInputPerMTokUsd ?? '-'}→${want.cachedInputPerMTokUsd ?? '-'}`)
  if (apply) await db.update(modelCatalog).set({ inputPerMTokUsd: want.inputPerMTokUsd, outputPerMTokUsd: want.outputPerMTokUsd, cachedInputPerMTokUsd: want.cachedInputPerMTokUsd ?? null, pricingSourceUrl: want.pricingSourceUrl ?? null, pricingVerifiedOn: want.pricingVerifiedOn ?? null, pricingNote: want.pricingNote ?? null, updatedAt: new Date() }).where(eq(modelCatalog.id, want.id))
}
if (apply) invalidateCatalog()
console.log(apply ? 'applied' : 'dry run (pass --apply)')
await pool.end()
