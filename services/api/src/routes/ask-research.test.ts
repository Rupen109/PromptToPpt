import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/index.ts'
import { aiUsageEvent, creditBalance, sourceChunk, sourceDocument } from '../db/schema.ts'
import { api, json, makeDeck, rid, setPlan, signUp } from '../test-utils.ts'

const wiki = vi.hoisted(() => ({ pages: [] as { title: string; url: string; text: string }[], fail: false }))
vi.mock('../research/wikipedia.ts', async (orig) => ({
  ...(await orig<typeof import('../research/wikipedia.ts')>()),
  searchWikipedia: async () => { if (wiki.fail) throw new Error('down'); return wiki.pages },
}))

const balance = async (id: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, id)))[0]!.balance
const ask = (cookie: string, id: string, question: string, extra: object = {}) => api(cookie, 'POST', `/presentations/${id}/ask`, { question, requestId: `q-${rid()}-${rid()}`, ...extra })
const research = (cookie: string, body: object) => api(cookie, 'POST', '/sources/research', { requestId: `r-${rid()}-${rid()}`, ...body })
const ARTICLE = 'Solar power is the conversion of energy from sunlight into electricity. '.repeat(8)

beforeEach(() => { wiki.pages = [{ title: 'Solar power', url: 'https://en.wikipedia.org/wiki/Solar_power', text: ARTICLE }, { title: 'Photovoltaics', url: 'https://en.wikipedia.org/wiki/Photovoltaics', text: ARTICLE }]; wiki.fail = false })

describe('Chat with your presentation (askDeck)', () => {
  it('Starter is refused with UPGRADE_REQUIRED and is not charged', async () => {
    const u = await signUp('ask'); const { id } = await makeDeck(u.id)
    const r = await ask(u.cookie, id, 'What is this about?')
    expect(r.status).toBe(403)
    expect((await json(r)).error).toMatchObject({ code: 'UPGRADE_REQUIRED', details: { feature: 'askDeck' } })
    expect(await db.select().from(aiUsageEvent).where(eq(aiUsageEvent.userId, u.id))).toHaveLength(0)
  })

  it('Pro: answers from the deck, points at real slides, charges the tier price once even when the request repeats', async () => {
    const u = await signUp('ask'); await setPlan(u.id, 'pro'); const { id, doc } = await makeDeck(u.id, 4)
    await json(await api(u.cookie, 'GET', '/me/entitlements'))
    const payload = { question: 'What does the deck say?', requestId: `q-${rid()}-${rid()}` }
    const r = await json(await api(u.cookie, 'POST', `/presentations/${id}/ask`, payload))
    expect(r.data.answer).toContain('Quarterly Review')
    expect(r.data.slides).toEqual([{ n: 1, id: doc.slides[0]!.id }])
    expect(r.data.creditsCharged).toBe(2) // default Pro model is premium tier
    const after = await balance(u.id)
    expect(after).toBe(3000 - 2)
    await api(u.cookie, 'POST', `/presentations/${id}/ask`, payload)
    expect(await balance(u.id)).toBe(after)
  })

  it('says so when the deck does not contain the answer (no slides cited)', async () => {
    const u = await signUp('ask'); await setPlan(u.id, 'pro'); const { id } = await makeDeck(u.id)
    const r = await json(await ask(u.cookie, id, 'something not in the deck please'))
    expect(r.data.slides).toEqual([])
  })

  it('slide numbers above the deck length are dropped, never shown', async () => {
    const u = await signUp('ask'); await setPlan(u.id, 'pro'); const { id } = await makeDeck(u.id, 3)
    const r = await json(await ask(u.cookie, id, 'where is it?'))
    expect(r.data.slides.every((s: { n: number }) => s.n >= 1 && s.n <= 3)).toBe(true)
  })

  it('a failing model refunds the charge; other users cannot ask about the deck; the question is validated', async () => {
    const u = await signUp('ask'); await setPlan(u.id, 'pro'); const { id } = await makeDeck(u.id)
    await json(await api(u.cookie, 'GET', '/me/entitlements'))
    const before = await balance(u.id)
    const fail = await ask(u.cookie, id, 'FAIL_PLEASE')
    expect(fail.status).toBe(503)
    expect(await balance(u.id)).toBe(before)
    const stranger = await signUp('ask'); await setPlan(stranger.id, 'pro')
    expect((await ask(stranger.cookie, id, 'hello there')).status).toBe(404)
    expect((await ask(u.cookie, id, '')).status).toBe(400)
    expect((await ask(u.cookie, id, 'x'.repeat(1001))).status).toBe(400)
    expect((await ask(u.cookie, id, 'ok then', { history: Array.from({ length: 9 }, () => ({ role: 'user', text: 'a' })) })).status).toBe(400)
  })

  it('records the call in the usage ledger as ask_deck', async () => {
    const u = await signUp('ask'); await setPlan(u.id, 'gold'); const { id } = await makeDeck(u.id)
    await ask(u.cookie, id, 'summary please')
    const rows = await db.select().from(aiUsageEvent).where(eq(aiUsageEvent.userId, u.id))
    expect(rows.some((r) => r.requestType === 'ask_deck')).toBe(true)
  })
})

describe('Wikipedia & web data (/sources/research)', () => {
  it('Starter is refused for both modes', async () => {
    const u = await signUp('res')
    for (const mode of ['wikipedia', 'web']) {
      const r = await research(u.cookie, { query: 'solar power', mode })
      expect(r.status).toBe(403)
      expect((await json(r)).error.details).toMatchObject({ feature: 'webData', mode })
    }
  })

  it('Pro: Wikipedia is free and saves each article as a source with its page link; web search is refused', async () => {
    const u = await signUp('res'); await setPlan(u.id, 'pro')
    await json(await api(u.cookie, 'GET', '/me/entitlements'))
    const r = await json(await research(u.cookie, { query: 'solar power', mode: 'wikipedia' }))
    expect(r.data.creditsCharged).toBe(0)
    expect(r.data.sources.map((s: any) => s.url)).toEqual(['https://en.wikipedia.org/wiki/Solar_power', 'https://en.wikipedia.org/wiki/Photovoltaics'])
    const rows = await db.select().from(sourceDocument).where(eq(sourceDocument.userId, u.id))
    expect(rows).toHaveLength(2)
    expect((await db.select().from(sourceChunk).where(eq(sourceChunk.sourceId, rows[0]!.id))).length).toBeGreaterThan(0)
    expect(await balance(u.id)).toBe(3000)
    const web = await research(u.cookie, { query: 'solar power', mode: 'web' })
    expect(web.status).toBe(403)
    expect(await balance(u.id)).toBe(3000)
  })

  it('no article → plain NO_RESULTS; Wikipedia down → plain RESEARCH_FAILED; nothing saved either way', async () => {
    const u = await signUp('res'); await setPlan(u.id, 'pro')
    wiki.pages = []
    const none = await research(u.cookie, { query: 'qzxv blorp', mode: 'wikipedia' })
    expect(none.status).toBe(422); expect((await json(none)).error.code).toBe('NO_RESULTS')
    wiki.fail = true
    const down = await research(u.cookie, { query: 'solar power', mode: 'wikipedia' })
    expect(down.status).toBe(422); expect((await json(down)).error.code).toBe('RESEARCH_FAILED')
    expect(await db.select().from(sourceDocument).where(eq(sourceDocument.userId, u.id))).toHaveLength(0)
  })

  it('Gold: web search charges 60 credits once per request id, saves one brief with the pages it used, logs the search fee', async () => {
    const u = await signUp('res'); await setPlan(u.id, 'gold')
    await json(await api(u.cookie, 'GET', '/me/entitlements'))
    const body = { query: 'solar power market 2026', mode: 'web', requestId: `r-${rid()}-${rid()}` }
    const r = await json(await api(u.cookie, 'POST', '/sources/research', body))
    expect(r.data.creditsCharged).toBe(60)
    expect(r.data.sources).toHaveLength(1)
    expect(await balance(u.id)).toBe(10000 - 60)
    const [doc] = await db.select().from(sourceDocument).where(eq(sourceDocument.userId, u.id))
    const text = (await db.select().from(sourceChunk).where(eq(sourceChunk.sourceId, doc!.id))).map((c) => c.text).join('\n')
    expect(text).toContain('https://example.com/mock-page')
    const ev = (await db.select().from(aiUsageEvent).where(eq(aiUsageEvent.userId, u.id))).find((e) => e.requestType === 'web_research')
    expect(Number(ev!.providerCostUsd)).toBeGreaterThanOrEqual(0.035)
    await api(u.cookie, 'POST', '/sources/research', body) // client retry
    expect(await balance(u.id)).toBe(10000 - 60)
  })

  it('Gold: a failed web search refunds the credits and saves nothing', async () => {
    const u = await signUp('res'); await setPlan(u.id, 'gold')
    await json(await api(u.cookie, 'GET', '/me/entitlements'))
    const r = await research(u.cookie, { query: 'FAIL_PLEASE topic', mode: 'web' })
    expect(r.status).toBe(503)
    expect(await balance(u.id)).toBe(10000)
    expect(await db.select().from(sourceDocument).where(eq(sourceDocument.userId, u.id))).toHaveLength(0)
  })

  it('validates input: short query, unknown mode, language injection attempt', async () => {
    const u = await signUp('res'); await setPlan(u.id, 'gold')
    expect((await research(u.cookie, { query: 'ab', mode: 'wikipedia' })).status).toBe(400)
    expect((await research(u.cookie, { query: 'solar', mode: 'bing' })).status).toBe(400)
    expect((await research(u.cookie, { query: 'solar power', mode: 'wikipedia', language: 'en.evil.com/x' })).status).toBe(400)
  })
})
