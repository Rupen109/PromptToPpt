import { describe, expect, it } from 'vitest'
import type { SlideElement } from '@prompttoppt/validation'
import { carry, planMorph } from './morph'

const box = { x: 100, y: 100, width: 400, height: 200, rotation: 0, locked: false, zIndex: 1, opacity: 1 }
const shape = (id: string, extra: object = {}) => ({ ...box, id, type: 'shape', shape: 'rect', fill: 'primary', radius: 0, ...extra }) as unknown as SlideElement
const text = (id: string, words: string, extra: object = {}) => ({ ...box, id, type: 'text', role: 'body', fontSize: 40, paragraphs: [{ runs: [{ text: words }] }], ...extra }) as unknown as SlideElement
const slide = (...elements: SlideElement[]) => ({ elements })

describe('planMorph: which elements are the same element', () => {
  it('matches by id (and type): the same id is moved, a new id comes in, a missing id goes out', () => {
    const plan = planMorph(slide(shape('a'), shape('b'), shape('gone')), slide(shape('a', { x: 900 }), shape('b'), shape('new')))
    expect(plan.pairs.map((p) => p.to.id)).toEqual(['a', 'b'])
    expect(plan.entering.map((e) => e.id)).toEqual(['new'])
    expect(plan.exiting.map((e) => e.id)).toEqual(['gone'])
  })
  it('never matches by words or look: the same words under another id are a different element', () => {
    const plan = planMorph(slide(text('t1', 'Hello')), slide(text('t2', 'Hello')))
    expect(plan.pairs).toHaveLength(0)
    expect(plan.entering).toHaveLength(1); expect(plan.exiting).toHaveLength(1)
  })
  it('the same id with another type is not the same element (a shape does not turn into a text)', () => {
    const plan = planMorph(slide(shape('a')), slide(text('a', 'x')))
    expect(plan.pairs).toHaveLength(0)
  })
  it('a text whose words changed fades across; one whose words are the same does not', () => {
    const plan = planMorph(slide(text('a', 'Old words'), text('b', 'Same')), slide(text('a', 'New words'), text('b', 'Same')))
    expect(plan.pairs.map((p) => p.crossfade)).toEqual([true, false])
  })
  it('a text that wraps differently in its new box also fades across (its two copies would not line up), while a text that keeps its wrapping does not', () => {
    const plan = planMorph(slide(text('a', 'Same words'), text('b', 'Same words')), slide(text('a', 'Same words', { width: 200 }), text('b', 'Same words', { x: 900, y: 500, fontSize: 80, width: 800 })))
    // a: the box got half as wide at the same size, so it wraps again; b: box and font both doubled, so it wraps the same way
    expect(plan.pairs.map((p) => p.crossfade)).toEqual([true, false])
  })
  it('an element an exit effect already removed is not on screen, so nothing moves from it', () => {
    const plan = planMorph(slide(shape('a'), shape('b')), slide(shape('a'), shape('b')), new Set(['b']))
    expect(plan.pairs.map((p) => p.to.id)).toEqual(['a'])
    expect(plan.entering.map((e) => e.id)).toEqual(['b']) // it comes in on the new slide
  })
  it('two slides with nothing in common still plan: everything goes out and everything comes in (a plain crossfade)', () => {
    const plan = planMorph(slide(shape('a')), slide(shape('b')))
    expect([plan.pairs.length, plan.entering.length, plan.exiting.length]).toEqual([0, 1, 1])
  })
})

describe('carry: where an element drawn at one place is carried to the other', () => {
  it('a box goes to the new corner and size exactly (from its top-left corner)', () => {
    const c = carry(shape('a'), shape('a', { x: 500, y: 300, width: 800, height: 100 }))
    expect(c.transform).toBe('translate(400px, 200px) scale(2, 0.5)')
    expect(c.origin).toBe('0 0')
  })
  it('the way back is the exact opposite: carrying the new one onto the old place', () => {
    const a = shape('a'), b = shape('a', { x: 500, y: 300, width: 800, height: 100 })
    expect(carry(b, a).transform).toBe('translate(-400px, -200px) scale(0.5, 2)')
  })
  it('a text moves by its centre and is scaled evenly by its font size (never stretched)', () => {
    const c = carry(text('t', 'x'), text('t', 'x', { x: 700, y: 500, width: 200, height: 400, fontSize: 80 }))
    expect(c.origin).toBe('center')
    // old centre (300, 200), new centre (800, 700); font 40 -> 80 is scale 2 in both directions
    expect(c.transform).toBe('translate(500px, 500px) scale(2)')
  })
  it('the rotation is carried from the old angle to the new one', () => {
    expect(carry(shape('a', { rotation: 10 }), shape('a', { rotation: 40 })).rotate).toEqual([10, 40])
  })
  it('nothing divides by zero for an empty box', () => {
    expect(carry(shape('a', { width: 0 }), shape('a', { width: 100 })).transform).toContain('scale(1, 1)')
  })
})
