import { describe, expect, it } from 'vitest'
import { composeSlide, getTheme } from '@prompttoppt/theme'
import type { Presentation, SlideContent } from '@prompttoppt/validation'
import { CAPABILITIES } from './capabilities/index.ts'
import { priceUnits, runAssistant, type AssistantDeps } from './pipeline.ts'
import { insertionPoints, resolveTargets } from './resolve.ts'
import { buildState, slideIndexText } from './state.ts'
import { intentSchema, understandPrompt, type Intent } from './understand.ts'

/** The customer's deck: a cover, four slides in a row with the SAME picture + text layout (7-10), a pricing slide, a thank-you page. */
const theme = getTheme('cobalt')
const slide = (id: string, c: SlideContent, extra: Record<string, unknown> = {}) => ({ id, locked: false, validation: { status: 'passed' as const, issues: [] }, ...composeSlide(c, theme, '16:9', () => `${id}e${Math.random().toString(36).slice(2, 8)}`), ...extra })
const tb = (title: string): SlideContent => ({ layout: 'title-body', title, bullets: ['First point here', 'Second point here', 'Third point here'], speakerNotes: '', sources: [] })
const split = (title: string): SlideContent => ({ layout: 'split-image-text', title, bullets: ['One idea', 'Another idea', 'A third idea'], imagePrompt: 'scene', imageAlt: title, speakerNotes: '', sources: [] })
function deck(): Presentation {
  return {
    schemaVersion: 1, id: 'd', title: 'Kalam', aspectRatio: '16:9', language: 'en', theme, sources: [],
    slides: [
      slide('s1', { layout: 'title', title: 'A P J Abdul Kalam', subtitle: 'A life of service', speakerNotes: '', sources: [] }),
      slide('s2', tb('Early life')), slide('s3', tb('Education')), slide('s4', tb('Market size')), slide('s5', tb('Market trends')), slide('s6', tb('Rocket science')),
      slide('s7', split('Architect of Pokhran-II')), slide('s8', split('Scientific leadership')), slide('s9', split('Missile programme')), slide('s10', split('Presidency and legacy')),
      slide('s11', tb('Pricing plans'), { locked: true }),
      slide('s12', { layout: 'thank-you', title: 'Thank you', speakerNotes: '', sources: [] }),
    ],
  } as unknown as Presentation
}
const free = { features: { premiumTemplates: false } } as never
const pro = { features: { premiumTemplates: true } } as never

/** fake model calls: the understanding is given, writing answers are made by the test */
function fake(intent: Partial<Intent>, writer: (card: string, input: any, problems: boolean) => unknown = () => ({ slides: [] })) {
  const calls = { understand: 0, write: 0, cards: [] as string[], authorized: [] as number[] }
  const deps: AssistantDeps = {
    understand: async () => { calls.understand++; return intentSchema.parse({ kind: 'edit', clarity: 'act', ...intent }) },
    write: async (p, schema, _route, card) => {
      calls.write++; calls.cards.push(card)
      const input = JSON.parse(p.prompt.match(/<input>([\s\S]*?)<\/input>/)![1]!)
      return schema.parse(writer(card, input, Array.isArray(input.problems)))
    },
    authorize: async (u) => { calls.authorized.push(u) },
    newId: (() => { let i = 0; return () => `new${++i}` })(),
  }
  return { deps, calls }
}
const run = (intent: Partial<Intent>, writer?: Parameters<typeof fake>[1], o: Partial<Parameters<typeof runAssistant>[0]> = {}) => {
  const f = fake(intent, writer)
  return runAssistant({ doc: deck(), ent: pro, instruction: 'x', activeSlideId: 's2', ...o }, f.deps).then((out) => ({ out, calls: f.calls }))
}
const done = (o: Awaited<ReturnType<typeof runAssistant>>) => { if (o.kind !== 'done') throw new Error(`expected done, got ${o.kind}`); return o }

describe('stage 1: the deck state is facts, not guesses', () => {
  it('focus: the slide on screen, and what the last answer changed', () => {
    const s = buildState(deck(), { activeSlideId: 's3', recent: [{ theme: false, slideIds: ['s12'], summary: ['Added a new slide at the end'] }] })
    expect(s.focus).toMatchObject({ current: 's3', lastChanged: ['s12'], lastChangeKind: 'slides', lastSummary: ['Added a new slide at the end'] })
    expect(slideIndexText(s).split('\n')[10]).toBe('11 | title-body | Pricing plans | bg #FFFFFF | locked')
  })
  it('the understanding prompt carries the slide index and focus, never the slides\' words, and stays small', () => {
    const s = buildState(deck(), { activeSlideId: 's7' })
    const p = understandPrompt(s, 'update layout of slides 7-10')
    expect(p.prompt).toContain('7 | split-image-text | Architect of Pokhran-II')
    expect(p.prompt).not.toContain('One idea') // no slide text
    expect((p.system.length + p.prompt.length) / 4).toBeLessThan(2600) // ≈ tokens: the cheap call stays cheap
  })
})

describe('stage 3: references become real slides by code', () => {
  const s = buildState(deck(), { activeSlideId: 's2', recent: [{ theme: false, slideIds: ['s12'], summary: ['Added a new slide at the end'] }] })
  const r = (refs: any[], defaultToCurrent?: boolean) => resolveTargets(s, refs, { instruction: 'make it blue', defaultToCurrent })
  it('numbers, ranges, last N, current, what was just changed, all', () => {
    expect(r([{ by: 'range', from: 7, to: 10 }])).toMatchObject({ ok: true, ids: ['s7', 's8', 's9', 's10'] })
    expect(r([{ by: 'number', n: 3 }, { by: 'number', n: 5 }])).toMatchObject({ ids: ['s3', 's5'] })
    expect(r([{ by: 'last', count: 2 }])).toMatchObject({ ids: ['s11', 's12'] })
    expect(r([{ by: 'current' }])).toMatchObject({ ids: ['s2'] })
    expect(r([{ by: 'just_changed' }])).toMatchObject({ ids: ['s12'] })
    expect((r([{ by: 'all' }]) as { ids: string[] }).ids).toHaveLength(12)
  })
  it('a title: one match is that slide; several are a question with buttons; none is said plainly', () => {
    expect(r([{ by: 'title', text: 'thank you page' }])).toMatchObject({ ids: ['s12'] })
    expect(r([{ by: 'title', text: 'pokhran' }])).toMatchObject({ ids: ['s7'] })
    const ask = r([{ by: 'title', text: 'the market slide' }])
    expect(ask).toMatchObject({ ok: false, ask: { text: 'Which slide do you mean — slide 4 or slide 5?' } })
    expect((ask as any).ask.options.map((o: any) => o.label)).toEqual(['Slide 4 — Market size', 'Slide 5 — Market trends', 'All of them'])
    expect((ask as any).ask.options[0].reply).toBe('make it blue (slide 4)')
    expect(r([{ by: 'title', text: 'quantum physics' }])).toMatchObject({ ok: false, refuse: expect.stringMatching(/couldn't find a slide about "quantum physics"/) })
  })
  it('a slide number past the end is refused with the real count; no target means the slide on screen', () => {
    expect(r([{ by: 'number', n: 40 }])).toMatchObject({ ok: false, refuse: 'There is no slide 40 — this deck has 12 slides.' })
    expect(r([])).toMatchObject({ ids: ['s2'] })
    expect(r([], false)).toMatchObject({ ids: [] })
  })
  it('"This slide" mode: the selected slide is the target; a request naming ANOTHER slide is refused, never moved onto this one', () => {
    const one = buildState(deck(), { activeSlideId: 's3', onlySlideId: 's3' })
    expect(resolveTargets(one, [], { instruction: 'x' })).toMatchObject({ ok: true, ids: ['s3'] })
    expect(resolveTargets(one, [{ by: 'number', n: 3 }], { instruction: 'x' })).toMatchObject({ ok: true, ids: ['s3'] })
    expect(resolveTargets(one, [{ by: 'number', n: 9 }], { instruction: 'x' })).toMatchObject({ ok: false, refuse: expect.stringMatching(/Only the selected slide/) })
  })
  it('a position ("after slide 3") is resolved exactly, even in "This slide" mode, and never falls back to the slide on screen', () => {
    const one = buildState(deck(), { activeSlideId: 's3', onlySlideId: 's3' })
    expect(resolveTargets(one, [{ by: 'number', n: 6 }], { instruction: 'x', anchor: true })).toMatchObject({ ok: true, ids: ['s6'] })
    expect(resolveTargets(one, [{ by: 'added_by_task', task: 0 }], { instruction: 'x', anchor: true })).toMatchObject({ ok: false })
  })
  it('new slides go at the end, the start, after a slide, or spread through the middle in order', () => {
    expect(insertionPoints(s, 1, 'end')).toEqual(['s12'])
    expect(insertionPoints(s, 2, 'start')).toEqual([null, null])
    expect(insertionPoints(s, 1, 'after', 's3')).toEqual(['s3'])
    const spread = insertionPoints(s, 4, 'spread')
    expect(spread).toHaveLength(4)
    expect(spread).not.toContain('s12') // never after the closing slide
    expect(spread).not.toContain(null)
  })
})

describe('the pipeline: the real chats that went wrong', () => {
  it('"update layout of slides 7-10": four different layouts, the slides\' own words, one writing call', async () => {
    const { out, calls } = await run({ tasks: [{ family: 'layout', targets: [{ by: 'range', from: 7, to: 10 }], values: {} }] }, (card, input) => ({
      slides: input.slides.map((s: any, i: number) => ({ slideId: s.slideId, content: { layout: ['process', 'timeline', 'agenda', 'process'][i], title: s.content.title, ...(i === 2 ? { items: s.content.bullets.map((b: string) => ({ label: b })) } : { steps: s.content.bullets.map((b: string) => ({ label: b.slice(0, 20), detail: b })) }) } })),
    }))
    const r = done(out)
    expect(calls).toMatchObject({ understand: 1, write: 1, cards: ['layout'] })
    expect(r.compiled.edits.map((e) => [e.slideId, e.content.layout])).toEqual([['s7', 'process'], ['s8', 'timeline'], ['s9', 'agenda'], ['s10', 'process']])
    expect(r.compiled.applied).toContain('Changed slide 9 to the agenda layout')
    expect(r.units).toBe(2) // more than one slide written
  })
  it('the check catches "all the same layout" and retries ONCE naming the problem; still wrong = the person is told', async () => {
    const same = (_c: string, input: any, problems: boolean) => ({ slides: input.slides.map((s: any, i: number) => ({ slideId: s.slideId, content: { layout: problems && i % 2 ? 'timeline' : 'process', title: s.content.title, steps: s.content.bullets.map((b: string) => ({ label: b, detail: b })) } })) })
    const fixed = await run({ tasks: [{ family: 'layout', targets: [{ by: 'range', from: 7, to: 10 }], values: {} }] }, same)
    expect(fixed.calls.write).toBe(2)
    expect(new Set(done(fixed.out).compiled.edits.map((e) => e.content.layout)).size).toBe(2)
    const never = await run({ tasks: [{ family: 'layout', targets: [{ by: 'range', from: 7, to: 10 }], values: {} }] }, (_c, input) => same(_c, input, false))
    expect(never.calls.write).toBe(2)
    expect(done(never.out).notes.join(' ')).toMatch(/^Not done: .*same layout/)
  })
  it('"add thank you page" then "color should be brown": the colour goes on THAT page (focus), the deck palette is untouched', async () => {
    const recent = [{ theme: false, slideIds: ['s12'], summary: ['Added a new slide at the end'] }]
    const { out, calls } = await run({ tasks: [{ family: 'background', targets: [{ by: 'just_changed' }], values: { color: '#7C2D12' } }] }, undefined, { recent })
    const r = done(out)
    expect(calls.write).toBe(0) // done by code, no second model call
    expect(r.compiled.backgrounds).toEqual([{ slideId: 's12', color: '#7C2D12' }])
    expect(r.compiled.theme).toBeNull()
    expect(r.units).toBe(1)
  })
  it('one message, two tasks: "add a thank you page and make it brown" targets the slide the first task adds', async () => {
    const { out } = await run({ tasks: [
      { family: 'add_slide', targets: [], values: { count: 1, where: 'end', about: 'thank you' } },
      { family: 'background', targets: [{ by: 'added_by_task', task: 0 }], values: { color: '#7C2D12' } },
    ] }, () => ({ slides: [{ content: { layout: 'thank-you', title: 'Thank you', subtitle: 'Questions?' } }] }))
    const r = done(out)
    expect(r.compiled.additions).toMatchObject([{ id: 'new1', afterSlideId: 's12', content: { layout: 'thank-you' } }])
    expect(r.compiled.backgrounds).toEqual([{ slideId: 'new1', color: '#7C2D12' }])
  })
  it('"add 2 slides after slide 3": both go after slide 3 in order (the second follows the first)', async () => {
    const { out } = await run({ tasks: [{ family: 'add_slide', targets: [], values: { count: 2, where: 'after', after: { by: 'number', n: 3 } } }] }, () => ({ slides: [{ content: tb('One') }, { content: tb('Two') }] }))
    expect(done(out).compiled.additions.map((a) => [a.id, a.afterSlideId])).toEqual([['new1', 's3'], ['new2', 'new1']])
  })
  it('text: "add 2 more points" that only rewords is retried once with the exact count; locked slides are left alone and said so', async () => {
    const { out, calls } = await run({ tasks: [{ family: 'text', targets: [{ by: 'number', n: 2 }, { by: 'number', n: 11 }], values: { request: 'add 2 more points', addPoints: 2 } }] }, (_c, input, problems) => ({
      slides: input.slides.map((s: any) => ({ slideId: s.slideId, content: { ...s.content, bullets: problems ? [...s.content.bullets, 'Four', 'Five'] : s.content.bullets.map((b: string) => `${b}!`) } })),
    }))
    const r = done(out)
    expect(calls.write).toBe(2)
    expect((r.compiled.edits[0]!.content as { bullets: string[] }).bullets).toHaveLength(5)
    expect(r.notes).toContain('Slide 11 is locked, so I left it alone.')
  })
})

describe('the pipeline: questions, chat and refusals cost nothing', () => {
  it('chat, off-topic, a question about the deck, and a question back to the person run no task', async () => {
    expect((await run({ kind: 'chat' })).out).toEqual({ kind: 'chat' })
    expect((await run({ kind: 'off_topic' })).out).toEqual({ kind: 'off_topic' })
    expect((await run({ kind: 'question', answer: 'It has 12 slides.' })).out).toEqual({ kind: 'answer', text: 'It has 12 slides.' })
    const ask = await run({ clarity: 'ask', question: 'The whole deck, or only this slide?' })
    expect(ask.out).toEqual({ kind: 'ask', question: { text: 'The whole deck, or only this slide?', options: [] } })
    expect(ask.calls.authorized).toEqual([])
  })
  it('an ambiguous title asks BEFORE anything is charged or written', async () => {
    const { out, calls } = await run({ tasks: [{ family: 'text', targets: [{ by: 'title', text: 'market' }], values: { request: 'shorten it' } }] })
    expect(out.kind).toBe('ask')
    expect(calls).toMatchObject({ write: 0, authorized: [] })
  })
  it('price units: undo is free, code-only work and one written slide are one unit, more written slides two', () => {
    const c = (f: keyof typeof CAPABILITIES, estimate: number) => ({ cap: CAPABILITIES[f], estimate })
    expect(priceUnits([c('undo', 0)])).toBe(0)
    expect(priceUnits([c('palette', 0), c('background', 3)])).toBe(1)
    expect(priceUnits([c('text', 1)])).toBe(1)
    expect(priceUnits([c('text', 1), c('add_slide', 1)])).toBe(2)
  })
  it('credits are authorised once, after planning and before the writing call', async () => {
    const { calls } = await run({ tasks: [{ family: 'text', targets: [{ by: 'range', from: 2, to: 3 }], values: { request: 'shorter' } }] }, (_c, input) => ({ slides: input.slides.map((s: any) => ({ slideId: s.slideId, content: { ...s.content, title: 'Short' } })) }))
    expect(calls.authorized).toEqual([2])
  })
})

describe('the pipeline: slide management and looks, done by code', () => {
  it('delete, move, duplicate and lock produce exact editor changes; a locked slide is never deleted; the last slide never goes', async () => {
    const del = done((await run({ tasks: [{ family: 'remove_slide', targets: [{ by: 'number', n: 4 }, { by: 'number', n: 11 }], values: {} }] })).out)
    expect(del.slideOps.removals).toEqual(['s4'])
    expect(del.notes).toContain('Slide 11 is locked, so I kept it.')
    expect(del.applied).toEqual(['Deleted slide 4'])
    const all = done((await run({ tasks: [{ family: 'remove_slide', targets: [{ by: 'all' }], values: {} }] }, undefined, { doc: { ...deck(), slides: deck().slides.filter((s) => !s.locked) } as Presentation })).out)
    expect(all.slideOps.removals).toEqual([])
    const mv = done((await run({ tasks: [{ family: 'move_slide', targets: [{ by: 'number', n: 6 }, { by: 'number', n: 7 }], values: { where: 'start' } }] })).out)
    expect(mv.slideOps.moves).toEqual([{ slideId: 's6', afterSlideId: null }, { slideId: 's7', afterSlideId: 's6' }])
    const dup = done((await run({ tasks: [{ family: 'duplicate_slide', targets: [{ by: 'number', n: 3 }], values: {} }] })).out)
    expect(dup.slideOps.duplicates).toEqual([{ slideId: 's3', newId: 'new1' }])
    const lock = done((await run({ tasks: [{ family: 'lock_slide', targets: [{ by: 'number', n: 2 }], values: { locked: true } }] })).out)
    expect(lock.slideOps.locks).toEqual([{ slideId: 's2', locked: true }])
  })
  it('deck look: a named template is found by code; a mood is chosen from the templates this plan allows; palette keeps what was not asked', async () => {
    const t = await run({ tasks: [{ family: 'template', targets: [], values: { mood: 'modern and dark' } }] }, (card, input) => ({ templateId: input.templates.find((x: string) => x.includes('|dark|'))!.split('|')[0] }), { ent: free })
    expect(t.calls.cards).toEqual(['template'])
    expect(done(t.out).compiled.theme).not.toBeNull()
    const dark = done((await run({ tasks: [{ family: 'palette', targets: [], values: { mode: 'dark' } }] })).out)
    expect(dark.compiled.applied[0]).toMatch(/New dark colour scheme/)
  })
  it('"This slide" mode: "delete slide 5" deletes nothing (the selected slide is never taken instead)', async () => {
    const r = done((await run({ tasks: [{ family: 'remove_slide', targets: [{ by: 'number', n: 5 }], values: {} }] }, undefined, { onlySlideId: 's3' })).out)
    expect(r.slideOps.removals).toEqual([])
    expect(r.notes[0]).toMatch(/Only the selected slide/)
  })
  it('removing the pictures of a locked slide is skipped and said so, never reported as done', async () => {
    const r = done((await run({ tasks: [{ family: 'picture', targets: [{ by: 'number', n: 11 }], values: { remove: true } }] })).out)
    expect(r.slideOps.clearPictures).toEqual([])
    expect(r.applied).toEqual([])
    expect(r.notes).toContain('Slide 11 is locked; skipped.')
  })
  it('whole-deck changes are refused in "This slide" mode, with a note', async () => {
    const r = done((await run({ tasks: [{ family: 'palette', targets: [], values: { mode: 'dark' } }] }, undefined, { onlySlideId: 's3' })).out)
    expect(r.compiled.theme).toBeNull()
    expect(r.notes[0]).toMatch(/Only the selected slide/)
  })
  it('pictures: a free photo by default, a paid proposal only when asked for AI; removing the picture of a picture + text slide keeps its words', async () => {
    const photo = done((await run({ tasks: [{ family: 'picture', targets: [{ by: 'number', n: 2 }], values: { source: 'photo', placement: 'background', subject: 'city skyline' } }] })).out)
    expect(photo.compiled.photos).toMatchObject([{ slideId: 's2', placement: 'background', query: 'city skyline' }])
    const ai = done((await run({ tasks: [{ family: 'picture', targets: [{ by: 'number', n: 2 }], values: { source: 'ai', placement: 'floating' } }] })).out)
    expect(ai.compiled.images).toHaveLength(1)
    const rm = done((await run({ tasks: [{ family: 'picture', targets: [{ by: 'number', n: 7 }], values: { remove: true } }] })).out)
    expect(rm.compiled.edits[0]).toMatchObject({ slideId: 's7', content: { layout: 'title-body', title: 'Architect of Pokhran-II' } })
    expect(rm.slideOps.clearPictures).toEqual(['s7'])
  })
  it('undo with nothing to put back says so; with a recorded change it is a free revert', async () => {
    const none = done((await run({ tasks: [{ family: 'undo', targets: [], values: {} }] })).out)
    expect(none.notes[0]).toMatch(/no earlier change of mine/)
    const back = done((await run({ tasks: [{ family: 'undo', targets: [], values: {} }] }, undefined, { recent: [{ theme: true, slideIds: [], summary: ['New dark colour scheme'] }] })).out)
    expect(back.compiled.reverts).toEqual([{ change: 0, part: 'all' }])
    expect(back.units).toBe(0)
  })
})
