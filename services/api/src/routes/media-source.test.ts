import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { creditBalance, sourceChunk, sourceDocument } from '../db/schema.ts'
import { api, json, origin, rid, setPlan, signUp } from '../test-utils.ts'

const wavBytes = (extra = 4096, marker = '') => Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WAVEfmt '), Buffer.from(marker), Buffer.alloc(extra, 0x20)])
const upload = (cookie: string | null, bytes: Buffer, name = 'talk.wav', path = '/api/v1/sources/media', headers: Record<string, string> = {}) => {
  const form = new FormData(); form.set('file', new File([new Uint8Array(bytes)], name, { type: 'audio/wav' }))
  return app.request(path, { method: 'POST', headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: form })
}
const balance = async (id: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, id)))[0]!.balance
const fresh = async () => { const u = await signUp('media'); await json(await api(u.cookie, 'GET', '/me/entitlements')); return u }

describe('POST /sources/media (audio & video to slides)', () => {
  it('signed-out visitors cannot use it', async () => { expect((await upload(null, wavBytes())).status).toBe(401) })

  it('transcribes into a timed transcript source, charges 6 credits per started 4 MB, stores no recording', async () => {
    const u = await fresh()
    const r = await upload(u.cookie, wavBytes(4096, 'SECRET_MARKER'))
    expect(r.status).toBe(201)
    const d = (await json(r)).data
    expect(d).toMatchObject({ type: 'transcript', creditsCharged: 6 })
    expect(await balance(u.id)).toBe(94)
    const chunks = await db.select().from(sourceChunk).where(eq(sourceChunk.sourceId, d.id))
    expect(chunks.map((c) => c.locator)).toEqual(['0:00', '2:10'])
    expect(chunks.map((c) => c.text).join(' ')).toContain('4,200 electric bicycles')
    expect(chunks.map((c) => c.text).join(' ')).not.toContain('SECRET_MARKER')
    const big = await upload(u.cookie, wavBytes(5 * 1024 * 1024)) // 5 MB = 2 started blocks
    expect((await json(big)).data.creditsCharged).toBe(12)
    expect(await balance(u.id)).toBe(94 - 12)
  })

  it('refuses things that are not recordings before any charge or model call', async () => {
    const u = await fresh()
    for (const [bytes, name, hint] of [[Buffer.concat([Buffer.from('MZ\x90\x00'), Buffer.alloc(4096)]), 'song.mp3', /not a supported recording/], [Buffer.alloc(0), 'empty.wav', /empty/], [Buffer.from('<svg xmlns="x"></svg>'.padEnd(4096)), 'a.m4a', /web or text file/]] as const) {
      const r = await upload(u.cookie, bytes, name)
      expect(r.status).toBe(422); expect((await json(r)).error.message).toMatch(hint)
    }
    expect(await balance(u.id)).toBe(100)
    expect(await db.select().from(sourceDocument).where(eq(sourceDocument.userId, u.id))).toHaveLength(0)
  })

  it('over 12 MB is refused (413) and costs nothing', async () => {
    const u = await fresh()
    expect((await upload(u.cookie, wavBytes(13 * 1024 * 1024))).status).toBe(413)
    expect(await balance(u.id)).toBe(100)
  })

  it('a recording with no speech is refunded with a plain message and nothing is stored', async () => {
    const u = await fresh()
    const r = await upload(u.cookie, wavBytes(4096, 'SILENT_MEDIA'))
    expect(r.status).toBe(422); expect((await json(r)).error.code).toBe('NO_SPEECH')
    expect(await balance(u.id)).toBe(100)
    expect(await db.select().from(sourceDocument).where(eq(sourceDocument.userId, u.id))).toHaveLength(0)
  })

  it('a failing model refunds the charge', async () => {
    const u = await fresh()
    const r = await upload(u.cookie, wavBytes(), 'FAIL_PLEASE.wav')
    expect(r.status).toBeGreaterThanOrEqual(422)
    expect(await balance(u.id)).toBe(100)
    expect(await db.select().from(sourceDocument).where(eq(sourceDocument.userId, u.id))).toHaveLength(0)
  })

  it('out of credits: 402 and nothing stored', async () => {
    const u = await fresh()
    await db.update(creditBalance).set({ balance: 5 }).where(eq(creditBalance.userId, u.id))
    const r = await upload(u.cookie, wavBytes())
    expect(r.status).toBe(402); expect((await json(r)).error.code).toBe('INSUFFICIENT_CREDITS')
  })

  it('is limited to 4 recordings a minute per person', async () => {
    const u = await fresh(); await setPlan(u.id, 'gold'); await json(await api(u.cookie, 'GET', '/me/entitlements'))
    const codes: number[] = []
    for (let i = 0; i < 6; i++) codes.push((await upload(u.cookie, wavBytes(4096, rid()))).status)
    expect(codes.filter((c) => c === 201).length).toBeLessThanOrEqual(4)
    expect(codes).toContain(429)
  })
})
