import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { describe, expect, it } from 'vitest'
import { composeSlide, getTheme } from '@prompttoppt/theme'
import { presentationSchema, type Presentation } from '@prompttoppt/validation'
import { db } from '../db/index.ts'
import { generationJob, presentation, presentationVersion } from '../db/schema.ts'
import { processOne } from '../generation/worker.ts'
import { api, json, setPlan, signUp } from '../test-utils.ts'

describe('a remix job through the real pipeline (mock model: checks the plumbing, not the writing)', () => {
  it('creates a NEW deck in the original\'s format and look, leaves the original untouched, and cites nothing', async () => {
    const u = await signUp('rxp'); await setPlan(u.id, 'pro')
    const theme = { ...getTheme('cobalt'), brand: { name: 'Acme', logo: { src: 'https://api.example.com/api/v1/assets/abcdefghijklmnopqrstuvwxyz012345', aspect: 3 } } }
    const idGen = () => nanoid(10); const id = nanoid()
    const contents = [
      { layout: 'title-body', title: 'Q3 sales review', bullets: ['Revenue up 15%', 'Pipeline down 8%'], speakerNotes: 'Open', sources: [] },
      { layout: 'chart', title: 'Revenue', chartType: 'bar', labels: ['Q1', 'Q2', 'Q3'], series: [{ name: 'Revenue', values: [100, 120, 138] }], unit: 'k', takeaway: 'Up 15%', speakerNotes: '', sources: [] },
    ] as never[]
    const slides = contents.map((c) => ({ id: nanoid(12), locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(c, theme, '4:3', idGen) }))
    const doc = { schemaVersion: 1, id, title: 'Q3 sales', aspectRatio: '4:3', language: 'es', theme, sources: [], slides } as unknown as Presentation
    await db.insert(presentation).values({ id, userId: u.id, title: doc.title, aspectRatio: '4:3', latestVersion: 1, revision: 1 })
    await db.insert(presentationVersion).values({ id: nanoid(), presentationId: id, version: 1, document: doc, createdBy: 'generation' })

    const src = (await json(await api(u.cookie, 'POST', `/presentations/${id}/remix-source`, {}))).data.sourceId
    const created = await api(u.cookie, 'POST', '/generation/jobs', { prompt: 'A short customer version', slideCount: 5, remixOf: id, sourceIds: [src], idempotencyKey: `rxp-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` })
    expect(created.status).toBe(201)
    const jobId = (await json(created)).data.id
    for (let i = 0; i < 20; i++) { const [j] = await db.select().from(generationJob).where(eq(generationJob.id, jobId)); if (['completed', 'failed'].includes(j!.status)) break; await processOne() }
    const view = (await json(await api(u.cookie, 'GET', `/generation/jobs/${jobId}`))).data
    expect(view.status, JSON.stringify(view)).toBe('completed')

    const out = (await json(await api(u.cookie, 'GET', `/presentations/${view.presentationId}`))).data.document as Presentation
    expect(presentationSchema.safeParse(out).success).toBe(true)
    expect(view.presentationId).not.toBe(id)
    expect(out.aspectRatio).toBe('4:3')
    expect(out.slides).toHaveLength(5)
    expect(out.theme, 'the theme must be exactly the original\'s').toEqual(theme)
    expect(out.sources, 'a remix must not carry the temporary working source').toEqual([])
    expect(out.slides.every((s) => ((s.content as { sources?: unknown[] }).sources ?? []).length === 0), 'no slide may cite the working source').toBe(true)
    const logos = out.slides.map((s) => s.elements.filter((e) => e.type === 'image' && /logo/i.test((e as { alt?: string }).alt ?? '')).length)
    expect(logos.every((n) => n === 1), `the brand logo must stay on every slide: ${logos}`).toBe(true)
    // the original deck is exactly as it was
    const [orig] = await db.select().from(presentationVersion).where(eq(presentationVersion.presentationId, id))
    expect((orig!.document as Presentation).slides).toHaveLength(2)
  })
})
