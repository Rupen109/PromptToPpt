import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { zValidator } from '@hono/zod-validator'
import { and, count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.ts'
import { sourceDocument } from '../db/schema.ts'
import { GateError } from '../billing/errors.ts'
import { byUser, rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'
import { BlockedUrlError, fetchPage, fromFile, fromPdf, fromText, FILE_MAX_BYTES, PDF_MAX_BYTES } from '../sources/extract.ts'
import { saveSource } from '../sources/store.ts'

export const sources = new Hono<AppEnv>()
sources.use('*', requireAuth)
sources.use('*', rateLimit({ windowMs: 60_000, max: 20, key: byUser('sources') }))

/** Our own extractor errors are written for users; anything else (parser internals) is replaced by a generic line. */
export const fileErrorMessage = (e: unknown) => {
  const m = (e as Error).message ?? ''
  return /^(That file|PDF |No text|Old \.ppt|No slides|That PowerPoint|That presentation|Text files|Unsupported file|PowerPoint files|That file has)/.test(m) ? m : 'Could not read that file'
}
const fail = (c: any, status: 400 | 413 | 422, code: string, message: string) => c.json({ success: false, error: { code, message } }, status)

const MAX_SOURCES_PER_USER = 100
/** Documents are stored as text: without a cap one account could fill the database 200 KB at a time. */
async function assertSourceRoom(userId: string) {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(sourceDocument).where(eq(sourceDocument.userId, userId))
  if (n >= MAX_SOURCES_PER_USER) throw new GateError('LIMIT_REACHED', `You can keep up to ${MAX_SOURCES_PER_USER} source documents. Remove some to add more.`, 429, { feature: 'sources', limit: MAX_SOURCES_PER_USER })
}
sources.use('*', async (c, next) => {
  if (c.req.method === 'POST') await assertSourceRoom(c.get('session')!.user.id)
  await next()
})
const save = saveSource

sources.post('/text', zValidator('json', z.object({ title: z.string().trim().max(200).optional(), text: z.string().trim().min(20, 'Add a bit more text').max(200_000) })), async (c) => {
  const { title, text } = c.req.valid('json')
  return c.json({ success: true, data: await save(c.get('session')!.user.id, 'text', fromText(title ?? '', text)) }, 201)
})

sources.post('/url', zValidator('json', z.object({ url: z.string().trim().max(2000) })), async (c) => {
  const { url } = c.req.valid('json')
  try {
    const ex = await fetchPage(url)
    return c.json({ success: true, data: await save(c.get('session')!.user.id, 'url', ex, url) }, 201)
  } catch (e) {
    if (e instanceof BlockedUrlError) return fail(c, 400, 'URL_NOT_ALLOWED', e.message)
    console.warn('[sources] url fetch failed:', (e as Error).message)
    return fail(c, 422, 'FETCH_FAILED', (e as Error).message.startsWith('Could not') || (e as Error).message.startsWith('The page') || (e as Error).message.startsWith('That URL') || (e as Error).message.startsWith('Page is') ? (e as Error).message : 'Could not read that page')
  }
})

sources.post('/pdf', bodyLimit({ maxSize: PDF_MAX_BYTES + 64 * 1024, onError: (c) => fail(c, 413, 'TOO_LARGE', 'PDF is larger than 10 MB') }), async (c) => {
  const form = await c.req.parseBody()
  const file = form['file']
  if (!(file instanceof File)) return fail(c, 400, 'NO_FILE', 'Attach a PDF as "file"')
  if (file.size > PDF_MAX_BYTES) return fail(c, 413, 'TOO_LARGE', 'PDF is larger than 10 MB')
  try {
    // Raw bytes are parsed in memory and discarded. Private S3 retention lands with the storage task.
    const ex = await fromPdf(new Uint8Array(await file.arrayBuffer()), file.name)
    return c.json({ success: true, data: await save(c.get('session')!.user.id, 'pdf', ex) }, 201)
  } catch (e) {
    return fail(c, 422, 'PARSE_FAILED', (e as Error).message.startsWith('That file') || (e as Error).message.startsWith('PDF has') || (e as Error).message.startsWith('No text') ? (e as Error).message : 'Could not read that PDF')
  }
})

/** One upload endpoint for PDF, PowerPoint (.pptx) and text (.txt/.md): the type is decided from the file's content, not its name. */
sources.post('/file', bodyLimit({ maxSize: FILE_MAX_BYTES + 64 * 1024, onError: (c) => fail(c, 413, 'TOO_LARGE', 'That file is too large (PDF up to 10 MB, PowerPoint up to 15 MB, text up to 1 MB)') }), async (c) => {
  const file = (await c.req.parseBody())['file']
  if (!(file instanceof File)) return fail(c, 400, 'NO_FILE', 'Attach a file as "file"')
  try {
    const { kind, extracted } = await fromFile(new Uint8Array(await file.arrayBuffer()), file.name)
    return c.json({ success: true, data: await save(c.get('session')!.user.id, kind === 'text' ? 'text' : kind, extracted) }, 201)
  } catch (e) {
    return fail(c, 422, 'PARSE_FAILED', fileErrorMessage(e))
  }
})

sources.delete('/:id', async (c) => {
  const res = await db.delete(sourceDocument).where(and(eq(sourceDocument.id, c.req.param('id')), eq(sourceDocument.userId, c.get('session')!.user.id))).returning({ id: sourceDocument.id })
  return res.length ? c.json({ success: true, data: null }) : c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Source not found' } }, 404)
})
