import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../db/index.ts'
import { supportTicket } from '../../db/schema.ts'
import { audit, ipOf } from '../../lib/audit.ts'
import type { AppEnv } from '../../middleware/session.ts'
import { getStorage } from '../../storage/index.ts'

/** Owner section: messages from the Support page. Mounted by routes/admin.ts under /api/v1/admin/support; auth + role + audit + rate limit are applied there. */
export const supportRoutes = new Hono<AppEnv>()
const status = z.enum(['new', 'resolved'])
const nf = (c: any) => c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Message not found' } }, 404)

supportRoutes.get('/', zValidator('query', z.object({ status: status.default('new'), page: z.coerce.number().int().min(1).default(1) })), async (c) => {
  const { status: st, page } = c.req.valid('query')
  const rows = await db.select().from(supportTicket).where(eq(supportTicket.status, st)).orderBy(desc(supportTicket.createdAt)).limit(30).offset((page - 1) * 30)
  const counts = await db.select({ status: supportTicket.status, n: count() }).from(supportTicket).groupBy(supportTicket.status)
  const total = counts.find((x) => x.status === st)?.n ?? 0
  return c.json({ success: true, data: { items: rows.map((r) => ({ id: r.id, email: r.email, message: r.message, files: r.files.map((f, i) => ({ index: i, name: f.name, mime: f.mime, bytes: f.bytes })), signedIn: !!r.userId, status: r.status, createdAt: r.createdAt.toISOString() })), total, pages: Math.max(1, Math.ceil(total / 30)), counts: Object.fromEntries(counts.map((x) => [x.status, x.n])) } })
})

supportRoutes.patch('/:id', zValidator('json', z.object({ status })), async (c) => {
  const [row] = await db.update(supportTicket).set({ status: c.req.valid('json').status, updatedAt: new Date() }).where(eq(supportTicket.id, c.req.param('id'))).returning({ id: supportTicket.id, status: supportTicket.status })
  if (!row) return nf(c)
  await audit(c.get('session')!.user.id, 'support.status', { id: row.id, status: row.status }, ipOf(c.req.raw.headers))
  return c.json({ success: true, data: row })
})

supportRoutes.get('/:id/files/:n', async (c) => {
  const [row] = await db.select({ files: supportTicket.files }).from(supportTicket).where(eq(supportTicket.id, c.req.param('id'))).limit(1)
  const f = row?.files[Number(c.req.param('n'))]
  if (!f) return nf(c)
  const bytes = await (await getStorage()).get(f.key)
  if (!bytes) return nf(c)
  return new Response(Buffer.from(bytes), { headers: { 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' } })
})

supportRoutes.delete('/:id', async (c) => {
  const [row] = await db.delete(supportTicket).where(eq(supportTicket.id, c.req.param('id'))).returning({ id: supportTicket.id })
  if (!row) return nf(c)
  await audit(c.get('session')!.user.id, 'support.delete', { id: row.id }, ipOf(c.req.raw.headers))
  return c.json({ success: true, data: null })
})
