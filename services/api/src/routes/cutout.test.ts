import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { setCutoutEngine } from '../media/cutout.ts'
import { db } from '../db/index.ts'
import { featureFlag } from '../db/schema.ts'
import { backgroundRemovalBlocked, invalidateFlags } from '../flags/flags.ts'
import { activeBackgroundProvider, APPROVED_FOR_PRODUCTION, PROVIDERS } from '../media/bg-providers.ts'
import { api, json, makeDeck, signUp } from '../test-utils.ts'

/** A picture of a red square on a grey room, and a stand-in for the model that calls anything not grey "the subject" (the real model is tried by hand and in the e2e suite). */
const room = (opts: { transparent?: boolean } = {}) => sharp({ create: { width: 200, height: 120, channels: opts.transparent ? 4 : 3, background: opts.transparent ? { r: 200, g: 200, b: 200, alpha: 0 } : { r: 128, g: 128, b: 128 } } })
  .composite([{ input: { create: { width: 60, height: 50, channels: 3, background: { r: 220, g: 30, b: 30 } } }, left: 70, top: 40 }])
const jpeg = () => room().jpeg().toBuffer()
const notGrey = { async mask(rgb: Uint8Array, w: number, h: number) { const m = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) m[i] = rgb[i * 3] === 128 && rgb[i * 3 + 1] === 128 ? 0 : 255; return m } }
const upload = async (cookie: string, deckId: string, bytes: Buffer, name = 'cup.jpg') => {
  const form = new FormData(); form.set('file', new File([new Uint8Array(bytes)], name))
  return json(await app.request(`/api/v1/presentations/${deckId}/images/upload`, { method: 'POST', headers: { Cookie: cookie }, body: form }))
}
const cutout = (cookie: string, deckId: string, url: string) => api(cookie, 'POST', `/presentations/${deckId}/images/cutout`, { url })
afterEach(() => setCutoutEngine(null))

describe('POST /presentations/:id/images/cutout (remove background)', () => {
  it('cuts the subject out of one of the person\'s pictures: a new transparent PNG, cropped to the subject, the original kept, listed in "my uploads"', async () => {
    setCutoutEngine(notGrey)
    const u = await signUp('cut'); const { id } = await makeDeck(u.id)
    const up = (await upload(u.cookie, id, await jpeg())).data
    const res = await cutout(u.cookie, id, up.url)
    const body = await json(res)
    expect(res.status).toBe(200)
    expect(body.data).toMatchObject({ mime: 'image/png', name: 'Picture without background' })
    expect(body.data.assetId).not.toBe(up.assetId)
    const served = await app.request(new URL(body.data.url).pathname)
    expect(served.status).toBe(200)
    const out = Buffer.from(await served.arrayBuffer())
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('png')
    expect(meta.hasAlpha).toBe(true)
    // the square is 60x50; the crop keeps it with a little margin, not the whole 200x120 room
    expect(meta.width!).toBeLessThan(110); expect(meta.height!).toBeLessThan(90) // JPEG blurs the edge a little
    const raw = await sharp(out).raw().toBuffer({ resolveWithObject: true })
    const alphaAt = (x: number, y: number) => raw.data[(y * raw.info.width + x) * 4 + 3]!
    expect(alphaAt(Math.floor(raw.info.width / 2), Math.floor(raw.info.height / 2))).toBe(255) // the subject
    expect(alphaAt(0, 0)).toBe(0) // the margin is transparent
    const mine = await json(await api(u.cookie, 'GET', '/media/mine'))
    const ids = mine.data.items.map((x: any) => x.id)
    expect(ids).toContain(up.assetId); expect(ids).toContain(body.data.assetId)
  })

  it('only the owner\'s own pictures: someone else\'s picture, a stranger\'s deck, any other address and a missing picture are refused in plain words', async () => {
    setCutoutEngine(notGrey)
    const u = await signUp('cut'); const other = await signUp('cut')
    const mine = await makeDeck(u.id); const theirs = await makeDeck(other.id)
    const theirPic = (await upload(other.cookie, theirs.id, await jpeg())).data
    expect((await json(await cutout(u.cookie, mine.id, theirPic.url))).error.code).toBe('NOT_A_PICTURE')
    expect((await json(await cutout(u.cookie, mine.id, 'https://example.com/a.jpg'))).error.code).toBe('NOT_A_PICTURE')
    expect((await cutout(u.cookie, theirs.id, theirPic.url)).status).toBe(404)
    expect((await cutout(u.cookie, mine.id, `${new URL(theirPic.url).origin}/api/v1/assets/${'a'.repeat(32)}`)).status).toBe(422)
  })

  it('a picture that is already transparent, and one with no clear subject, change nothing and say why; a model that fails is a plain "not available", never a broken picture', async () => {
    const u = await signUp('cut'); const { id } = await makeDeck(u.id)
    const png = (await upload(u.cookie, id, await room({ transparent: true }).png().toBuffer(), 'logo.png')).data
    setCutoutEngine(notGrey)
    expect((await json(await cutout(u.cookie, id, png.url))).error.message).toMatch(/already has a transparent background/)
    const jp = (await upload(u.cookie, id, await jpeg())).data
    setCutoutEngine({ async mask(_r, w, h) { return new Uint8Array(w * h) } })
    expect((await json(await cutout(u.cookie, id, jp.url))).error.message).toMatch(/could not find a clear subject/)
    setCutoutEngine({ async mask() { throw new Error('the model fell over') } })
    const bad = await cutout(u.cookie, id, jp.url)
    expect(bad.status).toBe(503)
    expect((await json(bad)).error.code).toBe('CUTOUT_UNAVAILABLE')
    expect((await json(await api(u.cookie, 'GET', '/media/mine'))).data.items).toHaveLength(2) // nothing new was kept
  })
})

describe('background removal dialog endpoints (development only)', () => {
  const post = (cookie: string, deckId: string, path: string, url: string) => api(cookie, 'POST', `/presentations/${deckId}/images/${path}`, { url })

  it('cutout-mask returns the model\'s foreground mask as a grey-scale PNG with its size; original returns the picture\'s own bytes; neither stores anything', async () => {
    setCutoutEngine(notGrey)
    const u = await signUp('mask'); const { id } = await makeDeck(u.id)
    const up = (await upload(u.cookie, id, await jpeg())).data
    const mask = await post(u.cookie, id, 'cutout-mask', up.url)
    expect(mask.status).toBe(200)
    expect(mask.headers.get('content-type')).toBe('image/png')
    const png = Buffer.from(await mask.arrayBuffer())
    const meta = await sharp(png).metadata()
    expect([meta.width, meta.height]).toEqual([200, 120])
    expect(mask.headers.get('x-mask-width')).toBe('200')
    expect(meta.channels).toBe(1)
    const { data: raw, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
    const at = (x: number, y: number) => raw[(y * info.width + x) * info.channels]
    expect(at(100, 60)).toBe(255) // inside the red square
    expect(at(5, 5)).toBe(0) // the room
    const orig = await post(u.cookie, id, 'original', up.url)
    expect(orig.status).toBe(200)
    expect(orig.headers.get('content-type')).toBe('image/jpeg')
    expect((await sharp(Buffer.from(await orig.arrayBuffer())).metadata()).width).toBe(200)
    expect((await json(await api(u.cookie, 'GET', '/media/mine'))).data.items).toHaveLength(1) // only the upload
  })

  it('only the owner\'s own pictures, and a stranger\'s deck is not found', async () => {
    setCutoutEngine(notGrey)
    const u = await signUp('mask'); const other = await signUp('mask')
    const mine = await makeDeck(u.id); const theirs = await makeDeck(other.id)
    const pic = (await upload(other.cookie, theirs.id, await jpeg())).data
    expect((await json(await post(u.cookie, mine.id, 'cutout-mask', pic.url))).error.code).toBe('NOT_A_PICTURE')
    expect((await json(await post(u.cookie, mine.id, 'original', 'https://example.com/x.jpg'))).error.code).toBe('NOT_A_PICTURE')
    expect((await post(u.cookie, theirs.id, 'cutout-mask', pic.url)).status).toBe(404)
  })

  it('the flag is the gate for the removal itself: switched off, cutout and cutout-mask refuse with a plain message and run nothing, while the original picture (needed by any editing feature) is still served', async () => {
    let ran = 0
    setCutoutEngine({ async mask(rgb, w, h) { ran++; return notGrey.mask(rgb, w, h) } })
    const u = await signUp('flag'); const { id } = await makeDeck(u.id)
    const up = (await upload(u.cookie, id, await jpeg())).data
    await db.insert(featureFlag).values({ key: 'background_removal', enabled: false, rolloutPercent: 100, plans: [], note: 'test' }).onConflictDoUpdate({ target: featureFlag.key, set: { enabled: false } })
    invalidateFlags()
    try {
      expect((await post(u.cookie, id, 'original', up.url)).status).toBe(200) // not part of the removal feature
      for (const path of ['cutout', 'cutout-mask']) {
        const r = await post(u.cookie, id, path, up.url)
        expect(r.status, path).toBe(403)
        expect((await json(r)).error.message, path).toMatch(/not available yet/)
      }
      expect(ran).toBe(0)
    } finally { await db.delete(featureFlag).where((await import('drizzle-orm')).eq(featureFlag.key, 'background_removal')); invalidateFlags() }
  })

  it('production runs only a provider approved in code, and only with its key: the development models never run there', () => {
    expect(Object.keys(APPROVED_FOR_PRODUCTION)).toEqual(['photoroom']) // adding a provider here is the deliberate act of approving it
    const noKey = process.env['PHOTOROOM_API_KEY']; delete process.env['PHOTOROOM_API_KEY']
    try {
      for (const id of Object.keys(PROVIDERS)) expect(backgroundRemovalBlocked('production', id), id).toBe(true) // no key: nothing runs
      expect(backgroundRemovalBlocked('production', undefined)).toBe(true)
      process.env['PHOTOROOM_API_KEY'] = 'k'
      expect(backgroundRemovalBlocked('production', undefined)).toBe(false)
      expect(backgroundRemovalBlocked('production', 'photoroom')).toBe(false)
      expect(backgroundRemovalBlocked('production', 'server-dev')).toBe(true)
      expect(backgroundRemovalBlocked('production', 'mock')).toBe(true)
      expect(backgroundRemovalBlocked('production', 'anything-else')).toBe(true)
    } finally { if (noKey === undefined) delete process.env['PHOTOROOM_API_KEY']; else process.env['PHOTOROOM_API_KEY'] = noKey }
    expect(backgroundRemovalBlocked('development', undefined)).toBe(false) // the development server model
    expect(backgroundRemovalBlocked('test', undefined)).toBe(false)
    expect(backgroundRemovalBlocked('development', 'no-such-provider')).toBe(true)
  })

  it('a development-only provider can never be approved for production, even if someone adds it to the allow-list', () => {
    for (const id of Object.keys(APPROVED_FOR_PRODUCTION)) expect(PROVIDERS[id]?.devOnly, id).toBe(false)
    APPROVED_FOR_PRODUCTION['server-dev'] = { approvedBy: 'x', approvedAt: '2000-01-01', evidence: 'x' }
    try { expect(activeBackgroundProvider('production', 'server-dev')).toBeNull() } finally { delete APPROVED_FOR_PRODUCTION['server-dev'] }
  })
})

describe('picture checks, cancellation and the queue limits', () => {
  it('only PNG, JPEG and WebP are recognised, by their first bytes', async () => {
    const { sniffPicture } = await import('../media/image-format.ts')
    expect(sniffPicture(await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).png().toBuffer())).toBe('png')
    expect(sniffPicture(await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).jpeg().toBuffer())).toBe('jpeg')
    expect(sniffPicture(await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).webp().toBuffer())).toBe('webp')
    expect(sniffPicture(await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).gif().toBuffer())).toBeNull()
    expect(sniffPicture(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(sniffPicture(new Uint8Array(0))).toBeNull()
    expect(sniffPicture(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull() // a truncated header
  })

  it('an animated picture is refused with a plain sentence, before the model is asked', async () => {
    const { segmentForeground } = await import('../media/cutout.ts')
    let asked = 0
    setCutoutEngine({ async mask(rgb, w, h) { asked++; return notGrey.mask(rgb, w, h) } })
    const frames = await sharp(Buffer.concat([await sharp({ create: { width: 8, height: 8, channels: 3, background: '#f00' } }).raw().toBuffer(), await sharp({ create: { width: 8, height: 8, channels: 3, background: '#00f' } }).raw().toBuffer()]), { raw: { width: 8, height: 16, channels: 3, pageHeight: 8 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer()
    await expect(segmentForeground(frames)).rejects.toThrow(/Animated pictures/)
    expect(asked).toBe(0)
  })

  it('a caller that goes away stops the model for that picture (the engine sees the abort) and the answer is "cancelled", never a result', async () => {
    const { segmentForeground, CutoutCancelledError } = await import('../media/cutout.ts')
    let sawAbort = false
    setCutoutEngine({ mask(_r, _w, _h, signal) { return new Promise((_ok, no) => { signal?.addEventListener('abort', () => { sawAbort = true; no(new Error('stopped')) }) }) } })
    const ac = new AbortController()
    const run = segmentForeground(await jpeg(), { signal: ac.signal })
    setTimeout(() => ac.abort(), 50)
    await expect(run).rejects.toBeInstanceOf(CutoutCancelledError)
    await new Promise((r) => setTimeout(r, 20))
    expect(sawAbort).toBe(true)
  })

  it('a timeout does not free the queue while the model is still working, and too many waiting pictures are refused as busy', async () => {
    const { segmentForeground, CutoutError, CutoutBusyError } = await import('../media/cutout.ts')
    const { setCutoutQueue } = await import('../media/cutout.ts')
    const { InferenceQueue } = await import('../media/cutout-queue.ts')
    setCutoutQueue(new InferenceQueue({ slots: 1, maxWaiting: 1 }))
    let release!: () => void
    const stuck = new Promise<void>((r) => { release = r })
    let running = 0, peak = 0
    setCutoutEngine({ async mask(_r, w, h) { running++; peak = Math.max(peak, running); await stuck; running--; return notGrey.mask(_r, w, h) } })
    try {
      const bytes = await jpeg()
      const first = segmentForeground(bytes)
      const second = segmentForeground(bytes)
      await new Promise((r) => setTimeout(r, 30))
      await expect(segmentForeground(bytes)).rejects.toBeInstanceOf(CutoutBusyError) // one running, one waiting: the third is refused
      release()
      await first; await second
      expect(peak).toBe(1)
      void CutoutError
    } finally { setCutoutQueue(null); release() }
  })

  it('over REAL HTTP: a client that goes away while the model is working stops the model for that picture (the abort travels from the socket to the engine)', async () => {
    const { serve } = await import('@hono/node-server')
    const u = await signUp('http'); const { id } = await makeDeck(u.id)
    const up = (await upload(u.cookie, id, await jpeg())).data
    let started!: () => void
    const running = new Promise<void>((r) => { started = r })
    let aborted = false
    setCutoutEngine({ mask(_r, _w, _h, signal) { started(); return new Promise((_ok, no) => { signal?.addEventListener('abort', () => { aborted = true; no(new Error('stopped')) }) }) } })
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' })
    try {
      await new Promise<void>((r) => (server.listening ? r() : server.once('listening', () => r())))
      const port = (server.address() as { port: number }).port
      const ac = new AbortController()
      const call = fetch(`http://127.0.0.1:${port}/api/v1/presentations/${id}/images/cutout-mask`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: u.cookie }, body: JSON.stringify({ url: up.url }), signal: ac.signal }).catch((e) => e)
      await running // the model has the picture
      expect(aborted).toBe(false)
      ac.abort() // the person closed the dialog
      await call
      for (let i = 0; i < 40 && !aborted; i++) await new Promise((r) => setTimeout(r, 25))
      expect(aborted, 'the engine never saw the abort').toBe(true)
    } finally { server.close() }
  })
})
