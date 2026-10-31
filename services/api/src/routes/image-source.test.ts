import { crc32, deflateSync } from 'node:zlib'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { aiUsageEvent, creditBalance, sourceChunk, sourceDocument } from '../db/schema.ts'
import { ImageError, inspectImage } from '../sources/image-read.ts'
import { api, json, origin, rid, setPlan, signUp } from '../test-utils.ts'

const be = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b }
const chunk = (type: string, data: Buffer) => Buffer.concat([be(data.length), Buffer.from(type), data, be(crc32(Buffer.concat([Buffer.from(type), data])))])
/** A real, tiny, valid PNG (solid colour) of the given size. `claim` writes a different size into the header (a "pixel bomb" header). */
function png(w = 64, h = 64, claim?: [number, number], marker = ''): Buffer {
  const [cw, ch] = claim ?? [w, h]
  const ihdr = Buffer.concat([be(cw), be(ch), Buffer.from([8, 2, 0, 0, 0])])
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 200)])
  const raw = Buffer.concat(Array.from({ length: h }, () => row))
  const text = marker ? [chunk('tEXt', Buffer.from(`k\0${marker}`))] : []
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), ...text, chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const jpeg = (w: number, h: number) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0, 0xff, 0xd9])
const webpX = (w: number, h: number) => { const b = Buffer.alloc(40); b.write('RIFF', 0); b.writeUInt32LE(32, 4); b.write('WEBPVP8X', 8); b.writeUInt32LE(10, 16); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b }

const upload = (cookie: string | null, bytes: Buffer | Uint8Array, name = 'notes.png', type = 'image/png') => {
  const form = new FormData(); form.set('file', new File([new Uint8Array(bytes)], name, { type }))
  return app.request('/api/v1/sources/image', { method: 'POST', headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: form })
}
const balance = async (id: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, id)))[0]!.balance

describe('inspectImage (type and size come from the bytes, not the name)', () => {
  it('reads PNG, JPEG and WebP sizes', () => {
    expect(inspectImage(png(50, 40))).toEqual({ mime: 'image/png', width: 50, height: 40 })
    expect(inspectImage(jpeg(800, 600))).toEqual({ mime: 'image/jpeg', width: 800, height: 600 })
    expect(inspectImage(webpX(1200, 900))).toEqual({ mime: 'image/webp', width: 1200, height: 900 })
  })
  it('refuses everything else with a sentence a person can act on', () => {
    const msg = (b: Buffer | Uint8Array) => { try { inspectImage(b); return 'accepted' } catch (e) { return e instanceof ImageError ? e.message : 'crash' } }
    expect(msg(Buffer.alloc(0))).toMatch(/empty/)
    expect(msg(Buffer.from('MZ\x90\x00 this is an exe'))).toMatch(/not a JPG, PNG or WebP/)
    expect(msg(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toMatch(/SVG/)
    expect(msg(Buffer.from('GIF89a......................'))).toMatch(/GIF/)
    expect(msg(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic'), Buffer.alloc(20)]))).toMatch(/HEIC/)
    expect(msg(png(8, 8))).toMatch(/too small/)
    expect(msg(png(64, 64, [50_000, 50_000]))).toMatch(/too large in pixels/)
    expect(msg(png(64, 64, [11_000, 11_000]))).toMatch(/too large in pixels/) // 121 MP
    expect(msg(Buffer.alloc(9 * 1024 * 1024, 1))).toMatch(/larger than 8 MB/)
  })
})

describe('POST /sources/image (image to deck)', () => {
  it('signed-out visitors cannot use it', async () => {
    expect((await upload(null, png())).status).toBe(401)
  })

  it('Starter: reads a picture into a private text source, charges 4 credits, stores no picture', async () => {
    const u = await signUp('img')
    await json(await api(u.cookie, 'GET', '/me/entitlements'))
    const r = await upload(u.cookie, png(64, 64, undefined, 'SECRET_MARKER'))
    expect(r.status).toBe(201)
    const d = (await json(r)).data
    expect(d).toMatchObject({ type: 'image', creditsCharged: 4 })
    expect(await balance(u.id)).toBe(96)
    const [doc] = await db.select().from(sourceDocument).where(eq(sourceDocument.id, d.id))
    expect(doc).toMatchObject({ type: 'image', userId: u.id })
    const text = (await db.select().from(sourceChunk).where(eq(sourceChunk.sourceId, d.id))).map((c) => c.text).join('\n')
    expect(text).toContain('4,200 electric bicycles')
    expect(text).not.toContain('SECRET_MARKER') // only the model's reading is kept, never the file
    const ev = (await db.select().from(aiUsageEvent).where(eq(aiUsageEvent.userId, u.id))).find((e) => e.requestType === 'image_read')
    expect(ev).toBeTruthy()
  })

  it('a photo-sized picture (over the 256 KB limit that applies to ordinary requests) is accepted', async () => {
    const u = await signUp('img'); await json(await api(u.cookie, 'GET', '/me/entitlements'))
    const photo = png(64, 64, undefined, 'x'.repeat(1_200_000)) // ≈ 1.2 MB, like a small phone photo
    expect(photo.length).toBeGreaterThan(1_000_000)
    expect((await upload(u.cookie, photo)).status).toBe(201)
  })

  it('a file that is not a picture is refused before any charge or model call', async () => {
    const u = await signUp('img'); await json(await api(u.cookie, 'GET', '/me/entitlements'))
    for (const [bytes, name, hint] of [[Buffer.from('MZ\x90\x00 fake exe'), 'photo.png', /not a JPG/], [Buffer.from('<svg xmlns="x"></svg>'), 'logo.png', /SVG/], [Buffer.alloc(0), 'empty.jpg', /empty/]] as const) {
      const r = await upload(u.cookie, bytes, name)
      expect(r.status).toBe(422)
      expect((await json(r)).error.message).toMatch(hint)
    }
    expect(await balance(u.id)).toBe(100)
    expect(await db.select().from(aiUsageEvent).where(eq(aiUsageEvent.userId, u.id))).toHaveLength(0)
  })

  it('over 8 MB is refused (413) and a pixel-bomb header is refused (422) without reaching the model', async () => {
    const u = await signUp('img'); await json(await api(u.cookie, 'GET', '/me/entitlements'))
    expect((await upload(u.cookie, Buffer.alloc(9 * 1024 * 1024, 1))).status).toBe(413)
    const bomb = await upload(u.cookie, png(64, 64, [60_000, 60_000]))
    expect(bomb.status).toBe(422)
    expect(await balance(u.id)).toBe(100)
  })

  it('a failing model refunds the charge and stores nothing', async () => {
    const u = await signUp('img'); await json(await api(u.cookie, 'GET', '/me/entitlements'))
    const r = await upload(u.cookie, png(), 'FAIL_PLEASE.png')
    expect(r.status).toBeGreaterThanOrEqual(422)
    expect(await balance(u.id)).toBe(100)
    expect(await db.select().from(sourceDocument).where(eq(sourceDocument.userId, u.id))).toHaveLength(0)
  })

  it('a picture with nothing readable is refunded with a plain message', async () => {
    const u = await signUp('img'); await json(await api(u.cookie, 'GET', '/me/entitlements'))
    const r = await upload(u.cookie, png(64, 64, undefined, 'BLANK_PICTURE'))
    expect(r.status).toBe(422)
    expect((await json(r)).error).toMatchObject({ code: 'NOTHING_READABLE' })
    expect(await balance(u.id)).toBe(100)
  })

  it('out of credits: 402 and nothing stored', async () => {
    const u = await signUp('img'); await json(await api(u.cookie, 'GET', '/me/entitlements'))
    await db.update(creditBalance).set({ balance: 3 }).where(eq(creditBalance.userId, u.id))
    const r = await upload(u.cookie, png())
    expect(r.status).toBe(402)
    expect((await json(r)).error.code).toBe('INSUFFICIENT_CREDITS')
    expect(await db.select().from(sourceDocument).where(eq(sourceDocument.userId, u.id))).toHaveLength(0)
  })

  it('is limited to 8 pictures a minute per person', async () => {
    const u = await signUp('img'); await setPlan(u.id, 'gold'); await json(await api(u.cookie, 'GET', '/me/entitlements'))
    const codes: number[] = []
    for (let i = 0; i < 10; i++) codes.push((await upload(u.cookie, png(64, 64, undefined, rid()))).status)
    expect(codes.filter((c) => c === 201).length).toBeLessThanOrEqual(8)
    expect(codes).toContain(429)
  })
})
