/**
 * QA only — what the database holds for a person's sources:  tsx scripts/qa-sources.ts <email>
 * prints JSON: [{ id, type, title, url, chunks: [{ locator, text }] }] newest first (refuses in production).
 */
import { desc, eq } from 'drizzle-orm'
import { db, pool } from '../src/db/index.ts'
import { isProd } from '../src/env.ts'
import { sourceChunk, sourceDocument, user } from '../src/db/schema.ts'

if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const email = process.argv[2]?.trim().toLowerCase()
const [u] = email ? await db.select().from(user).where(eq(user.email, email)) : []
if (!u) { console.log(JSON.stringify({ error: 'no such user' })); await pool.end(); process.exit(1) }
const docs = await db.select().from(sourceDocument).where(eq(sourceDocument.userId, u.id)).orderBy(desc(sourceDocument.createdAt))
const out = []
for (const d of docs) out.push({ id: d.id, type: d.type, title: d.title, url: d.url, chunks: (await db.select().from(sourceChunk).where(eq(sourceChunk.sourceId, d.id)).orderBy(sourceChunk.ordinal)).map((c) => ({ locator: c.locator, text: c.text })) })
console.log(JSON.stringify(out))
await pool.end()
