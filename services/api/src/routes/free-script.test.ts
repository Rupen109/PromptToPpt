import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { db } from '../db/index.ts'
import { draftAttachment } from '../db/schema.ts'
import { scriptSlideCount } from '../free-tools/prompts.ts'
import { json, origin } from '../test-utils.ts'

const post = (body: unknown) => app.request('/api/v1/free-tools/script', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) })
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')

// (The free-tool burst limit is 6 a minute per visitor and lives in memory, so this file stays under 6 calls.)
describe('free tool: video / Reel script → slides', () => {
  it('turns a pasted script into an outline, keeps the script for the editor hand-off, and scales the slide count with its length', async () => {
    const r = await post({ script: `Hook: rooftop solar pays back in 4.6 years. ${words(400)}`, kind: 'youtube' })
    expect(r.status).toBe(200)
    const d = (await json(r)).data
    expect(d.slides).toHaveLength(scriptSlideCount(words(407)))
    expect(d.slides.length).toBeGreaterThanOrEqual(5)
    const [row] = await db.select().from(draftAttachment).where(eq(draftAttachment.id, d.attachmentId))
    expect(row).toMatchObject({ kind: 'text' })
    expect(JSON.stringify(row!.parts)).toContain('rooftop solar pays back in 4.6 years')
  })

  it('refuses a too-short or too-long script, an unknown kind, and a failing model gives a plain answer', async () => {
    expect((await post({ script: 'hi' })).status).toBe(400)
    expect((await post({ script: 'a'.repeat(6001) })).status).toBe(400)
    expect((await post({ script: `${words(40)}`, kind: 'movie' })).status).toBe(400)
    const bad = await post({ script: `FAIL_PLEASE ${words(40)}` })
    expect(bad.status).toBeGreaterThanOrEqual(500)
  })

  it('the slide count rule: about one slide per 60 words, between 5 and 12', () => {
    expect([10, 300, 600, 1200, 5000].map((n) => scriptSlideCount(words(n)))).toEqual([5, 5, 10, 12, 12])
  })
})
