/** QA only — give a test user a plan without paying:  tsx scripts/qa-grant-plan.ts <email> <starter|pro|gold>  (refuses in production) */
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db, pool } from '../src/db/index.ts'
import { isProd } from '../src/env.ts'
import { subscription, user } from '../src/db/schema.ts'

const [email, planId] = [process.argv[2]?.trim().toLowerCase(), process.argv[3]]
if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
if (!email || !['starter', 'pro', 'gold'].includes(planId ?? '')) { console.error('Usage: qa-grant-plan <email> <starter|pro|gold>'); process.exit(1) }
const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email))
if (!u) { console.error(`No user ${email}`); process.exit(1) }
await db.delete(subscription).where(eq(subscription.userId, u.id))
if (planId !== 'starter') {
  const now = new Date()
  await db.insert(subscription).values({ id: nanoid(), userId: u.id, planId: planId!, status: 'active', currency: 'USD', interval: 'month', currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 864e5), provider: 'manual' })
}
console.log(`✅ ${email} → ${planId}`)
await pool.end()
