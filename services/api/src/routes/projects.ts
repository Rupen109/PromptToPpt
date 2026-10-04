import { zValidator } from '@hono/zod-validator'
import { and, count, desc, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { getEntitlements } from '../billing/entitlements.ts'
import { GateError } from '../billing/errors.ts'
import { db } from '../db/index.ts'
import { presentation, project } from '../db/schema.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'

export const projects = new Hono<AppEnv>()
projects.use('*', requireAuth)

const MAX_PROJECTS = 50
const name = z.string().trim().min(1, 'Give the project a name').max(60)
const notFound = (c: any) => c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
const mine = (id: string, userId: string) => and(eq(project.id, id), eq(project.userId, userId), isNull(project.deletedAt))

projects.get('/', async (c) => {
  const userId = c.get('session')!.user.id
  const rows = await db.select().from(project).where(and(eq(project.userId, userId), isNull(project.deletedAt))).orderBy(desc(project.createdAt))
  const counts = await db.select({ projectId: presentation.projectId, n: count() }).from(presentation).where(and(eq(presentation.userId, userId), isNull(presentation.deletedAt))).groupBy(presentation.projectId)
  const byId = new Map(counts.map((r) => [r.projectId, r.n]))
  return c.json({ success: true, data: rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt.toISOString(), decks: byId.get(r.id) ?? 0 })) })
})

/** Creating projects is a Pro feature (server-checked: hiding the button is not enforcement). Reading/using existing ones is not gated, so a downgrade never locks anyone out of their decks. */
projects.post('/', zValidator('json', z.object({ name })), async (c) => {
  const userId = c.get('session')!.user.id
  const ent = await getEntitlements(userId)
  if (!ent.features.projects) throw new GateError('UPGRADE_REQUIRED', `Projects are available on the Pro plan.`, 403, { feature: 'projects' })
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(project).where(and(eq(project.userId, userId), isNull(project.deletedAt)))
  if (n >= MAX_PROJECTS) throw new GateError('LIMIT_REACHED', `You can have up to ${MAX_PROJECTS} projects.`, 429, { feature: 'projects', limit: MAX_PROJECTS })
  const id = nanoid()
  const [row] = await db.insert(project).values({ id, userId, name: c.req.valid('json').name }).returning()
  return c.json({ success: true, data: { id, name: row!.name, createdAt: row!.createdAt.toISOString(), decks: 0 } }, 201)
})

projects.patch('/:id', zValidator('json', z.object({ name })), async (c) => {
  const [row] = await db.update(project).set({ name: c.req.valid('json').name }).where(mine(c.req.param('id'), c.get('session')!.user.id)).returning()
  return row ? c.json({ success: true, data: { id: row.id, name: row.name } }) : notFound(c)
})

/** Soft-deletes the project; its presentations stay (they just lose the folder). */
projects.delete('/:id', async (c) => {
  const userId = c.get('session')!.user.id
  const id = c.req.param('id')
  const out = await db.transaction(async (tx) => {
    const [row] = await tx.update(project).set({ deletedAt: new Date() }).where(mine(id, userId)).returning({ id: project.id })
    if (row) await tx.update(presentation).set({ projectId: null }).where(and(eq(presentation.userId, userId), eq(presentation.projectId, id)))
    return row
  })
  return out ? c.json({ success: true, data: null }) : notFound(c)
})
