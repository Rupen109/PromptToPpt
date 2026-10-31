import { describe, expect, it, vi } from 'vitest'
import { app } from '../app.ts'
import { api, json, makeDeck, signUp } from '../test-utils.ts'

const fetchLimited = vi.hoisted(() => vi.fn())
vi.mock('../brand/find.ts', async (orig) => ({ ...(await orig<typeof import('../brand/find.ts')>()), fetchLimited }))

const png = (w: number, h: number) => { const b = Buffer.alloc(40); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b }
const upload = (cookie: string, deckId: string, bytes: Buffer, name = 'photo.png') => {
  const form = new FormData()
  form.set('file', new File([new Uint8Array(bytes)], name))
  return app.request(`/api/v1/presentations/${deckId}/images/upload`, { method: 'POST', headers: { Cookie: cookie }, body: form })
}

describe('editor media: upload from the computer', () => {
  it('keeps a PNG as the owner\'s picture, lists it under "my uploads", serves it, and lets the owner delete it', async () => {
    const u = await signUp('up')
    const { id } = await makeDeck(u.id)
    const res = await upload(u.cookie, id, png(640, 360), 'My Logo.png')
    const body = await json(res)
    expect(res.status).toBe(200)
    expect(body.data).toMatchObject({ mime: 'image/png', aspect: 1.778, name: 'My Logo' })
    expect((await app.request(new URL(body.data.url).pathname)).status).toBe(200)
    const mine = await json(await api(u.cookie, 'GET', '/media/mine'))
    expect(mine.data.items.map((x: any) => x.id)).toContain(body.data.assetId)
    expect((await api(u.cookie, 'DELETE', `/media/mine/${body.data.assetId}`)).status).toBe(200)
    expect((await json(await api(u.cookie, 'GET', '/media/mine'))).data.items).toHaveLength(0)
    expect((await api(u.cookie, 'DELETE', `/media/mine/${body.data.assetId}`)).status).toBe(404)
  })

  it('judges the file by its bytes: a text file named .png, a tiny dot and no file are refused in plain words; strangers see no deck', async () => {
    const u = await signUp('up')
    const other = await signUp('up')
    const { id } = await makeDeck(u.id)
    expect((await json(await upload(u.cookie, id, Buffer.from('<html>hi</html>'), 'x.png'))).error.message).toMatch(/PNG or JPEG/)
    expect((await json(await upload(u.cookie, id, png(4, 4)))).error.message).toMatch(/too small/)
    const none = await app.request(`/api/v1/presentations/${id}/images/upload`, { method: 'POST', headers: { Cookie: u.cookie }, body: new FormData() })
    expect(none.status).toBe(400)
    expect((await upload(other.cookie, id, png(300, 300))).status).toBe(404)
    expect((await json(await api(other.cookie, 'GET', '/media/mine'))).data.items).toHaveLength(0)
  })

  it('refuses a file over 8 MB before reading it', async () => {
    const u = await signUp('up')
    const { id } = await makeDeck(u.id)
    const big = Buffer.alloc(9 * 1024 * 1024)
    png(100, 100).copy(big)
    expect((await upload(u.cookie, id, big)).status).toBe(413)
  })
})

describe('editor media: stock photos and the template library', () => {
  it('imports a stock photo only from the provider\'s own picture host and returns the credit line', async () => {
    const u = await signUp('stock')
    const { id } = await makeDeck(u.id)
    fetchLimited.mockResolvedValueOnce({ bytes: png(1920, 1080), type: 'image/png', url: 'https://images.unsplash.com/photo-1' })
    const ok = await json(await api(u.cookie, 'POST', `/presentations/${id}/images/stock`, { provider: 'unsplash', imageUrl: 'https://images.unsplash.com/photo-1?w=1920', author: 'Ada Lovelace', pageUrl: 'https://unsplash.com/photos/1' }))
    expect(ok.success).toBe(true)
    expect(ok.data.attribution).toMatchObject({ source: 'Photo by Ada Lovelace on Unsplash', license: 'Unsplash License' })
    expect(new URL(ok.data.url).pathname).toMatch(/^\/api\/v1\/assets\//)
    fetchLimited.mockClear()
    const wrongHost = await api(u.cookie, 'POST', `/presentations/${id}/images/stock`, { provider: 'unsplash', imageUrl: 'https://evil.example.com/a.jpg' })
    expect(wrongHost.status).toBe(422)
    const mismatch = await api(u.cookie, 'POST', `/presentations/${id}/images/stock`, { provider: 'pexels', imageUrl: 'https://images.unsplash.com/photo-1' })
    expect(mismatch.status).toBe(422)
    expect(fetchLimited).not.toHaveBeenCalled()
  })

  it('searches the pictures that ship with the templates by keyword, and needs a login for everything', async () => {
    const u = await signUp('lib')
    const hits = (await json(await api(u.cookie, 'GET', '/media/library?q=handshake'))).data.items
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].url).toMatch(/\/template-assets\/.+\.jpg$/)
    expect((await app.request('/api/v1/media/library?q=x')).status).toBe(401)
    expect((await app.request('/api/v1/media/search?q=cats')).status).toBe(401)
  })

  it('photo search says plainly when it is not set up or the question is too short', async () => {
    const u = await signUp('srch')
    expect((await api(u.cookie, 'GET', '/media/search?q=a')).status).toBe(400)
    const r = await api(u.cookie, 'GET', '/media/search?q=mountains')
    expect(r.status).toBe(503) // the test environment has no stock key, so no real photo site is ever called
    expect((await json(r)).error.code).toBe('SEARCH_UNAVAILABLE')
  })
})
