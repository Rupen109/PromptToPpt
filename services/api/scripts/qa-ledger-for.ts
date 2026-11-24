/** QA only — one test account's AI usage rows (provider, model, status, error code) and credit entries as JSON { usage, credits }, oldest first:  tsx scripts/qa-ledger-for.ts <email>  (refuses in production). Used by e2e/ai-backup-switch.mjs. */
import { pool } from '../src/db/index.ts'
import { isProd } from '../src/env.ts'

const email = process.argv[2]?.trim().toLowerCase()
if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
if (!email) { console.error('Usage: qa-ledger-for <email>'); process.exit(1) }
const r = await pool.query(
  `select e.provider, e.model, e.status, e.error_code, e.request_type from ai_usage_event e join "user" u on u.id = e.user_id where u.email = $1 order by e.created_at`,
  [email],
)
const c = await pool.query(`select l.delta, l.reason, l.ref_type from credit_ledger l join "user" u on u.id = l.user_id where u.email = $1 order by l.created_at`, [email])
console.log(JSON.stringify({ usage: r.rows, credits: c.rows }))
await pool.end()
