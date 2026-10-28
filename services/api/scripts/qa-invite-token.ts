/** QA only — print the newest pending collaboration invite token for an email (the real one arrives by mail):  tsx scripts/qa-invite-token.ts <email>  (refuses in production) */
import { desc, eq } from 'drizzle-orm'
import { db, pool } from '../src/db/index.ts'
import { isProd } from '../src/env.ts'
import { presentationMember } from '../src/db/schema.ts'

if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const email = process.argv[2]?.trim()
if (!email) { console.error('Usage: qa-invite-token <email>'); process.exit(1) }
const [m] = await db.select().from(presentationMember).where(eq(presentationMember.email, email)).orderBy(desc(presentationMember.createdAt)).limit(1)
if (!m) { console.error(`No invite for ${email}`); process.exit(1) }
console.log(m.token)
await pool.end()
