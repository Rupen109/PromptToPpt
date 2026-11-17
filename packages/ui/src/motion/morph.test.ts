import { describe, expect, it } from 'vitest'
import type { SlideElement } from '@prompttoppt/validation'
import { MAX_LETTER_PIECES, MAX_WORD_PIECES, carry, matchPieces, piecesOf, planMorph } from './morph'

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

describe('Morph by word and by character', () => {
  it('the pieces of a text are its words, or the letters of its words (spaces never count), across runs and paragraphs', () => {
    const t = { ...text('a', 'Hello big'), paragraphs: [{ runs: [{ text: 'Hello big' }, { text: ' world' }] }, { runs: [{ text: 'Go' }] }] } as unknown as SlideElement
    expect(piecesOf(t, 'word')).toEqual(['Hello', 'big', 'world', 'Go'])
    expect(piecesOf(t, 'letter').join('')).toBe('HellobigworldGo')
    expect(piecesOf(shape('s'), 'word')).toEqual([])
  })
  it('matches equal pieces in reading order (case-insensitive); the rest are left over', () => {
    expect(matchPieces(['The', 'big', 'dog', 'ran'], ['A', 'dog', 'ran', 'far'])).toEqual([[2, 1], [3, 2]])
    expect(matchPieces(['a', 'b', 'c'], ['C', 'B', 'A']).length).toBe(1) // order is kept: only one of them can match
    expect(matchPieces([], ['x'])).toEqual([])
  })
  it('by word: the pairs carry the matches; by object (and the default) they do not', () => {
    const a = text('t', 'Our big plan works'), b = text('t', 'Big plan for you', { x: 900 })
    const word = planMorph(slide(a), slide(b), new Set(), 'word')
    expect(word.pairs[0]!.pieces).toMatchObject({ level: 'word', from: 4, to: 4, matches: [[1, 0], [2, 1]] })
    expect(word.pairs[0]!.crossfade).toBe(false)
    expect(planMorph(slide(a), slide(b)).pairs[0]!.pieces).toBeUndefined()
    expect(planMorph(slide(a), slide(b), new Set(), 'object').pairs[0]!.pieces).toBeUndefined()
  })
  it('by character: letters match in order', () => {
    const plan = planMorph(slide(text('t', 'cat')), slide(text('t', 'act')), new Set(), 'character')
    expect(plan.pairs[0]!.pieces).toMatchObject({ level: 'letter', from: 3, to: 3 })
    expect(plan.pairs[0]!.pieces!.matches.length).toBeGreaterThanOrEqual(2)
  })
  it('falls back to one object when the texts share too little, are too long, are not both text, or turn at different angles', () => {
    expect(planMorph(slide(text('t', 'alpha beta')), slide(text('t', 'gamma delta')), new Set(), 'word').pairs[0]!.pieces).toBeUndefined()
    expect(planMorph(slide(text('t', 'alpha beta')), slide(text('t', 'gamma delta')), new Set(), 'word').pairs[0]!.crossfade).toBe(true)
    const long = Array.from({ length: MAX_WORD_PIECES + 1 }, (_, i) => `w${i}`).join(' ')
    expect(planMorph(slide(text('t', long)), slide(text('t', long, { x: 800 })), new Set(), 'word').pairs[0]!.pieces).toBeUndefined()
    const letters = 'x'.repeat(MAX_LETTER_PIECES + 1)
    expect(planMorph(slide(text('t', letters)), slide(text('t', letters)), new Set(), 'character').pairs[0]!.pieces).toBeUndefined()
    expect(planMorph(slide(text('t', 'same words')), slide(text('t', 'same words', { rotation: 10 })), new Set(), 'word').pairs[0]!.pieces).toBeUndefined()
    expect(planMorph(slide(shape('s')), slide(shape('s', { x: 5 })), new Set(), 'word').pairs[0]!.pieces).toBeUndefined()
  })
  it('an object switched off (hidden) is on neither slide for Morph', () => {
    const plan = planMorph(slide(shape('a', { hidden: true }), shape('b')), slide(shape('a'), shape('b', { hidden: true })))
    expect(plan.pairs).toHaveLength(0)
    expect(plan.entering.map((e) => e.id)).toEqual(['a'])
    expect(plan.exiting.map((e) => e.id)).toEqual(['b'])
  })
})
