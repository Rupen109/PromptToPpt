import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import { composeSlide, getTheme } from '@prompttoppt/theme'
import { presentationSchema, type Presentation, type Slide } from '@prompttoppt/validation'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { generationJob, presentation, presentationVersion } from '../db/schema.ts'
import { api, json, setPlan, signUp } from '../test-utils.ts'
import { closeDeck, DeckWriteCancelled, placeholderSlide, stableElementIds, writeDeck } from './progress.ts'
import { processOne } from './worker.ts'

const theme = getTheme('cobalt')
const rid = () => Math.random().toString(36).slice(2, 10)

/** a deck of placeholders and the job that writes it, the way POST /jobs sets them up */
async function openDeck(userId: string, n = 4) {
  const id = nanoid(), jobId = nanoid()
  const ids = Array.from({ length: n }, () => nanoid(12))
  const doc: Presentation = { schemaVersion: 1, id, title: 'draft', aspectRatio: '16:9', language: 'en', theme, sources: [], slides: ids.map((s) => placeholderSlide(s, '', theme)) }
  await db.insert(presentation).values({ id, userId, title: doc.title, latestVersion: 1, revision: 1 })
  await db.insert(presentationVersion).values({ id: nanoid(), presentationId: id, version: 1, document: doc, createdBy: 'generation' })
  await db.insert(generationJob).values({ id: jobId, userId, prompt: 'p', options: {}, idempotencyKey: `k-${rid()}-${rid()}`, presentationId: id, status: 'generating', lockedUntil: new Date(Date.now() + 3600_000) }) // leased: another test file's worker must not pick this job up
  return { id, jobId, ids, doc }
}
const slideWith = (id: string, title: string): Slide => stableElementIds({ id, locked: false, validation: { status: 'pending', issues: [] }, ...composeSlide({ layout: 'title-body', title, bullets: ['one', 'two'], speakerNotes: '', sources: [] }, theme, '16:9', () => nanoid(10)) } as Slide)
const stored = async (id: string) => { const [p] = await db.select().from(presentation).where(eq(presentation.id, id)); const [v] = await db.select().from(presentationVersion).where(and(eq(presentationVersion.presentationId, id), eq(presentationVersion.version, p!.latestVersion))); return { p: p!, doc: presentationSchema.parse(v!.document) } }

describe('writeDeck: generation writes into the open deck without undoing what the person did', () => {
  it('replaces placeholders slide by slide, bumps the revision, and keeps one working version', async () => {
    const u = await signUp('pw')
    const { id, jobId, ids, doc } = await openDeck(u.id)
    const r1 = await writeDeck(jobId, id, u.id, { ...doc, slides: [slideWith(ids[0]!, 'First'), ...doc.slides.slice(1)] })
    const s1 = await stored(id)
    expect(r1).toBe(2)
    expect(s1.doc.slides.map((s) => !!s.writing)).toEqual([false, true, true, true])
    expect(s1.doc.slides[0]!.elements.length).toBeGreaterThan(0)
    expect(await db.select().from(presentationVersion).where(eq(presentationVersion.presentationId, id))).toHaveLength(1)
  })

  it('keeps a title the person retyped, a slide they deleted and an element they resized, while later slides land', async () => {
    const u = await signUp('pw')
    const { id, jobId, ids, doc } = await openDeck(u.id)
    const first = { ...doc, title: 'Climate', slides: [slideWith(ids[0]!, 'First'), slideWith(ids[1]!, 'Second'), ...doc.slides.slice(2)] }
    await writeDeck(jobId, id, u.id, first)
    // the person edits: new title, deletes slide 2, resizes slide 1's first text
    const [p] = await db.select().from(presentation).where(eq(presentation.id, id))
    const mine = presentationSchema.parse((await stored(id)).doc)
    const edited: Presentation = { ...mine, title: 'My own title', slides: mine.slides.filter((s) => s.id !== ids[1]).map((s) => (s.id === ids[0] ? { ...s, elements: s.elements.map((e) => (e.id === `${ids[0]}:text1` ? { ...e, fontSize: 77 } : e)) } : s)) }
    const [v] = await db.select().from(presentationVersion).where(eq(presentationVersion.presentationId, id))
    await db.update(presentationVersion).set({ document: edited }).where(eq(presentationVersion.id, v!.id))
    await db.update(presentation).set({ title: edited.title, revision: p!.revision + 1 }).where(eq(presentation.id, id))
    // generation then writes slides 3 and 4 (and re-writes slide 1 with a picture, which must not drop the edit)
    await writeDeck(jobId, id, u.id, { ...first, slides: [slideWith(ids[0]!, 'First'), slideWith(ids[1]!, 'Second'), slideWith(ids[2]!, 'Third'), slideWith(ids[3]!, 'Fourth')] })
    const out = (await stored(id)).doc
    expect(out.title).toBe('My own title')
    expect(out.slides.map((s) => s.id)).toEqual([ids[0], ids[2], ids[3]]) // the deleted slide stays deleted
    expect(out.slides.some((s) => s.writing)).toBe(false)
    const sizes = out.slides[0]!.elements.filter((e) => e.type === 'text').map((e) => (e as { fontSize: number }).fontSize)
    expect(sizes).toContain(77) // the edit to slide 1 survived the re-write of slide 1
  })

  it('element ids are stable per slide, so the same slide written twice keeps the same ids', () => {
    const a = slideWith('s1', 'Same'), b = slideWith('s1', 'Same')
    expect(a.elements.map((e) => e.id)).toEqual(b.elements.map((e) => e.id))
    expect(a.elements[0]!.id).toMatch(/^s1:/)
  })

  it('writes nothing after the job was cancelled', async () => {
    const u = await signUp('pw')
    const { id, jobId, doc } = await openDeck(u.id)
    await db.update(generationJob).set({ status: 'cancelled' }).where(eq(generationJob.id, jobId))
    await expect(writeDeck(jobId, id, u.id, { ...doc, title: 'late' })).rejects.toBeInstanceOf(DeckWriteCancelled)
    expect((await stored(id)).doc.title).toBe('draft')
  })

  it('closeDeck: a deck with nothing written is removed; one with slides keeps them and loses the unwritten placeholders', async () => {
    const u = await signUp('pw')
    const empty = await openDeck(u.id)
    expect(await closeDeck(empty.jobId, empty.id, u.id)).toBe('removed')
    expect(await db.select().from(presentation).where(eq(presentation.id, empty.id))).toHaveLength(0) // gone, so it does not count toward the monthly allowance
    const part = await openDeck(u.id)
    await writeDeck(part.jobId, part.id, u.id, { ...part.doc, slides: [slideWith(part.ids[0]!, 'Only'), slideWith(part.ids[1]!, 'Two'), ...part.doc.slides.slice(2)] })
    expect(await closeDeck(part.jobId, part.id, u.id)).toBe('kept')
    expect((await stored(part.id)).doc.slides.map((s) => s.id)).toEqual([part.ids[0], part.ids[1]])
  })
})

describe('a real job opens its deck first and writes it', () => {
  const post = (cookie: string, body: object) => app.request('/api/v1/generation/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) })

  it('POST /jobs returns the deck at once (placeholders, counted once toward the allowance); the finished deck has no placeholders and the milestones are recorded in order', async () => {
    const u = await signUp('pj'); await setPlan(u.id, 'pro')
    const res = await post(u.cookie, { prompt: 'Create an 8 slide overview of our onboarding process for new customers', slideCount: 8, idempotencyKey: `key-${rid()}-${rid()}` })
    const view = (await json(res)).data
    expect(res.status).toBe(201)
    expect(view.presentationId).toBeTruthy()
    const opened = (await json(await api(u.cookie, 'GET', `/presentations/${view.presentationId}`))).data
    expect(opened.document.slides).toHaveLength(8)
    expect(opened.document.slides.every((s: Slide) => !!s.writing && s.elements.length === 0)).toBe(true)
    expect((await json(await api(u.cookie, 'GET', '/me/entitlements'))).data.usage.presentationsThisPeriod).toBe(1)

    for (let i = 0; i < 20; i++) { const [j] = await db.select().from(generationJob).where(eq(generationJob.id, view.id)); if (j!.status === 'completed') break; await processOne() }
    const [job] = await db.select().from(generationJob).where(eq(generationJob.id, view.id))
    expect(job!.status).toBe('completed')
    const done = (await json(await api(u.cookie, 'GET', `/presentations/${view.presentationId}`))).data
    expect(done.document.slides).toHaveLength(8)
    expect(done.document.slides.some((s: Slide) => s.writing)).toBe(false)
    expect(done.document.slides.every((s: Slide) => s.elements.length > 0)).toBe(true)
    expect(done.document.slides.map((s: Slide) => s.id)).toEqual((job!.checkpoint as { slideIds: string[] }).slideIds)
    expect((await json(await api(u.cookie, 'GET', '/me/entitlements'))).data.usage.presentationsThisPeriod).toBe(1) // still one deck, not two
    const m = (job!.checkpoint as { marks: Record<string, number> }).marks
    expect(Object.keys(m).sort()).toEqual(['done', 'firstSlide', 'skeleton', 'start', 'titles'])
    expect(m['skeleton']!).toBeLessThanOrEqual(m['titles']!)
    expect(m['titles']!).toBeLessThanOrEqual(m['firstSlide']!)
    expect(m['firstSlide']!).toBeLessThanOrEqual(m['done']!)
  })

  it('cancelling before any slide is written removes the empty deck and refunds; the quota is free again', async () => {
    const u = await signUp('pj'); await setPlan(u.id, 'pro')
    const view = (await json(await post(u.cookie, { prompt: 'Create a 6 slide overview of our onboarding process for new customers', slideCount: 6, idempotencyKey: `key-${rid()}-${rid()}` }))).data
    const c = await app.request(`/api/v1/generation/jobs/${view.id}/cancel`, { method: 'POST', headers: { Cookie: u.cookie } })
    expect(c.status).toBe(200)
    expect((await api(u.cookie, 'GET', `/presentations/${view.presentationId}`)).status).toBe(404)
    expect((await json(await api(u.cookie, 'GET', '/me/entitlements'))).data.usage.presentationsThisPeriod).toBe(0)
  })
})
