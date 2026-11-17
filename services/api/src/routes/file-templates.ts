import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { IMPORT_LIMITS } from '../template-import/types.ts'
import { assertTemplateFromFile, getEntitlements } from '../billing/entitlements.ts'
import { refuseIfOn } from '../flags/flags.ts'
import { byUser, rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'
import { busyAnswer, uploadGate } from '../middleware/upload-gate.ts'
import { BusyError } from '../sources/parse-pool.ts'
import { SourceError } from '../sources/errors.ts'
import { importTemplateFile, TemplateKindError } from '../template-import/importers.ts'
import { assertTemplateRoom, deleteUserTemplate, getUserTemplate, listUserTemplates, saveUserTemplate, summaryOf } from '../template-import/user-templates.ts'
import { layoutSlide } from '../generation/uploaded-template.ts'

/**
 * "Use a file's design": the person's uploaded designs. Upload (plan-gated, same size limit and worker pool as every other upload), list, one design with its slides (for the picker's
 * thumbnails), its layouts with placeholder words (for the editor's "From your template" menu), delete. Everything is scoped to the signed-in person: another person's id is a 404.
 */
export const fileTemplates = new Hono<AppEnv>()
fileTemplates.use('*', requireAuth)

const fail = (c: any, status: 400 | 404 | 413 | 422, code: string, message: string) => c.json({ success: false, error: { code, message } }, status)

fileTemplates.get('/', rateLimit({ windowMs: 60_000, max: 60, key: byUser('tpl-list') }), async (c) => {
  return c.json({ success: true, data: { templates: await listUserTemplates(c.get('session')!.user.id) } })
})

fileTemplates.post('/', rateLimit({ windowMs: 60_000, max: 6, key: byUser('tpl-upload'), message: 'You are uploading designs very quickly. Wait a moment and try again.' }), async (c, next) => {
  // the plan and the cap are decided BEFORE the body is read: a refused person costs nothing
  const userId = c.get('session')!.user.id
  assertTemplateFromFile(await getEntitlements(userId))
  await assertTemplateRoom(userId)
  await next()
}, uploadGate, bodyLimit({ maxSize: IMPORT_LIMITS.maxBytes + 64 * 1024, onError: (c) => fail(c, 413, 'TOO_LARGE', 'That file is too large (up to 15 MB)') }), async (c) => {
  const userId = c.get('session')!.user.id
  const maint = await refuseIfOn('maintenance_mode', c, userId)
  if (maint) return maint
  const file = (await c.req.parseBody())['file']
  if (!(file instanceof File)) return fail(c, 400, 'NO_FILE', 'Attach a file as "file"')
  try {
    const template = await importTemplateFile(new Uint8Array(await file.arrayBuffer()), { userId, filename: file.name || 'design.pptx' })
    return c.json({ success: true, data: await saveUserTemplate(userId, template) }, 201)
  } catch (e) {
    if (e instanceof BusyError) return busyAnswer(c)
    if (e instanceof TemplateKindError) return fail(c, 422, e.code, e.message)
    if (e instanceof SourceError) return fail(c, 422, 'PARSE_FAILED', e.message)
    throw e
  }
})

fileTemplates.get('/:id', rateLimit({ windowMs: 60_000, max: 60, key: byUser('tpl-get') }), async (c) => {
  const found = await getUserTemplate(c.get('session')!.user.id, c.req.param('id'))
  if (!found) return fail(c, 404, 'NOT_FOUND', 'Design not found')
  const t = found.template
  return c.json({ success: true, data: { summary: summaryOf(c.req.param('id'), found.createdAt, t), theme: t.theme, aspect: t.aspect, slides: t.slides.map((s) => s.slide) } })
})

fileTemplates.get('/:id/layouts', rateLimit({ windowMs: 60_000, max: 60, key: byUser('tpl-layouts') }), async (c) => {
  const found = await getUserTemplate(c.get('session')!.user.id, c.req.param('id'))
  if (!found) return fail(c, 404, 'NOT_FOUND', 'Design not found')
  const t = found.template
  const layouts = t.slides.map((s, index) => ({ index, name: `Slide ${s.n}`, layoutName: s.layoutName, slide: layoutSlide(t, index, 'layout') })).filter((l) => l.slide)
  return c.json({ success: true, data: { theme: t.theme, aspect: t.aspect, layouts } })
})

fileTemplates.delete('/:id', rateLimit({ windowMs: 60_000, max: 30, key: byUser('tpl-delete') }), async (c) => {
  return (await deleteUserTemplate(c.get('session')!.user.id, c.req.param('id'))) ? c.json({ success: true, data: null }) : fail(c, 404, 'NOT_FOUND', 'Design not found')
})
