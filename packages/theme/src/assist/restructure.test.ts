import { describe, expect, it } from 'vitest'
import type { Presentation, SlideContent } from '@prompttoppt/validation'
import { composeSlide, getTheme } from '../index'
import { checkOrder, checkReduce, checkSections, duplicateSlideIds, emptySlideIds, planRestructure } from './restructure'

let n = 0
const gen = () => `q${++n}`
const tb = (title: string, bullets: string[]): SlideContent => ({ layout: 'title-body', title, bullets, speakerNotes: '', sources: [] }) as SlideContent
const mk = (contents: SlideContent[]): Presentation => {
  const theme = getTheme('cobalt')
  return { schemaVersion: 1, id: 'p', title: 'T', aspectRatio: '16:9', language: 'en', theme, sources: [], slides: contents.map((c, i) => ({ id: `s${i + 1}`, locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(c, theme, '16:9', gen) })) } as Presentation
}
const deck = (k: number) => mk(Array.from({ length: k }, (_, i) => tb(`T${i + 1}`, [`point ${i + 1}`])))

describe('finding what can be proposed without a model', () => {
  it('empty slides are found; locked ones never proposed', () => {
    const d = deck(4); d.slides[1]!.elements = []; d.slides[2]!.elements = []; d.slides[2]!.locked = true
    expect(emptySlideIds(d)).toEqual(['s2'])
  })
  it('a later slide saying exactly the same as an earlier one is a duplicate (case and punctuation ignored); the first stays; different words are not duplicates', () => {
    const d = mk([tb('Plan', ['Ship it!']), tb('Other', ['b']), tb('PLAN', ['ship it']), tb('Plan', ['Ship it, now'])])
    expect(duplicateSlideIds(d)).toEqual(['s3'])
  })
})

describe('planRestructure: what a CONFIRMED plan may do to the deck as it is now', () => {
  it('removal: skips locked and vanished slides with the reason; refuses emptying the deck and a plan about slides that are all gone', () => {
    const d = deck(4); d.slides[1]!.locked = true
    expect(planRestructure(d, { kind: 'remove', slideIds: ['s2', 's3', 'zz'] })).toEqual({ ok: true, removals: ['s3'], moves: [], additions: [], notes: ['1 of the slides I suggested are no longer in the deck, so I skipped them.', 'Slide 2 is locked, so I kept it.'] })
    expect(planRestructure(deck(2), { kind: 'remove', slideIds: ['s1', 's2'] })).toMatchObject({ ok: false, why: expect.stringMatching(/at least one/) })
    expect(planRestructure(deck(2), { kind: 'remove', slideIds: ['x', 'y'] })).toMatchObject({ ok: false, why: expect.stringMatching(/changed since/) })
  })
  it('reorder: becomes one placement per slide that gives exactly that order; the same order changes nothing', () => {
    const d = deck(4)
    const r = planRestructure(d, { kind: 'reorder', order: ['s1', 's3', 's2', 's4'] })
    expect(r).toMatchObject({ ok: true, removals: [], moves: [{ slideId: 's1', afterSlideId: null }, { slideId: 's3', afterSlideId: 's1' }, { slideId: 's2', afterSlideId: 's3' }, { slideId: 's4', afterSlideId: 's2' }] })
    expect(planRestructure(d, { kind: 'reorder', order: ['s1', 's2', 's3', 's4'] })).toMatchObject({ ok: true, moves: [], notes: ['The slides are already in that order.'] })
  })
  it('reorder is refused when it is not exactly this deck\'s slides (a slide was added or deleted since) or when it would move a locked slide', () => {
    const d = deck(4)
    expect(planRestructure(d, { kind: 'reorder', order: ['s1', 's3', 's2'] })).toMatchObject({ ok: false, why: expect.stringMatching(/changed since/) })
    expect(planRestructure(d, { kind: 'reorder', order: ['s1', 's1', 's2', 's3'] })).toMatchObject({ ok: false })
    expect(planRestructure(d, { kind: 'reorder', order: ['s1', 's2', 's3', 'new'] })).toMatchObject({ ok: false })
    d.slides[1]!.locked = true
    expect(planRestructure(d, { kind: 'reorder', order: ['s1', 's3', 's2', 's4'] })).toMatchObject({ ok: false, why: expect.stringMatching(/Slide 2 is locked and would move/) })
    expect(planRestructure(d, { kind: 'reorder', order: ['s3', 's2', 's1', 's4'] })).toMatchObject({ ok: true }) // the locked slide stays at its place
  })
})

describe('checking what the model proposes (numbers) before it is shown to anyone', () => {
  it('reduce: exactly the target is left, the first slide stays, no repeats, no locked slide, numbers inside the deck', () => {
    const d = deck(6); d.slides[3]!.locked = true
    expect(checkReduce(d, [2, 3], 4)).toEqual({ ok: true, slideIds: ['s2', 's3'] })
    expect(checkReduce(d, [2], 4)).toMatchObject({ ok: false, why: expect.stringMatching(/leaves 5/) })
    expect(checkReduce(d, [1, 2], 4)).toMatchObject({ ok: false, why: expect.stringMatching(/first slide/) })
    expect(checkReduce(d, [4, 5], 4)).toMatchObject({ ok: false, why: expect.stringMatching(/locked/) })
    expect(checkReduce(d, [2, 2], 4)).toMatchObject({ ok: false })
    expect(checkReduce(d, [2, 9], 4)).toMatchObject({ ok: false })
  })
  it('order: every slide once, locked slides in place, not the current order', () => {
    const d = deck(4); d.slides[0]!.locked = true
    expect(checkOrder(d, [1, 3, 2, 4])).toEqual({ ok: true, order: ['s1', 's3', 's2', 's4'] })
    expect(checkOrder(d, [2, 1, 3, 4])).toMatchObject({ ok: false, why: expect.stringMatching(/locked/) })
    expect(checkOrder(d, [1, 2, 3, 4])).toMatchObject({ ok: false, why: expect.stringMatching(/already has/) })
    expect(checkOrder(d, [1, 2, 3])).toMatchObject({ ok: false })
    expect(checkOrder(d, [1, 2, 2, 4])).toMatchObject({ ok: false })
  })
})


describe('sections: divider slides, planned and checked against the deck', () => {
  it('a confirmed plan becomes one divider after the slide BEFORE each start; in deck order whatever the order given', () => {
    const d = deck(6)
    const r = planRestructure(d, { kind: 'sections', items: [{ title: 'Later', beforeSlideId: 's5' }, { title: 'Start', beforeSlideId: 's2' }] })
    expect(r).toMatchObject({ ok: true, removals: [], moves: [], additions: [{ afterSlideId: 's1', title: 'Start' }, { afterSlideId: 's4', title: 'Later' }] })
  })
  it('refused with the reason: before the first slide, the same start twice, the same title twice, a slide that is gone (the deck changed), an empty title', () => {
    const d = deck(6)
    expect(planRestructure(d, { kind: 'sections', items: [{ title: 'A', beforeSlideId: 's1' }] })).toMatchObject({ ok: false, why: expect.stringMatching(/first slide/) })
    expect(planRestructure(d, { kind: 'sections', items: [{ title: 'A', beforeSlideId: 's3' }, { title: 'B', beforeSlideId: 's3' }] })).toMatchObject({ ok: false, why: expect.stringMatching(/same slide/) })
    expect(planRestructure(d, { kind: 'sections', items: [{ title: 'A', beforeSlideId: 's3' }, { title: 'a', beforeSlideId: 's4' }] })).toMatchObject({ ok: false, why: expect.stringMatching(/different titles/) })
    expect(planRestructure(d, { kind: 'sections', items: [{ title: 'A', beforeSlideId: 'gone' }] })).toMatchObject({ ok: false, why: expect.stringMatching(/changed since/) })
    expect(planRestructure(d, { kind: 'sections', items: [{ title: '  ', beforeSlideId: 's3' }] })).toMatchObject({ ok: false, why: expect.stringMatching(/needs a title/) })
  })
  it('the model\'s numbers: 2 to 6 sections, later and later, from slide 2, short different titles, a deck of at least 4 slides', () => {
    const d = deck(8)
    expect(checkSections(d, [{ title: 'Problem', startsAtSlide: 2 }, { title: 'Plan', startsAtSlide: 5 }])).toEqual({ ok: true, items: [{ title: 'Problem', beforeSlideId: 's2' }, { title: 'Plan', beforeSlideId: 's5' }] })
    expect(checkSections(d, [{ title: 'Only', startsAtSlide: 2 }])).toMatchObject({ ok: false })
    expect(checkSections(d, [{ title: 'A', startsAtSlide: 1 }, { title: 'B', startsAtSlide: 4 }])).toMatchObject({ ok: false, why: expect.stringMatching(/from 2 to 8/) })
    expect(checkSections(d, [{ title: 'A', startsAtSlide: 5 }, { title: 'B', startsAtSlide: 3 }])).toMatchObject({ ok: false, why: expect.stringMatching(/later and later/) })
    expect(checkSections(d, [{ title: 'A', startsAtSlide: 2 }, { title: 'a', startsAtSlide: 4 }])).toMatchObject({ ok: false, why: expect.stringMatching(/different/) })
    expect(checkSections(d, [{ title: 'x'.repeat(41), startsAtSlide: 2 }, { title: 'B', startsAtSlide: 4 }])).toMatchObject({ ok: false, why: expect.stringMatching(/short title/) })
    expect(checkSections(deck(3), [{ title: 'A', startsAtSlide: 2 }, { title: 'B', startsAtSlide: 3 }])).toMatchObject({ ok: false, why: expect.stringMatching(/too short/) })
  })
})
