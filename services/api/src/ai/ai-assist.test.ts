import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { DESIGNS, composeSlide, contrastRatio, getTheme } from '@prompttoppt/theme'
import { findUrls, themeSchema, type Entitlements, type Presentation, type SlideContent } from '@prompttoppt/validation'
import { db } from '../db/index.ts'
import { creditBalance, generatedAsset } from '../db/schema.ts'
import { api, json, makeDeck, rid, setPlan, signUp } from '../test-utils.ts'
import { aiAssistOutput, aiAssistPrompt, compileAssist, isSmallTalk, keepShape, morePointsAsked, namesOneSlide, type AiAssistOutput } from './ai-assist.ts'
import { pageReader } from './linked-pages.ts'

const balance = async (id: string) => (await db.select().from(creditBalance).where(eq(creditBalance.userId, id)))[0]!.balance
const ask = (cookie: string, deckId: string, instruction: string, extra: object = {}) => api(cookie, 'POST', `/presentations/${deckId}/ai-assist`, { instruction, requestId: `req-${rid()}-${rid()}`, ...extra })
const free = { features: { premiumTemplates: false } } as unknown as Entitlements
const out = (o: Partial<AiAssistOutput>): AiAssistOutput => ({ reply: 'ok', operations: [], unsupported: [], onTopic: true, ...o })

describe('POST /presentations/:id/ai-assist', () => {
  it('a request about one slide that names none gets a free "which slide?" question — no model call, no charge, nothing changed', async () => {
    const u = await signUp('as')
    const { id } = await makeDeck(u.id)
    await api(u.cookie, 'GET', '/me/entitlements')
    const before = await balance(u.id)
    const slideId = (await json(await api(u.cookie, 'GET', `/presentations/${id}`))).data.document.slides[1].id
    const res = await ask(u.cookie, id, 'please make the title shorter', { activeSlideId: slideId })
    const body = await json(res)
    expect(res.status).toBe(200)
    expect(body.data).toMatchObject({ ask: true, applied: [], edits: [], creditsCharged: 0 })
    expect(body.data.reply).toMatch(/Which slide.*slide 2/)
    expect(await balance(u.id)).toBe(before)
    // naming the slide (as the answer buttons do) goes on to the model as usual
    const named = await ask(u.cookie, id, 'please make the title shorter (slide 2)', { activeSlideId: slideId })
    expect((await json(named)).data.ask).toBeUndefined()
  })

  it('"add 2 more bullet points" answered by only rewording makes the server ask the model once more, and the points are added', async () => {
    const u = await signUp('asr')
    const { id } = await makeDeck(u.id)
    await api(u.cookie, 'GET', '/me/entitlements')
    const doc = (await json(await api(u.cookie, 'GET', `/presentations/${id}`))).data.document
    const was = (doc.slides[1].content.bullets as string[]).length
    const body = (await json(await ask(u.cookie, id, 'please add 2 more bullet points', { activeSlideId: doc.slides[1].id }))).data
    expect(body.edits).toHaveLength(1)
    expect(body.edits[0].content.bullets).toHaveLength(was + 2)
    expect(body.notes).toEqual([])
    expect(body.creditsCharged).toBe(4) // one message, one charge: the second try is not billed again
  })

  it('if the model never adds them, the person is told plainly (nothing is faked)', async () => {
    const u = await signUp('asq')
    const { id } = await makeDeck(u.id)
    await api(u.cookie, 'GET', '/me/entitlements')
    const doc = (await json(await api(u.cookie, 'GET', `/presentations/${id}`))).data.document
    const body = (await json(await ask(u.cookie, id, 'please add 2 more bullet points stubborn', { activeSlideId: doc.slides[1].id }))).data
    expect(body.notes.join(' ')).toMatch(/asked for 2 more points/)
  })

  it('small talk ("hey", "thanks") is answered for free with what the assistant can do — never a change, never the last action again', async () => {
    const u = await signUp('ast')
    const { id } = await makeDeck(u.id)
    await api(u.cookie, 'GET', '/me/entitlements')
    const before = await balance(u.id)
    for (const hello of ['hey', 'Thanks!', 'ok', 'hello 🙂', 'thank you']) {
      const body = (await json(await ask(u.cookie, id, hello))).data
      expect(body, hello).toMatchObject({ applied: [], edits: [], additions: [], creditsCharged: 0 })
      expect(body.reply).toMatch(/Tell me what to update/)
    }
    expect(await balance(u.id)).toBe(before)
    for (const real of ['ok make the title shorter on slide 2', 'hey add a thank you slide', 'good, now animate every slide']) expect(isSmallTalk(real), real).toBe(false)
  })

  it('a message that names ONE slide costs one edit (2 credits on the starter tier); a deck-wide one costs two (4)', async () => {
    const u = await signUp('asp')
    const { id } = await makeDeck(u.id)
    await api(u.cookie, 'GET', '/me/entitlements')
    const slideId = (await json(await api(u.cookie, 'GET', `/presentations/${id}`))).data.document.slides[1].id
    const one = await json(await ask(u.cookie, id, 'please animate slide 2', { activeSlideId: slideId }))
    expect(one.data.creditsCharged).toBe(2)
    const wide = await json(await ask(u.cookie, id, 'please animate every slide', { activeSlideId: slideId }))
    expect(wide.data.creditsCharged).toBe(4)
    expect(namesOneSlide('make it shorter (slide 16)')).toBe(true)
    expect(namesOneSlide('change the thank you page')).toBe(true)
    expect(namesOneSlide('shorten slide 2 and 3 and every slide')).toBe(false)
    expect(namesOneSlide('change the colours')).toBe(false)
  })

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

  describe('"the text is not visible": the assistant fixes the text instead of undoing the change', () => {
    const slideWith = (id: string, bgColor: string, textColor: string) => {
      const c = composeSlide({ layout: 'thank-you', title: 'Thank you', subtitle: 'Questions?', speakerNotes: '', sources: [] } as SlideContent, getTheme('cobalt'), '16:9')
      return { id, locked: false, ...c, background: { type: 'color', value: bgColor }, elements: c.elements.map((e) => (e.type === 'text' ? { ...e, color: textColor } : e)) }
    }
    const d = () => withSlides([slideWith('s1', '#1A110C', '#0B0F1A'), slideWith('s2', '#1A110C', '#F8F1ED'), { ...slideWith('s3', '#1A110C', '#0B0F1A'), locked: true }])
    it('fix_readability: one slide, every slide, locked slides skipped, slide scope only for the selected slide', () => {
      const one = compileAssist(d(), out({ operations: [{ op: 'fix_readability', slideId: 's1' }] }), free, 'deck')
      expect(one.readability).toEqual(['s1'])
      expect(one.theme).toBeNull()
      expect(one.applied).toEqual(['Made the text on slide 1 readable on its background'])
      const all = compileAssist(d(), out({ operations: [{ op: 'fix_readability', slideId: null }] }), free, 'deck')
      expect(all.readability).toEqual(['s1', 's2'])
      const locked = compileAssist(d(), out({ operations: [{ op: 'fix_readability', slideId: 's3' }] }), free, 'deck')
      expect(locked.readability).toEqual([])
      expect(locked.notes).toHaveLength(1)
      expect(compileAssist(d(), out({ operations: [{ op: 'fix_readability', slideId: 's1' }] }), free, 'slide', 's1').readability).toEqual(['s1'])
      expect(compileAssist(d(), out({ operations: [{ op: 'fix_readability', slideId: 's2' }] }), free, 'slide', 's1').readability).toEqual([])
    })
    it('the model is TOLD what the slides look like: each slide\'s background and which ones have text that does not read', () => {
      const p = aiAssistPrompt({ instruction: 'the text is not visible', scope: 'deck', focusSlideId: undefined, doc: d() })
      const deckPart = p.prompt.slice(p.prompt.indexOf('<deck>'))
      expect(deckPart).toContain('"background":"#1A110C"')
      const lines = deckPart.split('\n').filter((l) => l.startsWith('{"id"'))
      expect(lines[0]).toContain('"lowContrastText":true') // dark text on a dark background
      expect(lines[1]).not.toContain('lowContrastText')
    })
    it('the prompt teaches: not visible = fix the text, do not revert, do not ask', () => {
      const s = aiAssistPrompt({ instruction: 'x', scope: 'deck', focusSlideId: undefined, doc: d() }).system
      expect(s).toContain('fix_readability')
      expect(s).toMatch(/TEXT NOT VISIBLE/)
      expect(s).toMatch(/Do NOT revert the change they asked for/)
    })
  })

  describe('"add 2 more bullet points": the lists really grow, or the user is told why not', () => {
    const cmp = (l: number, r: number): SlideContent => ({ layout: 'comparison', title: 'T', left: { heading: 'L', bullets: Array.from({ length: l }, (_, i) => `left ${i}`) }, right: { heading: 'R', bullets: Array.from({ length: r }, (_, i) => `right ${i}`) }, speakerNotes: '', sources: [] }) as SlideContent
    const d = (c: SlideContent) => withSlides([{ id: 's1', layoutId: 'comparison', locked: false, manual: false, content: c }])
    it('understands the request', () => {
      expect(morePointsAsked('please add 2 more bullet points here')).toBe(2)
      expect(morePointsAsked('currently its 4 bullet points, please add 2 more in both side')).toBe(2)
      expect(morePointsAsked('add three more points')).toBe(3)
      expect(morePointsAsked('add 2 bullet points')).toBe(2)
      expect(morePointsAsked('make the title shorter')).toBe(0)
      expect(morePointsAsked(undefined)).toBe(0)
    })
    it('a comparison slide may now hold 6 points per side (it was 4: the assistant could only reword)', () => {
      const r = compileAssist(d(cmp(4, 4)), out({ operations: [{ op: 'edit_slide', slideId: 's1', content: cmp(6, 6) }] }), free, 'deck', undefined, [], [], 'currently its 4 bullet points, please add 2 more in both side')
      expect((r.edits[0]!.content as { left: { bullets: string[] }; right: { bullets: string[] } }).left.bullets).toHaveLength(6)
      expect((r.edits[0]!.content as { right: { bullets: string[] } }).right.bullets).toHaveLength(6)
      expect(r.notes).toEqual([])
    })
    it('if the model only rewords (same number of points), the user is told nothing was added — not a bare "Done"', () => {
      const same = { ...cmp(4, 4), left: { heading: 'L', bullets: ['a', 'b', 'c', 'd'] }, right: { heading: 'R', bullets: ['e', 'f', 'g', 'h'] } } as SlideContent
      const r = compileAssist(d(cmp(4, 4)), out({ operations: [{ op: 'edit_slide', slideId: 's1', content: same }] }), free, 'deck', undefined, [], [], 'please add 2 more bullet points here')
      expect(r.notes).toHaveLength(1)
      expect(r.notes[0]).toMatch(/asked for 2 more points/)
    })
    it('a full layout is explained: "already full: at most N"', () => {
      const r = compileAssist(d(cmp(6, 6)), out({ operations: [{ op: 'edit_slide', slideId: 's1', content: { ...cmp(6, 6), left: { heading: 'L', bullets: ['1', '2', '3', '4', '5', '6'] } } as SlideContent }] }), free, 'deck', undefined, [], [], 'add 2 more bullet points')
      expect(r.notes[0]).toMatch(/already full.*at most 6/)
    })
    it('a request that is not "N more points" gets no such note', () => {
      const r = compileAssist(d(cmp(4, 4)), out({ operations: [{ op: 'edit_slide', slideId: 's1', content: { ...cmp(4, 4), title: 'Better title' } as SlideContent }] }), free, 'deck', undefined, [], [], 'make the title better')
      expect(r.notes).toEqual([])
    })
    it('the model is told the list limits and to count', () => {
      const s = aiAssistPrompt({ instruction: 'x', scope: 'deck', focusSlideId: undefined, doc: d(cmp(4, 4)) }).system
      expect(s).toMatch(/LIST SIZES/)
      expect(s).toMatch(/comparison 6 per side/)
    })
  })

  describe('the background of ONE slide', () => {
    const bg = (value: string) => ({ type: 'color', value })
    const d = () => withSlides([
      { id: 's1', layoutId: 'title-body', locked: false, background: bg('#1A110C'), content },
      { id: 's2', layoutId: 'title-body', locked: false, background: bg('#1A110C'), content },
      { id: 's3', layoutId: 'title-body', locked: false, background: bg('#1a110c'), content },
      { id: 's4', layoutId: 'thank-you', locked: false, background: bg('#D7936F'), content: { layout: 'thank-you', title: 'Thank you', speakerNotes: '', sources: [] } },
      { id: 's5', layoutId: 'title-body', locked: true, background: bg('#1A110C'), content },
    ])
    it('"same as the other slides" = the background most of the other slides share (the slide itself does not count), and the theme is untouched', () => {
      const r = compileAssist(d(), out({ operations: [{ op: 'set_slide_background', slideId: 's4', color: 'deck' }] }), free, 'deck')
      expect(r.backgrounds).toEqual([{ slideId: 's4', color: '#1A110C' }])
      expect(r.theme).toBeNull()
      expect(r.applied).toEqual(['Slide 4 now has the same background as the other slides'])
    })
    it('a chosen colour is applied to that slide only', () => {
      const r = compileAssist(d(), out({ operations: [{ op: 'set_slide_background', slideId: 's4', color: '#8b5a2b' }] }), free, 'deck')
      expect(r.backgrounds).toEqual([{ slideId: 's4', color: '#8B5A2B' }])
      expect(r.applied).toEqual(['Changed the background of slide 4'])
    })
    it('slide scope: allowed for the selected slide, refused for any other (and a deck-wide colour change is still refused there)', () => {
      const ok = compileAssist(d(), out({ operations: [{ op: 'set_slide_background', slideId: 's4', color: 'deck' }] }), free, 'slide', 's4')
      expect(ok.backgrounds).toHaveLength(1)
      const other = compileAssist(d(), out({ operations: [{ op: 'set_slide_background', slideId: 's1', color: '#112233' }, { op: 'set_colors', primary: '#112233', accent: '#445566', mode: 'dark' }] }), free, 'slide', 's4')
      expect(other.backgrounds).toEqual([])
      expect(other.theme).toBeNull()
      expect(other.notes.length).toBe(2)
    })
    it('missing and locked slides are skipped with a note; a slide that already has the colour is not "changed"', () => {
      const r = compileAssist(d(), out({ operations: [{ op: 'set_slide_background', slideId: 'ghost', color: '#112233' }, { op: 'set_slide_background', slideId: 's5', color: '#112233' }, { op: 'set_slide_background', slideId: 's1', color: '#1a110c' }] }), free, 'deck')
      expect(r.backgrounds).toEqual([])
      expect(r.notes).toHaveLength(3)
    })
    it('a bad colour is rejected by the schema (no hex injection)', () => {
      expect(aiAssistOutput.safeParse({ reply: 'x', onTopic: true, ask: null, operations: [{ op: 'set_slide_background', slideId: 's1', color: 'red; background:url(x)' }], unsupported: [] }).success).toBe(false)
      expect(aiAssistOutput.safeParse({ reply: 'x', onTopic: true, ask: null, operations: [{ op: 'set_slide_background', slideId: 's1', color: 'deck' }], unsupported: [] }).success).toBe(true)
    })
    it('the prompt says greetings and thanks are never a request to repeat the last change (a customer typed "hey" and got another slide)', () => {
      const s = aiAssistPrompt({ instruction: 'hey', scope: 'deck', focusSlideId: undefined, doc: d() }).system
      expect(s).toMatch(/GREETINGS AND SMALL TALK ARE NOT REQUESTS/)
      expect(s).toMatch(/NEVER repeat or continue your previous action/)
    })
    it('the prompt teaches the model: one-slide background is set_slide_background, "same as the others" is not a complaint', () => {
      const p = aiAssistPrompt({ instruction: 'x', scope: 'deck', focusSlideId: undefined, doc: d() }).system
      expect(p).toContain('set_slide_background')
      expect(p).toMatch(/BACKGROUND OF ONE SLIDE/)
      expect(p).toMatch(/not a complaint/)
    })
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
