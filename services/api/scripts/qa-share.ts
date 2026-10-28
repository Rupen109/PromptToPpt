/**
 * QA only — share-analytics helper for the real end-to-end tests (refuses in production):
 *   tsx scripts/qa-share.ts rows <deckId>              → the recorded visits as JSON (what is really stored)
 *   tsx scripts/qa-share.ts expire <token>             → makes the link expired
 *   tsx scripts/qa-share.ts fill <deckId> <n>          → adds n visits spread over the last 60 days (for the "5,000 visits" check)
 */
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db, pool } from '../src/db/index.ts'
import { isProd } from '../src/env.ts'
import { shareLink, shareView } from '../src/db/schema.ts'

if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const [cmd, a, b] = process.argv.slice(2)
if (cmd === 'rows') console.log(JSON.stringify(await db.select().from(shareView).where(eq(shareView.presentationId, a!))))
else if (cmd === 'expire') { await db.update(shareLink).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(shareLink.token, a!)); console.log('{"ok":true}') }
else if (cmd === 'fill') {
  const [link] = await db.select().from(shareLink).where(eq(shareLink.presentationId, a!))
  const n = Number(b); const devices = ['computer', 'computer', 'phone', 'tablet'] as const
  for (let k = 0; k < n; k += 1000) {
    await db.insert(shareView).values(Array.from({ length: Math.min(1000, n - k) }, (_, i) => { const at = new Date(Date.now() - ((k + i) * 7919 % (60 * 86_400_000))); return { id: nanoid(24), presentationId: a!, linkId: link!.id, visitorHash: `fill${(k + i) % 1700}`.padEnd(32, '0'), startedAt: at, lastSeenAt: at, durationMs: 5000 + ((k + i) * 131) % 90_000, maxSlide: (k + i) % 4, slideCount: 4, completed: (k + i) % 4 === 3, slideMs: {}, device: devices[(k + i) % 4]!, country: ['IN', 'US', 'GB', null][(k + i) % 4] ?? null, referrerHost: [null, 'linkedin.com', 'mail.example.com'][(k + i) % 3] ?? null } }))
  }
  console.log(JSON.stringify({ added: n }))
}
await pool.end()
