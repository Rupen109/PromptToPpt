/**
 * Owner-run: create (or reset) a ready-to-use account for an outside reviewer, e.g. Razorpay's review for international payments.
 *
 *   pnpm --filter @prompttoppt/api review-account <email> <PASSWORD_VARIABLE>
 *   pnpm --filter @prompttoppt/api review-account razorpayreviewer@slidesdone.app Razorpay_Test
 *
 * The password is read from the named environment variable (the .env file on this machine or server): it is never typed on a command line
 * and never printed. The account is verified, needs no invitation, sends no e-mail, and running it again only resets the password.
 * See src/admin/review-account.ts.
 */
import { pool } from '../src/db/index.ts'
import { upsertReviewAccount } from '../src/admin/review-account.ts'

const [email, variable] = process.argv.slice(2)
if (!email || !variable) {
  console.error('Usage: review-account <email> <PASSWORD_VARIABLE>   (the password is read from that environment variable)')
  process.exit(1)
}
const password = process.env[variable]
if (!password) {
  console.error(`❌ The environment variable ${variable} is empty or missing. Add it to the .env file of this machine or server, then run this again.`)
  process.exit(1)
}
try {
  const r = await upsertReviewAccount(email, password)
  console.log(r.created ? `✅ Review account created: ${email} (verified, Starter plan). The password is the value of ${variable}.` : `✅ ${email} already existed: its password is now the value of ${variable}, and it is verified.`)
} catch (e) {
  console.error(`❌ ${(e as Error).message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
