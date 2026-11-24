import { describe, expect, it } from 'vitest'
import { composeSlide, getTheme } from '@prompttoppt/theme'
import type { Presentation, SlideContent } from '@prompttoppt/validation'
import { CAPABILITIES } from './capabilities/index.ts'
import { priceUnits, runAssistant, type AssistantDeps } from './pipeline.ts'
import { insertionPoints, resolveTargets } from './resolve.ts'
import { buildState, slideIndexText } from './state.ts'
import { elementOpsAnswer, intentSchema, objectsPrompt, understandPrompt, type Intent } from './understand.ts'

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
/** a partly blocked request (a locked slide among the targets): the FIRST answer asks "do the rest?" with nothing written or charged; the result is the answer to "Yes, do the rest" (the same tasks, no model) */
const runProceed = async (intent: Partial<Intent>, writer?: Parameters<typeof fake>[1], o: Partial<Parameters<typeof runAssistant>[0]> = {}) => {
  const first = await run(intent, writer, o)
  if (first.out.kind !== 'ask') throw new Error(`expected the do-the-rest question first, got ${first.out.kind}`)
  expect(first.calls).toMatchObject({ write: 0, authorized: [] })
  const yes = first.out.question.options.find((x) => x.confirm?.kind === 'proceed')
  if (!yes) throw new Error('no do-the-rest option')
  const second = await run({}, writer, { ...o, confirm: yes.confirm as never })
  return { ...second, asked: first.out.question.text }
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
    const p = understandPrompt(s, 'update layout of slides 7-10', [], { examples: false }) // the ALWAYS-sent part (the per-message examples have their own bound below and in catalogue.test.ts)
    const withExamples = understandPrompt(s, 'update layout of slides 7-10')
    expect(withExamples.prompt).toContain('<examples>')
    expect((withExamples.system.length + withExamples.prompt.length) / 4).toBeLessThan(3500 + 450)
    expect(p.prompt).toContain('7 | split-image-text | Architect of Pokhran-II')
    expect(p.prompt).not.toContain('One idea') // no slide text
    expect((p.system.length + p.prompt.length) / 4).toBeLessThan(3500) // ≈ tokens: the cheap call stays cheap (the guide is the STATIC part of the prompt, which providers cache when it repeats; 4500 with timing, paths and picture shapes). NEXT TIME do not raise this: split the object-operations guide into a second call used only when the model picks the object family (docs/AI_EDIT_HONESTY_AND_SCENARIOS.md section 24). Every capability's guide text is sent with EVERY message (2600 before the object and brand families, 3000 before shapes/tables/charts, 3500 with transitions): raise this deliberately, per family, never silently. (2600 before the object and brand families, which add the closed list of object operations)
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
  it('the check catches "all the same layout" and retries ONCE naming the problem; still wrong = NOTHING is applied and the person is told why (never a claimed change that misses the request)', async () => {
    const same = (_c: string, input: any, problems: boolean) => ({ slides: input.slides.map((s: any, i: number) => ({ slideId: s.slideId, content: { layout: problems && i % 2 ? 'timeline' : 'process', title: s.content.title, steps: s.content.bullets.map((b: string) => ({ label: b, detail: b })) } })) })
    const fixed = await run({ tasks: [{ family: 'layout', targets: [{ by: 'range', from: 7, to: 10 }], values: {} }] }, same)
    expect(fixed.calls.write).toBe(2)
    expect(new Set(done(fixed.out).compiled.edits.map((e) => e.content.layout)).size).toBe(2)
    const never = await run({ tasks: [{ family: 'layout', targets: [{ by: 'range', from: 7, to: 10 }], values: {} }] }, (_c, input) => same(_c, input, false))
    expect(never.calls.write).toBe(2)
    const r = done(never.out)
    expect(r.compiled.edits).toEqual([]); expect(r.compiled.applied).toEqual([])
    expect(r.notes.join(' ')).toMatch(/^I couldn't do that \(all 4 slides came back with the same layout \(process\).*\), so nothing was changed for it\./)
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
  it('text: "add 2 more points" that only rewords is retried once with the exact count; a locked slide among the targets is asked about FIRST, then left alone and said so', async () => {
    const { out, calls, asked } = await runProceed({ tasks: [{ family: 'text', targets: [{ by: 'number', n: 2 }, { by: 'number', n: 11 }], values: { request: 'add 2 more points', addPoints: 2 } }] }, (_c, input, problems) => ({
      slides: input.slides.map((s: any) => ({ slideId: s.slideId, content: { ...s.content, bullets: problems ? [...s.content.bullets, 'Four', 'Five'] : s.content.bullets.map((b: string) => `${b}!`) } })),
    }))
    const r = done(out)
    expect(calls.write).toBe(2)
    expect((r.compiled.edits[0]!.content as { bullets: string[] }).bullets).toHaveLength(5)
    expect(r.notes).toContain('Slide 11 is locked, so I left it alone.')
    expect(asked).toBe('I can do that for 1 slide, but not on slide 11 (locked). Nothing was changed yet. Shall I do the rest?')
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
    const del = done((await runProceed({ tasks: [{ family: 'remove_slide', targets: [{ by: 'number', n: 4 }, { by: 'number', n: 11 }], values: {} }] })).out)
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
    expect(rm.slideOps.clearPictures).toEqual([]) // (the layout switch alone takes the picture off: one promise, one check, no "had no picture" note)
  })
  it('"remove the background of this image" is never taken for removing the image: the picture is KEPT and asked to be cut out; a slide with no picture says so', async () => {
    const doc = deck() as unknown as { slides: { elements: unknown[] }[] }
    const img = (id: string, w: number, h: number, extra: object = {}) => ({ type: 'image', id, x: 0, y: 0, width: w, height: h, rotation: 0, locked: false, zIndex: 1, opacity: 1, src: `https://example.test/${id}.jpg`, alt: '', ...extra })
    doc.slides[1]!.elements = [img('small', 100, 100), img('big', 800, 600), img('decor', 900, 900, { decorative: true }), img('hidden', 500, 500, { opacity: 0 })]
    const f = fake({ tasks: [{ family: 'picture', targets: [{ by: 'number', n: 2 }], values: { cutout: true } }] })
    const r = done(await runAssistant({ doc: doc as never, ent: pro, instruction: 'x', activeSlideId: 's2' }, f.deps))
    expect(r.slideOps.clearPictures).toEqual([])
    expect(r.compiled.edits).toEqual([])
    expect(r.slideOps.cutouts.map((c) => c.elementId)).toEqual(['big', 'small']) // the main pictures, biggest first; never the decoration or a hidden copy
    expect(r.slideOps.cutouts[0]).toMatchObject({ slideId: 's2', url: 'https://example.test/big.jpg' })
    const none = done((await run({ tasks: [{ family: 'picture', targets: [{ by: 'number', n: 7 }], values: { cutout: true } }] })).out)
    expect(none.slideOps.cutouts).toEqual([])
    expect(none.notes.join(' ')).toMatch(/no picture to remove the background of/)
  })
  it('"remove the picture" on a Morph template slide is never reported as done (its pictures belong to the template design)', async () => {
    const doc = deck() as unknown as { slides: { layoutId: string }[] }
    doc.slides[1]!.layoutId = 'morph-template'
    const f = fake({ tasks: [{ family: 'picture', targets: [{ by: 'number', n: 2 }], values: { remove: true } }] })
    const r = done(await runAssistant({ doc: doc as never, ent: pro, instruction: 'x', activeSlideId: 's2' }, f.deps))
    expect(r.slideOps.clearPictures).toEqual([])
    expect(r.applied).toEqual([])
    expect(r.notes.join(' ')).toMatch(/Morph design/)
  })
  it('"undo that" after a MOVE or a DELETE works even when the model scopes it to "that slide" (the dead end seen in the 1,500-user test)', async () => {
    for (const summary of ['Moved slide 3 to the end', 'Deleted slide 4']) {
      const r = done((await run({ tasks: [{ family: 'undo', targets: [{ by: 'just_changed' }], values: { part: 'slide' } }] }, undefined, { recent: [{ theme: false, slideIds: ['s3'], summary: [summary] }] })).out)
      expect(r.compiled.reverts, summary).toEqual([{ change: 0, part: 'all' }])
      expect(r.notes, summary).toEqual([])
    }
  })
  it('undo with nothing to put back says so; with a recorded change it is a free revert', async () => {
    const none = done((await run({ tasks: [{ family: 'undo', targets: [], values: {} }] })).out)
    expect(none.notes[0]).toMatch(/no earlier change of mine/)
    const back = done((await run({ tasks: [{ family: 'undo', targets: [], values: {} }] }, undefined, { recent: [{ theme: true, slideIds: [], summary: ['New dark colour scheme'] }] })).out)
    expect(back.compiled.reverts).toEqual([{ change: 0, part: 'all' }])
    expect(back.units).toBe(0)
  })
})

describe('writer answers are accepted slide by slide', () => {
  const steps = (s: any) => ({ layout: Number(String(s.slideId).slice(1)) % 2 ? 'timeline' : 'process', title: s.content.title, steps: s.content.bullets.map((b: string) => ({ label: b.slice(0, 20), detail: b })) })
  const broken = { layout: 'comparison', title: 'x', left: { heading: 'a', bullets: ['b'] } } // the "right" side is missing
  const layoutTask: Partial<Intent> = { tasks: [{ family: 'layout', targets: [{ by: 'range', from: 7, to: 10 }], values: {} }] }

  it('one invalid slide of four does not throw the others away: only that one is asked again, with the reason, and then all four are applied', async () => {
    const seen: any[] = []
    const { out, calls } = await run(layoutTask, (_c, input, problems) => {
      seen.push(input)
      return { slides: input.slides.map((s: any, i: number) => ({ slideId: s.slideId, content: !problems && s.slideId === 's9' ? broken : steps(s) })) }
    })
    expect(calls.write).toBe(2)
    expect(seen[0].slides).toHaveLength(4)
    expect(seen[1].slides.map((s: any) => s.slideId)).toEqual(['s9'])
    expect(seen[1].problems[0]).toMatch(/^Slide 9 was rejected: right: /)
    expect(done(out).compiled.edits.map((e) => e.slideId)).toEqual(['s7', 's8', 's9', 's10'])
  })
  it('a slide that stays invalid is named and left as it was; the other three are still applied (it used to fail the whole answer as "AI busy")', async () => {
    const { out, calls } = await run(layoutTask, (_c, input) => ({ slides: input.slides.map((s: any) => ({ slideId: s.slideId, content: s.slideId === 's8' ? broken : steps(s) })) }))
    const r = done(out)
    expect(calls.write).toBe(2)
    expect(r.compiled.edits.map((e) => e.slideId)).toEqual(['s7', 's9', 's10'])
    expect(r.notes.join(' ')).toMatch(/Slide 8: I couldn't do that \(.+\), so I left it as it was\./) // (with the reason, so a person can act on it)
  })
  it('a slide that was not returned at all, or came back without its layout change, is asked for again like an invalid one', async () => {
    const { out, calls } = await run(layoutTask, (_c, input, problems) => ({ slides: input.slides.filter((s: any) => problems || s.slideId !== 's10').map((s: any) => ({ slideId: s.slideId, content: !problems && s.slideId === 's7' ? s.content : steps(s) })) }))
    expect(calls.write).toBe(2)
    expect(done(out).compiled.edits).toHaveLength(4)
  })
  it('a text edit that changes the slide\'s layout is refused and asked again; the writer is told each slide\'s exact point limit', async () => {
    const seen: any[] = []
    const { out, calls } = await run({ tasks: [{ family: 'text', targets: [{ by: 'number', n: 2 }], values: { request: 'rewrite' } }] }, (_c, input, problems) => {
      seen.push(input)
      return { slides: input.slides.map((s: any) => ({ slideId: s.slideId, content: problems ? { ...s.content, title: 'New title' } : { layout: 'quote', quote: 'q' } })) }
    })
    expect(calls.write).toBe(2)
    expect(seen[0].slides[0].limits).toEqual({ maxPointsPerList: 6 })
    expect(seen[1].problems[0]).toMatch(/must keep the title-body layout \(you returned quote\)/)
    expect(done(out).compiled.edits[0]!.content).toMatchObject({ layout: 'title-body', title: 'New title' })
  })
  it('new slides: the invalid ones are asked for again (only those), the valid ones are kept, and a shortfall is said plainly', async () => {
    const asked: number[] = []
    const good = (i: number) => ({ content: tb(`Slide ${i}`) })
    const { out } = await run({ tasks: [{ family: 'add_slide', targets: [], values: { count: 3, where: 'end', about: 'more' } }] }, (_c, input) => { asked.push(input.count); return { slides: input.count === 3 ? [good(1), { content: broken }, good(3)] : [good(2)] } })
    expect(asked).toEqual([3, 1])
    expect(done(out).compiled.additions).toHaveLength(3)
    const stuck = await run({ tasks: [{ family: 'add_slide', targets: [], values: { count: 2, where: 'end', about: 'more' } }] }, (_c, input) => ({ slides: input.count === 2 ? [good(1), { content: broken }] : [{ content: broken }] }))
    expect(done(stuck.out).compiled.additions).toHaveLength(1)
    expect(done(stuck.out).notes).toContain('I could only make 1 of the 2 slides you asked for.')
  })
  it('figures are traced against the deck AS IT IS and the person\'s own words: a chart whose numbers appear only in the slide being added is refused; typed figures pass', async () => {
    const chartOf = (values: number[]) => ({ layout: 'chart', title: 'Market share', chartType: 'pie', labels: ['A', 'B', 'C', 'D'], series: [{ name: 'Share', values }], unit: '%', takeaway: 'We lead the market', speakerNotes: '', sources: [] })
    const mk = (instruction: string) => runAssistant({ doc: deck(), ent: pro, instruction, activeSlideId: 's2' }, fake({ tasks: [{ family: 'add_slide', targets: [], values: { count: 1, where: 'end', about: 'market share', layout: 'chart' } }] }, () => ({ slides: [{ content: chartOf([17, 31, 23, 29]) }] })).deps)
    const invented = done(await mk('add a pie chart of our market share'))
    expect(invented.compiled.additions).toEqual([])
    expect(invented.notes.join(' ')).toMatch(/figures .* are not in your message, your deck or your sources/)
    const given = done(await mk('add a pie chart: 17% A, 31% B, 23% C and 29% D'))
    expect(given.compiled.additions).toHaveLength(1)
  })
  it('a slide built from the person\'s OWN uploaded template keeps its design: a layout change is refused with the reason, and nothing is reported as done', async () => {
    const doc = deck() as unknown as { slides: { fromFile?: boolean }[] }
    doc.slides[1]!.fromFile = true
    const f = fake({ tasks: [{ family: 'layout', targets: [{ by: 'number', n: 2 }], values: { layout: 'timeline' } }] })
    const r = done(await runAssistant({ doc: doc as never, ent: pro, instruction: 'x', activeSlideId: 's2' }, f.deps))
    expect(r.applied).toEqual([])
    expect(r.compiled.edits).toEqual([])
    expect(r.notes.join(' ')).toMatch(/your own template/)
  })
  it('"use my coffee photo" when the model only says "latest": the upload the person NAMED is used, not the newest; with no name said, the newest', async () => {
    const mk = (instruction: string) => {
      const doc = deck() as unknown as { slides: { elements: unknown[] }[] }
      doc.slides[1]!.elements = [{ type: 'image', id: 'only', x: 0, y: 0, width: 600, height: 400, rotation: 0, locked: false, zIndex: 1, opacity: 1, src: 'https://example.test/old.jpg', alt: 'old' }]
      const f = fake({ tasks: [{ family: 'picture', targets: [{ by: 'number', n: 2 }], values: { replace: 'latest' } }] })
      return runAssistant({ doc: doc as never, ent: pro, instruction, activeSlideId: 's2', uploads: [{ id: 'u1', url: 'https://x.test/tea.png', name: 'tea leaves' }, { id: 'u2', url: 'https://x.test/coffee.png', name: 'coffee beans' }] } as never, f.deps)
    }
    expect(done(await mk('use my coffee photo here')).slideOps.swaps[0]?.url).toBe('https://x.test/coffee.png')
    const newest = done(await mk('use my latest upload'))
    expect(newest.slideOps.swaps[0]?.url).toBe('https://x.test/tea.png')
  })
  it('addressIsInMessage: the website the model passes must be written in the person\'s own message', async () => {
    const { addressIsInMessage } = await import('./capabilities/look.ts')
    expect(addressIsInMessage('acme.com', 'match the brand of acme.com')).toBe(true)
    expect(addressIsInMessage('https://www.acme.com/about', 'use https://acme.com for the style')).toBe(true)
    expect(addressIsInMessage('www.Acme.com', 'make it look like WWW.ACME.COM please')).toBe(true)
    expect(addressIsInMessage('acme.com', 'match the brand of my company website')).toBe(false) // invented by the model
    expect(addressIsInMessage('acme', 'match acme')).toBe(false) // not an address
    expect(addressIsInMessage('acme.com', 'match the brand of notacme.org')).toBe(false)
    expect(addressIsInMessage('acme.com', 'match the brand of notacme.com')).toBe(false)
    expect(addressIsInMessage('acme.com', 'match the brand of mail.acme.com.')).toBe(true)
  })

  describe('"I can\'t do that yet" is never a mistake: a second look at what CAN be done', () => {
    const answers = (list: Partial<Intent>[]) => { let n = 0; const seen: string[] = []; const base = fake({}); const deps: AssistantDeps = { ...base.deps, understand: async (p) => { seen.push(p.prompt); return intentSchema.parse({ kind: 'edit', clarity: 'act', ...list[Math.min(n++, list.length - 1)] }) } }; return { deps, seen, calls: () => n } }
    it('only unsupported parts: the model is asked once more with the real capability list, and a task it finds is used', async () => {
      const a = answers([{ unsupported: ['lock slide 2'] }, { tasks: [{ family: 'lock_slide', targets: [{ by: 'number', n: 2 }], values: { locked: true } }] }])
      const r = done(await runAssistant({ doc: deck(), ent: pro, instruction: 'protect slide 2', activeSlideId: 's1' }, a.deps))
      expect(a.calls()).toBe(2)
      expect(a.seen[1]).toMatch(/<second look>[\s\S]*lock or unlock slides[\s\S]*<\/second look>/)
      expect(r.slideOps.locks).toHaveLength(1)
      expect(r.notes.join(' ')).not.toMatch(/can't do that yet/)
    })
    it('when nothing fits it stays unsupported, said by code', async () => {
      const a = answers([{ unsupported: ['play music'] }])
      const r = done(await runAssistant({ doc: deck(), ent: pro, instruction: 'play music', activeSlideId: 's1' }, a.deps))
      expect(a.calls()).toBe(2)
      expect(r.notes.join(' ')).toMatch(/I can't do that yet: play music/)
      expect(r.applied).toEqual([])
    })
    it('it is NOT asked again when the model already found a task, or when there is nothing unsupported', async () => {
      const a = answers([{ tasks: [{ family: 'lock_slide', targets: [{ by: 'number', n: 2 }], values: { locked: true } }], unsupported: ['play music'] }])
      await runAssistant({ doc: deck(), ent: pro, instruction: 'lock slide 2 and play music', activeSlideId: 's1' }, a.deps)
      expect(a.calls()).toBe(1)
      const b = answers([{ kind: 'chat' }])
      await runAssistant({ doc: deck(), ent: pro, instruction: 'hi', activeSlideId: 's1' }, b.deps)
      expect(b.calls()).toBe(1)
    })
  })

  describe('a big message is done step by step', () => {
    it('does the first parts, names the rest in the person\'s words, and offers them as the next step', async () => {
      const t = (n: number, phrase: string) => ({ family: 'background' as const, targets: [{ by: 'number' as const, n }], values: { color: '#112233' }, phrase })
      // (three or more changes are shown as a plan first: the plan names the first four and the rest for the next step; "Go ahead" does the four and still offers the rest)
      const { out, asked } = await runProceed({ tasks: [t(1, 'slide 1 dark'), t(2, 'slide 2 dark'), t(3, 'slide 3 dark'), t(4, 'slide 4 dark'), t(5, 'slide 5 dark'), t(6, 'slide 6 dark')] })
      expect(asked).toMatch(/^I'll make these 4 changes:\n1\. slide 1 dark\n2\. slide 2 dark\n3\. slide 3 dark\n4\. slide 4 dark\nThen, in the next step: slide 5 dark; slide 6 dark\.\nNothing has changed yet\. Go ahead\?$/)
      const r = done(out)
      expect(r.later).toEqual(['slide 5 dark', 'slide 6 dark'])
      expect(r.notes.join(' ')).toMatch(/step by step: the first 4 parts are done here. Still to do: slide 5 dark; slide 6 dark\./)
      expect(r.compiled.backgrounds).toHaveLength(4) // only four were done
    })
    it('two changes in one message are done at once; three or more are shown as a plan first and nothing runs or is charged before Go ahead', async () => {
      const t = (n: number) => ({ family: 'background' as const, targets: [{ by: 'number' as const, n }], values: { color: '#112233' }, phrase: `slide ${n} dark` })
      expect(done((await run({ tasks: [t(1), t(2)] })).out).compiled.backgrounds).toHaveLength(2)
      const three = await run({ tasks: [t(1), t(2), t(3)] })
      expect(three.out.kind).toBe('ask'); expect(three.calls).toMatchObject({ write: 0, authorized: [] })
    })
    it('a message within the limit has nothing left over', async () => {
      const { out } = await run({ tasks: [{ family: 'background', targets: [{ by: 'number', n: 1 }], values: { color: '#112233' } }] })
      expect(done(out).later).toBeUndefined()
    })
  })

  describe('object tasks are decided in a second step', () => {
    const picDeck = () => { const d = deck() as unknown as { slides: { elements: unknown[] }[] }; d.slides[1]!.elements = [{ type: 'image', id: 'only', x: 100, y: 100, width: 600, height: 400, rotation: 0, locked: false, zIndex: 1, opacity: 1, src: 'https://example.test/a.jpg', alt: 'a', fit: 'cover', clip: 'none' }]; return d as never }
    const twoStep = (stage1: Partial<Intent>, stage2: unknown) => { const seen = { one: [] as string[], two: [] as string[] }; const base = fake({}); const deps: AssistantDeps = { ...base.deps, understand: async (p) => { seen.one.push(p.system); return intentSchema.parse({ kind: 'edit', clarity: 'act', ...stage1 }) }, understandOps: async (p) => { seen.two.push(p.system + '\n' + p.prompt); return elementOpsAnswer.parse(stage2) as never } }; return { deps, seen } }
    it('step 1 only says "objects"; step 2 (with the full operation list) says which and what, and the change is made', async () => {
      const a = twoStep({ tasks: [{ family: 'element', targets: [{ by: 'number', n: 2 }], values: {} }] }, { tasks: [{ index: 0, elements: [{ by: 'type', type: 'image' }], ops: [{ op: 'picture_style', clip: 'circle' }] }] })
      const r = done(await runAssistant({ doc: picDeck(), ent: { features: { advancedEditor: true } } as never, instruction: 'make the picture a circle', activeSlideId: 's2' }, a.deps))
      expect(a.seen.two).toHaveLength(1)
      expect(a.seen.two[0]).toMatch(/picture_style/); expect(a.seen.two[0]).toMatch(/"index":0/)
      expect(a.seen.one[0]).not.toMatch(/picture_style|table_order|chart_value|add_shape/) // the long operation list is NOT in the first prompt
      expect(r.slideOps.elementChanges).toHaveLength(1)
      expect(r.slideOps.elementChanges[0]!.patch).toMatchObject({ clip: 'circle' })
    })
    it('a plan limit is refused with the reason AND the upgrade offer; a rule or a switch is not an upgrade', async () => {
      const mk = () => twoStep({ tasks: [{ family: 'element', targets: [{ by: 'number', n: 2 }], values: {} }] }, { tasks: [{ index: 0, elements: [{ by: 'type', type: 'image' }], ops: [{ op: 'picture_style', clip: 'circle' }] }] })
      const a = mk()
      const r = await runAssistant({ doc: picDeck(), ent: { features: { advancedEditor: false } } as never, instruction: 'make the picture a circle', activeSlideId: 's2' }, a.deps)
      expect(r).toMatchObject({ kind: 'done' })
      expect((r as { notes: string[] }).notes.join(' ')).toMatch(/advanced editor, which your plan does not include/)
      expect((r as { upgrade?: string }).upgrade).toMatch(/advanced editor/)
      const b = mk()
      const ok = await runAssistant({ doc: picDeck(), ent: { features: { advancedEditor: true } } as never, instruction: 'make the picture a circle', activeSlideId: 's2' }, b.deps)
      expect((ok as { upgrade?: string }).upgrade).toBeUndefined()
    })
    it('a listed id becomes its sentence with the way forward; free words keep the plain sentence', async () => {
      const a = twoStep({ tasks: [{ family: 'element', targets: [{ by: 'number', n: 2 }], values: {} }] }, { tasks: [{ index: 0, unsupported: 'shape_shadow' }] }) // (chart styling is supported now: a still-unsupported listed id)
      const r = await runAssistant({ doc: picDeck(), ent: { features: { advancedEditor: true } } as never, instruction: 'add a shadow to the box', activeSlideId: 's2' }, a.deps)
      const text = (r as { notes: string[] }).notes.join(' ')
      expect(text).toMatch(/a shadow on a shape or on text/)
      expect(text).toMatch(/Give a shape an outline or a different colour/)
      const b = twoStep({ tasks: [{ family: 'element', targets: [{ by: 'number', n: 2 }], values: {} }] }, { tasks: [{ index: 0, unsupported: 'other', said: 'spin the slide in 3D' }] })
      const r2 = await runAssistant({ doc: picDeck(), ent: { features: { advancedEditor: true } } as never, instruction: 'spin the slide in 3D', activeSlideId: 's2' }, b.deps)
      expect((r2 as { notes: string[] }).notes.join(' ')).toMatch(/I can't do that yet: spin the slide in 3D\./)
    })
    it('an id that is not on the list is not an error: it becomes "other" with the model\'s own words', () => {
      const bad = elementOpsAnswer.parse({ tasks: [{ index: 0, unsupported: 'chart_legend' }] }).tasks[0]!
      expect(bad).toMatchObject({ unsupported: 'other', said: 'chart_legend' })
      expect(elementOpsAnswer.parse({ tasks: [{ index: 0, unsupported: 'hand_path' }] }).tasks[0]).toMatchObject({ unsupported: 'hand_path' })
    })
    it('a question from step 2 is asked as it is, and nothing is changed', async () => {
      const a = twoStep({ tasks: [{ family: 'element', targets: [{ by: 'number', n: 2 }], values: {} }] }, { tasks: [{ index: 0, ask: 'Which picture do you mean?' }] })
      const out = await runAssistant({ doc: picDeck(), ent: { features: { advancedEditor: true } } as never, instruction: 'make it a circle', activeSlideId: 's2' }, a.deps)
      expect(out).toMatchObject({ kind: 'ask', question: { text: 'Which picture do you mean?' } })
    })
    it('step 2 is not asked for anything that is not an object task, or when step 1 already gave operations', async () => {
      const a = twoStep({ tasks: [{ family: 'lock_slide', targets: [{ by: 'number', n: 2 }], values: { locked: true } }] }, { tasks: [{ index: 0, ops: [{ op: 'delete' }] }] })
      await runAssistant({ doc: deck(), ent: pro, instruction: 'lock slide 2', activeSlideId: 's1' }, a.deps)
      expect(a.seen.two).toHaveLength(0)
      const b = twoStep({ tasks: [{ family: 'element', targets: [{ by: 'number', n: 2 }], values: { elements: [{ by: 'type', type: 'image' }], ops: [{ op: 'delete' }] } }] }, { tasks: [{ index: 0, ops: [{ op: 'delete' }] }] })
      await runAssistant({ doc: picDeck(), ent: { features: { advancedEditor: true } } as never, instruction: 'delete the picture', activeSlideId: 's2' }, b.deps)
      expect(b.seen.two).toHaveLength(0)
    })
    it('the object prompt carries the selection and counts, and the first prompt is a fraction of what it was', () => {
      const st = buildState(deck(), { activeSlideId: 's2' })
      const one = understandPrompt(st, 'x'), two = objectsPrompt(st, 'x', [{ index: 0, targets: [] }])
      const tokens = (p: { system: string; prompt: string }) => (p.system.length + p.prompt.length) / 4
      expect(tokens(one)).toBeLessThan(3500)
      expect(two.prompt).toMatch(/"selected"/); expect(two.prompt).toMatch(/objectsOnCurrentSlide/)
    })
  })
})

describe('W0 slice 1: "done" means the REQUEST is met (real chats: "5 points total in timeline", "add more content", "add 2 more in both side")', () => {
  const timeline = (n: number): SlideContent => ({ layout: 'timeline', title: 'Academic Pursuits', steps: Array.from({ length: n }, (_, i) => ({ label: `Step ${i + 1}`, detail: `What happened in step ${i + 1}` })), speakerNotes: '', sources: [] } as unknown as SlideContent)
  const withTimeline = () => { const d = deck(); d.slides[2] = slide('s3', timeline(4)) as never; return d }
  const textTask = (values: Record<string, unknown>, n = 3): Partial<Intent> => ({ tasks: [{ family: 'text', targets: [{ by: 'number', n }], values: { request: 'change the text', ...values } }] })
  const editOf = (r: ReturnType<typeof done>, id: string) => r.compiled.edits.find((e) => e.slideId === id)?.content as any

  it('"also add 5 points total in timeline": the writer is told exactly 5; 4 steps is NOT accepted (retried with the reason), 5 is applied', async () => {
    const seen: any[] = []
    const { out, calls } = await run(textTask({ totalPoints: 5 }), (_c, input, problems) => { seen.push(input); return { slides: [{ slideId: 's3', content: problems ? timeline(5) : { ...timeline(4), title: 'Reworded' } }] } }, { doc: withTimeline() })
    expect(seen[0].slides[0].goal).toEqual({ points: { steps: 5 } })
    expect(seen[1].problems[0]).toMatch(/Slide 3 was rejected: it has 4 points; it needs exactly 5/)
    expect(calls.write).toBe(2)
    expect(editOf(done(out), 's3').steps).toHaveLength(5)
  })
  it('a writer that never reaches the goal: the slide is NOT changed and the reply says why (it used to say "Done — rewrote slide 4")', async () => {
    const { out } = await run(textTask({ totalPoints: 5 }), () => ({ slides: [{ slideId: 's3', content: { ...timeline(4), title: 'Reworded' } }] }), { doc: withTimeline() })
    const r = done(out)
    expect(r.compiled.edits).toEqual([]); expect(r.compiled.applied).toEqual([])
    expect(r.notes.join(' ')).toMatch(/Slide 3: I couldn't do that \(it has 4 points; it needs exactly 5\), so I left it as it was\./)
  })
  it('more than the layout holds ("8 points" on a timeline that holds 6): asked BEFORE writing, nothing written, nothing charged', async () => {
    const { out, calls } = await run(textTask({ totalPoints: 8 }), undefined, { doc: withTimeline() })
    expect(out.kind).toBe('ask')
    expect(calls.write).toBe(0); expect(calls.authorized).toEqual([1]) // (the route gives the reservation back for a question)
    if (out.kind === 'ask') { expect(out.question.text).toMatch(/slide 3: this timeline slide holds at most 6 points\. Nothing was changed/); expect(out.question.options.map((o) => o.label)).toEqual(['Yes, 6 points', 'No, leave it']) }
  })
  it('"add more content in the 2nd slide": the writer gets a word target; the same amount of words reworded is NOT done', async () => {
    const seen: any[] = []
    const same = { layout: 'title-body', title: 'Early life', bullets: ['First idea here', 'Second idea here', 'Third idea here'], speakerNotes: '', sources: [] }
    const longer = { ...same, bullets: ['First idea here, with the detail of what happened and why it mattered', 'Second idea here, with an example from the period', 'Third idea here, and what it led to later'] }
    const { out } = await run(textTask({ length: 'longer' }, 2), (_c, input, problems) => { seen.push(input); return { slides: [{ slideId: 's2', content: problems ? longer : same }] } })
    expect(seen[0].slides[0].goal.words.atLeast).toBeGreaterThan(10)
    expect(seen[1].problems[0]).toMatch(/it needs at least \d+ \(more detail/)
    expect(editOf(done(out), 's2').bullets[0]).toMatch(/what happened/)
  })
  it('"add 2 more in both side" on a comparison: each side ends with exactly +2', async () => {
    const d = deck(); d.slides[2] = slide('s3', { layout: 'comparison', title: 'Balance', left: { heading: 'State', bullets: ['a1', 'a2', 'a3'] }, right: { heading: 'Person', bullets: ['b1', 'b2', 'b3'] }, speakerNotes: '', sources: [] } as unknown as SlideContent) as never
    const side = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`)
    const { out, calls } = await run(textTask({ addPoints: 2 }), (_c, input, problems) => ({ slides: [{ slideId: 's3', content: { layout: 'comparison', title: 'Balance', left: { heading: 'State', bullets: side(problems ? 5 : 6, 'a') }, right: { heading: 'Person', bullets: side(problems ? 5 : 6, 'b') }, speakerNotes: '', sources: [] } }] }), { doc: d })
    expect(calls.write).toBe(2) // 6 per side (one too many each) was refused
    const c = editOf(done(out), 's3')
    expect([c.left.bullets.length, c.right.bullets.length]).toEqual([5, 5])
  })
  it('speaker notes only: code takes ONLY the notes from the writer, so a writer that also rewords the title cannot change the slide (one call, no retry)', async () => {
    const base = { layout: 'title-body', title: 'Early life', bullets: ['First point here', 'Second point here', 'Third point here'], sources: [] }
    const { out, calls } = await run(textTask({ notesOnly: true }, 2), () => ({ slides: [{ slideId: 's2', content: { ...base, title: 'Early years', bullets: ['changed'], speakerNotes: 'Talk about the early years.' } }] }))
    expect(calls.write).toBe(1)
    const c = editOf(done(out), 's2')
    expect(c.title).toBe('Early life'); expect(c.bullets).toEqual(['First point here', 'Second point here', 'Third point here']); expect(c.speakerNotes).toBe('Talk about the early years.')
  })
  it('"add more content" may also add points to lists with room (the writer is told which, and the result keeps the new item)', async () => {
    const seen: any[] = []
    const { out } = await run(textTask({ length: 'longer' }, 2), (_c, input) => { seen.push(input); return { slides: [{ slideId: 's2', content: { layout: 'title-body', title: 'Early life', bullets: ['First point here, told in more detail', 'Second point here, with an example', 'Third point here', 'A fourth point that adds real detail'], speakerNotes: '', sources: [] } }] } })
    expect(seen[0].slides[0].goal.mayAddPoints).toEqual({ bullets: 6 })
    expect(editOf(done(out), 's2').bullets).toHaveLength(4)
  })
  it('"4 slides after slide 6" with one withheld (an invented figure): the other three still go right after slide 6, never to the end', async () => {
    let i = 0
    const { out } = await run({ tasks: [{ family: 'add_slide', targets: [], values: { count: 4, where: 'after', after: { by: 'number', n: 6 }, about: 'more' } }] }, () => ({ slides: [0, 1, 2, 3].map(() => ({ content: { layout: 'title-body', title: `New ${++i}`, bullets: i === 2 ? ['Revenue grew 42% to $9.7 million', 'b point', 'c point'] : ['a point', 'b point', 'c point'], speakerNotes: '', sources: [] } })) }), { instruction: 'add 4 more slides after slide 6' })
    const r = done(out)
    expect(r.compiled.additions).toHaveLength(3)
    // new2 was withheld: new3 takes its place right after new1, new4 after new3; nothing falls to the end
    expect(r.compiled.additions.map((a) => [a.id, a.afterSlideId])).toEqual([['new1', 's6'], ['new3', 'new1'], ['new4', 'new3']])
    expect(r.notes.join(' ')).toMatch(/I never make up numbers/)
  })
  it('W1: a timed script ("30 seconds") is the notes at a normal speaking pace: too short is sent back once with the exact gap, the reply calls the length an estimate', async () => {
    const base = { layout: 'title-body', title: 'Early life', bullets: ['First point here', 'Second point here', 'Third point here'], sources: [] }
    const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
    const seen: any[] = []
    let i = 0
    const { out, calls } = await run(textTask({ notesOnly: true, notesSeconds: 30 }, 2), (_c, input) => { seen.push(input); return { slides: [{ slideId: 's2', content: { ...base, speakerNotes: words(++i === 1 ? 20 : 70) } }] } })
    expect(seen[0].speakerNotesWords).toEqual({ about: 70, atLeast: 56, atMost: 84 })
    expect(calls.write).toBe(2) // (20 words was refused: the exact gap went back)
    expect(seen[1].problems.join(' ')).toMatch(/must be 56-84 words \(about 30 seconds spoken\); they have 20/)
    const r = done(out)
    expect(editOf(r, 's2').speakerNotes.split(' ')).toHaveLength(70)
    expect(r.notes.join(' ')).toMatch(/Slide 2: about 30 seconds spoken at a normal pace \(70 words; your own pace may differ\)/)
  })
  it('W1: a timed script for many slides keeps its timing through the confirm', async () => {
    const { out } = await runProceed({ tasks: [{ family: 'text', targets: [{ by: 'all' }], values: { request: 'write a 1 minute script', notesOnly: true, notesSeconds: 60 } }] })
    if (out.kind === 'ask') expect(out.question.options[0]!.confirm).toMatchObject({ kind: 'text_bulk', notesOnly: true, notesSeconds: 60 })
    else throw new Error('expected the confirm')
  })
  it('notes for many slides: the confirm says it writes the SPEAKER NOTES (it used to say "rewrites the words")', async () => {
    const { out } = await runProceed({ tasks: [{ family: 'text', targets: [{ by: 'all' }], values: { request: 'add speaker notes', notesOnly: true } }] })
    expect(out.kind).toBe('ask')
    if (out.kind === 'ask') { expect(out.question.text).toMatch(/^This writes the speaker notes of 11 of the 12 slides/); expect(out.question.options[0]!.confirm).toMatchObject({ kind: 'text_bulk', notesOnly: true }) }
  })
  it('"make these 4 different": a picture layout is refused for slides without a picture (no empty picture boxes)', async () => {
    const d = deck(); for (const i of [6, 7, 8, 9]) d.slides[i] = slide(d.slides[i]!.id, tb(`Topic ${i}`)) as never
    const { out } = await run({ tasks: [{ family: 'layout', targets: [{ by: 'range', from: 7, to: 10 }], values: {} }] }, (_c, input, problems) => ({ slides: input.slides.map((s: any, i: number) => ({ slideId: s.slideId, content: !problems && i === 0 ? { layout: 'split-image-text', title: s.content.title, bullets: s.content.bullets, imagePrompt: 'x', imageAlt: 'x', speakerNotes: '', sources: [] } : { layout: i % 2 ? 'process' : 'timeline', title: s.content.title, steps: s.content.bullets.map((b: string) => ({ label: b.slice(0, 20), detail: b })) } })) }), { doc: d })
    const r = done(out)
    expect(r.compiled.edits.map((e) => e.content.layout)).not.toContain('split-image-text')
    expect(r.compiled.edits).toHaveLength(4)
  })
})

describe('W0 slice 2: check BEFORE changing (real chat: "update the text color to red" left slides 9-10 and said Done)', () => {
  const big = (slides: number) => { const d = deck(); const extra = Array.from({ length: slides }, (_, i) => slide(`b${i}`, tb(`Topic ${i}`))); d.slides = [...d.slides.filter((s) => !s.locked), ...extra] as never; return d }
  const textCount = (d: Presentation) => d.slides.reduce((n, s) => n + s.elements.filter((e) => e.type === 'text' && !e.decorative && !(e as { brand?: boolean }).brand).length, 0)
  const editor = { features: { premiumTemplates: true, advancedEditor: true } } as never
  const red = { tasks: [{ family: 'element' as const, targets: [{ by: 'all' as const }], values: { elements: [{ by: 'all_text' }], ops: [{ op: 'text_style', color: '#FF0000' }] } }] }

  it('more than 60 text objects: EVERY one is changed (the first 60 used to be kept silently)', async () => {
    const d = big(30)
    expect(textCount(d)).toBeGreaterThan(60)
    const r = done((await run(red, undefined, { doc: d, ent: editor })).out)
    expect(r.slideOps.elementChanges).toHaveLength(textCount(d))
    expect(new Set(r.slideOps.elementChanges.map((c) => c.slideId)).size).toBe(d.slides.length)
  })
  it('more than the request limit: refused BEFORE anything changes, with the count and what to do instead (never a silent cut)', async () => {
    const d = big(160)
    const r = done((await run(red, undefined, { doc: d, ent: editor })).out)
    expect(r.slideOps.elementChanges).toEqual([])
    expect(r.notes.join(' ')).toMatch(/That is \d+ objects, more than the 400 I can change in one request, so nothing was changed\./)
  })
  it('some slides locked: asked first ("do the rest?"), nothing charged; "Yes" changes every unlocked text and names the locked slide', async () => {
    const { out, asked } = await runProceed(red, undefined, { ent: editor })
    const r = done(out)
    expect(asked).toMatch(/^I can do that for \d+ objects, but not on slide 11 \(locked\)\. Nothing was changed yet\. Shall I do the rest\?$/)
    expect(r.slideOps.elementChanges.some((c) => c.slideId === 's11')).toBe(false)
    expect(r.slideOps.elementChanges.length).toBeGreaterThan(10)
  })
  it('EVERYTHING asked is blocked (only the locked slide): no pointless question, a plain reason, nothing charged', async () => {
    const { out, calls } = await run({ tasks: [{ family: 'remove_slide', targets: [{ by: 'number', n: 11 }], values: {} }] })
    const r = done(out)
    expect(r.slideOps.removals).toEqual([])
    expect(r.notes).toContain('Slide 11 is locked, so I kept it.')
    expect(calls.authorized).toEqual([1]) // (code-only work; the route refunds a request that changed nothing)
  })
  it('the "do the rest" answer re-checks every task: a forged task value is refused like any new request', async () => {
    const { out } = await run({}, undefined, { confirm: { kind: 'proceed', tasks: [{ family: 'transition', targets: [{ by: 'all' }], values: { type: 'teleport' } }] } as never })
    const r = done(out)
    expect(r.compiled.applied).toEqual([]); expect(r.notes).toEqual(['That confirmation does not match what I can do any more, so nothing was changed. Please ask again.'])
  })
})

describe('a background change made through slide ops says what it did (the route answers "nothing changed" to an empty applied list)', () => {
  it('pattern, pattern off, and a picture blur each come back with an applied line', async () => {
    const withPicture = () => { const d = deck(); (d.slides[1] as { background?: unknown }).background = { type: 'image', value: 'https://images.example/p.jpg' }; return d }
    for (const [values, doc] of [[{ pattern: 'dots' }, deck()], [{ pattern: 'none' }, deck()], [{ blur: 'soft' }, withPicture()]] as const) {
      const { out } = await run({ tasks: [{ family: 'background', targets: [{ by: 'number', n: 2 }], values } as never] }, undefined, { doc: doc as never })
      expect(out.kind).toBe('done')
      if (out.kind === 'done') expect(out.applied.length, JSON.stringify(values)).toBeGreaterThan(0)
    }
  })
})
