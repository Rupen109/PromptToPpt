import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { env } from '../env.ts'
import { api, json, makeDeck, setPlan, signUp } from '../test-utils.ts'
import { eq, sql } from 'drizzle-orm'
import { getTheme } from '@prompttoppt/theme'
import { db } from '../db/index.ts'
import { generationJob, presentationVersion } from '../db/schema.ts'
import { storeAsset } from './assets.ts'
import { themeWithKit } from './apply.ts'

const origin = process.env['WEB_URL'] ?? 'http://localhost:3000'
const png = (w: number, h: number) => { const b = Buffer.alloc(40); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b }
const jpeg = (w: number, h: number) => Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0])
const upload = (cookie: string, path: string, bytes: Buffer, name = 'logo.png', label?: string) => {
  const f = new FormData(); f.append('file', new File([new Uint8Array(bytes)], name)); if (label) f.append('name', label)
  return app.request(`/api/v1/brand${path}`, { method: 'POST', headers: { Cookie: cookie, Origin: origin }, body: f })
}
const asset = (url: string) => app.request(url.replace(env.API_URL, ''))
const pro = async () => { const u = await signUp('bk'); await setPlan(u.id, 'pro'); return u }
const kit = (cookie: string, body: object = {}) => api(cookie, 'POST', '/brand/kits', { name: 'Acme', primary: '#e4572e', accent: '#17bebb', headingFont: 'Playfair Display', bodyFont: 'Inter', ...body })

describe('brand kits: plans and limits', () => {
  it('Starter has none (limit 0, creating is refused); Pro keeps 1, Gold 5', async () => {
    const free = await signUp('bk')
    const list = await json(await api(free.cookie, 'GET', '/brand/kits'))
    expect(list.data).toMatchObject({ kits: [], limit: 0 })
    const denied = await kit(free.cookie)
    expect(denied.status).toBe(403); expect((await json(denied)).error.code).toBe('UPGRADE_REQUIRED')

    const p = await pro()
    expect((await kit(p.cookie)).status).toBe(201)
    const second = await kit(p.cookie, { name: 'Second' })
    expect(second.status).toBe(429); expect((await json(second)).error.code).toBe('LIMIT_REACHED')

    const g = await signUp('bk'); await setPlan(g.id, 'gold')
    for (let i = 0; i < 5; i++) expect((await kit(g.cookie, { name: `K${i}` })).status).toBe(201)
    expect((await kit(g.cookie, { name: 'K6' })).status).toBe(429)
  })
  it('parallel creates cannot slip past the cap', async () => {
    const p = await pro()
    const rs = await Promise.all([kit(p.cookie, { name: 'A' }), kit(p.cookie, { name: 'B' }), kit(p.cookie, { name: 'C' })])
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1)
    expect((await json(await api(p.cookie, 'GET', '/brand/kits'))).data.kits).toHaveLength(1)
  })
  it('needs a sign-in', async () => { expect((await api('', 'GET', '/brand/kits')).status).toBe(401) })
})

describe('brand kits: content', () => {
  it('normalises colours, drops fonts we cannot render, rejects bad colours; the first kit is the default', async () => {
    const p = await pro()
    const r = await json(await kit(p.cookie, { headingFont: 'Comic Sans Fancy', extra: ['#112233', '#abcdef'] }))
    expect(r.data).toMatchObject({ name: 'Acme', isDefault: true, colors: { primary: '#E4572E', accent: '#17BEBB', extra: ['#112233', '#ABCDEF'] }, fonts: { heading: null, body: 'Inter' }, logo: null, images: [] })
    expect((await kit(p.cookie, { primary: 'red' })).status).toBe(400)
  })
  it('edits a kit; defaults move between kits and a deleted default hands over to another', async () => {
    const g = await signUp('bk'); await setPlan(g.id, 'gold')
    const a = (await json(await kit(g.cookie, { name: 'A' }))).data, b = (await json(await kit(g.cookie, { name: 'B' }))).data
    expect([a.isDefault, b.isDefault]).toEqual([true, false])
    const patched = (await json(await api(g.cookie, 'PATCH', `/brand/kits/${b.id}`, { name: 'Brand B', primary: '#0b5fff', isDefault: true }))).data
    expect(patched).toMatchObject({ name: 'Brand B', isDefault: true, colors: { primary: '#0B5FFF' } })
    const list = (await json(await api(g.cookie, 'GET', '/brand/kits'))).data.kits
    expect(list.map((k: { id: string; isDefault: boolean }) => [k.id, k.isDefault])).toEqual([[b.id, true], [a.id, false]])
    expect((await api(g.cookie, 'PATCH', `/brand/kits/${b.id}`, { isDefault: false })).status).toBe(200) // cannot leave the account without a default
    expect((await json(await api(g.cookie, 'GET', '/brand/kits'))).data.kits.filter((k: { isDefault: boolean }) => k.isDefault)).toHaveLength(1)
    await api(g.cookie, 'DELETE', `/brand/kits/${b.id}`)
    expect((await json(await api(g.cookie, 'GET', '/brand/kits'))).data.kits).toMatchObject([{ id: a.id, isDefault: true }])
  })
})

describe('brand kits: logo and pictures', () => {
  it('a PNG/JPEG logo is accepted and measured; other files, tiny and extreme shapes are refused; replacing removes the old file', async () => {
    const p = await pro(); const k = (await json(await kit(p.cookie))).data
    const ok = await upload(p.cookie, `/kits/${k.id}/logo`, png(480, 160))
    expect(ok.status).toBe(200)
    const logo1 = (await json(ok)).data.logo
    expect(logo1.aspect).toBeCloseTo(3, 2)
    expect((await asset(logo1.url)).status).toBe(200)
    for (const bad of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), png(20, 20), png(3000, 100), Buffer.alloc(3 * 1024 * 1024, 1)]) expect([413, 422]).toContain((await upload(p.cookie, `/kits/${k.id}/logo`, bad)).status)
    const swapped = (await json(await upload(p.cookie, `/kits/${k.id}/logo`, jpeg(300, 300), 'logo.jpg'))).data.logo
    expect(swapped.url).not.toBe(logo1.url)
    expect((await asset(logo1.url)).status).toBe(404) // the replaced logo is gone
    expect((await asset(swapped.url)).headers.get('content-type')).toBe('image/jpeg')
    const removed = (await json(await api(p.cookie, 'PATCH', `/brand/kits/${k.id}`, { removeLogo: true }))).data
    expect(removed.logo).toBeNull(); expect((await asset(swapped.url)).status).toBe(404)
  })
  it('brand pictures: up to 20 per kit, removable, and never counted as AI pictures', async () => {
    const g = await signUp('bk'); await setPlan(g.id, 'gold'); const k = (await json(await kit(g.cookie))).data
    let last: { images: { id: string; url: string }[] } = { images: [] }
    for (let i = 0; i < 20; i++) { const r = await upload(g.cookie, `/kits/${k.id}/images`, png(200, 100 + i), 'p.png', `Pic ${i}`); expect(r.status).toBe(201); last = (await json(r)).data }
    expect(last.images).toHaveLength(20)
    expect((await upload(g.cookie, `/kits/${k.id}/images`, png(200, 100))).status).toBe(429)
    const gone = last.images[0]!
    const after = (await json(await api(g.cookie, 'DELETE', `/brand/kits/${k.id}/images/${gone.id}`))).data
    expect(after.images).toHaveLength(19); expect((await asset(gone.url)).status).toBe(404)
    expect((await json(await api(g.cookie, 'GET', '/me/entitlements'))).data.usage.imagesThisPeriod).toBe(0)
  })
  it('a 1 MB logo and a 2.5 MB picture are accepted (the global 256 KB request limit must not apply to uploads); over the kit limits they get a plain message', async () => {
    const p = await pro(); const k = (await json(await kit(p.cookie))).data
    const big = (n: number) => Buffer.concat([png(300, 100), Buffer.alloc(n)])
    const logo = await upload(p.cookie, `/kits/${k.id}/logo`, big(1024 * 1024))
    expect(logo.status).toBe(200)
    const pic = await upload(p.cookie, `/kits/${k.id}/images`, big(2.5 * 1024 * 1024))
    expect(pic.status).toBe(201)
    const tooBig = await upload(p.cookie, `/kits/${k.id}/logo`, big(2.5 * 1024 * 1024))
    expect(tooBig.status).toBeGreaterThanOrEqual(400); expect((await json(tooBig)).error.message).toMatch(/2 MB|too large/i)
    const huge = await upload(p.cookie, `/kits/${k.id}/images`, big(4 * 1024 * 1024))
    expect(huge.status).toBe(413); expect((await json(huge)).error.message).toMatch(/too large/i)
  })
  it('deleting a kit deletes its files', async () => {
    const p = await pro(); const k = (await json(await kit(p.cookie))).data
    const logo = (await json(await upload(p.cookie, `/kits/${k.id}/logo`, png(300, 100)))).data.logo.url
    const pic = (await json(await upload(p.cookie, `/kits/${k.id}/images`, png(100, 100)))).data.images[0].url
    await api(p.cookie, 'DELETE', `/brand/kits/${k.id}`)
    expect((await asset(logo)).status).toBe(404); expect((await asset(pic)).status).toBe(404)
  })
  it('deleting a kit keeps a file a deck still shows (no broken logo), but removes the ones nothing uses', async () => {
    const p = await pro(); const k = (await json(await kit(p.cookie))).data
    const logo = (await json(await upload(p.cookie, `/kits/${k.id}/logo`, png(300, 100)))).data.logo.url
    const pic = (await json(await upload(p.cookie, `/kits/${k.id}/images`, png(100, 100)))).data.images[0].url
    const deck = await makeDeck(p.id)
    // the deck shows the logo on a slide (as applyBrand would put it there)
    await db.update(presentationVersion).set({ document: sql`jsonb_set(${presentationVersion.document}, '{theme,brand}', ${JSON.stringify({ logo: { url: logo, aspect: 3 } })}::jsonb, true)` }).where(eq(presentationVersion.presentationId, deck.id))
    expect((await api(p.cookie, 'DELETE', `/brand/kits/${k.id}`)).status).toBe(200)
    expect((await asset(logo)).status).toBe(200) // still used by the deck
    expect((await asset(pic)).status).toBe(404) // used by nothing
  })
  it('a kit can be created from a website lookup\'s saved logo (measured from the stored file); someone else\'s logo is refused', async () => {
    const a = await pro(), b = await pro()
    const mine = `${env.API_URL}/api/v1/assets/${await storeAsset(a.id, 'logo', png(400, 100), 'image/png', 'https://acme.example/')}`
    const made = await json(await kit(a.cookie, { logoUrl: mine }))
    expect(made.data.logo.aspect).toBeCloseTo(4, 2)
    const theirs = `${env.API_URL}/api/v1/assets/${await storeAsset(a.id, 'logo', png(400, 100), 'image/png', 'x')}`
    const stolen = await kit(b.cookie, { logoUrl: theirs })
    expect(stolen.status).toBe(422)
    expect((await kit(b.cookie, { logoUrl: 'https://evil.example/logo.png' })).status).toBe(422)
  })
})

describe('brand kits: ownership', () => {
  it('nobody can read, change, delete or upload into another person\'s kit', async () => {
    const a = await pro(), b = await pro(); const k = (await json(await kit(a.cookie))).data
    expect((await json(await api(b.cookie, 'GET', '/brand/kits'))).data.kits).toEqual([])
    expect((await api(b.cookie, 'PATCH', `/brand/kits/${k.id}`, { name: 'hijack' })).status).toBe(404)
    expect((await api(b.cookie, 'DELETE', `/brand/kits/${k.id}`)).status).toBe(404)
    expect((await upload(b.cookie, `/kits/${k.id}/logo`, png(300, 100))).status).toBe(404)
    expect((await upload(b.cookie, `/kits/${k.id}/images`, png(300, 100))).status).toBe(404)
    expect((await json(await api(a.cookie, 'GET', '/brand/kits'))).data.kits[0].name).toBe('Acme')
  })
})

describe('new decks in a brand kit (no AI call is made in these tests)', () => {
  it('the kit\'s colours, fonts and logo replace the design\'s; parts the kit does not have are left alone', () => {
    const base = getTheme('cobalt')
    const full = themeWithKit(base, { name: 'Acme', colors: { primary: '#E4572E', accent: '#17BEBB' }, fonts: { heading: 'Playfair Display', body: 'Inter' }, logo: { url: 'https://api.example.com/api/v1/assets/abcdefghijklmnopqrstuvwxyz012345', aspect: 3 } } as never)
    expect(full.fonts).toEqual({ heading: 'Playfair Display', body: 'Inter' })
    expect(full.brand).toEqual({ name: 'Acme', logo: { src: 'https://api.example.com/api/v1/assets/abcdefghijklmnopqrstuvwxyz012345', aspect: 3 } })
    expect(full.colors.primary.toLowerCase()).not.toBe(base.colors.primary.toLowerCase())
    expect(full.style).toEqual(base.style)
    const empty = themeWithKit(base, { name: 'Empty', colors: { primary: null, accent: null }, fonts: { heading: null, body: null }, logo: null } as never)
    expect(empty).toEqual(base)
    expect(themeWithKit(base, { name: 'Logo only', colors: { primary: '#E4572E', accent: null }, fonts: { heading: 'Inter', body: null }, logo: null } as never)).toEqual(base) // half a pair is not applied
  })
  it('a job can name a brand kit: your own is accepted and stored; someone else\'s, an unknown one, or one on Starter is refused', async () => {
    const a = await pro(), b = await pro(), free = await signUp('bk')
    const k = (await json(await kit(a.cookie))).data, theirs = (await json(await kit(b.cookie))).data
    const job = (kitId?: string) => ({ prompt: 'Create an 8 slide overview of our onboarding process for new customers', slideCount: 8, idempotencyKey: `key-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`, ...(kitId ? { brandKitId: kitId } : {}) })
    const ok = await api(a.cookie, 'POST', '/generation/jobs', job(k.id))
    expect(ok.status).toBe(201)
    const id = (await json(ok)).data.id
    await api(a.cookie, 'POST', `/generation/jobs/${id}/cancel`) // never let the worker pick it up: that would call the real model
    const [row] = await db.select().from(generationJob).where(eq(generationJob.id, id))
    expect((row!.options as { brandKitId?: string }).brandKitId).toBe(k.id)
    expect((await api(a.cookie, 'POST', '/generation/jobs', job(theirs.id))).status).toBe(400)
    expect((await api(a.cookie, 'POST', '/generation/jobs', job('nope'))).status).toBe(400)
    const denied = await api(free.cookie, 'POST', '/generation/jobs', job(k.id))
    expect(denied.status).toBe(403); expect((await json(denied)).error.code).toBe('UPGRADE_REQUIRED')
  })
})
