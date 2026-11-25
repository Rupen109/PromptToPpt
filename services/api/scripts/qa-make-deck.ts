/**
 * A deck with N slides of real content on a test account, written straight to the database (no AI, no credits). Dev only.
 *   tsx --env-file=.env scripts/qa-make-deck.ts you@example.com 12
 * Prints the deck id. The browser suites use it when they need a deck of a given size (e.g. the assistant's bulk rewrite, suite 108).
 */
import { eq } from 'drizzle-orm'
const { isProd } = await import('../src/env.ts')
if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const { db, pool } = await import('../src/db/index.ts')
const { user } = await import('../src/db/schema.ts')
const { makeDeck } = await import('../src/test-utils.ts')
const [email, count] = process.argv.slice(2)
const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, String(email)))
if (!u) { console.error(`no account with ${email}`); process.exit(1) }
const { id } = await makeDeck(u.id, Math.max(1, Math.min(40, Number(count) || 3)))
console.log(id)
await pool.end(); process.exit(0)
