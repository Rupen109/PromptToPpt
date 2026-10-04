import { Hono, type MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { zValidator } from '@hono/zod-validator'
import { and, asc, count, eq, gt, inArray, isNull, lt } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { db } from '../db/index.ts'
import { draftAttachment, promptDraft } from '../db/schema.ts'
import { clientIp, rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'
import { pageReader } from '../ai/linked-pages.ts'
import { BlockedUrlError, FILE_MAX_BYTES, fromFile, type Extracted } from '../sources/extract.ts'
import { saveSource } from '../sources/store.ts'
import { fileErrorMessage } from './sources.ts'

const DRAFT_TTL_MS = 30 * 60 * 1000
const ATTACHMENT_TTL_MS = 60 * 60 * 1000
export const MAX_PROMPT_CHARS = 4000
export const MAX_DRAFT_ATTACHMENTS = 5

export const drafts = new Hono<AppEnv>()

const err = (c: any, status: 400 | 413 | 422, code: string, message: string) => c.json({ success: false, error: { code, message } }, status)
/** One bucket for every anonymous upload/fetch: these endpoints do real work (PDF parsing, outbound fetches) for strangers. */
const attachLimit = rateLimit({ windowMs: 60_000, max: 10 })

/** Anonymous uploads are capped per client per day and in total (storage + parsing CPU are the attack surface). */
const MAX_UNCLAIMED_ATTACHMENTS = 20_000
const MAX_ATTACHMENTS_PER_IP_DAY = 40
const daily = new Map<string, { day: number; n: number }>()
const dailyAttachLimit: MiddlewareHandler = async (c, next) => {
  const ip = clientIp(c)
  const day = Math.floor(Date.now() / 86_400_000)
  const hit = daily.get(ip)
  const entry = hit && hit.day === day ? hit : { day, n: 0 }
  if (++entry.n > MAX_ATTACHMENTS_PER_IP_DAY) return c.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many uploads today. Sign up to continue.' } }, 429)
  daily.set(ip, entry)
  if (daily.size > 20_000) daily.clear()
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(draftAttachment)
  if (n >= MAX_UNCLAIMED_ATTACHMENTS) return c.json({ success: false, error: { code: 'BUSY', message: 'Uploads are busy right now. Please try again shortly.' } }, 503)
  await next()
}

/** Scheduled cleanup (started from index.ts): expired anonymous attachments and drafts do not wait for the next upload to be purged. */
export async function purgeExpiredDrafts(): Promise<void> {
  await db.delete(draftAttachment).where(lt(draftAttachment.expiresAt, new Date()))
}

async function storeAttachment(kind: 'pdf' | 'pptx' | 'text' | 'url', ex: Extracted, url?: string) {
  const id = nanoid(24)
  const chars = ex.parts.reduce((n, p) => n + p.text.length, 0)
  await db.delete(draftAttachment).where(lt(draftAttachment.expiresAt, new Date())) // opportunistic purge of expired rows
  await db.insert(draftAttachment).values({ id, kind, title: ex.title, url: url ?? null, parts: ex.parts, chars, expiresAt: new Date(Date.now() + ATTACHMENT_TTL_MS) })
  return { id, kind, title: ex.title, chars }
}

/** Public: a file the visitor attached on the landing page (PDF, PowerPoint .pptx, .txt/.md). Parsed now so a bad file is reported immediately. */
drafts.post('/attachments', attachLimit, dailyAttachLimit, bodyLimit({ maxSize: FILE_MAX_BYTES + 64 * 1024, onError: (c) => err(c, 413, 'TOO_LARGE', 'That file is too large (PDF up to 10 MB, PowerPoint up to 15 MB, text up to 1 MB)') }), async (c) => {
  const file = (await c.req.parseBody())['file']
  if (!(file instanceof File)) return err(c, 400, 'NO_FILE', 'Attach a file as "file"')
  try {
    const { kind, extracted } = await fromFile(new Uint8Array(await file.arrayBuffer()), file.name)
    return c.json({ success: true, data: await storeAttachment(kind, extracted) }, 201)
  } catch (e) {
    return err(c, 422, 'PARSE_FAILED', fileErrorMessage(e))
  }
})

/** Public: a reference website. Fetched now with the same SSRF-safe fetcher as signed-in sources. */
drafts.post('/attachments/link', attachLimit, dailyAttachLimit, zValidator('json', z.object({ url: z.string().trim().max(2000) })), async (c) => {
  const { url } = c.req.valid('json')
  try {
    const ex = await pageReader.read(url)
    return c.json({ success: true, data: await storeAttachment('url', ex, url) }, 201)
  } catch (e) {
    if (e instanceof BlockedUrlError) return err(c, 400, 'URL_NOT_ALLOWED', e.message)
    const m = (e as Error).message
    return err(c, 422, 'FETCH_FAILED', /^(Could not|The page|That URL|Page is)/.test(m) ? m : 'Could not read that page')
  }
})

/** Public: landing page stores the visitor's prompt (and any attachments) before login. */
drafts.post(
  '/',
  rateLimit({ windowMs: 60_000, max: 20 }),
  zValidator('json', z.object({ prompt: z.string().trim().min(1).max(MAX_PROMPT_CHARS), attachmentIds: z.array(z.string().max(40)).max(MAX_DRAFT_ATTACHMENTS).default([]) })),
  async (c) => {
    const { prompt, attachmentIds } = c.req.valid('json')
    const ids = [...new Set(attachmentIds)]
    if (ids.length) {
      const ok = await db.select({ id: draftAttachment.id }).from(draftAttachment).where(and(inArray(draftAttachment.id, ids), isNull(draftAttachment.draftId), gt(draftAttachment.expiresAt, new Date())))
      if (ok.length !== ids.length) return err(c, 400, 'ATTACHMENT_EXPIRED', 'An attached file expired — please add it again.')
    }
    const id = nanoid(24)
    await db.transaction(async (tx) => {
      await tx.insert(promptDraft).values({ id, prompt, expiresAt: new Date(Date.now() + DRAFT_TTL_MS) })
      if (ids.length) await tx.update(draftAttachment).set({ draftId: id, expiresAt: new Date(Date.now() + DRAFT_TTL_MS) }).where(inArray(draftAttachment.id, ids))
    })
    return c.json({ success: true, data: { id, expiresInSeconds: DRAFT_TTL_MS / 1000 } }, 201)
  },
)

/** Turns the draft's attachments into the claiming user's own private sources (idempotent: a refresh returns the same ones). */
async function materialise(draftId: string, userId: string) {
  const rows = await db.select().from(draftAttachment).where(eq(draftAttachment.draftId, draftId)).orderBy(asc(draftAttachment.createdAt))
  const out: { id: string; type: string; title: string; chunks: number }[] = []
  for (const a of rows) {
    if (a.sourceId) {
      out.push({ id: a.sourceId, type: a.kind, title: a.title, chunks: 0 })
      continue
    }
    const saved = await saveSource(userId, a.kind as 'pdf' | 'pptx' | 'text' | 'url', { title: a.title, parts: a.parts }, a.url ?? undefined)
    const [won] = await db.update(draftAttachment).set({ sourceId: saved.id }).where(and(eq(draftAttachment.id, a.id), isNull(draftAttachment.sourceId))).returning({ id: draftAttachment.id })
    if (won) out.push(saved)
    else out.push({ id: (await db.select({ s: draftAttachment.sourceId }).from(draftAttachment).where(eq(draftAttachment.id, a.id)))[0]!.s!, type: a.kind, title: a.title, chunks: 0 })
  }
  return out
}

/**
 * Authenticated: atomically claims a draft (single use). The UPDATE ... WHERE guards
 * against double-claim, expiry, and claiming someone else's already-claimed draft.
 * Re-claiming by the same user is idempotent so a page refresh doesn't lose the prompt.
 */
drafts.post('/:id/claim', requireAuth, async (c) => {
  const userId = c.get('session')!.user.id
  const id = c.req.param('id')

  const [claimed] = await db
    .update(promptDraft)
    .set({ claimedByUserId: userId, claimedAt: new Date() })
    .where(and(eq(promptDraft.id, id), isNull(promptDraft.claimedByUserId), gt(promptDraft.expiresAt, new Date())))
    .returning({ prompt: promptDraft.prompt })
  const prompt = claimed?.prompt ?? (await db.select({ prompt: promptDraft.prompt }).from(promptDraft).where(and(eq(promptDraft.id, id), eq(promptDraft.claimedByUserId, userId))))[0]?.prompt
  if (prompt === undefined) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Draft expired or already used' } }, 404)
  const sources = await materialise(id, userId)
  return c.json({ success: true, data: { prompt, sources, sourceIds: sources.map((s) => s.id) } })
})
