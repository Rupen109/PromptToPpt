import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { presentationSchema, type Presentation, type TextElement } from '@prompttoppt/validation'
import { validateDeck } from '@prompttoppt/theme'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { aiUsageEvent, creditBalance, generationJob, userTemplate } from '../db/schema.ts'
import { setStorage, type AssetStorage } from '../storage/index.ts'
import { miniPptx, para, picture, sp, testPng } from '../template-import/test-fixtures.ts'
import { picturePagesPdf, portraitPdf, sampleDeckPdf } from '../template-import/pdf-fixtures.ts'
import { api, json, rid, setPlan, signUp } from '../test-utils.ts'
import { processOne } from './worker.ts'
import { alignFill, assignSlides, buildDeck, classifySlides, layoutSlide, placeholderFor, uploadedFillSchema, type UploadedFill } from './uploaded-template.ts'
import { getUserTemplate, MAX_USER_TEMPLATES } from '../template-import/user-templates.ts'
import type { UploadedTemplate } from '../template-import/types.ts'

/**
 * Decks in the look of an uploaded file ("Use a file's design"): the plan gate, the routes, the option rules, the slide choice, the words (never the file's own), pictures, ids, saving and
 * deleting. The AI is the mock model, so this suite costs nothing.
 */
const E = 12700
const b = (x: number, y: number, w: number, h: number) => ({ x: x * E, y: y * E, w: w * E, h: h * E })
const mem = (): AssetStorage => { const m = new Map<string, Uint8Array>(); return { async put(k, bytes) { m.set(k, bytes) }, async get(k) { return m.get(k) ?? null } } }
/** 5 slides: cover, bullets, two boxes + photo, a figure + contact detail, closing */
const SAMPLE_WORDS = ['Zorblax Quarterly Review', 'Annual dinner of the Fenwick Society', 'Sprocket assembly line cadence', 'Contact hello@fenwick-society.example', 'Gratitude from the Fenwick team', 'Cheeseboard logistics', '86%', 'Acme Fenwick Co']
const fixture = () => miniPptx({
  size: { cx: 960 * E, cy: 540 * E },
  theme: { major: 'Georgia', minor: 'Verdana', colors: { accent1: 'C0392B', dk2: '1B2631' } },
  slideBg: { 0: '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="1B2631"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' },
  slides: [
    sp(2, 'Title', b(60, 150, 800, 120), { txBox: true, text: para('Zorblax Quarterly Review', { sz: 44, b: true, color: 'FFFFFF' }) }) + sp(3, 'Sub', b(60, 290, 800, 50), { txBox: true, text: para('Annual dinner of the Fenwick Society', { sz: 20, color: 'DDDDDD' }) }) + sp(4, 'Brand', b(60, 480, 200, 30), { txBox: true, text: para('Acme Fenwick Co', { sz: 12 }) }),
    sp(2, 'Title', b(60, 40, 800, 70), { txBox: true, text: para('Sprocket assembly line cadence', { sz: 32, b: true }) }) + sp(3, 'Body', b(60, 140, 800, 300), { txBox: true, text: para('Cheeseboard logistics for everyone', { sz: 22, bullet: true }) + para('Second reason to attend the dinner', { sz: 22, bullet: true }) + para('Third reason that is long enough to count', { sz: 22, bullet: true }) }) + sp(4, 'Brand', b(60, 480, 200, 30), { txBox: true, text: para('Acme Fenwick Co', { sz: 12 }) }),
    sp(2, 'Title', b(60, 40, 800, 70), { txBox: true, text: para('Gratitude from the Fenwick team', { sz: 32, b: true }) }) + sp(3, 'Left', b(60, 140, 400, 300), { txBox: true, text: para('Left column words about cheese', { sz: 20 }) }) + picture(5, 'Photo', b(500, 140, 400, 300), 'rId5') + sp(4, 'Brand', b(60, 480, 200, 30), { txBox: true, text: para('Acme Fenwick Co', { sz: 12 }) }),
    sp(2, 'Big', b(60, 120, 400, 140), { txBox: true, text: para('86%', { sz: 80, b: true }) }) + sp(3, 'Cap', b(60, 270, 800, 60), { txBox: true, text: para('of guests came back for dessert', { sz: 22 }) }) + sp(4, 'Mail', b(60, 400, 600, 40), { txBox: true, text: para('Contact hello@fenwick-society.example', { sz: 18 }) }) + sp(5, 'Brand', b(60, 480, 200, 30), { txBox: true, text: para('Acme Fenwick Co', { sz: 12 }) }),
    sp(2, 'Thanks', b(60, 200, 800, 100), { txBox: true, text: para('Thank you for coming', { sz: 48, b: true, algn: 'ctr' }) }) + sp(4, 'Brand', b(60, 480, 200, 30), { txBox: true, text: para('Acme Fenwick Co', { sz: 12 }) }),
  ],
  slideRels: { 2: [{ id: 'rId5', type: 'image', target: '../media/p.png' }] },
  media: { 'p.png': testPng(400, 300) },
})

const form = (bytes: Uint8Array, name: string) => { const f = new FormData(); f.set('file', new File([Buffer.from(bytes)], name)); return f }
const upload = (cookie: string, bytes: Uint8Array, name = 'Fenwick Dinner.pptx') => app.request('/api/v1/file-templates', { method: 'POST', headers: { Cookie: cookie }, body: form(bytes, name) })
const start = (cookie: string, body: Record<string, unknown>) => app.request('/api/v1/generation/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ idempotencyKey: `k-${rid()}-${rid()}`, ...body }) })
async function drain(jobId: string) {
  for (let i = 0; i < 25; i++) {
    const [job] = await db.select().from(generationJob).where(eq(generationJob.id, jobId))
    if (['completed', 'failed', 'cancelled'].includes(job!.status)) return job!
    await processOne()
  }
  throw new Error('job did not finish')
}
const deckOf = async (cookie: string, id: string) => (await json(await api(cookie, 'GET', `/presentations/${id}`))).data as { revision: number; document: Presentation }
const wordsOf = (doc: Presentation) => doc.slides.flatMap((s) => s.elements.flatMap((e) => (e.type === 'text' ? e.paragraphs.flatMap((p) => p.runs.map((r) => r.text)) : e.type === 'table' ? [...e.header, ...e.rows.flat()] : [])))
const balance = async (id: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, id)))[0]?.balance ?? 0

let proUser: { id: string; cookie: string }
let tplId: string
/** a Pro person with an uploaded design (each block uses its own: /jobs is limited to 10 a minute and 2 running jobs per person) */
async function proWithTemplate() { const u = await signUp('ftw'); await setPlan(u.id, 'pro'); const id = (await json(await upload(u.cookie, fixture()))).data.id as string; return { ...u, tplId: id } }
beforeAll(async () => {
  setStorage(mem())
  proUser = await signUp('ft')
  await setPlan(proUser.id, 'pro')
  const res = await upload(proUser.cookie, fixture())
  expect(res.status).toBe(201)
  tplId = (await json(res)).data.id
}, 60_000)

describe('plan gate (server-side, never the browser)', () => {
  it('Starter is refused on upload and on starting a deck, with the upgrade details; Pro, Gold and Premium are allowed', async () => {
    const s = await signUp('fts')
    const up = await upload(s.cookie, fixture())
    expect(up.status).toBe(403)
    expect((await json(up)).error).toMatchObject({ code: 'UPGRADE_REQUIRED', details: { feature: 'templateFromFile' } })
    const job = await start(s.cookie, { prompt: 'A deck about cheese', fromTemplateId: tplId })
    expect(job.status).toBe(403)
    expect((await json(job)).error).toMatchObject({ code: 'UPGRADE_REQUIRED', details: { feature: 'templateFromFile' } })
    for (const plan of ['gold', 'premium'] as const) {
      const u = await signUp('ftp'); await setPlan(u.id, plan)
      expect((await upload(u.cookie, fixture())).status).toBe(201)
    }
  })

  it('the flag is one value per plan: turning it off for a plan refuses that plan', async () => {
    const { plan } = await import('../db/schema.ts')
    const [row] = await db.select().from(plan).where(eq(plan.id, 'pro'))
    try {
      await db.update(plan).set({ features: { ...(row!.features as object), templateFromFile: false } as never }).where(eq(plan.id, 'pro'))
      const r = await upload(proUser.cookie, fixture())
      expect(r.status).toBe(403)
      expect((await json(await start(proUser.cookie, { prompt: 'A deck about cheese', fromTemplateId: tplId }))).error.details.feature).toBe('templateFromFile')
    } finally { await db.update(plan).set({ features: row!.features as never }).where(eq(plan.id, 'pro')) }
  })
})

describe('routes: upload, list, one, layouts, delete, isolation', () => {
  it('upload returns a summary; list is newest first with a thumbnail slide; one design has its slides; layouts carry placeholders, never the file\'s words', async () => {
    const list = (await json(await api(proUser.cookie, 'GET', '/file-templates'))).data.templates
    expect(list[0]).toMatchObject({ id: tplId, name: 'Fenwick Dinner', slideCount: 5, aspect: '16:9' })
    expect(list[0].cover.elements.length).toBeGreaterThan(0)
    const one = (await json(await api(proUser.cookie, 'GET', `/file-templates/${tplId}`))).data
    expect(one.summary.layouts).toHaveLength(5)
    expect(one.summary.layouts.map((l: any) => l.kind)).toEqual(['cover', 'content', 'content', 'content', 'closing'])
    expect(one.slides).toHaveLength(5)
    const lay = (await json(await api(proUser.cookie, 'GET', `/file-templates/${tplId}/layouts`))).data
    expect(lay.layouts).toHaveLength(5)
    const text = JSON.stringify(lay.layouts)
    for (const w of SAMPLE_WORDS.filter((x) => x !== 'Acme Fenwick Co')) expect(text).not.toContain(w)
  })

  it('a text PDF becomes a design like a .pptx; a PDF of pictures or a portrait document is refused with the reason; a file that is not a presentation keeps its code', async () => {
    const pu = await signUp('ftpdf'); await setPlan(pu.id, 'pro') // its own person: uploads are limited to 6 a minute
    const good = await upload(pu.cookie, sampleDeckPdf(), 'Orbit deck.pdf')
    expect(good.status).toBe(201)
    const made = (await json(good)).data
    expect(made.slideCount).toBe(4)
    const one = (await json(await api(pu.cookie, 'GET', `/file-templates/${made.id}`))).data
    expect(one.aspect).toBe('16:9')
    expect(one.slides).toHaveLength(4)
    expect(one.theme.colors.background).toBe('#0B1220')
    const lay = (await json(await api(pu.cookie, 'GET', `/file-templates/${made.id}/layouts`))).data
    expect(JSON.stringify(lay.layouts)).not.toContain('Mission to Mars')
    expect((await api(pu.cookie, 'DELETE', `/file-templates/${made.id}`)).status).toBe(200)
    const pictures = await upload(pu.cookie, picturePagesPdf(), 'scan.pdf')
    expect(pictures.status).toBe(422)
    expect((await json(pictures)).error).toMatchObject({ code: 'PARSE_FAILED', message: expect.stringMatching(/pictures.*upload the \.pptx/i) })
    const portrait = await upload(pu.cookie, portraitPdf(), 'letter.pdf')
    expect(portrait.status).toBe(422)
    expect((await json(portrait)).error.message).toMatch(/portrait document/)
    expect((await json(await upload(pu.cookie, new TextEncoder().encode('just words'), 'notes.txt'))).error.code).toBe('NOT_A_PRESENTATION')
    expect((await upload(pu.cookie, new TextEncoder().encode('PK\u0003\u0004 not really'), 'x.pptx')).status).toBe(422)
  })

  it('another person cannot list, read, use or delete my design', async () => {
    const other = await signUp('fto'); await setPlan(other.id, 'pro')
    expect((await json(await api(other.cookie, 'GET', '/file-templates'))).data.templates).toEqual([])
    expect((await api(other.cookie, 'GET', `/file-templates/${tplId}`)).status).toBe(404)
    expect((await api(other.cookie, 'GET', `/file-templates/${tplId}/layouts`)).status).toBe(404)
    expect((await api(other.cookie, 'DELETE', `/file-templates/${tplId}`)).status).toBe(404)
    const job = await start(other.cookie, { prompt: 'A deck about cheese', fromTemplateId: tplId })
    expect(job.status).toBe(404)
    expect((await api(proUser.cookie, 'GET', `/file-templates/${tplId}`)).status).toBe(200) // still mine
    expect((await app.request('/api/v1/file-templates')).status).toBe(401)
  })

  it('a person keeps at most MAX_USER_TEMPLATES designs; the 21st is refused before the file is read', async () => {
    const u = await signUp('ftc'); await setPlan(u.id, 'pro')
    const t = (await getUserTemplate(proUser.id, tplId))!.template
    await db.insert(userTemplate).values(Array.from({ length: MAX_USER_TEMPLATES }, (_, i) => ({ id: `cap-${u.id}-${i}`.slice(0, 40), userId: u.id, name: `T${i}`, sourceFilename: 't.pptx', aspect: '16:9', slideCount: 1, data: { ...t } as never })))
    const r = await upload(u.cookie, fixture())
    expect(r.status).toBe(429)
    expect((await json(r)).error).toMatchObject({ code: 'LIMIT_REACHED' })
    expect((await json(await api(u.cookie, 'GET', '/file-templates'))).data.templates).toHaveLength(MAX_USER_TEMPLATES)
  })

  it('uploads are rate limited per person', async () => {
    const u = await signUp('ftr'); await setPlan(u.id, 'pro')
    const codes: number[] = []
    for (let i = 0; i < 8; i++) codes.push((await app.request('/api/v1/file-templates', { method: 'POST', headers: { Cookie: u.cookie }, body: new FormData() })).status)
    expect(codes.slice(0, 6).every((c) => c === 400)).toBe(true)
    expect(codes.slice(6)).toEqual([429, 429])
  })

  it('deleting removes it for good', async () => {
    const u = await signUp('ftd'); await setPlan(u.id, 'pro')
    const id = (await json(await upload(u.cookie, fixture()))).data.id
    expect((await api(u.cookie, 'DELETE', `/file-templates/${id}`)).status).toBe(200)
    expect((await api(u.cookie, 'GET', `/file-templates/${id}`)).status).toBe(404)
    expect((await api(u.cookie, 'DELETE', `/file-templates/${id}`)).status).toBe(404)
  })
})

describe('option rules', () => {
  let opt: Awaited<ReturnType<typeof proWithTemplate>>
  beforeAll(async () => { opt = await proWithTemplate() })
  it.each([
    ['remix', { remixOf: 'abc', sourceIds: [] }],
    ['rewrite', { targetPresentationId: 'abc' }],
    ['picturesOnly', { picturesOnly: true }],
    ['morph', { morph: true }],
    ['a Morph template', { morphTemplate: 'aurora' }],
    ['a template design', { designId: 'cobalt' }],
    ['a brand kit', { brandKitId: 'kit' }],
  ])('cannot be combined with %s (400)', async (_n, extra) => {
    const r = await start(opt.cookie, { prompt: 'A deck about cheese', fromTemplateId: opt.tplId, ...extra })
    expect(r.status).toBe(400)
    expect((await json(r)).error.code).toBe('INVALID_REQUEST')
  })

  it('an unknown or malformed design is a 404', async () => {
    expect((await start(opt.cookie, { prompt: 'A deck about cheese', fromTemplateId: 'nope' })).status).toBe(404)
  })

  it('the slide count: the person\'s number wins, otherwise the template\'s own, never above the plan (Pro: 15)', async () => {
    const u = await signUp('ftn'); await setPlan(u.id, 'pro')
    const id = (await json(await upload(u.cookie, fixture()))).data.id
    const slides = async (extra: object) => { const j = await drain((await json(await start(u.cookie, { prompt: 'A deck about cheese for the society', templateMode: 'manual', fromTemplateId: id, ...extra }))).data.id); return (await deckOf(u.cookie, j.presentationId!)).document.slides.length }
    expect(await slides({})).toBe(5)
    expect(await slides({ slideCount: 9 })).toBe(9)
    const tooMany = await start(u.cookie, { prompt: 'A deck about cheese for the society', templateMode: 'manual', fromTemplateId: id, slideCount: 30 })
    expect(tooMany.status).toBe(403) // the plan's slide limit
  })
})

describe('slide choice (assignSlides)', () => {
  let tpl: UploadedTemplate
  beforeAll(async () => { tpl = (await getUserTemplate(proUser.id, tplId))!.template })

  it('finds the cover and the closing slide from position and pattern', () => {
    const c = classifySlides(tpl)
    expect(c.cover).toBe(0)
    expect(c.closing).toBe(4)
  })

  it('cover first, closing last, never an unknown index, whatever the model says', () => {
    const a = assignSlides(tpl, 7, [4, 99, -3, 1.5, 2, 'x' as never, 0])
    expect(a[0]).toBe(0)
    expect(a[6]).toBe(4)
    expect(a.every((i) => Number.isInteger(i) && i >= 0 && i < 5)).toBe(true)
    expect(a.slice(1, -1).every((i) => i !== 0 && i !== 4)).toBe(true)
  })

  it('no template slide twice in a row; with more slides than the template, layouts repeat evenly', () => {
    const a = assignSlides(tpl, 14, undefined)
    for (let i = 1; i < a.length; i++) expect(a[i]).not.toBe(a[i - 1])
    const mid = a.slice(1, -1)
    const counts = [1, 2, 3].map((k) => mid.filter((x) => x === k).length)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
    expect(a.filter((x) => x === 0)).toHaveLength(1)
    expect(a.filter((x) => x === 4)).toHaveLength(1)
  })

  it('a model that spams one layout is corrected (at most ceil(middle / pool) uses of any slide)', () => {
    const a = assignSlides(tpl, 11, Array(11).fill(2))
    const mid = a.slice(1, -1)
    expect(Math.max(...[1, 2, 3].map((k) => mid.filter((x) => x === k).length))).toBeLessThanOrEqual(Math.ceil(9 / 3))
  })

  it('fewer slides than the template: a subset, still cover first and closing last, each used once', () => {
    const a = assignSlides(tpl, 3, [0, 3, 4])
    expect(a).toEqual([0, 3, 4])
    expect(assignSlides(tpl, 2)).toEqual([0, 4])
    expect(assignSlides(tpl, 1)).toEqual([0])
  })

  it('no proposal at all: the template\'s own order', () => {
    expect(assignSlides(tpl, 5)).toEqual([0, 1, 2, 3, 4])
  })

  it('the model\'s words follow the slide the code actually uses (matched by role)', () => {
    const fill: UploadedFill = { title: 'T', chrome: {}, slides: [{ use: 0, fields: {} }, { use: 1, fields: Object.fromEntries(tpl.slides[1]!.slots.map((s) => [s.elementId, `words for ${s.role}`])) }] }
    const aligned = alignFill(tpl, [0, 2], fill)
    expect(aligned.slides[1]!.use).toBe(2)
    expect(Object.values(aligned.slides[1]!.fields)).toContain('words for title')
  })

  it('the model\'s reply is validated by shape', () => {
    expect(uploadedFillSchema.safeParse({ title: 'x', slides: [{ use: 1.5, fields: {} }] }).success).toBe(false)
    expect(uploadedFillSchema.safeParse({ title: 'x', slides: [{ use: 1, fields: { a: 'b' } }] }).success).toBe(true)
  })
})

describe('manual mode: no AI, no sample words', () => {
  it('makes the deck from the file\'s slides with role placeholders, costs nothing, uses no model, and is a valid deck', async () => {
    const m = await proWithTemplate()
    const before = await balance(m.id)
    const events = (await db.select().from(aiUsageEvent).where(eq(aiUsageEvent.userId, m.id))).length
    const r = await start(m.cookie, { prompt: 'My own deck', templateMode: 'manual', fromTemplateId: m.tplId })
    expect(r.status).toBe(201)
    const job = await drain((await json(r)).data.id)
    expect(job.status).toBe('completed')
    expect(await balance(m.id)).toBe(before)
    expect((await db.select().from(aiUsageEvent).where(eq(aiUsageEvent.userId, m.id))).length).toBe(events)
    const { document: doc } = await deckOf(m.cookie, job.presentationId!)
    expect(presentationSchema.safeParse(doc).success).toBe(true)
    expect(doc.templateId).toBe(m.tplId)
    expect(doc.slides).toHaveLength(5)
    expect(doc.title).toBe('Fenwick Dinner')
    const blob = JSON.stringify(doc)
    for (const w of SAMPLE_WORDS.filter((x) => x !== 'Acme Fenwick Co')) expect(blob).not.toContain(w)
    const words = wordsOf(doc)
    expect(words).toContain('Add your title')
    expect(words.some((w) => /^Add /.test(w))).toBe(true)
    // the repeated brand label is the file's own design text: kept in manual mode
    expect(words.filter((w) => w === 'Acme Fenwick Co').length).toBeGreaterThan(0)
    expect(doc.slides.every((s) => s.manual && s.ownLook && !s.writing)).toBe(true)
    // the photo box is the editor's "picture goes here" (no picture of the uploader's)
    const images = doc.slides.flatMap((s) => s.elements.filter((e) => e.type === 'image'))
    expect(images.some((e) => e.type === 'image' && !e.src)).toBe(true)
  })
})

describe('AI mode (mock model)', () => {
  let docA: Presentation
  let jobA: typeof generationJob.$inferSelect
  let ai: Awaited<ReturnType<typeof proWithTemplate>>
  beforeAll(async () => {
    ai = await proWithTemplate()
    const r = await start(ai.cookie, { prompt: 'Create a deck about volcano safety for school children', fromTemplateId: ai.tplId, slideCount: 7 })
    expect(r.status).toBe(201)
    jobA = await drain((await json(r)).data.id)
    docA = (await deckOf(ai.cookie, jobA.presentationId!)).document
  }, 60_000)

  it('completes with the template\'s own theme, aspect, fonts and a valid document; the deck holds the requested number of slides', () => {
    expect(jobA.status).toBe('completed')
    expect(presentationSchema.safeParse(docA).success).toBe(true)
    expect(docA.slides).toHaveLength(7)
  })

  it('the look is the file\'s: theme and every slide\'s background/look flags', async () => {
    const t = (await getUserTemplate(ai.id, ai.tplId))!.template
    expect(docA.theme).toEqual(t.theme)
    expect(docA.aspectRatio).toBe(t.aspect)
    expect(docA.theme.fonts.heading).toBe('Georgia')
    expect(docA.slides.every((s) => s.manual && s.ownLook)).toBe(true)
    expect(docA.slides[0]!.background).toEqual(t.slides[0]!.slide.background)
  })

  it('no word of the file\'s own samples ships; the words are about the new topic', () => {
    const blob = [docA.title, ...wordsOf(docA), ...docA.slides.map((x) => x.speakerNotes)].join(' ') // (the theme's name is the file's name: the person's own label)
    for (const w of ['Zorblax', 'Fenwick', 'Sprocket', 'Cheeseboard', 'hello@fenwick', 'dessert']) expect(blob).not.toContain(w)
    expect(wordsOf(docA).some((w) => /volcano/i.test(w))).toBe(true)
  })

  it('numbers and details: the request gave no figure, so a figure box and a contact box are left out (not filled, not the sample)', () => {
    const blob = wordsOf(docA).join(' ')
    expect(blob).not.toMatch(/\d/)
    expect(blob).not.toMatch(/@/)
  })

  it('nothing overflows its box (the deck validator\'s own measure)', () => {
    const report = validateDeck(docA)
    const overflow = report.slides.flatMap((s) => s.issues).filter((i) => i.code === 'overflow')
    expect(overflow).toEqual([])
  })

  it('the cover is the first slide and the closing slide the last', async () => {
    const t = (await getUserTemplate(ai.id, ai.tplId))!.template
    const ids = (s: Presentation['slides'][number]) => new Set(s.elements.map((e) => e.id.split(':')[1]))
    const tplIds = (k: number) => new Set(t.slides[k]!.slide.elements.map((e) => e.id))
    expect([...ids(docA.slides[0]!)].every((x) => tplIds(0).has(x!))).toBe(true)
    expect([...ids(docA.slides[6]!)].every((x) => tplIds(4).has(x!))).toBe(true)
  })

  it('the repeated brand label was replaced once for the whole deck (not "Acme Fenwick Co")', () => {
    expect(wordsOf(docA).filter((w) => w === 'Acme Fenwick Co')).toEqual([])
  })

  it('a replaceable photo is never the uploader\'s picture: with no match found it is the "picture goes here" box', () => {
    const images = docA.slides.flatMap((s) => s.elements.filter((e) => e.type === 'image'))
    expect(images.length).toBeGreaterThan(0)
    expect(images.every((e) => e.type === 'image' && !e.src)).toBe(true)
  })

  it('element ids are stable: <slide id>:<template element id>, and building the same deck again gives the same ids', async () => {
    const t = (await getUserTemplate(ai.id, ai.tplId))!.template
    expect(docA.slides.every((s) => s.elements.every((e) => e.id.startsWith(`${s.id}:`)))).toBe(true)
    const idsOf = (d: Presentation) => d.slides.map((s) => s.elements.map((e) => e.id))
    const again = buildDeck({ tpl: t, assignment: [0, 1, 2, 3, 4], slideIds: ['a', 'b', 'c', 'd', 'e'], mode: 'manual', rules: { allowedNumbers: new Set(), figuresAllowed: false }, title: 't', language: 'en', sources: [] })
    const twice = buildDeck({ tpl: t, assignment: [0, 1, 2, 3, 4], slideIds: ['a', 'b', 'c', 'd', 'e'], mode: 'manual', rules: { allowedNumbers: new Set(), figuresAllowed: false }, title: 't', language: 'en', sources: [] })
    expect(idsOf(again.doc)).toEqual(idsOf(twice.doc))
  })

  it('uses the usual ledger types and credits for a new presentation', async () => {
    const types = (await db.select().from(aiUsageEvent).where(eq(aiUsageEvent.userId, ai.id))).map((e) => e.requestType)
    expect(types).toContain('outline_generation')
    expect(types).toContain('prompt_analysis')
    expect(types).not.toContain('slide_content')
  })

  it('saves through the real save route and reloads', async () => {
    const cur = await deckOf(ai.cookie, jobA.presentationId!)
    const res = await api(ai.cookie, 'PUT', `/presentations/${jobA.presentationId}`, { baseRevision: cur.revision, document: { ...cur.document, title: 'Edited title' } })
    expect(res.status).toBe(200)
    expect((await deckOf(ai.cookie, jobA.presentationId!)).document.templateId).toBe(ai.tplId)
  })

  it('deleting the design leaves the deck working; the editor menu then finds nothing', async () => {
    const u = await signUp('ftz'); await setPlan(u.id, 'pro')
    const id = (await json(await upload(u.cookie, fixture()))).data.id
    const job = await drain((await json(await start(u.cookie, { prompt: 'Deck about glaciers and ice', fromTemplateId: id, templateMode: 'manual' }))).data.id)
    expect((await api(u.cookie, 'DELETE', `/file-templates/${id}`)).status).toBe(200)
    const cur = await deckOf(u.cookie, job.presentationId!)
    expect(presentationSchema.safeParse(cur.document).success).toBe(true)
    expect((await api(u.cookie, 'PUT', `/presentations/${job.presentationId}`, { baseRevision: cur.revision, document: { ...cur.document, title: 'Still saves' } })).status).toBe(200)
    expect((await api(u.cookie, 'GET', `/file-templates/${id}/layouts`)).status).toBe(404)
  })

  it('a deck made from a template counts as an ordinary new presentation (quota)', async () => {
    const u = await signUp('ftq'); await setPlan(u.id, 'pro')
    const id = (await json(await upload(u.cookie, fixture()))).data.id
    const { makeDeck } = await import('../test-utils.ts')
    for (let i = 0; i < 15; i++) await makeDeck(u.id, 3) // Pro: 15 presentations a month
    const r = await start(u.cookie, { prompt: 'Deck about glaciers and ice', fromTemplateId: id, templateMode: 'manual' })
    expect(r.status).toBe(429)
    expect((await json(r)).error).toMatchObject({ code: 'LIMIT_REACHED', details: { feature: 'presentations' } })
  }, 60_000)
})

describe('the words never copy the sample (buildDeck)', () => {
  let tpl: UploadedTemplate
  beforeAll(async () => { tpl = (await getUserTemplate(proUser.id, tplId))!.template })
  const rules = { allowedNumbers: new Set<string>(), figuresAllowed: false }
  const build = (fill: UploadedFill, mode: 'ai' | 'manual' = 'ai') => buildDeck({ tpl, assignment: [0, 1, 2, 3, 4], slideIds: ['a', 'b', 'c', 'd', 'e'], mode, fill, rules, title: 'Volcano safety', language: 'en', sources: [] })

  it('a box the model skipped gets a short stand-in from the deck\'s title, never the sample', () => {
    const { doc, report } = build({ title: 'Volcano safety', chrome: {}, slides: tpl.slides.map((_, i) => ({ use: i, fields: {} })) })
    const blob = JSON.stringify(doc)
    expect(blob).not.toContain('Zorblax')
    expect(blob).not.toContain('Sprocket')
    expect(report.boxesWithoutWords).toBeGreaterThan(0)
  })

  it('a long answer is fitted to the box and a figure the user did not give is removed', () => {
    const long = 'word '.repeat(300)
    const { doc } = build({ title: 'T', chrome: {}, slides: tpl.slides.map((s, i) => ({ use: i, fields: Object.fromEntries(s.slots.map((x) => [x.elementId, x.numeric ? '86%' : `${long} 4521`])) })) })
    for (const s of doc.slides) for (const e of s.elements) if (e.type === 'text') {
      const txt = e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' ')
      expect(txt).not.toContain('4521')
      expect(txt.length).toBeLessThan(560) // the biggest box of the fixture holds about 500 letters; 300 words were asked for
    }
    expect(validateDeck(doc).slides.flatMap((s) => s.issues).filter((i) => i.code === 'overflow')).toEqual([])
  })

  it('keeps the sample paragraph\'s style (size, weight, colour) and drops its links', () => {
    const { doc } = build({ title: 'T', chrome: {}, slides: tpl.slides.map((s, i) => ({ use: i, fields: Object.fromEntries(s.slots.map((x) => [x.elementId, 'Brief words'])) })) })
    const t0 = doc.slides[0]!.elements.find((e) => e.type === 'text') as TextElement
    const o0 = tpl.slides[0]!.slide.elements.find((e) => e.type === 'text') as TextElement
    expect(t0.fontSize).toBe(o0.fontSize)
    expect(t0.paragraphs[0]!.runs[0]!.link).toBeUndefined()
  })

  describe('charts are kept, never with the file\'s data', () => {
    const withChart = () => {
      const t2 = structuredClone(tpl)
      t2.slides[1]!.slide.elements.push({ type: 'chart', id: 'c1', x: 10, y: 20, width: 600, height: 300, rotation: 0, locked: false, zIndex: 50, opacity: 1, chartType: 'bar', labels: ['Mercury', 'Venus'], unit: 'USD', series: [{ name: 'Zorblax Sales', values: [41, 87] }] } as never)
      t2.slides[1]!.slide.elements.push({ type: 'table', id: 't1', x: 0, y: 0, width: 300, height: 200, rotation: 0, locked: false, zIndex: 51, opacity: 1, header: ['Region', 'Revenue'], rows: [['North', '4,132'], ['South', '9,901']] } as never)
      return t2
    }
    const chartOf = (doc: Presentation) => doc.slides[0]!.elements.find((e) => e.type === 'chart') as Extract<Presentation['slides'][number]['elements'][number], { type: 'chart' }> | undefined
    const mk = (t2: UploadedTemplate, mode: 'ai' | 'manual', charts: unknown, allowed: string[], figuresAllowed: boolean) => buildDeck({
      tpl: t2, assignment: [1], slideIds: ['x'], mode, rules: { allowedNumbers: new Set(allowed), figuresAllowed }, title: 't', language: 'en', sources: [],
      ...(mode === 'ai' ? { fill: { title: 'T', chrome: {}, slides: [{ use: 1, fields: {}, charts: charts as never }] } } : {}),
    })

    it('manual mode: the chart stays in place with Item labels, stepped sample values and placeholder: true; tables keep their shape with stand-in words', () => {
      const { doc, report } = mk(withChart(), 'manual', {}, [], false)
      const c = chartOf(doc)!
      expect(c).toMatchObject({ x: 10, y: 20, width: 600, height: 300, chartType: 'bar', placeholder: true })
      expect(c.labels[0]).toBe('Item 1')
      expect(c.unit).toBeUndefined()
      expect(report).toMatchObject({ chartsKept: 1, chartsPlaceholder: 1 })
      expect(JSON.stringify(doc)).not.toMatch(/4,132|Zorblax Sales|North|Mercury|"unit":"USD"|\[41,87\]/)
      expect(presentationSchema.safeParse(doc).success).toBe(true)
    })

    it('AI mode with figures in the request: the chart carries exactly those figures and is not a placeholder', () => {
      const { doc, report } = mk(withChart(), 'ai', { c1: { labels: ['Pilots', 'Riders'], series: [{ name: 'Visitors', values: [120, 3.5] }], unit: '%' } }, ['120', '3.5'], true)
      const c = chartOf(doc)!
      expect(c.series).toEqual([{ name: 'Visitors', values: [120, 3.5] }])
      expect(c.labels).toEqual(['Pilots', 'Riders'])
      expect(c.placeholder).toBeUndefined()
      expect(report).toMatchObject({ chartsKept: 1, chartsPlaceholder: 0 })
    })

    it('AI mode: a figure the request did not contain (or no figures given at all) falls back to placeholder data', () => {
      const bad = { c1: { labels: ['A', 'B'], series: [{ name: 'S', values: [120, 999] }] } }
      expect(chartOf(mk(withChart(), 'ai', bad, ['120'], true).doc)!.placeholder).toBe(true)
      expect(chartOf(mk(withChart(), 'ai', { c1: { labels: ['A', 'B'], series: [{ name: 'S', values: [120, 130] }] } }, ['120', '130'], false).doc)!.placeholder).toBe(true)
      const wrongShape = { c1: { labels: ['A', 'B'], series: [{ name: 'S', values: [120] }] } }
      expect(chartOf(mk(withChart(), 'ai', wrongShape, ['120'], true).doc)!.placeholder).toBe(true)
      const noMatch = mk(withChart(), 'ai', bad, ['120'], true).doc
      expect(JSON.stringify(noMatch)).not.toMatch(/999|Zorblax Sales|Mercury/)
    })

    it('pie charts keep one series; the layout menu inserts a placeholder chart', () => {
      const t2 = withChart()
      ;(t2.slides[1]!.slide.elements.find((e) => e.type === 'chart') as { chartType: string }).chartType = 'pie'
      const { doc } = mk(t2, 'ai', { c1: { labels: ['A', 'B'], series: [{ name: 'S', values: [1.5, 2.5] }, { name: 'T', values: [3, 4] }] } }, ['1.5', '2.5', '3', '4'], true)
      expect(chartOf(doc)!.series).toHaveLength(1)
      const s = layoutSlide(t2, 1, 'lay')!
      expect((s.elements.find((e) => e.type === 'chart') as { placeholder?: boolean }).placeholder).toBe(true)
    })

    it('alignFill carries the model\'s chart data to the slide the code actually uses', () => {
      const t2 = withChart()
      const fill: UploadedFill = { title: 'T', chrome: {}, slides: [{ use: 1, fields: {}, charts: { c1: { labels: ['A'], series: [{ name: 'S', values: [5] }] } } }] }
      const out = alignFill(t2, [1], fill)
      expect(out.slides[0]!.charts?.['c1']).toBeTruthy()
    })
  })

  it('placeholders are role based, short, and a figure box holds "0"', () => {
    expect(placeholderFor({ role: 'title', lines: 1, maxChars: 40, numeric: false })).toBe('Add your title')
    expect(placeholderFor({ role: 'bullets', lines: 3, maxChars: 80, numeric: false }).split('\n')).toHaveLength(3)
    expect(placeholderFor({ role: 'body', lines: 1, maxChars: 80, numeric: true })).toBe('0')
  })

  it('layoutSlide (the editor menu): placeholders in every box, and the picture is a "picture goes here" box', () => {
    const s = layoutSlide(tpl, 2, 'layout')!
    expect(s.id).toBe('layout')
    expect(JSON.stringify(s)).not.toContain('Gratitude')
    expect(s.elements.some((e) => e.type === 'image' && !e.src)).toBe(true)
    expect(layoutSlide(tpl, 99, 'x')).toBeNull()
  })
})
