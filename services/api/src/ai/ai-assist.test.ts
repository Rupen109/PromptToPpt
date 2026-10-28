import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { DESIGNS, contrastRatio, getTheme } from '@prompttoppt/theme'
import { findUrls, themeSchema, type Entitlements, type Presentation, type SlideContent } from '@prompttoppt/validation'
import { db } from '../db/index.ts'
import { creditBalance, generatedAsset } from '../db/schema.ts'
import { api, json, makeDeck, rid, setPlan, signUp } from '../test-utils.ts'
import { aiAssistOutput, aiAssistPrompt, compileAssist, keepShape, type AiAssistOutput } from './ai-assist.ts'
import { pageReader } from './linked-pages.ts'

const balance = async (id: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, id)))[0]!.balance
const ask = (cookie: string, deckId: string, instruction: string, extra: object = {}) => api(cookie, 'POST', `/presentations/${deckId}/ai-assist`, { instruction, requestId: `req-${rid()}-${rid()}`, ...extra })
const free = { features: { premiumTemplates: false } } as unknown as Entitlements
const out = (o: Partial<AiAssistOutput>): AiAssistOutput => ({ reply: 'ok', operations: [], unsupported: [], onTopic: true, ...o })

describe('POST /presentations/:id/ai-assist', () => {
  it('animates the deck: one charge (2× an edit on the starter tier), a valid full theme comes back', async () => {
    const u = await signUp('as')
    const { id } = await makeDeck(u.id)
    const before = await (async () => { await api(u.cookie, 'GET', '/me/entitlements'); return balance(u.id) })()
    const res = await ask(u.cookie, id, 'please animate every slide')
    const body = await json(res)
    expect(res.status).toBe(200)
    expect(body.data.applied).toEqual(['Animated every slide (zoom)'])
    expect(body.data.theme.motion).toMatchObject({ transition: 'zoom', entrance: 'zoom' })
    expect(themeSchema.safeParse(body.data.theme).success).toBe(true)
    expect(body.data.creditsCharged).toBe(4)
    expect(await balance(u.id)).toBe(before - 4)
  })

  it('"change the colours" yields an accessible generated palette (text reads on background and surface)', async () => {
    const u = await signUp('as')
    const { id } = await makeDeck(u.id)
    const body = await json(await ask(u.cookie, id, "I don't like the colours"))
    const c = body.data.theme.colors
    expect(body.data.theme).toMatchObject({ id: 'custom' })
    expect(contrastRatio(c.textPrimary, c.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(c.textPrimary, c.surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(4.5)
  })

  it('a picture request becomes a PROPOSAL: nothing is generated or spent on images until the user confirms', async () => {
    const u = await signUp('as')
    const deck = await makeDeck(u.id)
    await api(u.cookie, 'GET', '/me/entitlements')
    const before = await balance(u.id)
    const body = await json(await ask(u.cookie, deck.id, 'add a photo of a car as the background'))
    expect(body.data.applied).toEqual(['Proposed a picture for slide 1 — confirm below to generate it'])
    expect(body.data.images).toEqual([{ slideId: deck.doc.slides[0]!.id, slideNumber: 1, placement: 'background', prompt: expect.stringContaining('red electric hatchback'), alt: expect.any(String) }])
    expect(body.data.reply).toBe('I prepared a picture for you to confirm below.')
    expect(body.data.theme).toBeNull()
    expect(await balance(u.id)).toBe(before - 4) // the assistant message itself; the picture costs nothing until confirmed
    const events = await db.select().from(generatedAsset).where(eq(generatedAsset.userId, u.id))
    expect(events).toHaveLength(0)
  })

  it('unsupported requests are explained and cost nothing', async () => {
    const u = await signUp('as')
    const { id } = await makeDeck(u.id)
    await api(u.cookie, 'GET', '/me/entitlements')
    const before = await balance(u.id)
    const body = await json(await ask(u.cookie, id, 'please export this'))
    expect(body.data.applied).toEqual([])
    expect(body.data.notes).toContain('I cannot export.')
    expect(body.data.creditsCharged).toBe(0)
    expect(await balance(u.id)).toBe(before)
  })

  it('mixed request: does what it can, proposes the picture, charges once', async () => {
    const u = await signUp('as')
    const { id } = await makeDeck(u.id)
    const body = await json(await ask(u.cookie, id, 'change colours, animate everything and add a photo'))
    expect(body.data.applied).toHaveLength(3)
    expect(body.data.images).toHaveLength(1)
    expect(body.data.reply).toBe('Done — 2 changes applied to your deck. I also prepared a picture for you to confirm below.')
    expect(body.data.creditsCharged).toBe(4)
  })

  it('a model failure is refunded', async () => {
    const u = await signUp('as')
    const { id } = await makeDeck(u.id)
    await api(u.cookie, 'GET', '/me/entitlements')
    const before = await balance(u.id)
    const res = await ask(u.cookie, id, 'FAIL_PLEASE')
    expect(res.status).toBe(503) // gateway reports exhausted retries as AI_UNAVAILABLE
    expect(await balance(u.id)).toBe(before)
  })

  it('retrying the same requestId is charged once', async () => {
    const u = await signUp('as')
    const { id } = await makeDeck(u.id)
    await api(u.cookie, 'GET', '/me/entitlements')
    const before = await balance(u.id)
    const requestId = `req-${rid()}-${rid()}`
    await api(u.cookie, 'POST', `/presentations/${id}/ai-assist`, { instruction: 'animate', requestId })
    await api(u.cookie, 'POST', `/presentations/${id}/ai-assist`, { instruction: 'animate', requestId })
    expect(await balance(u.id)).toBe(before - 4)
  })

  it('premium templates are gated by plan; the gate holds even when the model asks for one', async () => {
    const u = await signUp('as')
    const { id } = await makeDeck(u.id)
    const denied = await json(await ask(u.cookie, id, 'use a premium template'))
    expect(denied.data.theme).toBeNull()
    expect(denied.data.notes[0]).toMatch(/Pro template/)
    await setPlan(u.id, 'pro')
    const ok = await json(await ask(u.cookie, id, 'use a premium template'))
    expect(ok.data.theme).toMatchObject({ templateId: DESIGNS.find((d) => d.premium)!.id })
  })

  it("you can't use someone else's deck, and slide scope needs a real unlocked slide", async () => {
    const owner = await signUp('as')
    const other = await signUp('as')
    const { id, doc } = await makeDeck(owner.id)
    expect((await ask(other.cookie, id, 'animate')).status).toBe(404)
    expect((await ask(owner.cookie, id, 'animate', { scope: 'slide', slideId: 'nope' })).status).toBe(404)
    const deck = await json(await ask(owner.cookie, id, 'animate', { scope: 'slide', slideId: doc.slides[0]!.id }))
    expect(deck.data.theme).toBeNull() // theme operations are refused in slide scope
    expect(deck.data.creditsCharged).toBe(0)
  })
})

describe('linked web pages in the assistant', () => {
  const PAGE_TEXT = 'Tata Aeris launch — a new urban EV with 450 km range. '.repeat(6)
  it('reads a pasted link server-side, uses it for the edit, and charges one extra unit per page read', async () => {
    const read = vi.spyOn(pageReader, 'read').mockResolvedValue({ title: 'Tata Aeris launch', parts: [{ locator: null, text: PAGE_TEXT }] })
    const u = await signUp('as')
    const { id, doc } = await makeDeck(u.id)
    await api(u.cookie, 'GET', '/me/entitlements')
    const before = await balance(u.id)
    const body = await json(await ask(u.cookie, id, 'https://www.tata.com/newsroom/aeris-launch see this site and please update the content'))
    expect(read).toHaveBeenCalledWith('https://www.tata.com/newsroom/aeris-launch')
    expect(body.data.edits).toHaveLength(1)
    expect(body.data.edits[0].slideId).toBe(doc.slides[1]!.id)
    expect(body.data.edits[0].content.title).toContain('From link: Tata Aeris launch')
    expect(body.data.creditsCharged).toBe(6) // (deck 2 + 1 page) × starter edit price 2
    expect(await balance(u.id)).toBe(before - 6)
    read.mockRestore()
  })

  it("an unreadable page is reported (never guessed at) and costs nothing when nothing else changed", async () => {
    const read = vi.spyOn(pageReader, 'read').mockRejectedValue(new Error('Could not load that page (HTTP 403).'))
    const u = await signUp('as')
    const { id } = await makeDeck(u.id)
    await api(u.cookie, 'GET', '/me/entitlements')
    const before = await balance(u.id)
    const body = await json(await ask(u.cookie, id, 'https://example.org/article update the content'))
    expect(body.data.applied).toEqual([])
    expect(body.data.notes.join('|')).toMatch(/Couldn't read https:\/\/example\.org\/article — Could not load that page/)
    expect(body.data.creditsCharged).toBe(0)
    expect(await balance(u.id)).toBe(before)
    read.mockRestore()
  })

  it('private / internal addresses are refused by the same SSRF guard as deck sources (no stub: real fetcher)', async () => {
    const u = await signUp('as')
    const { id } = await makeDeck(u.id)
    const body = await json(await ask(u.cookie, id, 'update the content from http://127.0.0.1:5432/secret and http://169.254.169.254/latest/meta-data'))
    expect(body.data.notes.filter((n: string) => n.startsWith("Couldn't read"))).toHaveLength(2)
    expect(body.data.creditsCharged).toBe(0)
  })

  it('findUrls: max 2, de-duplicated, trailing punctuation trimmed', () => {
    expect(findUrls('see https://a.com/x, and https://a.com/x. also (https://b.org/y) plus https://c.net/z')).toEqual(['https://a.com/x', 'https://b.org/y'])
    expect(findUrls('no links here')).toEqual([])
  })
})

describe('compileAssist (the trust boundary between model output and the deck)', () => {
  const doc = { schemaVersion: 1, id: 'p', title: 'T', aspectRatio: '16:9', language: 'en', theme: getTheme('cobalt'), sources: [], slides: [] } as unknown as Presentation
  const withSlides = (slides: object[]) => ({ ...doc, slides } as unknown as Presentation)
  const content: SlideContent = { layout: 'title-body', title: 'New', bullets: ['a', 'b'], speakerNotes: '', sources: [] }

  it('rejects unknown templates, locked/manual/missing slides and layout changes', () => {
    const d = withSlides([
      { id: 's1', layoutId: 'title-body', locked: false, manual: false, content },
      { id: 's2', layoutId: 'title-body', locked: true, manual: false, content },
      { id: 's3', layoutId: 'title-body', locked: false, manual: true },
    ])
    const r = compileAssist(d, out({ operations: [
      { op: 'set_template', id: 'does-not-exist' },
      { op: 'edit_slide', slideId: 's2', content }, { op: 'edit_slide', slideId: 's3', content },
      { op: 'edit_slide', slideId: 'ghost', content }, { op: 'edit_slide', slideId: 's1', content: { layout: 'quote', quote: 'q', speakerNotes: '', sources: [] } as never },
    ] }), free, 'deck')
    expect(r.theme).toBeNull()
    expect(r.edits).toEqual([])
    expect(r.applied).toEqual([])
    expect(r.notes).toHaveLength(5)
  })

  it('applies a valid edit and a theme change together', () => {
    const d = withSlides([{ id: 's1', layoutId: 'title-body', locked: false, manual: false, content }])
    const r = compileAssist(d, out({ operations: [{ op: 'edit_slide', slideId: 's1', content: { ...content, title: 'Better' } }, { op: 'set_fonts', pair: 'playfair' }] }), free, 'deck')
    expect(r.edits[0]!.content).toMatchObject({ title: 'Better' })
    expect(r.theme!.fonts).toEqual({ heading: 'Playfair Display', body: 'Lora' })
    expect(r.applied).toHaveLength(2)
  })

  it('edit_slide keeps the slide\'s structure: optional blocks stay, no new ones, card lists keep their length, bullets may change', () => {
    const prev = { layout: 'process', title: 'How it works', steps: [{ title: 'One', description: 'a' }, { title: 'Two', description: 'b' }, { title: 'Three', description: 'c' }], speakerNotes: '', sources: [] } as unknown as SlideContent
    const model = { layout: 'process', title: 'How we work', steps: [{ title: 'First', description: 'x' }, { title: 'Second', description: 'y' }, { title: 'Third', description: 'z' }, { title: 'Fourth', description: 'w' }], extra: 'x', speakerNotes: 'n', sources: [] } as unknown as SlideContent
    const k = keepShape(prev, model) as unknown as { steps: { title: string }[]; title: string; extra?: string; speakerNotes: string }
    expect(k.steps.map((x) => x.title)).toEqual(['First', 'Second', 'Third'])
    expect(k.title).toBe('How we work'); expect(k.extra).toBeUndefined(); expect(k.speakerNotes).toBe('n')
    const a = { layout: 'title', title: 'Hello', subtitle: 'Sub', speakerNotes: '', sources: [] } as SlideContent
    expect(keepShape(a, { layout: 'title', title: 'Hi', speakerNotes: '', sources: [] } as SlideContent)).toMatchObject({ title: 'Hi', subtitle: 'Sub' })
    const b = { layout: 'title', title: 'Hello', speakerNotes: '', sources: [] } as SlideContent
    expect(keepShape(b, { layout: 'title', title: 'Hi', subtitle: 'New', speakerNotes: '', sources: [] } as SlideContent)).not.toHaveProperty('subtitle')
    const t = { layout: 'title-body', title: 'T', bullets: ['a', 'b'], speakerNotes: '', sources: [] } as SlideContent
    expect(keepShape(t, { layout: 'title-body', title: 'T2', bullets: ['a', 'b', 'c', 'd'], speakerNotes: '', sources: [] } as SlideContent)).toMatchObject({ bullets: ['a', 'b', 'c', 'd'] })
  })

  it('the recent conversation reaches the model as data, in order, and is absent when there is none', () => {
    const d = withSlides([{ id: 's1', layoutId: 'title-body', locked: false, manual: false, content }])
    const withChat = aiAssistPrompt({ instruction: 'revert it please', scope: 'deck', focusSlideId: undefined, doc: d, conversation: [{ role: 'user', text: 'make theme light' }, { role: 'assistant', text: 'Done. Changes made: New light colour scheme' }] })
    expect(withChat.prompt).toMatch(/<conversation>\nuser: make theme light\nassistant: Done\. Changes made: New light colour scheme\n<\/conversation>/)
    expect(withChat.prompt.indexOf('<conversation>')).toBeLessThan(withChat.prompt.indexOf('<instruction>'))
    expect(withChat.system).toMatch(/UNDO \/ REVERT/)
    expect(aiAssistPrompt({ instruction: 'hi', scope: 'deck', focusSlideId: undefined, doc: d }).prompt).not.toContain('<conversation>')
  })

  it('revert: puts back a recorded change (all / theme / one slide) and refuses what was never changed', () => {
    const d = withSlides([{ id: 's1', layoutId: 'title-body', locked: false, manual: false, content }, { id: 's2', layoutId: 'title-body', locked: false, manual: false, content }])
    const recent = [{ theme: true, slideIds: ['s1'], summary: ['Applied the "Cobalt" template'] }, { theme: false, slideIds: ['s2'], summary: ['Rewrote slide 2'] }]
    const ok = compileAssist(d, out({ operations: [{ op: 'revert', change: 0, part: 'theme' }, { op: 'revert', change: 1, part: 'slide', slideId: 's2' }] }), free, 'deck', undefined, [], recent)
    expect(ok.reverts).toEqual([{ change: 0, part: 'theme' }, { change: 1, part: 'slide', slideId: 's2' }])
    expect(ok.applied).toHaveLength(2)
    const bad = compileAssist(d, out({ operations: [{ op: 'revert', change: 3, part: 'all' }, { op: 'revert', change: 1, part: 'slide', slideId: 's1' }, { op: 'revert', change: 1, part: 'theme' }] }), free, 'deck', undefined, [], recent)
    expect(bad.notes).toHaveLength(2) // unknown change, slide not touched by it
    expect(bad.reverts).toEqual([{ change: 1, part: 'all' }]) // a theme revert of a change that had no theme part falls back to "all"
    expect(compileAssist(d, out({ operations: [{ op: 'revert', change: 0, part: 'all' }] }), free, 'deck').reverts).toEqual([]) // nothing recorded → nothing to put back
    expect(compileAssist(d, out({ operations: [{ op: 'revert', change: 0, part: 'all' }] }), free, 'slide', 's1', [], recent).reverts).toHaveLength(1) // allowed in slide scope too
  })

  it('add_slide: a thank-you slide goes at the end or after a given slide; unknown anchors fall back to the end; capped at 5', () => {
    const d = withSlides([{ id: 's1', layoutId: 'title-body', locked: false, manual: false, content }, { id: 's2', layoutId: 'title-body', locked: false, manual: false, content }])
    const thanks = { layout: 'thank-you', title: 'Thank you', subtitle: 'Questions?', speakerNotes: '', sources: [] } as SlideContent
    const r = compileAssist(d, out({ operations: [{ op: 'add_slide', afterSlideId: null, content: thanks }, { op: 'add_slide', afterSlideId: 's1', content: thanks }, { op: 'add_slide', afterSlideId: 'ghost', content: thanks }] }), free, 'deck')
    expect(r.additions.map((a) => a.afterSlideId)).toEqual([null, 's1', null])
    expect(r.additions[0]!.content).toMatchObject({ layout: 'thank-you', title: 'Thank you' })
    expect(r.applied).toHaveLength(3)
    expect(r.notes).toHaveLength(1)
    const many = compileAssist(d, out({ operations: Array.from({ length: 7 }, () => ({ op: 'add_slide' as const, content: thanks })) }), free, 'deck')
    expect(many.additions).toHaveLength(5)
    // also allowed when only one slide is selected
    expect(compileAssist(d, out({ operations: [{ op: 'add_slide', content: thanks }] }), free, 'slide', 's1').additions).toHaveLength(1)
  })

  it('"none" turns motion off; unsupported items always surface as notes', () => {
    const r = compileAssist(doc, out({ operations: [{ op: 'set_motion', preset: 'none' }], unsupported: ['no images'] }), free, 'deck')
    expect(r.theme!.motion).toMatchObject({ transition: 'none', entrance: 'none' })
    expect(r.notes).toEqual(['no images'])
  })

  it('add_image: placement is downgraded to what the layout allows; locked/missing slides and >3 proposals are refused', () => {
    const d = withSlides([
      { id: 'a', layoutId: 'title', locked: false, manual: false, content: { layout: 'title', title: 'T', speakerNotes: '', sources: [] } },
      { id: 'b', layoutId: 'title-body', locked: false, manual: false, content },
      { id: 'c', layoutId: 'process', locked: false, manual: false, content: {} },
      { id: 'd', layoutId: 'title', locked: true, manual: false, content: {} },
    ])
    const img = (slideId: string, placement: 'background' | 'beside' | 'floating') => ({ op: 'add_image' as const, slideId, placement, prompt: 'a calm lake' })
    const r = compileAssist(d, out({ operations: [img('a', 'background'), img('b', 'background'), img('c', 'beside'), img('d', 'background'), img('ghost', 'floating'), img('a', 'floating'), img('b', 'floating')] }), free, 'deck')
    expect(r.images.map((i) => `${i.slideNumber}:${i.placement}`)).toEqual(['1:background', '2:beside', '3:floating']) // b: background not allowed → beside; c: beside not allowed → floating
    expect(r.notes.join('|')).toMatch(/is locked/)
    expect(r.notes.join('|')).toMatch(/does not exist/)
    expect(r.notes.join('|')).toMatch(/At most 3/)
    expect(r.theme).toBeNull()
  })

  it('in single-slide scope only pictures for that slide are accepted', () => {
    const d = withSlides([{ id: 'a', layoutId: 'title', locked: false, manual: false, content }, { id: 'b', layoutId: 'title', locked: false, manual: false, content }])
    const r = compileAssist(d, out({ operations: [{ op: 'add_image', slideId: 'b', placement: 'background', prompt: 'x y z' }, { op: 'add_image', slideId: 'a', placement: 'background', prompt: 'x y z' }] }), free, 'slide', 'a')
    expect(r.images.map((i) => i.slideId)).toEqual(['a'])
  })
})

describe('model output: null means "not used"', () => {
  it('a model that writes null for optional fields (ask, reply, unsupported) is accepted instead of failing the whole request', () => {
    const r = aiAssistOutput.safeParse({ reply: null, operations: [], unsupported: null, onTopic: true, ask: null })
    expect(r.success).toBe(true)
    if (r.success) { expect(r.data.ask).toBeUndefined(); expect(r.data.reply).toBe(''); expect(r.data.unsupported).toEqual([]) }
  })
})
