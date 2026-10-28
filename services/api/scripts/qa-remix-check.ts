/**
 * Read-only (and one balance setter) database helper for the real end-to-end remix tests (e2e/suites/22-remix-journey.mjs).
 * usage: qa-remix-check.ts <command> <email> [arg]
 *   balance <email>                     → { balance }
 *   setbalance <email> <n>              → sets the credit balance (QA accounts only)
 *   jobs <email> <sinceIso>             → remix jobs since: [{ status, slideCount, remixOf, model }]
 *   spent <email> <sinceIso>            → net credits spent on generation since (reserve − refund), and number of charges
 *   source <email> <sinceIso>           → text of the newest "Remix source:" created since
 *   decks <email>                       → [{ id, title, aspect, slides, deleted }] newest first
 *   fill <email> <n>                    → adds n empty decks (to use up a monthly allowance quickly; QA accounts only)
 */
import { and, desc, eq, gte, like, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../src/db/index.ts'
import { isProd } from '../src/env.ts'
import { creditBalance, creditLedger, generationJob, presentation, presentationVersion, sourceChunk, sourceDocument, user } from '../src/db/schema.ts'

if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const [cmd, email, arg] = process.argv.slice(2)
const [u] = await db.select().from(user).where(eq(user.email, email!))
if (!u) { console.log(JSON.stringify({ error: 'no such user' })); process.exit(1) }
const since = arg ? new Date(arg) : new Date(0)
let out: unknown
if (cmd === 'balance') out = { balance: (await db.select().from(creditBalance).where(eq(creditBalance.userId, u.id)))[0]?.balance ?? null }
else if (cmd === 'setbalance') { await db.update(creditBalance).set({ balance: Number(arg) }).where(eq(creditBalance.userId, u.id)); out = { ok: true } }
else if (cmd === 'jobs') {
  const rows = await db.select().from(generationJob).where(and(eq(generationJob.userId, u.id), gte(generationJob.createdAt, since)))
  out = rows.filter((j) => (j.options as { remixOf?: string }).remixOf).map((j) => ({ status: j.status, slideCount: (j.options as { slideCount?: number }).slideCount, remixOf: (j.options as { remixOf?: string }).remixOf, model: (j.options as { model?: string }).model }))
} else if (cmd === 'spent') {
  const [r] = await db.select({ net: sql<number>`coalesce(-sum(${creditLedger.delta}),0)::int`, charges: sql<number>`count(*) filter (where ${creditLedger.reason} = 'reserve')::int`, refunds: sql<number>`count(*) filter (where ${creditLedger.reason} = 'refund')::int` }).from(creditLedger).where(and(eq(creditLedger.userId, u.id), eq(creditLedger.refType, 'job'), gte(creditLedger.createdAt, since), sql`${creditLedger.reason} in ('reserve','refund')`))
  out = r
} else if (cmd === 'source') {
  const [d] = await db.select().from(sourceDocument).where(and(eq(sourceDocument.userId, u.id), like(sourceDocument.title, 'Remix source: %'), gte(sourceDocument.createdAt, since))).orderBy(desc(sourceDocument.createdAt)).limit(1)
  out = d ? { title: d.title, text: (await db.select().from(sourceChunk).where(eq(sourceChunk.sourceId, d.id)).orderBy(sourceChunk.ordinal)).map((c) => c.text).join('\n') } : null
} else if (cmd === 'decks') {
  const rows = await db.select({ id: presentation.id, title: presentation.title, aspect: presentation.aspectRatio, deleted: presentation.deletedAt, doc: presentationVersion.document }).from(presentation).innerJoin(presentationVersion, and(eq(presentationVersion.presentationId, presentation.id), eq(presentationVersion.version, presentation.latestVersion))).where(eq(presentation.userId, u.id)).orderBy(desc(presentation.createdAt)).limit(15)
  out = rows.map((r) => ({ id: r.id, title: r.title, aspect: r.aspect, slides: (r.doc as { slides: unknown[] }).slides.length, deleted: !!r.deleted }))
} else if (cmd === 'fill') {
  await db.insert(presentation).values(Array.from({ length: Number(arg) }, (_, i) => ({ id: nanoid(), userId: u.id, title: `fill ${i}`, aspectRatio: '16:9', latestVersion: 1, revision: 1 })))
  out = { ok: true }
} else out = { error: 'unknown command' }
console.log(JSON.stringify(out))
process.exit(0)
