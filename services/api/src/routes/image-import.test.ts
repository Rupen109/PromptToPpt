import { describe, expect, it, vi } from 'vitest'
import { app } from '../app.ts'
import { api, json, makeDeck, signUp } from '../test-utils.ts'
import { BrandReadError } from '../brand/find.ts'
import { BlockedUrlError } from '../sources/ssrf.ts'

const fetchLimited = vi.hoisted(() => vi.fn())
vi.mock('../brand/find.ts', async (orig) => ({ ...(await orig<typeof import('../brand/find.ts')>()), fetchLimited }))

const png = (w: number, h: number) => { const b = Buffer.alloc(40); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b }
const imp = (cookie: string, deckId: string, url: string) => api(cookie, 'POST', `/presentations/${deckId}/images/import`, { url })

describe('POST /presentations/:id/images/import ("Image URL" keeps its own copy)', () => {
  it('downloads a public PNG, stores it as the owner\'s asset and returns a URL of ours that serves the bytes', async () => {
    const u = await signUp('imp')
    const { id } = await makeDeck(u.id)
    fetchLimited.mockResolvedValueOnce({ bytes: png(800, 450), type: 'image/png', url: 'https://cdn.example.com/a/b.png' })
    const res = await imp(u.cookie, id, 'https://cdn.example.com/a/b.png')
    const body = await json(res)
    expect(res.status).toBe(200)
    expect(body.data).toMatchObject({ mime: 'image/png', aspect: 1.778 })
    expect(new URL(body.data.url).pathname).toMatch(/^\/api\/v1\/assets\//)
    const served = await app.request(new URL(body.data.url).pathname)
    expect(served.status).toBe(200)
    expect([...new Uint8Array(await served.arrayBuffer()).slice(0, 4)]).toEqual([137, 80, 78, 71])
  })

  it('refuses what is not a usable picture, in plain words: no download, a web page, a text file named .png, a tiny dot, a blocked address', async () => {
    const u = await signUp('imp')
    const { id } = await makeDeck(u.id)
    fetchLimited.mockResolvedValueOnce(null)
    const none = await imp(u.cookie, id, 'https://example.com/page')
    expect(none.status).toBe(422)
    expect((await json(none)).error.message).toMatch(/could not download a picture/)
    fetchLimited.mockResolvedValueOnce({ bytes: Buffer.from('<html>not a picture</html>'), type: 'application/octet-stream', url: 'https://example.com/x.png' })
    expect((await json(await imp(u.cookie, id, 'https://example.com/x.png'))).error.message).toMatch(/PNG or JPEG/)
    fetchLimited.mockResolvedValueOnce({ bytes: png(4, 4), type: 'image/png', url: 'https://example.com/dot.png' })
    expect((await json(await imp(u.cookie, id, 'https://example.com/dot.png'))).error.message).toMatch(/too small/)
    fetchLimited.mockRejectedValueOnce(new BlockedUrlError('That address is not allowed'))
    expect((await json(await imp(u.cookie, id, 'http://169.254.169.254/latest'))).error.message).toMatch(/not allowed/)
    fetchLimited.mockRejectedValueOnce(new BrandReadError('We could not find that website. Check the spelling of the address.'))
    expect((await json(await imp(u.cookie, id, 'https://no-such-host.example/p.png'))).error.message).toMatch(/could not find that website/)
  })

  it('needs a login and a deck the person may edit: strangers get the same answer as "no such deck"', async () => {
    const owner = await signUp('imp')
    const stranger = await signUp('imp')
    const { id } = await makeDeck(owner.id)
    expect((await app.request(`/api/v1/presentations/${id}/images/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/a.png' }) })).status).toBe(401)
    fetchLimited.mockClear()
    expect((await imp(stranger.cookie, id, 'https://example.com/a.png')).status).toBe(404)
    expect(fetchLimited).not.toHaveBeenCalled()
    expect((await api(owner.cookie, 'POST', `/presentations/${id}/images/import`, { url: 'x' })).status).toBe(400)
  })
})
