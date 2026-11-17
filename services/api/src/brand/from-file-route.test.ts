import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { env } from '../env.ts'
import { closePool } from '../sources/parse-pool.ts'
import { miniPptx, para, picture, sp, testPng } from '../template-import/test-fixtures.ts'
import { api, json, origin, setPlan, signUp } from '../test-utils.ts'
import { brandPdf } from './test-brand-pdf.ts'

const E = 12700
const b = (x: number, y: number, w: number, h: number) => ({ x: x * E, y: y * E, w: w * E, h: h * E })
const pdf = () => brandPdf({ title: 'Acme', pages: [0, 1].map(() => ({ bg: [255, 255, 255] as [number, number, number], rects: [{ x: 0, y: 440, w: 960, h: 100, fill: [10, 37, 64] as [number, number, number] }, { x: 40, y: 100, w: 220, h: 200, fill: [255, 90, 31] as [number, number, number] }], texts: [{ x: 60, y: 480, size: 44, text: 'Acme', font: 'Helvetica-Bold' as const, color: [255, 255, 255] as [number, number, number] }], images: [{ x: 880, y: 485, w: 60, h: 50, px: 64, rgb: [255, 90, 31] as [number, number, number] }] })) })
const pptx = () => miniPptx({ size: { cx: 960 * E, cy: 540 * E }, theme: { major: 'Montserrat', minor: 'Lato' }, slides: [sp(2, 'c', b(50, 50, 300, 200), { fill: 'E4572E' }) + sp(4, 't', b(60, 300, 600, 60), { txBox: true, text: para('Hello', { sz: 30 }) }) + picture(9, 'Logo', b(850, 20, 80, 40), 'rId5')], slideRels: { 0: [{ id: 'rId5', type: 'image', target: '../media/logo.png' }] }, media: { 'logo.png': testPng(160, 80) } })
const post = (cookie: string, bytes: Uint8Array | null, name: string) => {
  const f = new FormData()
  if (bytes) f.append('file', new File([new Uint8Array(bytes)], name))
  return app.request('/api/v1/brand/from-file', { method: 'POST', headers: { Cookie: cookie, Origin: origin }, body: f })
}
const pro = async () => { const u = await signUp('bf'); await setPlan(u.id, 'pro'); return u }

describe('POST /brand/from-file (read in the parse worker)', () => {
  it('Starter is refused before the file is read; signed-out is refused', async () => {
    const free = await signUp('bf')
    const r = await post(free.cookie, pdf(), 'a.pdf')
    expect(r.status).toBe(403); expect((await json(r)).error).toMatchObject({ code: 'UPGRADE_REQUIRED' })
    expect((await app.request('/api/v1/brand/from-file', { method: 'POST', headers: { Origin: origin }, body: new FormData() })).status).toBe(401)
  })
  it('a PDF gives colours, fonts, a stored logo and the layouts answer', async () => {
    const u = await pro()
    const r = await post(u.cookie, pdf(), 'Acme brand.pdf')
    expect(r.status).toBe(200)
    const d = (await json(r)).data
    expect(d).toMatchObject({ source: 'pdf', fileName: 'Acme brand.pdf', name: 'Acme', colors: { primary: '#0A2540', accent: '#FF5A1F' }, layouts: { available: true } })
    expect(d.fonts.heading.original).toBe('Helvetica')
    expect(d.logo.url).toContain(`${env.API_URL}/api/v1/assets/`)
    const img = await app.request(d.logo.url.replace(env.API_URL, ''))
    expect(img.status).toBe(200); expect(img.headers.get('content-type')).toBe('image/png')
    // the same file again reuses the stored logo
    expect((await json(await post(u.cookie, pdf(), 'Acme brand.pdf'))).data.logo.url).toBe(d.logo.url)
  })
  it('a PowerPoint gives colours, fonts, the logo and offers its layouts', async () => {
    const u = await pro()
    const d = (await json(await post(u.cookie, pptx(), 'Acme.pptx'))).data
    expect(d).toMatchObject({ source: 'pptx', name: 'Acme', colors: { primary: '#E4572E' }, layouts: { available: true } })
    expect(d.fonts.heading).toMatchObject({ family: 'Montserrat', exact: true })
    expect(d.logo.aspect).toBe(2)
  })
  it('the logo can be saved into a kit; another person cannot use it', async () => {
    const a = await pro(), other = await pro()
    const d = (await json(await post(a.cookie, pptx(), 'Acme.pptx'))).data
    const mine = await api(a.cookie, 'POST', '/brand/kits', { name: 'Acme', primary: d.colors.primary, accent: d.colors.accent, headingFont: d.fonts.heading.family, bodyFont: d.fonts.body.family, logoUrl: d.logo.url })
    expect(mine.status).toBe(201); expect((await json(mine)).data.logo.url).toBe(d.logo.url)
    const theirs = await api(other.cookie, 'POST', '/brand/kits', { name: 'Stolen', logoUrl: d.logo.url })
    expect(theirs.status).toBe(422)
  })
  it('"Update my kit" from a lookup replaces the kit\'s logo and source (the update used to ignore both); another person\'s logo is refused', async () => {
    const a = await pro(), other = await pro()
    const first = (await json(await post(a.cookie, pptx(), 'Acme.pptx'))).data
    const kit = (await json(await api(a.cookie, 'POST', '/brand/kits', { name: 'Mine', primary: '#E4572E', accent: '#17BEBB', headingFont: 'Inter', bodyFont: 'Inter' }))).data
    expect(kit.logo).toBeNull()
    const upd = (await json(await api(a.cookie, 'PATCH', `/brand/kits/${kit.id}`, { logoUrl: first.logo.url, sourceUrl: 'https://acme.example' }))).data
    expect(upd.logo.url).toBe(first.logo.url); expect(upd.sourceUrl).toBe('https://acme.example')
    const second = (await json(await post(a.cookie, pdf(), 'Acme.pdf'))).data
    const upd2 = (await json(await api(a.cookie, 'PATCH', `/brand/kits/${kit.id}`, { logoUrl: second.logo.url }))).data
    expect(upd2.logo.url).toBe(second.logo.url)
    const theirs = await json(await post(other.cookie, pptx(), 'Theirs.pptx'))
    expect((await api(a.cookie, 'PATCH', `/brand/kits/${kit.id}`, { logoUrl: theirs.data.logo.url })).status).toBe(422)
  })
  it('friendly refusals: no file, wrong type, corrupt, password protected', async () => {
    const u = await pro()
    expect((await post(u.cookie, null, 'x')).status).toBe(400)
    const seen: string[] = []
    const refused = async (bytes: Uint8Array, name: string, msg: RegExp) => { const r = await post(u.cookie, bytes, name); const body = await json(r); expect(r.status).toBe(422); expect(body.error.message).toMatch(msg); seen.push(JSON.stringify(body)) }
    await refused(new TextEncoder().encode('just words'), 'notes.txt', /PowerPoint \(\.pptx\) or a PDF/)
    await refused(new TextEncoder().encode('%PDF-1.4\nnope'), 'bad.pdf', /could not be opened/)
    await refused(brandPdf({ password: 'secret', pages: [{ rects: [{ x: 0, y: 0, w: 100, h: 100, fill: [255, 0, 0] }] }] }), 'locked.pdf', /password protected/)
    await refused(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 1, 2, 3]), 'old.ppt', /./)
    for (const t of seen) expect(t).not.toMatch(/stack|\.ts:|node_modules|Exception/i)
  })
  it('a file over 15 MB is refused with 413 before it is read', async () => {
    const u = await pro()
    const r = await post(u.cookie, new Uint8Array(15 * 1024 * 1024 + 200_000), 'huge.pdf')
    expect(r.status).toBe(413)
  })
  it('a PDF with too many pages is refused inside the worker, which ends alone; the next file reads fine', async () => {
    const u = await pro()
    const r = await post(u.cookie, brandPdf({ pages: Array.from({ length: 301 }, () => ({ rects: [{ x: 0, y: 0, w: 10, h: 10, fill: [1, 2, 3] as [number, number, number] }] })) }), 'long.pdf')
    expect(r.status).toBe(422); expect((await json(r)).error.message).toMatch(/301 pages/)
    await closePool()
    expect((await post(u.cookie, pdf(), 'after.pdf')).status).toBe(200)
  })
})
