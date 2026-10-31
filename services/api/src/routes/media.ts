import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { zValidator } from '@hono/zod-validator'
import { and, count, eq, gte, inArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { aiConfigured } from '../ai/gateway.ts'
import { creditPrice, refundCredits, reserveCredits } from '../billing/credits.ts'
import { getEntitlements } from '../billing/entitlements.ts'
import { GateError } from '../billing/errors.ts'
import { db } from '../db/index.ts'
import { mediaJob, sourceChunk, sourceDocument } from '../db/schema.ts'
import { refuseIfOn } from '../flags/flags.ts'
import { FfmpegError, ffmpegAvailable, probeMedia } from '../media/ffmpeg.ts'
import { MAX_JOBS_PER_DAY, MAX_VIDEO_BYTES, MAX_VIDEO_MINUTES, MAX_VIDEO_MINUTES_PER_DAY, PART_BYTES, cleanup, fileSize, filePath, head, partSize, partsFor, writePart } from '../media/store.ts'
import { byUser, rateLimit } from '../middleware/rate-limit.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'
import { busyAnswer, uploadGate } from '../middleware/upload-gate.ts'
import { MediaError, inspectMedia } from '../sources/media-read.ts'

/**
 * Video to slides for big recordings (≤ 200 MB, ≤ 90 minutes), signed-in only. The browser sends the file in 8 MB parts; `complete` checks it, measures
 * its length and takes the credits (3 per started minute); a background worker does the listening and watching (media/pipeline.ts).
 */
export const media = new Hono<AppEnv>()
media.use('*', requireAuth)
const fail = (c: any, status: 400 | 402 | 404 | 409 | 413 | 422 | 429 | 503, code: string, message: string) => c.json({ success: false, error: { code, message } }, status)
const ACTIVE = ['uploading', 'queued', 'processing']
const mine = (id: string, userId: string) => and(eq(mediaJob.id, id), eq(mediaJob.userId, userId))

media.use('*', async (c, next) => {
  if (!(await ffmpegAvailable())) return fail(c, 503, 'VIDEO_UNAVAILABLE', 'Big video files are not available on this server right now. Export just the audio (MP3 or M4A, up to 12 MB) and add that instead.')
  await next()
})

media.post('/uploads', rateLimit({ windowMs: 60_000, max: 6, key: byUser('mediastart') }), zValidator('json', z.object({ filename: z.string().trim().min(1).max(200), bytes: z.number().int().min(2048).max(MAX_VIDEO_BYTES, 'That video is larger than 200 MB. Export a shorter part or just the audio and try again.') })), async (c) => {
  const userId = c.get('session')!.user.id
  const { filename, bytes } = c.req.valid('json')
  const maint = await refuseIfOn('maintenance_mode', c, userId)
  if (maint) return maint
  if (!aiConfigured) return c.json({ success: false, error: { code: 'AI_NOT_CONFIGURED', message: 'AI is not configured on this server' } }, 503)
  const [{ n: active } = { n: 0 }] = await db.select({ n: count() }).from(mediaJob).where(and(eq(mediaJob.userId, userId), inArray(mediaJob.status, ACTIVE)))
  if (active > 0) return fail(c, 429, 'LIMIT_REACHED', 'You already have a video being prepared. Wait for it to finish, then add the next one.')
  const [{ n: today } = { n: 0 }] = await db.select({ n: count() }).from(mediaJob).where(and(eq(mediaJob.userId, userId), gte(mediaJob.createdAt, new Date(Date.now() - 24 * 3600_000))))
  if (today >= MAX_JOBS_PER_DAY) throw new GateError('LIMIT_REACHED', `You have reached today's limit of ${MAX_JOBS_PER_DAY} big videos. Please try again tomorrow.`, 429, { feature: 'read_video', limit: MAX_JOBS_PER_DAY })
  const ent = await getEntitlements(userId)
  const perMinute = await creditPrice('read_video', 'starter')
  if (ent.credits.balance < perMinute) throw new GateError('INSUFFICIENT_CREDITS', 'You do not have enough credits for a video. A video costs 3 credits per minute.', 402, { feature: 'read_video' })
  const id = nanoid(24)
  await db.insert(mediaJob).values({ id, userId, filename: filename.replace(/[\u0000-\u001f]/g, ' '), bytes, partsTotal: partsFor(bytes), status: 'uploading', stage: 'Uploading' })
  return c.json({ success: true, data: { id, partBytes: PART_BYTES, partsTotal: partsFor(bytes) } }, 201)
})

media.put('/uploads/:id/parts/:n', uploadGate, rateLimit({ windowMs: 60_000, max: 400, key: byUser('mediapart') }), bodyLimit({ maxSize: PART_BYTES + 64 * 1024, onError: (c) => fail(c, 413, 'TOO_LARGE', 'That part is too large.') }), async (c) => {
  const userId = c.get('session')!.user.id
  const n = Number(c.req.param('n'))
  const [job] = await db.select().from(mediaJob).where(mine(c.req.param('id'), userId))
  if (!job) return fail(c, 404, 'NOT_FOUND', 'Upload not found')
  if (job.status !== 'uploading') return fail(c, 409, 'CONFLICT', 'This upload is already closed.')
  if (!Number.isInteger(n) || n < 0 || n >= job.partsTotal) return fail(c, 400, 'INVALID_REQUEST', 'Unknown part number')
  const data = new Uint8Array(await c.req.arrayBuffer())
  if (data.length !== partSize(job.bytes, n)) return fail(c, 400, 'INVALID_REQUEST', 'That part has the wrong size. Start the upload again.')
  try { await writePart(job.id, n, data) } catch (e) { console.error('[media] write', e); return fail(c, 503, 'STORAGE', 'Could not store the upload. Please try again.') }
  const [row] = await db.update(mediaJob).set({ partsReceived: sql`greatest(${mediaJob.partsReceived}, ${n + 1})`, updatedAt: new Date() }).where(mine(job.id, userId)).returning({ received: mediaJob.partsReceived })
  return c.json({ success: true, data: { received: row?.received ?? n + 1 } })
})

media.post('/uploads/:id/complete', rateLimit({ windowMs: 60_000, max: 6, key: byUser('mediacomplete') }), async (c) => {
  const userId = c.get('session')!.user.id
  const [job] = await db.select().from(mediaJob).where(mine(c.req.param('id'), userId))
  if (!job) return fail(c, 404, 'NOT_FOUND', 'Upload not found')
  if (job.status !== 'uploading') return c.json({ success: true, data: { status: job.status } })
  const refuse = async (status: 413 | 422 | 429, code: string, message: string) => { await db.update(mediaJob).set({ status: 'failed', error: message, updatedAt: new Date() }).where(eq(mediaJob.id, job.id)); await cleanup(job.id); return fail(c, status, code, message) }
  if (job.partsReceived < job.partsTotal || (await fileSize(job.id)) !== job.bytes) return fail(c, 409, 'CONFLICT', 'The upload is incomplete. Please send the missing parts.')
  try { inspectMedia(await head(job.id), Number.MAX_SAFE_INTEGER) } catch (e) { return refuse(422, 'PARSE_FAILED', e instanceof MediaError ? e.message : 'Could not read that file') }
  let probe
  try { probe = await probeMedia(filePath(job.id)) } catch (e) { if (!(e instanceof FfmpegError)) console.error('[media] probe', e); return refuse(422, 'PARSE_FAILED', 'I could not read that video. It may be damaged or in an unusual format. Export it as MP4 (or the audio as MP3 or M4A) and try again.') }
  const minutes = Math.max(1, Math.ceil(probe.durationSec / 60))
  if (minutes > MAX_VIDEO_MINUTES) return refuse(413, 'TOO_LONG', `That video is ${minutes} minutes long. The limit is ${MAX_VIDEO_MINUTES} minutes: export a shorter part and try again.`)
  const [{ s: usedSec } = { s: 0 }] = await db.select({ s: sql<number>`coalesce(sum(${mediaJob.durationSec}), 0)::int` }).from(mediaJob).where(and(eq(mediaJob.userId, userId), gte(mediaJob.createdAt, new Date(Date.now() - 24 * 3600_000)), inArray(mediaJob.status, ['queued', 'processing', 'completed'])))
  if (Math.ceil(usedSec / 60) + minutes > MAX_VIDEO_MINUTES_PER_DAY) return refuse(429, 'LIMIT_REACHED', `You can add up to ${MAX_VIDEO_MINUTES_PER_DAY} minutes of video a day. Please try again tomorrow.`)
  const price = minutes * (await creditPrice('read_video', 'starter'))
  try { await reserveCredits(userId, price, 'media_job', job.id, { strict: true }) } catch (e) { await cleanup(job.id); await db.update(mediaJob).set({ status: 'failed', error: 'Not enough credits.', updatedAt: new Date() }).where(eq(mediaJob.id, job.id)); throw e } // 402 INSUFFICIENT_CREDITS, before any work
  await db.update(mediaJob).set({ status: 'queued', stage: 'Waiting for its turn', progress: 2, durationSec: probe.durationSec, hasVideo: probe.hasVideo, credits: price, updatedAt: new Date() }).where(eq(mediaJob.id, job.id))
  return c.json({ success: true, data: { status: 'queued', minutes, credits: price, hasVideo: probe.hasVideo } })
})

media.get('/jobs/:id', async (c) => {
  const userId = c.get('session')!.user.id
  const [job] = await db.select().from(mediaJob).where(mine(c.req.param('id'), userId))
  if (!job) return fail(c, 404, 'NOT_FOUND', 'Job not found')
  let source = null
  if (job.status === 'completed' && job.sourceId) {
    const [doc] = await db.select({ id: sourceDocument.id, title: sourceDocument.title }).from(sourceDocument).where(eq(sourceDocument.id, job.sourceId))
    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(sourceChunk).where(eq(sourceChunk.sourceId, job.sourceId))
    if (doc) source = { id: doc.id, type: 'transcript', title: doc.title, chunks: n }
  }
  return c.json({ success: true, data: { status: job.status, stage: job.stage, progress: job.progress, credits: job.credits, error: job.error, source, partsReceived: job.partsReceived, partsTotal: job.partsTotal } })
})

media.delete('/jobs/:id', async (c) => {
  const userId = c.get('session')!.user.id
  const [job] = await db.select().from(mediaJob).where(mine(c.req.param('id'), userId))
  if (!job) return fail(c, 404, 'NOT_FOUND', 'Job not found')
  if (job.status === 'uploading' || job.status === 'queued') {
    await db.update(mediaJob).set({ status: 'failed', error: 'Cancelled.', updatedAt: new Date() }).where(and(eq(mediaJob.id, job.id), eq(mediaJob.status, job.status)))
    if (job.status === 'queued' && job.credits > 0) await refundCredits(userId, 'media_job', job.id)
    await cleanup(job.id)
  }
  return c.json({ success: true, data: null })
})
