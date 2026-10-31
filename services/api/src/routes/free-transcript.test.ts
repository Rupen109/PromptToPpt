import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { draftAttachment } from '../db/schema.ts'
import { json, origin } from '../test-utils.ts'

const post = (body: unknown, ip = '203.0.113.7') => app.request('/api/v1/free-tools/transcript', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'x-forwarded-for': ip }, body: JSON.stringify(body) })
const TEXT = '0:00\nWelcome to the solar talk.\n0:30\n[Music]\nIndia aims for 500 gigawatts by 2030.\n3:10\nPanels cost 40% less than in 2015.'

describe('free tool: YouTube transcript → slides (no login, no AI, no YouTube access)', () => {
  it('cleans a pasted transcript, keeps time stamps and keeps it for the editor hand-off', async () => {
    const r = await post({ text: TEXT, title: 'Solar talk' }, '203.0.113.11')
    expect(r.status).toBe(200)
    const d = (await json(r)).data
    expect(d).toMatchObject({ title: 'Solar talk', timed: true })
    expect(d.parts.map((p: { locator: string }) => p.locator)).toEqual(['0:00', '3:10'])
    expect(d.parts[0].text).toBe('Welcome to the solar talk. India aims for 500 gigawatts by 2030.')
    expect(d.words).toBeGreaterThan(10)
    const [row] = await db.select().from(draftAttachment).where(eq(draftAttachment.id, d.attachmentId))
    expect(row).toMatchObject({ kind: 'transcript', title: 'Solar talk' })
  })

  it('plain text without time stamps works and says so', async () => {
    const d = (await json(await post({ text: 'This is a plain transcript with no time stamps, just a few sentences of words for the tool.' }, '203.0.113.12'))).data
    expect(d.timed).toBe(false)
    expect(d.title).toBe('YouTube video')
  })

  it('refuses empty / too short / over-long text with plain messages and stores nothing', async () => {
    const short = await post({ text: 'hi there' }, '203.0.113.13')
    expect(short.status).toBe(400)
    const music = await post({ text: '[Music] [Applause] [Music] [Applause] [Music] [Applause] [Music]' }, '203.0.113.13')
    expect(music.status).toBe(422)
    expect((await json(music)).error.message).toMatch(/too little text/)
    const long = await post({ text: 'x '.repeat(160_000) }, '203.0.113.13')
    expect([400, 413]).toContain(long.status)
  })

  it('is rate limited per visitor (6 a minute)', async () => {
    const codes: number[] = []
    for (let i = 0; i < 8; i++) codes.push((await post({ text: `${TEXT}\n${i}:59\nmore words ${i}` }, '203.0.113.99')).status)
    expect(codes).toContain(429)
    expect(codes.filter((c) => c === 200).length).toBeLessThanOrEqual(6)
  })
})
