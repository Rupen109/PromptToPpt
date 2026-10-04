import { eq } from 'drizzle-orm'
import { zipSync, strToU8 } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { app } from '../app.ts'
import { pageReader } from '../ai/linked-pages.ts'
import { db } from '../db/index.ts'
import { draftAttachment, sourceChunk, sourceDocument } from '../db/schema.ts'
import { fromFile, fromPptx, fromTextFile } from '../sources/extract.ts'
import { signUp } from '../test-utils.ts'

const slideXml = (...paras: string[][]) => `<?xml version="1.0"?><p:sld xmlns:a="x" xmlns:p="y"><p:cSld><p:spTree>${paras.map((runs) => `<p:sp><p:txBody><a:p>${runs.map((t) => `<a:r><a:t>${t}</a:t></a:r>`).join('')}</a:p></p:txBody></p:sp>`).join('')}</p:spTree></p:cSld></p:sld>`
const pptx = (slides: Record<number, string[][]>, notes: Record<number, string[][]> = {}) =>
  zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    ...Object.fromEntries(Object.entries(slides).map(([n, p]) => [`ppt/slides/slide${n}.xml`, strToU8(slideXml(...p))])),
    ...Object.fromEntries(Object.entries(notes).map(([n, p]) => [`ppt/notesSlides/notesSlide${n}.xml`, strToU8(slideXml(...p))])),
    'ppt/media/image1.png': new Uint8Array([1, 2, 3]),
  })

describe('PowerPoint (.pptx) and text extraction', () => {
  it('reads slide text and speaker notes in slide order (slide 2 before slide 10), with citation locators', () => {
    const bytes = pptx({ 10: [['Tenth']], 2: [['Second slide', ' heading'], ['Revenue grew 40% &amp; margins held']], 1: [['Title slide']] }, { 2: [['Mention the Q3 cohort']] })
    const ex = fromPptx(bytes, 'Board Q3.pptx')
    expect(ex.title).toBe('Board Q3')
    expect(ex.parts.map((p) => p.locator)).toEqual(['slide 1', 'slide 2', 'slide 10'])
    expect(ex.parts[1]!.text).toBe('Second slide heading\nRevenue grew 40% & margins held\n\nSpeaker notes: Mention the Q3 cohort')
  })

  it('rejects: old .ppt, non-zip, zip without slides, image-only decks, oversized (zip-bomb) entries', () => {
    expect(() => fromPptx(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0, 0]), 'old.ppt')).toThrow(/save as \.pptx/)
    expect(() => fromPptx(strToU8('hello world, definitely not a zip'), 'x.pptx')).toThrow(/not a PowerPoint/)
    expect(() => fromPptx(zipSync({ 'readme.txt': strToU8('hi') }), 'x.pptx')).toThrow(/No slides found/)
    expect(() => fromPptx(pptx({ 1: [] }), 'x.pptx')).toThrow(/No text found/)
    const bomb = zipSync({ 'ppt/slides/slide1.xml': new Uint8Array(9 * 1024 * 1024).fill(32) })
    expect(bomb.length).toBeLessThan(100_000) // compresses to almost nothing…
    expect(() => fromPptx(bomb, 'bomb.pptx')).toThrow(/too large or unusual/) // …but is never inflated
  })

  it('fromFile decides by CONTENT: a renamed pptx is still a pptx; a text file named .pdf is refused; binary "text" is refused', async () => {
    expect((await fromFile(pptx({ 1: [['Hello from slides']] }), 'renamed.pdf')).kind).toBe('pptx')
    expect((await fromFile(strToU8('Plain notes about the quarter, long enough to count.'), 'notes.txt')).kind).toBe('text')
    await expect(fromFile(strToU8('MZ not really a pdf'), 'evil.pdf')).rejects.toThrow(/Unsupported file type/)
    await expect(fromFile(new Uint8Array([65, 66, 0, 67, ...new Array(40).fill(65)]), 'bin.txt')).rejects.toThrow(/plain text/)
    expect(() => fromTextFile(strToU8('short'), 'a.txt')).toThrow(/too little text/)
  })
})

const send = (path: string, file: { bytes: Uint8Array; name: string }, cookie?: string) => {
  const fd = new FormData()
  fd.set('file', new File([Buffer.from(file.bytes)], file.name))
  return app.request(path, { method: 'POST', headers: cookie ? { Cookie: cookie } : {}, body: fd })
}
const json = async (r: Response) => (await r.json()) as any
const deck = { bytes: pptx({ 1: [['Quarterly review']], 2: [['Pipeline coverage fell to 2.1x'], ['Main risk: EMEA renewals']] }), name: 'review.pptx' }

describe('POST /sources/file', () => {
  it('needs login; accepts pptx and txt; reports unreadable files in plain words', async () => {
    expect((await send('/api/v1/sources/file', deck)).status).toBe(401)
    const { cookie } = await signUp('up')
    const ok = await json(await send('/api/v1/sources/file', deck, cookie))
    expect(ok.data).toMatchObject({ type: 'pptx', title: 'review' })
    const chunks = await db.select().from(sourceChunk).where(eq(sourceChunk.sourceId, ok.data.id))
    expect(chunks.map((c) => c.locator)).toContain('slide 2')
    expect((await json(await send('/api/v1/sources/file', { bytes: strToU8('Meeting notes: ship the beta on Friday, then review.'), name: 'n.md' }, cookie))).data.type).toBe('text')
    const bad = await send('/api/v1/sources/file', { bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]), name: 'old.ppt' }, cookie)
    expect(bad.status).toBe(422)
    expect((await json(bad)).error.message).toMatch(/save as \.pptx/)
  })
})

describe('landing-page drafts with attachments', () => {
  const postJson = (path: string, body: unknown, cookie?: string) => app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })
  const page = { title: 'Tata Aeris launch', parts: [{ locator: null, text: 'Tata Aeris is a new urban electric vehicle with a 450 km range and fast charging. '.repeat(3) }] }

  it('visitor attaches a file + a link, creates a draft; after login the claim turns them into the user’s private sources', async () => {
    const read = vi.spyOn(pageReader, 'read').mockResolvedValue(page)
    const file = await json(await send('/api/v1/drafts/attachments', deck)) // anonymous
    expect(file.data).toMatchObject({ kind: 'pptx', title: 'review' })
    const link = await json(await postJson('/api/v1/drafts/attachments/link', { url: 'https://www.tata.com/newsroom/aeris' }))
    expect(link.data).toMatchObject({ kind: 'url', title: 'Tata Aeris launch' })
    expect(read).toHaveBeenCalledWith('https://www.tata.com/newsroom/aeris')
    const draft = await json(await postJson('/api/v1/drafts', { prompt: 'Make a launch deck', attachmentIds: [file.data.id, link.data.id] }))
    expect(draft.success).toBe(true)

    const u = await signUp('up')
    const claim = await json(await postJson(`/api/v1/drafts/${draft.data.id}/claim`, {}, u.cookie))
    expect(claim.data.prompt).toBe('Make a launch deck')
    expect(claim.data.sourceIds).toHaveLength(2)
    const rows = await db.select().from(sourceDocument).where(eq(sourceDocument.userId, u.id))
    expect(rows.map((r) => `${r.type}:${r.title}`).sort()).toEqual(['pptx:review', 'url:Tata Aeris launch'])
    expect(rows.find((r) => r.type === 'url')!.url).toBe('https://www.tata.com/newsroom/aeris')
    // refresh → same sources, none duplicated
    const again = await json(await postJson(`/api/v1/drafts/${draft.data.id}/claim`, {}, u.cookie))
    expect(again.data.sourceIds.sort()).toEqual(claim.data.sourceIds.sort())
    expect(await db.select().from(sourceDocument).where(eq(sourceDocument.userId, u.id))).toHaveLength(2)
    read.mockRestore()
  })

  it('draft without attachments still works (prompt only, empty source list)', async () => {
    const draft = await json(await postJson('/api/v1/drafts', { prompt: 'Just a prompt' }))
    const u = await signUp('up')
    expect((await json(await postJson(`/api/v1/drafts/${draft.data.id}/claim`, {}, u.cookie))).data).toMatchObject({ prompt: 'Just a prompt', sourceIds: [] })
  })

  it('a draft belongs to one visitor: others cannot claim it or its files; attachments cannot be reused or limitless', async () => {
    const file = await json(await send('/api/v1/drafts/attachments', deck))
    const d1 = await json(await postJson('/api/v1/drafts', { prompt: 'mine', attachmentIds: [file.data.id] }))
    const owner = await signUp('up')
    const thief = await signUp('up')
    expect((await postJson(`/api/v1/drafts/${d1.data.id}/claim`, {}, owner.cookie)).status).toBe(200)
    expect((await postJson(`/api/v1/drafts/${d1.data.id}/claim`, {}, thief.cookie)).status).toBe(404)
    expect((await db.select().from(sourceDocument).where(eq(sourceDocument.userId, thief.id)))).toHaveLength(0)
    // already bound → refused for a second draft
    expect((await postJson('/api/v1/drafts', { prompt: 'reuse', attachmentIds: [file.data.id] })).status).toBe(400)
    // unknown / too many
    expect((await postJson('/api/v1/drafts', { prompt: 'x', attachmentIds: ['nope'] })).status).toBe(400)
    expect((await postJson('/api/v1/drafts', { prompt: 'x', attachmentIds: ['a', 'b', 'c', 'd', 'e', 'f'] })).status).toBe(400)
  })

  it('expired attachments are refused; bad uploads and blocked links are explained', async () => {
    const file = await json(await send('/api/v1/drafts/attachments', deck))
    await db.update(draftAttachment).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(draftAttachment.id, file.data.id))
    const res = await postJson('/api/v1/drafts', { prompt: 'late', attachmentIds: [file.data.id] })
    expect(res.status).toBe(400)
    expect((await json(res)).error.code).toBe('ATTACHMENT_EXPIRED')
    const bad = await send('/api/v1/drafts/attachments', { bytes: strToU8('MZ nope'), name: 'x.exe' })
    expect(bad.status).toBe(422)
    const blocked = await postJson('/api/v1/drafts/attachments/link', { url: 'http://169.254.169.254/latest/meta-data' })
    expect(blocked.status).toBe(400)
    expect((await json(blocked)).error.code).toBe('URL_NOT_ALLOWED')
  })
})
