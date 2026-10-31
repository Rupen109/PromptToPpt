import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { aiUsageEvent, creditBalance, sourceChunk } from '../db/schema.ts'
import { ffmpegAvailable } from '../media/ffmpeg.ts'
import { filePath } from '../media/store.ts'
import { processOneMedia } from '../media/worker.ts'
import { api, json, origin, signUp } from '../test-utils.ts'

const have = await ffmpegAvailable() // these tests make real media with ffmpeg; without it they are skipped (the server then answers VIDEO_UNAVAILABLE)
const dir = mkdtempSync(join(tmpdir(), 'sd-media-test-'))
const make = (name: string, args: string[]) => { const out = join(dir, name); execFileSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', ...args, out]); return readFileSync(out) }
let video: Buffer, audio: Buffer, longAudio: Buffer
beforeAll(() => {
  if (!have) return
  video = make('v.mp4', ['-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=10:d=12', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'])
  audio = make('a.m4a', ['-f', 'lavfi', '-i', 'sine=frequency=330:duration=8', '-c:a', 'aac'])
  longAudio = make('long.m4a', ['-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-t', '5460', '-c:a', 'aac', '-b:a', '8k']) // 91 minutes of silence
})

const call = (cookie: string, method: string, path: string, body?: Buffer | Uint8Array) => app.request(`/api/v1/media${path}`, { method, headers: { Origin: origin, Cookie: cookie, ...(body ? { 'Content-Type': 'application/octet-stream' } : {}) }, ...(body ? { body: new Uint8Array(body) } : {}) })
const start = (cookie: string, filename: string, bytes: number) => api(cookie, 'POST', '/media/uploads', { filename, bytes })
async function upload(cookie: string, bytes: Buffer, filename: string) {
  const s = await json(await start(cookie, filename, bytes.length)); const { id, partBytes, partsTotal } = s.data
  for (let n = 0; n < partsTotal; n++) expect((await call(cookie, 'PUT', `/uploads/${id}/parts/${n}`, bytes.subarray(n * partBytes, (n + 1) * partBytes))).status).toBe(200)
  return id as string
}
const complete = (cookie: string, id: string) => api(cookie, 'POST', `/media/uploads/${id}/complete`)
const job = async (cookie: string, id: string) => (await json(await api(cookie, 'GET', `/media/jobs/${id}`))).data
const balance = async (id: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, id)))[0]!.balance
const fresh = async () => { const u = await signUp('vid'); await json(await api(u.cookie, 'GET', '/me/entitlements')); return u }
async function finish(cookie: string, id: string) { for (let i = 0; i < 4; i++) { const j = await job(cookie, id); if (j.status === 'completed' || j.status === 'failed') return j; await processOneMedia() } return job(cookie, id) }

describe.skipIf(!have)('video to slides (big recordings)', () => {
  it('video: upload in parts → length measured and credits taken → worker listens AND reads the screen → one timed source; the file is deleted', async () => {
    const u = await fresh()
    const id = await upload(u.cookie, video, 'lecture.mp4')
    expect(existsSync(filePath(id))).toBe(true)
    const done = await complete(u.cookie, id)
    expect(done.status).toBe(200)
    expect((await json(done)).data).toMatchObject({ status: 'queued', minutes: 1, credits: 3, hasVideo: true })
    expect(await balance(u.id)).toBe(97)
    expect((await job(u.cookie, id)).status).toBe('queued')
    const j = await finish(u.cookie, id)
    expect(j).toMatchObject({ status: 'completed', progress: 100 })
    const text = (await db.select().from(sourceChunk).where(eq(sourceChunk.sourceId, j.source.id))).map((c) => c.text).join('\n')
    expect(text).toContain('4,200 electric bicycles') // what was said
    expect(text).toContain('[on screen] Quarterly results') // what was shown
    expect(existsSync(filePath(id))).toBe(false)
    const kinds = (await db.select().from(aiUsageEvent).where(eq(aiUsageEvent.userId, u.id))).map((e) => e.requestType)
    expect(kinds).toEqual(expect.arrayContaining(['media_read', 'video_read']))
    expect(await balance(u.id)).toBe(97) // charged once, not again
  })

  it('audio only: the same pipeline without the screen part', async () => {
    const u = await fresh()
    const id = await upload(u.cookie, audio, 'voice-note.m4a')
    expect((await json(await complete(u.cookie, id))).data).toMatchObject({ hasVideo: false, credits: 3 })
    const j = await finish(u.cookie, id); expect(j.status).toBe('completed')
    const text = (await db.select().from(sourceChunk).where(eq(sourceChunk.sourceId, j.source.id))).map((c) => c.text).join('\n')
    expect(text).toContain('4,200'); expect(text).not.toContain('[on screen]')
  })

  it('refuses at the start: over 200 MB, no credits, a second video while one is being prepared', async () => {
    const u = await fresh()
    expect((await start(u.cookie, 'huge.mp4', 201 * 1024 * 1024)).status).toBe(400)
    const id = await upload(u.cookie, audio, 'a.m4a') // still "uploading": counts as active
    const second = await start(u.cookie, 'b.m4a', audio.length)
    expect(second.status).toBe(429)
    await api(u.cookie, 'DELETE', `/media/jobs/${id}`)
    const poor = await fresh(); await db.update(creditBalance).set({ balance: 2 }).where(eq(creditBalance.userId, poor.id))
    const r = await start(poor.cookie, 'c.m4a', audio.length)
    expect(r.status).toBe(402); expect((await json(r)).error.code).toBe('INSUFFICIENT_CREDITS')
  })

  it('refuses at the end, before any charge: a wrong-size part, an incomplete upload, a file that is not a recording, a video over 90 minutes', async () => {
    const u = await fresh()
    const s = (await json(await start(u.cookie, 'x.mp4', audio.length))).data
    expect((await call(u.cookie, 'PUT', `/uploads/${s.id}/parts/0`, audio.subarray(0, 100))).status).toBe(400)
    expect((await complete(u.cookie, s.id)).status).toBe(409)
    await api(u.cookie, 'DELETE', `/media/jobs/${s.id}`)

    const fake = Buffer.concat([Buffer.from('MZ\x90\x00'), Buffer.alloc(5000)])
    const fid = await upload(u.cookie, fake, 'movie.mp4')
    const bad = await complete(u.cookie, fid)
    expect(bad.status).toBe(422); expect((await json(bad)).error.message).toMatch(/not a supported recording/)
    expect(existsSync(filePath(fid))).toBe(false)

    const lid = await upload(u.cookie, longAudio, 'all-day.m4a')
    const long = await complete(u.cookie, lid)
    expect(long.status).toBe(413); expect((await json(long)).error.message).toMatch(/limit is 90 minutes/)
    expect(await balance(u.id)).toBe(100)
  })

  it('no speech and nothing on screen: refunded with a plain message; a failing model: retried once, then refunded', async () => {
    const u = await fresh()
    const a = await upload(u.cookie, audio, 'SILENT_FILE.m4a'); await complete(u.cookie, a)
    const ja = await finish(u.cookie, a)
    expect(ja.status).toBe('failed'); expect(ja.error).toMatch(/nothing to build a deck from. You were not charged/)
    expect(await balance(u.id)).toBe(100)
    const b = await upload(u.cookie, audio, 'FAIL_PLEASE.m4a'); await complete(u.cookie, b)
    expect(await balance(u.id)).toBe(97)
    const jb = await finish(u.cookie, b)
    expect(jb.status).toBe('failed'); expect(await balance(u.id)).toBe(100)
  })

  it("cancelling a queued video refunds it; other people cannot see or cancel your job", async () => {
    const u = await fresh(); const other = await fresh()
    const id = await upload(u.cookie, audio, 'a.m4a'); await complete(u.cookie, id)
    expect(await balance(u.id)).toBe(97)
    expect((await api(other.cookie, 'GET', `/media/jobs/${id}`)).status).toBe(404)
    expect((await api(other.cookie, 'DELETE', `/media/jobs/${id}`)).status).toBe(404)
    expect((await api(u.cookie, 'DELETE', `/media/jobs/${id}`)).status).toBe(200)
    expect(await balance(u.id)).toBe(100)
    expect(existsSync(filePath(id))).toBe(false)
  })

  it('signed-out visitors cannot use it', async () => {
    expect((await app.request('/api/v1/media/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ filename: 'a.mp4', bytes: 5000 }) })).status).toBe(401)
  })
})
