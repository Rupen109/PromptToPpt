/** QA only — set a user's role:  tsx scripts/qa-set-role.ts <email> <user|admin>  (refuses in production) */
import { eq } from 'drizzle-orm'
import { db, pool } from '../src/db/index.ts'
import { isProd } from '../src/env.ts'
import { user } from '../src/db/schema.ts'

const [email, role] = [process.argv[2]?.trim().toLowerCase(), process.argv[3]]
if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
if (!email || !['user', 'admin'].includes(role ?? '')) { console.error('Usage: qa-set-role <email> <user|admin>'); process.exit(1) }
const [u] = await db.update(user).set({ role: role! }).where(eq(user.email, email)).returning({ id: user.id })
console.log(u ? `✅ ${email} → ${role}` : `No user ${email}`)
await pool.end()
process.exit(u ? 0 : 1)
