import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { zValidator } from '@hono/zod-validator'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { exportFormatSchema, presentationSchema } from '@prompttoppt/validation'
import { assertExport, getEntitlements } from '../billing/entitlements.ts'
import { db } from '../db/index.ts'
import { exportEvent, presentation, presentationVersion } from '../db/schema.ts'
import { buildPptx, fetchImageLoader } from '../export/pptx.ts'
import { refuseIfOff } from '../flags/flags.ts'
import { rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'

export const exportsRoute = new Hono<AppEnv>()
exportsRoute.use('*', requireAuth)

const fileName = (title: string, ext: string) => `${title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'presentation'}.${ext}`

/**
 * The plan gate lives here for every format. PPTX is built on the server and streamed back. PDF / PNG / JPG / HTML are rendered
 * in the browser (that is where the fonts and the slide renderer are) — the server only authorises them, so the answer is
 * `{ mode: 'client' }` and the same plan check still applies.
 */
exportsRoute.post('/', rateLimit({ windowMs: 60_000, max: 20, key: (c) => `export:${(c.get('session') as { user: { id: string } }).user.id}` }), zValidator('json', z.object({ presentationId: z.string().max(64), format: exportFormatSchema })), async (c) => {
  const userId = c.get('session')!.user.id
  const { presentationId, format } = c.req.valid('json')
  const off = await refuseIfOff('exports', c, userId)
  if (off) return off
  const ent = await getEntitlements(userId)
  assertExport(ent, format)

  const [p] = await db.select().from(presentation).where(and(eq(presentation.id, presentationId), eq(presentation.userId, userId), isNull(presentation.deletedAt)))
  if (!p) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Presentation not found' } }, 404)
  const eventId = nanoid()
  const t0 = Date.now()
  await db.insert(exportEvent).values({ id: eventId, userId, presentationId, format, mode: format === 'pptx' ? 'server' : 'client' })
  if (format !== 'pptx') return c.json({ success: true, data: { mode: 'client', format, title: p.title, eventId } })

  const [v] = await db.select().from(presentationVersion).where(and(eq(presentationVersion.presentationId, p.id), eq(presentationVersion.version, p.latestVersion)))
  const parsed = presentationSchema.safeParse(v?.document)
  if (!parsed.success) {
    await db.update(exportEvent).set({ status: 'failed', error: 'invalid document', durationMs: Date.now() - t0 }).where(eq(exportEvent.id, eventId))
    return c.json({ success: false, error: { code: 'EXPORT_FAILED', message: 'This presentation could not be exported. Open it, fix any highlighted slide and try again.' } }, 422)
  }
  try {
    const file = await buildPptx(parsed.data, fetchImageLoader())
    await db.update(exportEvent).set({ status: 'success', bytes: file.length, slideCount: parsed.data.slides.length, durationMs: Date.now() - t0 }).where(eq(exportEvent.id, eventId))
    return c.body(new Uint8Array(file), 200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${fileName(p.title, 'pptx')}"`,
      'Cache-Control': 'no-store',
    })
  } catch (e) {
    await db.update(exportEvent).set({ status: 'failed', error: String((e as Error).message).slice(0, 300), durationMs: Date.now() - t0 }).where(eq(exportEvent.id, eventId))
    console.error('[export]', e)
    return c.json({ success: false, error: { code: 'EXPORT_FAILED', message: 'Export failed. Please try again.' } }, 500)
  }
})

/** Browser-rendered formats report how they went (owner "Exports" section). Only the event's owner can update it, and only once. */
exportsRoute.patch('/events/:id', zValidator('json', z.object({ ok: z.boolean(), durationMs: z.number().int().min(0).max(3_600_000).optional(), bytes: z.number().int().min(0).optional(), slideCount: z.number().int().min(0).max(500).optional(), error: z.string().max(300).optional() })), async (c) => {
  const b = c.req.valid('json')
  const r = await db.update(exportEvent).set({ status: b.ok ? 'success' : 'failed', durationMs: b.durationMs ?? null, bytes: b.bytes ?? null, slideCount: b.slideCount ?? null, error: b.ok ? null : (b.error ?? 'failed') }).where(and(eq(exportEvent.id, c.req.param('id')), eq(exportEvent.userId, c.get('session')!.user.id), eq(exportEvent.status, 'started'))).returning({ id: exportEvent.id })
  return c.json({ success: true, data: { updated: r.length === 1 } })
})
