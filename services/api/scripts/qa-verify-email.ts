/** QA only — mark a test user's email as verified:  tsx scripts/qa-verify-email.ts <email>  (refuses in production). Lets e2e suites run with REQUIRE_EMAIL_VERIFICATION=true. */
import { eq } from 'drizzle-orm'
import { db, pool } from '../src/db/index.ts'
import { isProd } from '../src/env.ts'
import { user } from '../src/db/schema.ts'

const email = process.argv[2]?.trim().toLowerCase()
if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
if (!email) { console.error('Usage: qa-verify-email <email>'); process.exit(1) }
const r = await db.update(user).set({ emailVerified: true }).where(eq(user.email, email)).returning({ id: user.id })
if (r.length === 0) { console.error(`No user ${email}`); process.exit(1) }
console.log(`✅ ${email} verified`)
await pool.end()
