/** QA only — what a real AskPPT / web-search run recorded:  tsx scripts/qa-ask-check.ts <ai-usage-type> <email>  → JSON { n, costUsd, failed } (refuses in production) */
import { and, eq, sql } from 'drizzle-orm'
import { db, pool } from '../src/db/index.ts'
import { isProd } from '../src/env.ts'
import { aiUsageEvent, user } from '../src/db/schema.ts'

if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const [type, email] = process.argv.slice(2)
const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email!.toLowerCase()))
if (!u) { console.log(JSON.stringify({ error: 'no such user' })); process.exit(1) }
const [r] = await db.select({ n: sql<number>`count(*)::int`, costUsd: sql<number>`coalesce(sum(${aiUsageEvent.providerCostUsd}),0)::float`, failed: sql<number>`count(*) filter (where ${aiUsageEvent.status} = 'error')::int` }).from(aiUsageEvent).where(and(eq(aiUsageEvent.userId, u.id), eq(aiUsageEvent.requestType, type!)))
console.log(JSON.stringify(r))
await pool.end()
