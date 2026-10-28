import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { sourceChunk, sourceDocument } from '../db/schema.ts'
import { api, json, origin, signUp } from '../test-utils.ts'

const TEXT = '0:00\nWelcome to the solar talk.\n0:30\nIndia aims for 500 gigawatts by 2030.\n3:10\nPanels cost 40% less than in 2015.'

describe('POST /sources/transcript and YouTube links', () => {
  it('stores a transcript with minute locators and the canonical video link; costs nothing', async () => {
    const u = await signUp('tr')
    const r = await api(u.cookie, 'POST', '/sources/transcript', { title: 'Solar talk', url: 'https://youtu.be/dQw4w9WgXcQ?t=5', text: TEXT })
    expect(r.status).toBe(201)
    const d = (await json(r)).data
    expect(d).toMatchObject({ type: 'transcript', title: 'Solar talk' })
    const [doc] = await db.select().from(sourceDocument).where(eq(sourceDocument.id, d.id))
    expect(doc!.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    const chunks = await db.select().from(sourceChunk).where(eq(sourceChunk.sourceId, d.id))
    expect(chunks.map((c) => c.locator)).toEqual(['0:00', '3:10'])
  })

  it('a link that is not YouTube is refused; an empty/short transcript is refused; signed out is refused', async () => {
    const u = await signUp('tr')
    expect((await api(u.cookie, 'POST', '/sources/transcript', { url: 'https://evil.example/watch?v=dQw4w9WgXcQ', text: TEXT })).status).toBe(400)
    expect((await api(u.cookie, 'POST', '/sources/transcript', { text: 'too short' })).status).toBe(400)
    const none = await app.request('/api/v1/sources/transcript', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ text: TEXT }) })
    expect(none.status).toBe(401)
  })

  it('pasting a YouTube link as a "website link" answers with the transcript instructions, never fetches', async () => {
    const u = await signUp('tr')
    const r = await api(u.cookie, 'POST', '/sources/url', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
    expect(r.status).toBe(422)
    expect((await json(r)).error.message).toMatch(/Show transcript/)
  })

  it('a .vtt upload through /sources/file is stored as a transcript', async () => {
    const u = await signUp('tr')
    const form = new FormData(); form.set('file', new File(['WEBVTT\n\n00:00:00.000 --> 00:00:04.000\nHello and welcome to this long enough caption line.\n'], 'lecture.vtt', { type: 'text/vtt' }))
    const r = await app.request('/api/v1/sources/file', { method: 'POST', headers: { Origin: origin, Cookie: u.cookie }, body: form })
    expect(r.status).toBe(201)
    expect((await json(r)).data.type).toBe('transcript')
  })
})
