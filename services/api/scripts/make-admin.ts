/** Promote a user to owner/admin:  pnpm --filter @prompttoppt/api make-admin you@example.com   (role is never settable via the API) */
import { eq } from 'drizzle-orm'
import { db, pool } from '../src/db/index.ts'
import { user } from '../src/db/schema.ts'

const email = process.argv[2]?.trim().toLowerCase()
if (!email) {
  console.error('Usage: make-admin <email>')
  process.exit(1)
}
const [u] = await db.update(user).set({ role: 'admin' }).where(eq(user.email, email)).returning({ id: user.id, email: user.email })
console.log(u ? `✅ ${u.email} is now an admin` : `❌ No user with email ${email}. Sign up first, then run this again.`)
await pool.end()
process.exit(u ? 0 : 1)
