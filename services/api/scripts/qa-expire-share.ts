/** QA only — make a deck's live share link already expired (the one-day wait cannot be tested):  tsx scripts/qa-expire-share.ts <presentationId>  (refuses in production) */
import { and, eq, isNull } from 'drizzle-orm'
import { db, pool } from '../src/db/index.ts'
import { isProd } from '../src/env.ts'
import { shareLink } from '../src/db/schema.ts'

const id = process.argv[2]?.trim()
if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
if (!id) { console.error('Usage: qa-expire-share <presentationId>'); process.exit(1) }
const rows = await db.update(shareLink).set({ expiresAt: new Date(Date.now() - 60_000) }).where(and(eq(shareLink.presentationId, id), isNull(shareLink.revokedAt))).returning({ id: shareLink.id })
console.log(`expired ${rows.length} link(s) of ${id}`)
await pool.end()
