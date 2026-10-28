import { and, eq, like } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { describe, expect, it } from 'vitest'
import { composeSlide, getTheme } from '@prompttoppt/theme'
import type { Presentation } from '@prompttoppt/validation'
import { db } from '../db/index.ts'
import { generationJob, presentation, presentationVersion, sourceChunk, sourceDocument } from '../db/schema.ts'
import { api, json, setPlan, signUp } from '../test-utils.ts'
import { remixPrompt } from './prompt.ts'

/** a deck with real figures (a chart and metrics), one hand-edited slide, in a 4:3 format */
async function figuresDeck(userId: string, aspect: '16:9' | '4:3' = '4:3') {
  const theme = getTheme('cobalt'); const id = nanoid(); const idGen = () => nanoid(10)
  const contents = [
    { layout: 'title-body', title: 'Q3 sales review', bullets: ['Revenue up 15%', 'Pipeline down 8%'], speakerNotes: 'Open with the headline', sources: [] },
    { layout: 'chart', title: 'Revenue by quarter', chartType: 'bar', labels: ['Q1', 'Q2', 'Q3'], series: [{ name: 'Revenue', values: [100, 120.5, 138] }], unit: 'k', takeaway: 'Up 15% on Q2', speakerNotes: '', sources: [] },
    { layout: 'metrics', title: 'Wins', metrics: [{ value: '40%', label: 'Enterprise growth', detail: 'year on year' }, { value: '3', label: 'New partners' }], speakerNotes: '', sources: [] },
  ] as never[]
  const slides = contents.map((c) => ({ id: nanoid(12), locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(c, theme, aspect, idGen) }))
  // a slide the user edited by hand: its stored original says one thing, what it SHOWS now says another
  const edited = { ...slides[0]!, id: nanoid(12), manual: true, content: { layout: 'title-body', title: 'STALE original title', bullets: ['stale bullet'], speakerNotes: '', sources: [] }, elements: slides[0]!.elements.map((e) => (e.type === 'text' && e.role === 'title' ? { ...e, paragraphs: [{ runs: [{ text: 'Typed by hand: new headline 77%' }] }] } : e)) }
  const picturesOnly = { ...slides[0]!, id: nanoid(12), manual: true, content: undefined, elements: [{ ...slides[0]!.elements.find((e) => e.type === 'shape')! }] }
  const doc = { schemaVersion: 1, id, title: 'Q3 sales', aspectRatio: aspect, language: 'en', theme, sources: [], slides: [...slides, edited, picturesOnly] } as unknown as Presentation
  await db.insert(presentation).values({ id, userId, title: doc.title, aspectRatio: aspect, latestVersion: 1, revision: 1 })
  await db.insert(presentationVersion).values({ id: nanoid(), presentationId: id, version: 1, document: doc, createdBy: 'generation' })
  return { id, doc }
}
const pro = async () => { const u = await signUp('rx'); await setPlan(u.id, 'pro'); return u }

describe('duplicate', () => {
  it('makes an independent copy named "Copy of …" for the owner only, and it counts as a new deck', async () => {
    const u = await pro(), other = await pro()
    const { id, doc } = await figuresDeck(u.id)
    const res = await api(u.cookie, 'POST', `/presentations/${id}/duplicate`, {})
    expect(res.status).toBe(201)
    const copy = (await json(res)).data
    expect(copy.title).toBe('Copy of Q3 sales'); expect(copy.id).not.toBe(id)
    const got = (await json(await api(u.cookie, 'GET', `/presentations/${copy.id}`))).data
    expect(got.document.id).toBe(copy.id); expect(got.document.slides).toHaveLength(doc.slides.length); expect(got.document.aspectRatio).toBe('4:3')
    const list = (await json(await api(u.cookie, 'GET', '/presentations'))).data.map((d: { id: string }) => d.id)
    expect(list).toEqual(expect.arrayContaining([id, copy.id]))
    expect((await api(other.cookie, 'POST', `/presentations/${id}/duplicate`, {})).status).toBe(404)
    expect((await api('', 'POST', `/presentations/${id}/duplicate`, {})).status).toBe(401)
  })
})

describe('remix source', () => {
  it('Pro and Gold only; needs your own deck', async () => {
    const free = await signUp('rx'); const u = await pro(), other = await pro()
    const mine = await figuresDeck(u.id)
    const freeDeck = await figuresDeck(free.id)
    const denied = await api(free.cookie, 'POST', `/presentations/${freeDeck.id}/remix-source`, {})
    expect(denied.status).toBe(403); expect((await json(denied)).error.code).toBe('UPGRADE_REQUIRED')
    expect((await api(other.cookie, 'POST', `/presentations/${mine.id}/remix-source`, {})).status).toBe(404)
  })
  it('turns the deck into a private source that keeps the figures, one part per slide; hand-edited slides are read as they look now; slides with nothing readable are skipped and counted', async () => {
    const u = await pro(); const { id } = await figuresDeck(u.id)
    const r = await api(u.cookie, 'POST', `/presentations/${id}/remix-source`, {})
    expect(r.status).toBe(201)
    const data = (await json(r)).data
    expect(data).toMatchObject({ title: 'Q3 sales', slideCount: 5, aspectRatio: '4:3', skipped: 1 }) // the picture-only slide has nothing to read; the hand-edited one is read
    const chunks = await db.select().from(sourceChunk).where(eq(sourceChunk.sourceId, data.sourceId))
    const text = chunks.map((c) => c.text).join('\n')
    for (const must of ['Revenue up 15%', 'Pipeline down 8%', '100 | 120.5 | 138', 'Enterprise growth', '40%', 'Open with the headline', 'Typed by hand: new headline 77%']) expect(text).toContain(must)
    expect(text).not.toContain('STALE original title') // the hand-edited slide is read as it looks now, not from its stale original
    expect(chunks.map((c) => c.locator)).toEqual(expect.arrayContaining(['slide 1', 'slide 2', 'slide 3']))
    const [doc] = await db.select().from(sourceDocument).where(eq(sourceDocument.id, data.sourceId))
    expect(doc).toMatchObject({ userId: u.id, type: 'text', title: 'Remix source: Q3 sales' })
  })
  it('keeps only the newest 20 working copies so remixing never fills the source allowance', async () => {
    const u = await pro(); const { id } = await figuresDeck(u.id)
    await db.insert(sourceDocument).values({ id: nanoid(), userId: u.id, type: 'text', title: 'My own notes' })
    const old = Array.from({ length: 24 }, (_, i) => ({ id: nanoid(), userId: u.id, type: 'text', title: `Remix source: old ${i}`, createdAt: new Date(Date.now() - (30 - i) * 3600_000) }))
    await db.insert(sourceDocument).values(old)
    const r = await api(u.cookie, 'POST', `/presentations/${id}/remix-source`, {})
    expect(r.status).toBe(201)
    const fresh = (await json(r)).data.sourceId
    const rows = await db.select().from(sourceDocument).where(and(eq(sourceDocument.userId, u.id), like(sourceDocument.title, 'Remix source: %')))
    expect(rows).toHaveLength(20)
    expect(rows.map((x) => x.id)).toContain(fresh) // the newest one always survives
    expect(rows.map((x) => x.title)).not.toContain('Remix source: old 0') // the oldest were removed
    expect(await db.select().from(sourceDocument).where(and(eq(sourceDocument.userId, u.id), eq(sourceDocument.title, 'My own notes')))).toHaveLength(1) // the user's own sources are never touched
  })
})

describe('remix job (no AI call: each job is cancelled before the worker can run it)', () => {
  const job = (extra: object) => ({ prompt: 'Make a 6 slide version for our team meeting without the financials', slideCount: 6, idempotencyKey: `rx-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`, ...extra })
  it('is stored with the original deck\'s format; only for your own deck, only on Pro/Gold, and not together with a rewrite', async () => {
    const u = await pro(), other = await pro(), free = await signUp('rx')
    const { id } = await figuresDeck(u.id, '4:3'); const theirs = await figuresDeck(other.id)
    const src = (await json(await api(u.cookie, 'POST', `/presentations/${id}/remix-source`, {}))).data.sourceId
    const ok = await api(u.cookie, 'POST', '/generation/jobs', job({ remixOf: id, sourceIds: [src] }))
    expect(ok.status).toBe(201)
    const jid = (await json(ok)).data.id
    await api(u.cookie, 'POST', `/generation/jobs/${jid}/cancel`)
    const [row] = await db.select().from(generationJob).where(eq(generationJob.id, jid))
    expect(row!.options).toMatchObject({ remixOf: id, aspectRatio: '4:3', sourceIds: [src] })
    expect((await api(u.cookie, 'POST', '/generation/jobs', job({ remixOf: theirs.id, sourceIds: [src] }))).status).toBe(404)
    expect((await api(u.cookie, 'POST', '/generation/jobs', job({ remixOf: id, sourceIds: [src], targetPresentationId: id }))).status).toBe(400)
    const mineFree = await figuresDeck(free.id)
    const freeOwnSource = (await db.insert(sourceDocument).values({ id: nanoid(), userId: free.id, type: 'text', title: 'notes' }).returning())[0]!.id
    const denied = await api(free.cookie, 'POST', '/generation/jobs', job({ remixOf: mineFree.id, sourceIds: [freeOwnSource] }))
    expect(denied.status).toBe(403); expect((await json(denied)).error.code).toBe('UPGRADE_REQUIRED')
  })
})

describe('remix: loopholes and edge cases', () => {
  const job = (extra: object) => ({ prompt: 'A short customer version', slideCount: 5, idempotencyKey: `rx-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`, ...extra })
  it('a remix job without its source text is refused (the model would invent the content), as is another person\'s source', async () => {
    const u = await pro(), other = await pro()
    const { id } = await figuresDeck(u.id); const theirs = await figuresDeck(other.id)
    const none = await api(u.cookie, 'POST', '/generation/jobs', job({ remixOf: id }))
    expect(none.status).toBe(400); expect((await json(none)).error.code).toBe('REMIX_NEEDS_SOURCE')
    expect((await api(u.cookie, 'POST', '/generation/jobs', job({ remixOf: id, sourceIds: [] }))).status).toBe(400)
    const stolen = (await json(await api(other.cookie, 'POST', `/presentations/${theirs.id}/remix-source`, {}))).data.sourceId
    expect((await api(u.cookie, 'POST', '/generation/jobs', job({ remixOf: id, sourceIds: [stolen] }))).status).toBe(400)
  })
  it('a deleted deck cannot be duplicated or remixed', async () => {
    const u = await pro(); const { id } = await figuresDeck(u.id)
    const src = (await json(await api(u.cookie, 'POST', `/presentations/${id}/remix-source`, {}))).data.sourceId
    await db.update(presentation).set({ deletedAt: new Date() }).where(eq(presentation.id, id))
    expect((await api(u.cookie, 'POST', `/presentations/${id}/duplicate`, {})).status).toBe(404)
    expect((await api(u.cookie, 'POST', `/presentations/${id}/remix-source`, {})).status).toBe(404)
    expect((await api(u.cookie, 'POST', '/generation/jobs', job({ remixOf: id, sourceIds: [src] }))).status).toBe(404)
  })
  it('a deck with nothing readable on any slide has nothing to remix: a clear message, no source is created', async () => {
    const u = await pro()
    const id = nanoid(); const theme = getTheme('cobalt')
    const s0 = composeSlide({ layout: 'title', title: 'Only manual', speakerNotes: '', sources: [] } as never, theme, '16:9', () => nanoid(10))
    const doc = { schemaVersion: 1, id, title: 'Manual', aspectRatio: '16:9', language: 'en', theme, sources: [], slides: [{ id: nanoid(12), locked: false, validation: { status: 'pending', issues: [] }, ...s0, manual: true, content: undefined, elements: [] }] } as unknown as Presentation
    await db.insert(presentation).values({ id, userId: u.id, title: 'Manual', aspectRatio: '16:9', latestVersion: 1, revision: 1 })
    await db.insert(presentationVersion).values({ id: nanoid(), presentationId: id, version: 1, document: doc, createdBy: 'generation' })
    const r = await api(u.cookie, 'POST', `/presentations/${id}/remix-source`, {})
    expect(r.status).toBe(422); expect((await json(r)).error.code).toBe('NOTHING_TO_REMIX')
    expect(await db.select().from(sourceDocument).where(and(eq(sourceDocument.userId, u.id), like(sourceDocument.title, 'Remix source: %')))).toHaveLength(0)
  })
  it('working copies younger than an hour are never cleaned up, so a queued remix job cannot lose its source', async () => {
    const u = await pro(); const { id } = await figuresDeck(u.id)
    await db.insert(sourceDocument).values(Array.from({ length: 25 }, (_, i) => ({ id: nanoid(), userId: u.id, type: 'text', title: `Remix source: fresh ${i}`, createdAt: new Date(Date.now() - i * 60_000) })))
    expect((await api(u.cookie, 'POST', `/presentations/${id}/remix-source`, {})).status).toBe(201)
    expect(await db.select().from(sourceDocument).where(and(eq(sourceDocument.userId, u.id), like(sourceDocument.title, 'Remix source: %')))).toHaveLength(26)
  })
  it('is rate limited (10 a minute) so it cannot be used to flood the database', async () => {
    const u = await pro(); const { id } = await figuresDeck(u.id)
    const codes: number[] = []
    for (let i = 0; i < 12; i++) codes.push((await api(u.cookie, 'POST', `/presentations/${id}/remix-source`, {})).status)
    expect(codes.slice(0, 10).every((c) => c === 201)).toBe(true)
    expect(codes.slice(10)).toEqual([429, 429])
  })
  it('the brief names the original language and the exact slide count, and keeps the rules about facts', () => {
    const p = remixPrompt('  A short customer version  ', 'Q3 sales', 'es', 6)
    expect(p).toContain('A short customer version'); expect(p).not.toContain('  A short')
    expect(p).toContain('ISO code "es"'); expect(p).toContain('exactly 6 slides')
    expect(p).toMatch(/keep every number exactly as written/); expect(p).toMatch(/Do not invent/)
    expect(remixPrompt('x', 'T', 'en')).not.toMatch(/exactly \d+ slides/)
    expect(remixPrompt('x', 'a'.repeat(500), 'en').length).toBeLessThan(1200) // a long title cannot blow up the brief
  })
})
