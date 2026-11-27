import { eq, sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { pageReader } from '../ai/linked-pages.ts'
import { db } from '../db/index.ts'
import { creditBalance, creditLedger } from '../db/schema.ts'
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
    expect(body.data.creditsCharged).toBe(4)
    expect(await balance(u.id)).toBe(start - 4)
  })

  it('"update layout of slides 2-3": both slides change layout, keep their titles, the base edit + one more written slide', async () => {
    const { u, id, doc, start } = await setup('v2b')
    const { body } = await ask(u.cookie, id, 'update layout of slides 2-3, they look the same', { activeSlideId: doc.slides[0]!.id })
    expect(body.data.edits.map((e: any) => e.slideId)).toEqual([doc.slides[1]!.id, doc.slides[2]!.id])
    expect(body.data.edits.every((e: any) => e.content.layout !== 'title-body')).toBe(true)
    expect(body.data.edits[0].content.title).toBe('Point 1')
    expect(await balance(u.id)).toBe(start - 7)
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
    expect(await balance(free.id)).toBe(150)
    const { u, id } = await setup('v2i')
    const t = await ask(u.cookie, id, 'use a premium template')
    expect(t.body.data.theme).not.toBeNull()
    const ex = await ask(u.cookie, id, 'export it to pdf')
    expect(ex.body.data.notes.join(' ')).toMatch(/I can't do that yet: I cannot export\./) // said by code in one fixed shape, never the model's own wording
  })

  it('a model failure is refunded; retrying the same requestId is charged once', async () => {
    const { u, id, doc, start } = await setup('v2j')
    const fail = await ask(u.cookie, id, 'fail_please')
    expect(fail.status).toBe(503) // the gateway gave up on the model: "busy, you were not charged"
    expect(await balance(u.id)).toBe(start)
    const body = { instruction: 'shorten slide 2', requestId: `req-${rid()}-${rid()}`, activeSlideId: doc.slides[0]!.id }
    await api(u.cookie, 'POST', `/presentations/${id}/ai-assist`, body)
    await api(u.cookie, 'POST', `/presentations/${id}/ai-assist`, body)
    expect(await balance(u.id)).toBe(start - 4)
  })

  it('"This slide" mode: a deck-wide change is refused there and costs nothing', async () => {
    const { u, id, doc, start } = await setup('v2k')
    const { body } = await ask(u.cookie, id, 'make it a dark theme', { scope: 'slide', slideId: doc.slides[1]!.id })
    expect(body.data.theme).toBeNull()
    expect(body.data.notes[0]).toMatch(/Only the selected slide/)
    expect(await balance(u.id)).toBe(start)
  })

  it('past the daily allowance of free checks, a reply that changes nothing is CHARGED and the reply says so (never a silent charge)', async () => {
    const { u, id, start } = await setup('v2cap')
    const before = (await ask(u.cookie, id, 'how are you doing')).body.data
    expect(before).toMatchObject({ creditsCharged: 0 }) // inside the allowance: free
    const now = new Date()
    await db.insert(creditLedger).values(Array.from({ length: 25 }, (_, i) => ({ id: `cap-${rid()}-${i}`, userId: u.id, delta: 2, balanceAfter: start, reason: 'refund', refType: 'ai_assist', refId: `old-${i}`, idempotencyKey: `cap-key-${rid()}-${i}`, createdAt: now })))
    const after = (await ask(u.cookie, id, 'how are you doing')).body.data
    expect(after.creditsCharged).toBe(4)
    expect(after.notes.join(' ')).toMatch(/used today's 25 free checks and answers, so this reply used 4 credits/)
    expect(await balance(u.id)).toBe(start - 4)
  })
})

describe('a pasted link is charged only when its words are used', () => {
  const PAGE = { title: 'Launch notes', parts: [{ locator: null, text: 'The launch happens in March and has two partners. '.repeat(8) }] }
  it('the page is used to write: one unit for the edit, one for the page', async () => {
    const read = vi.spyOn(pageReader, 'read').mockResolvedValue(PAGE as never)
    const { u, id, doc, start } = await setup('v2link1')
    const { body } = await ask(u.cookie, id, 'shorten slide 2 using https://www.tata.com/newsroom/launch', { activeSlideId: doc.slides[0]!.id })
    read.mockRestore()
    expect(body.data.creditsCharged).toBe(8)
    expect(await balance(u.id)).toBe(start - 8)
  })
  it('the page is read but nothing needed it: the page is not charged, and the answer says so', async () => {
    const read = vi.spyOn(pageReader, 'read').mockResolvedValue(PAGE as never)
    const { u, id, doc, start } = await setup('v2link2')
    const { body } = await ask(u.cookie, id, 'lock slide 2, my notes are at https://www.tata.com/newsroom/launch', { activeSlideId: doc.slides[0]!.id })
    read.mockRestore()
    expect(body.data.creditsCharged).toBe(4)
    expect(body.data.notes.join(' ')).toMatch(/did not need the page you linked/)
    expect(await balance(u.id)).toBe(start - 4)
  })
})

describe('small talk: one short line, at once, free, no model asked', () => {
  it('"hii", "thanks" and "ok" each get one line (never the long list of what I can do)', async () => {
    const { u, id, start } = await setup('small')
    for (const [say, want] of [['hii', /^Hi! What would you like to change/], ['thanks!', /^You're welcome/], ['ok', /^Great\. Tell me what/]] as const) {
      const d = (await ask(u.cookie, id, say)).body.data
      expect(d.reply).toMatch(want)
      expect(d.reply.split('\n')).toHaveLength(1)
      expect(d.reply.length).toBeLessThan(80)
      expect(d.creditsCharged).toBe(0)
    }
    expect(await balance(u.id)).toBe(start)
  })
})

describe('quick edits (the editor\'s one-click menu): a fixed task on the slide on screen, no understanding step, the plan\'s prices', () => {
  const understood = async (since: Date) => (await db.execute(sql`select count(*)::int as n from ai_usage_event where request_type in ('assist_understand','assist_read') and created_at >= ${since.toISOString()}`)).rows[0] as { n: number }
  it('"Improve writing" rewrites only the current slide, never asks the model what was meant, and costs one AI edit', async () => {
    const { u, id, doc, start } = await setup('quick1')
    const t0 = new Date()
    const { status, body } = await ask(u.cookie, id, 'Improve writing', { quick: 'improve', scope: 'slide', slideId: doc.slides[2]!.id, activeSlideId: doc.slides[2]!.id })
    expect(status).toBe(200)
    expect(body.data.edits.map((e: any) => e.slideId)).toEqual([doc.slides[2]!.id])
    expect(body.data.creditsCharged).toBe(4)
    expect(await balance(u.id)).toBe(start - 4)
    expect((await understood(t0)).n).toBe(0)
  })
  it('every quick edit is one task the assistant accepts as it is (its family is ready, its values are valid for that family, it aims at the slide on screen)', async () => {
    const { QUICK_EDITS } = await import('@prompttoppt/validation')
    const { quickConfirm } = await import('./quick.ts')
    const { CAPABILITIES } = await import('./capabilities/index.ts')
    const { intentSchema } = await import('./understand.ts')
    for (const q of QUICK_EDITS) {
      const c = quickConfirm(q.id)
      const parsed = intentSchema.safeParse({ kind: 'edit', clarity: 'act', tasks: c.tasks })
      expect(parsed.success, `${q.id}: ${parsed.success ? '' : parsed.error.message}`).toBe(true)
      const t = c.tasks[0]!
      expect(CAPABILITIES[t.family as keyof typeof CAPABILITIES]?.values.safeParse(t.values).success, `${q.id} values`).toBe(true)
      expect(t.targets).toEqual([{ by: 'current' }])
    }
  })
  it('an unknown quick edit is refused before anything runs or is charged; Starter is sent to the upgrade', async () => {
    const { u, id, doc, start } = await setup('quick3')
    expect((await ask(u.cookie, id, 'Do it', { quick: 'make_it_pop', scope: 'slide', slideId: doc.slides[0]!.id })).status).toBe(400)
    expect(await balance(u.id)).toBe(start)
    const free = await signUp('quick3s'); const deck = await makeDeck(free.id, 3)
    expect((await ask(free.cookie, deck.id, 'Make shorter', { quick: 'shorten', scope: 'slide', slideId: deck.doc.slides[0]!.id })).status).toBe(403)
  })
})
