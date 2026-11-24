/** QA only — print the assistant requests of a deck (status, what was refunded, what the server verified) as JSON:  tsx scripts/qa-assist-requests.ts <presentationId>  (refuses in production) */
import { desc, eq } from 'drizzle-orm'
import { db, pool } from '../src/db/index.ts'
import { isProd } from '../src/env.ts'
import { aiAssistRequest } from '../src/db/schema.ts'

if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const id = process.argv[2]
if (!id) { console.error('Usage: qa-assist-requests <presentationId>'); process.exit(1) }
const rows = await db.select().from(aiAssistRequest).where(eq(aiAssistRequest.presentationId, id)).orderBy(desc(aiAssistRequest.createdAt))
console.log(JSON.stringify(rows.map((r) => ({ id: r.id, status: r.status, trigger: r.trigger, reservations: r.reservations, refundedRefs: r.refundedRefs, mismatches: r.mismatches, results: (r.results as { key: string; kind: string; status: string }[] | null)?.map((c) => `${c.kind}:${c.status}`) }))))
await pool.end()
