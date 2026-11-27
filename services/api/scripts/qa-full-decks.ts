/**
 * The seed decks of the full AI-edit QA (e2e/ai-full-qa.mjs): each deck as it was generated, before anyone chatted (its version 1, an immutable
 * generation snapshot), keyed like the cases (the first 8 characters of the deck id). They are real people's decks, so the file stays OUT of the repo.
 *   tsx --env-file=.env scripts/qa-full-decks.ts <out.json>     (dev only)
 */
import { writeFileSync } from 'node:fs'
import { and, eq, like } from 'drizzle-orm'
const { isProd } = await import('../src/env.ts')
if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const { db, pool } = await import('../src/db/index.ts')
const { presentation, presentationVersion } = await import('../src/db/schema.ts')
const { CASES } = await import('../../../e2e/ai-full-qa-cases.mjs' as string) as { CASES: { deck: string }[] }
const out: Record<string, { document: unknown }> = {}
for (const key of [...new Set(CASES.map((c) => c.deck))]) {
  const [p] = await db.select({ id: presentation.id }).from(presentation).where(like(presentation.id, `${key}%`))
  if (!p) { console.warn(`missing deck ${key}`); continue }
  const [v] = await db.select({ document: presentationVersion.document }).from(presentationVersion).where(and(eq(presentationVersion.presentationId, p.id), eq(presentationVersion.version, 1)))
  if (v) out[key] = { document: v.document }
}
writeFileSync(process.argv[2] ?? 'decks.json', JSON.stringify(out))
console.log(`${Object.keys(out).length} decks written`)
await pool.end(); process.exit(0)
