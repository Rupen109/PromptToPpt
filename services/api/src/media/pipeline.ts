import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { AIUnavailableError } from '@prompttoppt/ai'
import { aiConfigured, gateway } from '../ai/gateway.ts'
import { db } from '../db/index.ts'
import { mediaJob } from '../db/schema.ts'
import { framesReadOutput, framesReadPrompt, mediaReadOutput, mediaReadPrompt } from '../sources/media-read.ts'
import { fromTranscript, clock } from '../sources/transcript.ts'
import { saveSource } from '../sources/store.ts'
import { extractAudio, frameAt, thumbAt } from './ffmpeg.ts'
import { pickKeyframes, sampleCount, type Sample } from './keyframes.ts'
import { SEGMENT_SECONDS, cleanup, filePath, readWork, workDir } from './store.ts'

/** Nothing usable in the recording (no speech, nothing readable on screen): the person is told plainly and not charged. */
export class NoContent extends Error {}

const STAMP = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+(.*)$/
const secOf = (h: string | undefined, m: string, s: string) => Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s)

/** The model's timed lines ("1:05 words") as {t, text}, with `offset` seconds added; a line without a time joins the one before it. */
export function parseTimedLines(text: string, offset: number): { t: number; text: string }[] {
  const out: { t: number; text: string }[] = []
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const m = STAMP.exec(line)
    if (m) out.push({ t: secOf(m[1], m[2]!, m[3]!) + offset, text: m[4]!.trim() })
    else if (line.trim() && out.length) out[out.length - 1]!.text += ` ${line.trim()}`
    else if (line.trim()) out.push({ t: offset, text: line.trim() })
  }
  return out.filter((l) => l.text)
}

/** Speech and on-screen text in one timeline: "m:ss words" for speech, "m:ss [on screen] text" for the screen. */
export function mergeTimeline(speech: { t: number; text: string }[], screen: { t: number; text: string }[]): string {
  const all = [...speech.map((x) => ({ ...x, kind: 0 })), ...screen.map((x) => ({ ...x, kind: 1 }))]
  all.sort((a, b) => a.t - b.t || a.kind - b.kind)
  return all.map((x) => `${clock(Math.max(0, Math.round(x.t)))} ${x.kind ? '[on screen] ' : ''}${x.text.replace(/\s*\n\s*/g, ' / ')}`).join('\n')
}

const note = (id: string, patch: Partial<typeof mediaJob.$inferInsert>) => db.update(mediaJob).set({ ...patch, updatedAt: new Date() }).where(eq(mediaJob.id, id))
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const x = items[i++]!; await fn(x) } }))
}

export async function runMediaJob(id: string): Promise<void> {
  const [job] = await db.select().from(mediaJob).where(eq(mediaJob.id, id))
  if (!job || !job.durationSec) throw new Error('job is not ready')
  if (!aiConfigured) throw new Error('AI is not configured')
  const input = filePath(id), dir = workDir(id), userId = job.userId, dur = job.durationSec
  await mkdir(dir, { recursive: true })
  await note(id, { status: 'processing', stage: 'Getting ready', progress: 3 })

  // 1 ─ listen (in pieces of 20 minutes, so a long recording never has to fit one answer)
  const segments = Math.ceil(dur / SEGMENT_SECONDS)
  const speech: { t: number; text: string }[] = []
  let title = ''
  const hasSound = true // ffprobe confirmed at least one audio or video stream; a video without sound simply yields no speech
  if (hasSound) {
    for (let i = 0; i < segments; i++) {
      await note(id, { stage: segments > 1 ? `Listening (part ${i + 1} of ${segments})` : 'Listening', progress: 5 + Math.round((i / segments) * 45) })
      const start = i * SEGMENT_SECONDS
      const piece = join(dir, `a${i}.m4a`)
      try { await extractAudio(input, start, Math.min(SEGMENT_SECONDS, dur - start), piece) } catch { continue } // a video with no sound track has nothing to extract
      const bytes = new Uint8Array(await readWork(id, `a${i}.m4a`))
      if (bytes.length < 2048) continue
      const out = await gateway.run({ route: 'fast', requestType: 'media_read', ...mediaReadPrompt(job.filename, 'audio', segments > 1 ? { n: i + 1, of: segments } : undefined), media: [{ kind: 'audio', mimeType: 'audio/mp4', data: bytes }], schema: mediaReadOutput, maxOutputTokens: 24_000, timeoutMs: 240_000, ctx: { userId } })
      if (out.hasSpeech && out.text.trim()) { speech.push(...parseTimedLines(out.text, start)); if (!title && out.title) title = out.title }
    }
  }

  // 2 ─ watch (only moments where the screen changes)
  const screen: { t: number; text: string }[] = []
  if (job.hasVideo) {
    await note(id, { stage: 'Looking at the screen', progress: 52 })
    const n = sampleCount(dur), step = dur / n
    const samples: Sample[] = []
    await pool(Array.from({ length: n }, (_, k) => Math.min(dur - 0.5, k * step + step / 2)), 4, async (t) => { try { samples.push({ t, gray: await thumbAt(input, t) }) } catch { /* a moment that cannot be decoded is skipped */ } })
    samples.sort((a, b) => a.t - b.t)
    const moments = pickKeyframes(samples)
    const jpgs: { t: number; name: string }[] = []
    await pool(moments, 4, async (t) => { const name = `f${Math.round(t * 10)}.jpg`; try { await frameAt(input, t, join(dir, name)); jpgs.push({ t, name }) } catch { /* skip */ } })
    jpgs.sort((a, b) => a.t - b.t)
    const BATCH = 6
    for (let b = 0; b < jpgs.length; b += BATCH) {
      const batch = jpgs.slice(b, b + BATCH)
      await note(id, { stage: 'Reading the screen', progress: 55 + Math.round((b / Math.max(1, jpgs.length)) * 35) })
      const images = await Promise.all(batch.map(async (f) => ({ mimeType: 'image/jpeg', data: new Uint8Array(await readWork(id, f.name)) })))
      const out = await gateway.run({ route: 'fast', requestType: 'video_read', ...framesReadPrompt(batch.map((f) => clock(Math.round(f.t)))), images, schema: framesReadOutput, maxOutputTokens: 6000, timeoutMs: 120_000, ctx: { userId } })
      for (const fr of out.frames) { const f = batch[fr.index - 1]; if (f && fr.text.trim().length >= 3) screen.push({ t: f.t, text: fr.text.trim() }) }
    }
  }

  // 3 ─ one timed source
  await note(id, { stage: 'Finishing', progress: 94 })
  const text = mergeTimeline(speech, screen)
  if (text.replace(/\[on screen\]/g, '').trim().length < 20) throw new NoContent('no speech and nothing readable on screen')
  const finalTitle = (title || job.filename.replace(/\.[a-z0-9]+$/i, '') || 'Video').slice(0, 200)
  const saved = await saveSource(userId, 'transcript', fromTranscript(finalTitle, text, 120, 1))
  await note(id, { status: 'completed', stage: 'Done', progress: 100, sourceId: saved.id, title: finalTitle, error: null, lockedUntil: null })
  await cleanup(id)
}

export const publicMediaError = (e: unknown) =>
  e instanceof NoContent ? "I couldn't hear any speech or read any text on screen in that video, so there is nothing to build a deck from. You were not charged."
  : e instanceof AIUnavailableError ? 'The AI service is busy or unavailable. You were not charged — please try again in a moment.'
  : 'Something went wrong while reading that video. You were not charged.'
