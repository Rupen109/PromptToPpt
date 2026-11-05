/**
 * Starts decks on a real account through the same function the "Create" button uses (gates, credits, the deck row, the job). Dev only.
 *   tsx --env-file=.env scripts/start-decks-for.ts you@example.com "prompt one" "prompt two" …
 * The decks open at once in the library ("recently created") and fill in as they are written.
 */
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
const { isProd } = await import('../src/env.ts')
if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const { db, pool } = await import('../src/db/index.ts')
const { user } = await import('../src/db/schema.ts')
const { startDeckJob } = await import('../src/generation/start.ts')
const [email, ...prompts] = process.argv.slice(2)
if (!email || prompts.length === 0) { console.error('usage: start-decks-for.ts <email> "<prompt>" …'); process.exit(1) }
const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email))
if (!u) { console.error(`no account with ${email} in this database`); process.exit(1) }
for (const prompt of prompts) {
  const r = await startDeckJob(u.id, { prompt, slideCount: 10, sourceIds: [], picturesOnly: false, idempotencyKey: `own-${randomUUID()}` } as never).catch((e) => ({ status: 0, body: { error: String(e?.message ?? e) } }))
  console.log(`${r.status}  ${prompt.slice(0, 70)}  ->`, JSON.stringify((r.body as { data?: { presentationId?: string; status?: string }; error?: unknown }).data ?? (r.body as { error?: unknown }).error))
}
await pool.end(); process.exit(0)
