import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../db/index.ts'
import { creditBalance } from '../db/schema.ts'
import { api, json, makeDeck, rid, setPlan, signUp } from '../test-utils.ts'

/** POST /ai-assist on the v2 pipeline (the default), with the mock model (src/ai/mock-assistant.ts). Pro plan, Gemini Flash credit class: one unit = 2 credits. */
const balance = async (id: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, id)))[0]!.balance
const ask = async (cookie: string, deckId: string, instruction: string, extra: object = {}) => {
  const res = await api(cookie, 'POST', `/presentations/${deckId}/ai-assist`, { instruction, requestId: `req-${rid()}-${rid()}`, ...extra })
  return { status: res.status, body: await json(res) }
}
async function setup(tag: string, slides = 4) {
  const u = await signUp(tag); await setPlan(u.id, 'pro') // AI edits are a paid feature (Starter has none)
  const { id, doc } = await makeDeck(u.id, slides)
  await api(u.cookie, 'GET', '/me/entitlements')
  return { u, id, doc, start: await balance(u.id) }
}

describe('POST /ai-assist (v2): understand → resolve → do → check', () => {
  it('a one-slide text edit costs one unit and returns the edit', async () => {
    const { u, id, doc, start } = await setup('v2a')
    const { body } = await ask(u.cookie, id, 'shorten slide 2', { activeSlideId: doc.slides[0]!.id })
    expect(body.data.edits).toHaveLength(1)
    expect(body.data.edits[0].slideId).toBe(doc.slides[1]!.id)
    expect(body.data.creditsCharged).toBe(2)
    expect(await balance(u.id)).toBe(start - 2)
  })

  it('"update layout of slides 2-3": both slides change layout, keep their titles, two units (more than one slide written)', async () => {
    const { u, id, doc, start } = await setup('v2b')
    const { body } = await ask(u.cookie, id, 'update layout of slides 2-3, they look the same', { activeSlideId: doc.slides[0]!.id })
    expect(body.data.edits.map((e: any) => e.slideId)).toEqual([doc.slides[1]!.id, doc.slides[2]!.id])
    expect(body.data.edits.every((e: any) => e.content.layout !== 'title-body')).toBe(true)
    expect(body.data.edits[0].content.title).toBe('Point 1')
    expect(await balance(u.id)).toBe(start - 4)
  })

  it('a first answer that misses (kept the layout) is checked and retried once, then applied', async () => {
    const { u, id, doc } = await setup('v2c')
    const { body } = await ask(u.cookie, id, 'lazy: change the layout of slide 2', { activeSlideId: doc.slides[0]!.id })
    expect(body.data.edits[0].content.layout).not.toBe('title-body')
  })

  it('chat, a question about the deck and a question back to the person are free', async () => {
    const { u, id, doc, start } = await setup('v2d')
    expect((await ask(u.cookie, id, 'hey')).body.data).toMatchObject({ creditsCharged: 0, applied: [] })
    const q = await ask(u.cookie, id, 'how many slides are there?')
    expect(q.body.data.reply).toBe('This deck has 4 slides.')
    const back = await ask(u.cookie, id, 'ask_please', { activeSlideId: doc.slides[1]!.id })
    expect(back.body.data).toMatchObject({ ask: true, options: [], reply: 'Do you mean the whole deck or only this slide?' })
    expect(await balance(u.id)).toBe(start)
  })

  it('a title that fits two slides is asked about with buttons, before anything is charged', async () => {
    const { u, id, start } = await setup('v2e')
    const { body } = await ask(u.cookie, id, 'shorten the point slide')
    expect(body.data.ask).toBe(true)
    expect(body.data.options.map((o: any) => o.label)).toEqual(['Slide 2 — Point 1', 'Slide 3 — Point 2', 'All of them'])
    expect(body.data.options[0].reply).toBe('shorten the point slide (slide 2)')
    expect(await balance(u.id)).toBe(start)
  })

  it('"add a thank you page and make it brown": the new slide has an id from the server and the colour is set on it', async () => {
    const { u, id, doc } = await setup('v2f')
    const { body } = await ask(u.cookie, id, 'add a thank you page and make it brown', { activeSlideId: doc.slides[0]!.id })
    expect(body.data.additions).toHaveLength(1)
    const newId = body.data.additions[0].id
    expect(newId).toBeTruthy()
    expect(body.data.backgrounds).toEqual([{ slideId: newId, color: '#7C2D12' }])
  })

  it('slide management comes back as exact editor changes: delete, move, duplicate', async () => {
    const { u, id, doc } = await setup('v2g')
    expect((await ask(u.cookie, id, 'delete slide 2')).body.data.removals).toEqual([doc.slides[1]!.id])
    expect((await ask(u.cookie, id, 'move slide 2 to the end')).body.data.moves).toEqual([{ slideId: doc.slides[1]!.id, afterSlideId: doc.slides[3]!.id }])
    expect((await ask(u.cookie, id, 'duplicate slide 3')).body.data.duplicates).toHaveLength(1)
  })

  it('undo of a recorded change is free; with nothing recorded it says so and costs nothing', async () => {
    const { u, id, doc, start } = await setup('v2h')
    const back = await ask(u.cookie, id, 'undo that', { recent: [{ theme: false, slideIds: [doc.slides[1]!.id], summary: ['Rewrote slide 2'] }] })
    expect(back.body.data.reverts).toEqual([{ change: 0, part: 'all' }])
    const none = await ask(u.cookie, id, 'undo that')
    expect(none.body.data.notes[0]).toMatch(/no earlier change of mine/)
    expect(await balance(u.id)).toBe(start)
  })

  it('Starter has no AI assistant (403, nothing charged); Pro applies premium templates; unsupported parts are said plainly', async () => {
    const free = await signUp('v2i0')
    const { id: freeDeck } = await makeDeck(free.id, 4)
    await api(free.cookie, 'GET', '/me/entitlements')
    const denied = await ask(free.cookie, freeDeck, 'animate every slide')
    expect(denied.status).toBe(403)
    expect(denied.body.error.code).toBe('UPGRADE_REQUIRED')
    expect(await balance(free.id)).toBe(100)
    const { u, id } = await setup('v2i')
    const t = await ask(u.cookie, id, 'use a premium template')
    expect(t.body.data.theme).not.toBeNull()
    const ex = await ask(u.cookie, id, 'export it to pdf')
    expect(ex.body.data.notes).toContain('I cannot export.')
  })

  it('a model failure is refunded; retrying the same requestId is charged once', async () => {
    const { u, id, doc, start } = await setup('v2j')
    const fail = await ask(u.cookie, id, 'fail_please')
    expect(fail.status).toBe(503) // the gateway gave up on the model: "busy, you were not charged"
    expect(await balance(u.id)).toBe(start)
    const body = { instruction: 'shorten slide 2', requestId: `req-${rid()}-${rid()}`, activeSlideId: doc.slides[0]!.id }
    await api(u.cookie, 'POST', `/presentations/${id}/ai-assist`, body)
    await api(u.cookie, 'POST', `/presentations/${id}/ai-assist`, body)
    expect(await balance(u.id)).toBe(start - 2)
  })

  it('"This slide" mode: a deck-wide change is refused there and costs nothing', async () => {
    const { u, id, doc, start } = await setup('v2k')
    const { body } = await ask(u.cookie, id, 'make it a dark theme', { scope: 'slide', slideId: doc.slides[1]!.id })
    expect(body.data.theme).toBeNull()
    expect(body.data.notes[0]).toMatch(/Only the selected slide/)
    expect(await balance(u.id)).toBe(start)
  })
})
