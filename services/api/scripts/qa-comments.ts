/**
 * QA only — comments helper for the real end-to-end tests (refuses in production):
 *   tsx scripts/qa-comments.ts counts <deckId>              → { threads, comments }
 *   tsx scripts/qa-comments.ts fill <deckId> <email> <n>    → adds n one-comment threads on the deck's first slide (for the "300 threads" check)
 */
import { count, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db, pool } from '../src/db/index.ts'
import { isProd } from '../src/env.ts'
import { comment, commentThread, presentation, presentationVersion, user } from '../src/db/schema.ts'

if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const [cmd, deckId, email, n] = process.argv.slice(2)
if (cmd === 'counts') {
  const [t] = await db.select({ n: count() }).from(commentThread).where(eq(commentThread.presentationId, deckId!))
  const rows = await db.select({ id: commentThread.id }).from(commentThread).where(eq(commentThread.presentationId, deckId!))
  let c = 0; for (const r of rows) c += (await db.select({ n: count() }).from(comment).where(eq(comment.threadId, r.id)))[0]!.n
  console.log(JSON.stringify({ threads: t!.n, comments: c }))
} else if (cmd === 'fill') {
  const [u] = await db.select().from(user).where(eq(user.email, email!.toLowerCase()))
  const [p] = await db.select().from(presentation).where(eq(presentation.id, deckId!))
  const [v] = await db.select().from(presentationVersion).where(eq(presentationVersion.presentationId, deckId!))
  const slideId = ((v!.document as { slides: { id: string }[] }).slides)[0]!.id
  for (let i = 0; i < Number(n); i++) {
    const id = nanoid()
    await db.insert(commentThread).values({ id, presentationId: p!.id, slideId, x: String(((i * 37) % 100) / 100), y: String(((i * 53) % 100) / 100), createdBy: u!.id })
    await db.insert(comment).values({ id: nanoid(), threadId: id, authorId: u!.id, body: `Filler comment number ${i + 1} about the wording of this slide.` })
  }
  console.log(JSON.stringify({ added: Number(n) }))
}
await pool.end()
