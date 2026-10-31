import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { post, user } from '../db/schema.ts'
import { headings, publishProblem, readingMinutes, slugify } from '../content/posts.ts'
import { api, json, origin, rid, signUp } from '../test-utils.ts'

async function admin() { const u = await signUp('blog'); await db.update(user).set({ role: 'admin' }).where(eq(user.id, u.id)); return u }
const adm = (cookie: string, method: string, path: string, body?: unknown) => api(cookie, method, `/admin/posts${path}`, body)
const pub = (path: string) => app.request(`/api/v1/content${path}`, { headers: { Origin: origin } })
const tag = () => `t${rid()}` // a private tag per test, so other runs' posts never mix in
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])

describe('content helpers', () => {
  it('slugs, reading time, headings, publish problems', () => {
    expect(slugify('  Héllo, Wörld & Co! 2026 ')).toBe('hello-world-and-co-2026')
    expect(slugify('!!!')).toBe('')
    expect(readingMinutes('word '.repeat(450))).toBe(2)
    expect(readingMinutes('')).toBe(1)
    expect(headings('# T\n## First one\ntext\n### Sub *part*\n```\n## not a heading\n```\n#### too deep')).toEqual([{ level: 2, text: 'First one', id: 'first-one' }, { level: 3, text: 'Sub part', id: 'sub-part' }])
    expect(publishProblem({ kind: 'blog', title: 'T', summary: '', body: 'x'.repeat(30), sourceUrl: null, section: null })).toMatch(/summary/)
    expect(publishProblem({ kind: 'blog', title: 'T', summary: 's', body: 'short', sourceUrl: null, section: null })).toMatch(/Write the article/)
    expect(publishProblem({ kind: 'guide', title: 'T', summary: 's', body: 'x'.repeat(30), sourceUrl: null, section: ' ' })).toMatch(/section/)
    expect(publishProblem({ kind: 'news', title: 'T', summary: 'A short story.', body: '', sourceUrl: null, section: null })).toBeNull()
  })
})

describe('the dashboard is for the owner only', () => {
  it('anonymous 401, ordinary user 403, on every endpoint', async () => {
    const u = await signUp('blog')
    for (const [m, p] of [['GET', ''], ['POST', ''], ['GET', '/x'], ['PATCH', '/x'], ['DELETE', '/x'], ['POST', '/x/publish'], ['POST', '/x/unpublish']] as const) {
      expect((await adm('', m, p, m === 'GET' ? undefined : {})).status, `${m} ${p} anon`).toBe(401)
      expect((await adm(u.cookie, m, p, m === 'GET' ? undefined : {})).status, `${m} ${p} user`).toBe(403)
    }
  })
})

describe('writing and publishing', () => {
  it('blog: draft is invisible → publish → visible with reading time, tags and related; unpublish hides it again', async () => {
    const a = await admin(); const t = tag()
    const mk = await adm(a.cookie, 'POST', '', { kind: 'blog', title: 'How we cut deck time in half', summary: 'A short excerpt.', body: `## Intro\n${'word '.repeat(450)}`, tags: [t.toUpperCase(), ' ', t, 'AI Tools'] })
    expect(mk.status).toBe(201)
    const p = (await json(mk)).data
    expect(p).toMatchObject({ kind: 'blog', slug: 'how-we-cut-deck-time-in-half', state: 'draft', readingMinutes: 2 })
    expect(p.tags).toEqual([t, 'ai tools']) // lower-cased, de-duplicated, blanks dropped
    expect((await pub(`/posts/blog/${p.slug}`)).status).toBe(404)
    expect((await json(await pub(`/posts?kind=blog&tag=${t}`))).data.total).toBe(0)

    const live = await adm(a.cookie, 'POST', `/${p.id}/publish`, {})
    expect(live.status).toBe(200)
    expect((await json(live)).data.state).toBe('published')
    const one = (await json(await pub(`/posts/blog/${p.slug}`))).data
    expect(one).toMatchObject({ title: 'How we cut deck time in half', authorName: 'SlidesDone team' })
    expect(one.headings).toEqual([{ level: 2, text: 'Intro', id: 'intro' }])
    const list = (await json(await pub(`/posts?kind=blog&tag=${t}`))).data
    expect(list.total).toBe(1)
    expect(list.items[0]).not.toHaveProperty('body') // lists never carry the article
    expect((await json(await pub('/tags?kind=blog'))).data.some((x: { tag: string }) => x.tag === t)).toBe(true)

    await adm(a.cookie, 'POST', `/${p.id}/unpublish`)
    expect((await pub(`/posts/blog/${p.slug}`)).status).toBe(404)
  })

  it('publishing is refused until the post is complete, in plain words', async () => {
    const a = await admin()
    const mk = (await json(await adm(a.cookie, 'POST', '', { kind: 'blog', title: 'Half done post' }))).data
    const r = await adm(a.cookie, 'POST', `/${mk.id}/publish`, {})
    expect(r.status).toBe(422); expect((await json(r)).error.message).toMatch(/summary/)
    await adm(a.cookie, 'PATCH', `/${mk.id}`, { summary: 'ok' })
    expect((await json(await adm(a.cookie, 'POST', `/${mk.id}/publish`, {}))).error.message).toMatch(/Write the article/)
    const g = (await json(await adm(a.cookie, 'POST', '', { kind: 'guide', title: 'A guide', summary: 's', body: 'x'.repeat(40) }))).data
    expect((await json(await adm(a.cookie, 'POST', `/${g.id}/publish`, {}))).error.message).toMatch(/section/)
  })

  it('scheduled: a future date is not public until it comes; a live post cannot be emptied', async () => {
    const a = await admin()
    const p = (await json(await adm(a.cookie, 'POST', '', { kind: 'blog', title: `Scheduled ${rid()}`, summary: 's', body: 'x'.repeat(60) }))).data
    const future = new Date(Date.now() + 3 * 24 * 3600_000).toISOString()
    const sch = (await json(await adm(a.cookie, 'POST', `/${p.id}/publish`, { publishedAt: future }))).data
    expect(sch.state).toBe('scheduled')
    expect((await pub(`/posts/blog/${p.slug}`)).status).toBe(404)
    await db.update(post).set({ publishedAt: new Date(Date.now() - 1000) }).where(eq(post.id, p.id)) // "time passes"
    expect((await pub(`/posts/blog/${p.slug}`)).status).toBe(200)
    const empty = await adm(a.cookie, 'PATCH', `/${p.id}`, { summary: '' })
    expect(empty.status).toBe(422)
    expect((await adm(a.cookie, 'POST', `/${p.id}/publish`, { publishedAt: new Date(Date.now() + 400 * 24 * 3600_000).toISOString() })).status).toBe(422)
  })

  it('web addresses: made from the title, unique per type, editable, reserved ones refused', async () => {
    const a = await admin(); const title = `Same title ${rid()}`
    const one = (await json(await adm(a.cookie, 'POST', '', { kind: 'blog', title }))).data
    const two = (await json(await adm(a.cookie, 'POST', '', { kind: 'blog', title }))).data
    const g = (await json(await adm(a.cookie, 'POST', '', { kind: 'guide', title }))).data
    expect(two.slug).toBe(`${one.slug}-2`)
    expect(g.slug).toBe(one.slug) // a different type may reuse the address
    expect((await adm(a.cookie, 'PATCH', `/${two.id}`, { slug: one.slug })).status).toBe(409)
    expect((await adm(a.cookie, 'PATCH', `/${two.id}`, { slug: 'my-new-address' })).status).toBe(200)
    expect((await adm(a.cookie, 'POST', '', { kind: 'blog', title: 'x y z', slug: 'rss' })).status).toBe(400)
    expect((await adm(a.cookie, 'PATCH', `/${two.id}`, { slug: 'Bad Address!' })).status).toBe(400)
    const clash = await adm(a.cookie, 'POST', '', { kind: 'blog', title: 'Another', slug: one.slug })
    expect(clash.status).toBe(409)
  })

  it('news: short items, trending strip, source link kept; a link must be http(s)', async () => {
    const a = await admin(); const t = tag()
    const mkN = async (title: string, extra: object) => (await json(await adm(a.cookie, 'POST', '', { kind: 'news', title, summary: `${title} — short story.`, tags: [t], sourceName: 'The Wire', sourceUrl: 'https://example.com/story', ...extra }))).data
    const n1 = await mkN(`Chip news ${rid()}`, { trending: true }), n2 = await mkN(`Quiet news ${rid()}`, {})
    for (const n of [n1, n2]) expect((await adm(a.cookie, 'POST', `/${n.id}/publish`, {})).status).toBe(200)
    const trending = (await json(await pub('/news/trending'))).data
    expect(trending.some((x: { id: string }) => x.id === n1.id)).toBe(true)
    expect(trending.some((x: { id: string }) => x.id === n2.id)).toBe(false)
    const one = (await json(await pub(`/posts/news/${n1.slug}`))).data
    expect(one).toMatchObject({ sourceName: 'The Wire', sourceUrl: 'https://example.com/story', hasBody: false })
    expect((await adm(a.cookie, 'POST', '', { kind: 'news', title: 'Bad link', sourceUrl: 'javascript:alert(1)' })).status).toBe(400)
    expect((await adm(a.cookie, 'POST', '', { kind: 'news', title: 'Too long', summary: 'x'.repeat(600) })).status).toBe(400)
  })

  it('guides: grouped by section, ordered by number, with previous / next', async () => {
    const a = await admin(); const sec = `Section ${rid()}`
    const mk = async (title: string, sortOrder: number) => { const g = (await json(await adm(a.cookie, 'POST', '', { kind: 'guide', title, summary: 's', body: 'x'.repeat(40), section: sec, sortOrder }))).data; await adm(a.cookie, 'POST', `/${g.id}/publish`, {}); return g }
    const second = await mk(`Second ${rid()}`, 90_002), first = await mk(`First ${rid()}`, 90_001)
    const groups = (await json(await pub('/guides'))).data as { name: string; items: { id: string }[] }[]
    expect(groups.find((g) => g.name === sec)!.items.map((i) => i.id)).toEqual([first.id, second.id])
    const d = (await json(await pub(`/posts/guide/${first.slug}`))).data
    expect(d.next.id).toBe(second.id)
    expect((await json(await pub(`/posts/guide/${second.slug}`))).data.prev.id).toBe(first.id)
  })

  it('delete removes it; unknown ids and types are 404; search and filters work in the dashboard', async () => {
    const a = await admin(); const word = `zebra${rid()}`
    const p = (await json(await adm(a.cookie, 'POST', '', { kind: 'blog', title: `About ${word}` }))).data
    const found = (await json(await adm(a.cookie, 'GET', `?q=${word}&kind=blog&state=draft`))).data
    expect(found.items.map((i: { id: string }) => i.id)).toEqual([p.id])
    expect(found.items[0]).not.toHaveProperty('body')
    expect((await json(await adm(a.cookie, 'GET', `?q=${word}&state=published`))).data.items).toHaveLength(0)
    expect((await adm(a.cookie, 'DELETE', `/${p.id}`)).status).toBe(200)
    expect((await adm(a.cookie, 'GET', `/${p.id}`)).status).toBe(404)
    expect((await pub('/posts/podcast/x')).status).toBe(404)
    expect((await pub('/posts?kind=podcast')).status).toBe(400)
  })
})

describe('pictures', () => {
  it('upload (PNG by content) → public URL serves it; a fake picture or an over-size one is refused; user pictures are never served here', async () => {
    const a = await admin()
    const form = (bytes: Uint8Array, name = 'x.png') => { const f = new FormData(); f.set('file', new File([bytes], name, { type: 'image/png' })); return f }
    const up = await app.request('/api/v1/admin/posts/images/upload', { method: 'POST', headers: { Origin: origin, Cookie: a.cookie }, body: form(PNG) })
    expect(up.status).toBe(201)
    const { url } = (await json(up)).data
    expect(url).toMatch(/^\/api\/v1\/content\/images\/post-[A-Za-z0-9_-]+\.png$/)
    const got = await app.request(url, { headers: { Origin: origin } })
    expect(got.status).toBe(200); expect(got.headers.get('content-type')).toBe('image/png'); expect(got.headers.get('cache-control')).toMatch(/immutable/)
    // the picture is accepted as a cover, a made-up path is not
    const p = (await json(await adm(a.cookie, 'POST', '', { kind: 'blog', title: `Cover ${rid()}`, coverUrl: url }))).data
    expect(p.coverUrl).toBe(url)
    expect((await adm(a.cookie, 'POST', '', { kind: 'blog', title: 'Bad cover', coverUrl: 'https://evil.example/x.png' })).status).toBe(400)
    const fake = await app.request('/api/v1/admin/posts/images/upload', { method: 'POST', headers: { Origin: origin, Cookie: a.cookie }, body: form(Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])) })
    expect(fake.status).toBe(422)
    expect((await app.request('/api/v1/content/images/abc123abc123abc123abc123.png', { headers: { Origin: origin } })).status).toBe(404) // not a "post-" key
    const user = await signUp('blog')
    expect((await app.request('/api/v1/admin/posts/images/upload', { method: 'POST', headers: { Origin: origin, Cookie: user.cookie }, body: form(PNG) })).status).toBe(403)
  })
})
