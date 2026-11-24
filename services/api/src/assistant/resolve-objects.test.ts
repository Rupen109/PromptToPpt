import { describe, expect, it } from 'vitest'
import { getTheme } from '@prompttoppt/theme'
import type { Presentation } from '@prompttoppt/validation'
import { resolveElements, sameColourFamily } from './resolve.ts'
import { buildState } from './state.ts'

/** W1: objects named the way people name them ("the box that says Revenue", "the blue shapes", "the largest image", "the decorations") are found by CODE among the slide's real objects */
const box = (id: string, o: object) => ({ id, x: 0, y: 0, width: 100, height: 100, rotation: 0, locked: false, zIndex: 1, opacity: 1, ...o })
const deck = (): Presentation => ({ schemaVersion: 1, id: 'p', title: 'T', aspectRatio: '16:9', language: 'en', theme: getTheme('cobalt'), sources: [], slides: [{ id: 's1', layoutId: 'blank', locked: false, validation: { status: 'passed', issues: [] }, elements: [
  box('t1', { type: 'text', role: 'body', fontSize: 30, color: '#1D4ED8', align: 'left', valign: 'top', paragraphs: [{ runs: [{ text: 'Revenue grew 20%' }] }] }),
  box('t2', { type: 'text', role: 'body', fontSize: 30, color: 'textPrimary', align: 'left', valign: 'top', paragraphs: [{ runs: [{ text: 'Costs' }] }] }),
  box('sh', { type: 'shape', shape: 'rect', fill: '#2563EB', width: 300 }),
  box('red', { type: 'shape', shape: 'rect', fill: '#DC2626' }),
  box('big', { type: 'image', src: 'https://x.test/a.png', alt: 'a', fit: 'cover', clip: 'none', width: 800, height: 600 }),
  box('small', { type: 'image', src: 'https://x.test/b.png', alt: 'b', fit: 'cover', clip: 'none', width: 120, height: 90 }),
  box('deco', { type: 'shape', shape: 'rect', fill: 'accent', decorative: true }),
  box('off', { type: 'shape', shape: 'ellipse', fill: '#16A34A', hidden: true }),
] }] } as unknown as Presentation)
const ids = (r: ReturnType<typeof resolveElements>) => (r.ok ? r.items.map((i) => i.element.id).sort() : r)
const st = () => buildState(deck(), { activeSlideId: 's1' })

describe('objects named the way people name them', () => {
  it('by the words on them', () => expect(ids(resolveElements(st(), ['s1'], [{ by: 'text', text: 'revenue' }], ['select']))).toEqual(['t1']))
  it('by colour family: blue text and blue shapes, never the red one', () => expect(ids(resolveElements(st(), ['s1'], [{ by: 'color', color: '#0000FF' }], ['select']))).toEqual(['sh', 't1']))
  it('a colour named by WORD ("the blue box") finds the same family as a colour code', () => expect(ids(resolveElements(st(), ['s1'], [{ by: 'color', color: 'blue' }], ['select']))).toEqual(['sh', 't1']))
  it('"the big blue box": colour, type and size narrow TOGETHER to one object (never every blue thing)', () => {
    expect(ids(resolveElements(st(), ['s1'], [{ by: 'color', color: 'blue', type: 'shape', which: 'largest' }], ['rotate']))).toEqual(['sh'])
    expect(ids(resolveElements(st(), ['s1'], [{ by: 'color', color: 'blue', type: 'text' }], ['select']))).toEqual(['t1'])
  })
  it('the largest and the smallest (of a type)', () => {
    expect(ids(resolveElements(st(), ['s1'], [{ by: 'size', which: 'largest', type: 'image' }], ['move']))).toEqual(['big'])
    expect(ids(resolveElements(st(), ['s1'], [{ by: 'size', which: 'smallest', type: 'image' }], ['move']))).toEqual(['small'])
  })
  it('the decorations, the hidden objects, every object; a set is never asked "which one" even for a one-object operation', () => {
    expect(ids(resolveElements(st(), ['s1'], [{ by: 'decorative' }], ['delete']))).toEqual(['deco'])
    expect(ids(resolveElements(st(), ['s1'], [{ by: 'hidden' }], ['show']))).toEqual(['off'])
    expect((resolveElements(st(), ['s1'], [{ by: 'all_objects' }], ['delete']) as { items: unknown[] }).items).toHaveLength(7) // (every object but the design's own decoration: that one is named on its own)
  })
  it('nothing matching is said plainly', () => expect(resolveElements(st(), ['s1'], [{ by: 'text', text: 'Profit' }], ['select'])).toMatchObject({ ok: false, refuse: 'Slide 1 has no object with the words "Profit" to change.' }))
  it('colour families: hues close together are one family; greys only match greys', () => {
    expect(sameColourFamily('#2563EB', '#1D4ED8')).toBe(true)
    expect(sameColourFamily('#0056B3', '#0000FF')).toBe(true) // (a darker, greener blue is still "blue")
    expect(sameColourFamily('#0D9488', '#2563EB')).toBe(false) // (teal is not blue)
    expect(sameColourFamily('#2563EB', '#DC2626')).toBe(false)
    expect(sameColourFamily('#FFFFFF', '#F5F5F5')).toBe(true)
    expect(sameColourFamily('#FFFFFF', '#2563EB')).toBe(false)
  })
})
