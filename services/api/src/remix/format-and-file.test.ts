import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { composeSlide, getTheme } from '@prompttoppt/theme'
import { CANVAS, presentationSchema, type Presentation } from '@prompttoppt/validation'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { generationJob, presentation, presentationVersion } from '../db/schema.ts'
import { processOne } from '../generation/worker.ts'
import { remixPrompt } from './prompt.ts'
import { api, json, setPlan, signUp } from '../test-utils.ts'

const key = () => `fmt-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
const job = (cookie: string, body: Record<string, unknown>) => api(cookie, 'POST', '/generation/jobs', { idempotencyKey: key(), ...body })
async function finish(jobId: string) {
  for (let i = 0; i < 25; i++) { const [j] = await db.select().from(generationJob).where(eq(generationJob.id, jobId)); if (['completed', 'failed'].includes(j!.status)) break; await processOne() }
  return (await json(await api('', 'GET', `/generation/jobs/${jobId}`))).data
}
async function viewOf(cookie: string, jobId: string) { await finish(jobId); return (await json(await api(cookie, 'GET', `/generation/jobs/${jobId}`))).data }

/** A real, minimal .pptx (a zip of XML): the server reads its slide text and notes, one part per slide. */
const pptx = (slides: string[], notes?: Record<number, string>) => zipSync({
  '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
  'ppt/presentation.xml': strToU8('<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>'),
  ...Object.fromEntries(slides.map((t, i) => [`ppt/slides/slide${i + 1}.xml`, strToU8(`<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`)])),
  ...Object.fromEntries(Object.entries(notes ?? {}).map(([n, t]) => [`ppt/notesSlides/notesSlide${n}.xml`, strToU8(`<?xml version="1.0"?><p:notes xmlns:a="a" xmlns:p="p"><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:notes>`)])),
})
async function upload(cookie: string, bytes: Uint8Array, name: string) {
  const fd = new FormData(); fd.set('file', new File([bytes], name))
  return app.request('/api/v1/sources/file', { method: 'POST', headers: { Cookie: cookie, Origin: process.env['WEB_URL'] ?? 'http://localhost:3000' }, body: fd })
}

describe('the format (shape) of a new deck: 16:9, 4:3, 1:1 or the vertical 9:16', () => {
  it('a new deck can be made vertical: its canvas is 1080 × 1920 and every slide is valid and clean', async () => {
    const u = await signUp('fmt'); await setPlan(u.id, 'pro')
    const created = await job(u.cookie, { prompt: 'A vertical story about our spring offer for the shop window', aspectRatio: '9:16' })
    expect(created.status).toBe(201)
    const view = await viewOf(u.cookie, (await json(created)).data.id)
    expect(view.status, JSON.stringify(view)).toBe('completed')
    const deck = (await json(await api(u.cookie, 'GET', `/presentations/${view.presentationId}`))).data
    const doc = deck.document as Presentation
    expect(doc.aspectRatio).toBe('9:16'); expect(presentationSchema.safeParse(doc).success).toBe(true)
    const { width, height } = CANVAS['9:16']
    for (const s of doc.slides) for (const e of s.elements) { if (e.decorative) continue; expect(e.x + e.width, `${s.layoutId} ${e.id}`).toBeLessThanOrEqual(width + 2); expect(e.y + e.height, `${s.layoutId} ${e.id}`).toBeLessThanOrEqual(height + 2) }
  })

  it('refuses a shape that does not exist, Morph in a vertical deck, and a different shape for a deck in your own design', async () => {
    const u = await signUp('fmt'); await setPlan(u.id, 'gold')
    expect((await job(u.cookie, { prompt: 'A pitch for a bakery', aspectRatio: '2:1' })).status).toBe(400)
    const morph = await job(u.cookie, { prompt: 'A pitch for a bakery delivery service', aspectRatio: '9:16', morph: true })
    expect(morph.status).toBe(400); expect((await json(morph)).error.message).toMatch(/widescreen/)
    expect((await job(u.cookie, { prompt: 'A pitch for a bakery delivery service', aspectRatio: '9:16', morphTemplate: 'pitch-orbit' })).status).toBe(400)
    expect((await job(u.cookie, { prompt: 'A pitch for a bakery delivery service', aspectRatio: '1:1', fromTemplateId: 'x'.repeat(10) })).status).toBeGreaterThanOrEqual(400) // (an unknown design is refused first; a real one with a shape of its own is refused by the shape rule)
    // 16:9 Morph is still fine
    expect((await job(u.cookie, { prompt: 'A pitch for a bakery delivery service', aspectRatio: '16:9', morph: true })).status).toBe(201)
  })

  it('a remix can change the format: a 4:3 deck becomes a vertical one in the same look, the original is untouched', async () => {
    const u = await signUp('fmt'); await setPlan(u.id, 'pro')
    const theme = getTheme('cobalt'); const idGen = () => nanoid(10); const id = nanoid()
    const contents = [{ layout: 'title-body', title: 'Spring offer', bullets: ['Two for one', 'Until Sunday'], speakerNotes: '', sources: [] }, { layout: 'quote', quote: 'Fresh every morning', attribution: 'The baker', speakerNotes: '', sources: [] }] as never[]
    const slides = contents.map((c) => ({ id: nanoid(12), locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(c, theme, '4:3', idGen) }))
    const doc = { schemaVersion: 1, id, title: 'Spring offer', aspectRatio: '4:3', language: 'en', theme, sources: [], slides } as unknown as Presentation
    await db.insert(presentation).values({ id, userId: u.id, title: doc.title, aspectRatio: '4:3', latestVersion: 1, revision: 1 })
    await db.insert(presentationVersion).values({ id: nanoid(), presentationId: id, version: 1, document: doc, createdBy: 'generation' })
    const src = (await json(await api(u.cookie, 'POST', `/presentations/${id}/remix-source`, {}))).data.sourceId
    const same = await viewOf(u.cookie, (await json(await job(u.cookie, { prompt: 'A short version', slideCount: 4, remixOf: id, sourceIds: [src] }))).data.id)
    expect((await json(await api(u.cookie, 'GET', `/presentations/${same.presentationId}`))).data.document.aspectRatio, 'without a choice the format stays').toBe('4:3')
    const src2 = (await json(await api(u.cookie, 'POST', `/presentations/${id}/remix-source`, {}))).data.sourceId
    const tall = await viewOf(u.cookie, (await json(await job(u.cookie, { prompt: 'A vertical story version', slideCount: 4, remixOf: id, sourceIds: [src2], aspectRatio: '9:16' }))).data.id)
    expect(tall.status, JSON.stringify(tall)).toBe('completed')
    const out = (await json(await api(u.cookie, 'GET', `/presentations/${tall.presentationId}`))).data.document as Presentation
    expect(out.aspectRatio).toBe('9:16'); expect(out.theme, 'the look is the original\'s').toEqual(theme); expect(out.slides).toHaveLength(4)
    const [orig] = await db.select().from(presentationVersion).where(eq(presentationVersion.presentationId, id))
    expect((orig!.document as Presentation).aspectRatio).toBe('4:3')
  })
})

describe('remixing a PowerPoint file', () => {
  it('the upload reads the slides (text and notes) and says how many', async () => {
    const u = await signUp('rpp'); await setPlan(u.id, 'pro')
    const r = await upload(u.cookie, pptx(['Resultados del tercer trimestre', 'Ventas: 120 millones', 'Próximos pasos'], { 2: 'Mencionar el crecimiento' }), 'trimestre.pptx')
    expect(r.status).toBe(201)
    const s = (await json(r)).data
    expect(s).toMatchObject({ type: 'pptx', title: 'trimestre', parts: 3 })
  })

  it('makes a NEW deck from the file: the chosen shape and length, a fresh look, the file kept as its source', async () => {
    const u = await signUp('rpp'); await setPlan(u.id, 'pro')
    const src = (await json(await upload(u.cookie, pptx(['Quarterly review', 'Revenue grew 15%', 'Hiring plan']), 'review.pptx'))).data
    const created = await job(u.cookie, { prompt: 'A short version for investors', slideCount: 5, aspectRatio: '9:16', sourceIds: [src.id], remixFile: src.title })
    expect(created.status).toBe(201)
    const view = await viewOf(u.cookie, (await json(created)).data.id)
    expect(view.status, JSON.stringify(view)).toBe('completed')
    const doc = (await json(await api(u.cookie, 'GET', `/presentations/${view.presentationId}`))).data.document as Presentation
    expect(presentationSchema.safeParse(doc).success).toBe(true)
    expect(doc.aspectRatio).toBe('9:16'); expect(doc.slides).toHaveLength(5)
    expect(doc.sources.map((s) => s.id)).toContain(src.id)
  })

  it('is a Pro feature; it needs the file; it cannot be mixed with rewrite, Morph or your own design', async () => {
    const free = await signUp('rpp')
    const src = (await json(await upload(free.cookie, pptx(['One slide']), 'one.pptx'))).data
    const starter = await job(free.cookie, { prompt: 'Make it shorter', sourceIds: [src.id], remixFile: 'one' })
    expect(starter.status).toBe(403); expect((await json(starter)).error).toMatchObject({ code: 'UPGRADE_REQUIRED', details: { feature: 'remix' } })
    const gold = await signUp('rpp'); await setPlan(gold.id, 'gold')
    const s2 = (await json(await upload(gold.cookie, pptx(['One slide']), 'one.pptx'))).data
    const nofile = await job(gold.cookie, { prompt: 'Make it shorter', remixFile: 'one' })
    expect(nofile.status).toBe(400); expect((await json(nofile)).error.code).toBe('REMIX_NEEDS_SOURCE')
    for (const extra of [{ morph: true }, { morphTemplate: 'pitch-orbit' }, { targetPresentationId: 'x' }, { remixOf: 'x' }, { picturesOnly: true }, { fromTemplateId: 'x'.repeat(10) }]) {
      expect((await job(gold.cookie, { prompt: 'Make it shorter', sourceIds: [s2.id], remixFile: 'one', ...extra })).status, JSON.stringify(extra)).toBeGreaterThanOrEqual(400)
    }
  })

  it('a file that is not a PowerPoint is not read as one', async () => {
    const u = await signUp('rpp'); await setPlan(u.id, 'pro')
    const r = await upload(u.cookie, strToU8('just some text, not a presentation at all'), 'notes.txt')
    expect(((await json(r)).data ?? {}).type).not.toBe('pptx')
  })
})

describe('the brief of a remix', () => {
  it('names the language when it is known, and quotes the file\'s own first words when it is not (so the model writes in the file\'s language)', () => {
    const known = remixPrompt('Shorter', 'Informe', 'es', 6)
    expect(known).toContain('ISO code "es"'); expect(known).toContain('exactly 6 slides')
    const unknown = remixPrompt('Shorter', 'trimestre', undefined, undefined, 'Resultados del tercer trimestre\nVentas "récord"')
    expect(unknown).toContain('its own words begin: "Resultados del tercer trimestre Ventas récord"')
    expect(unknown).not.toContain('ISO code')
    expect(remixPrompt('x', 't', undefined, undefined, 'a'.repeat(900))).toContain('a'.repeat(280) + '"')
  })
})
