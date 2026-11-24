import { describe, expect, it } from 'vitest'
import type { Expectation, Presentation } from '@prompttoppt/validation'
import { getTheme } from '../themes'
import { collateralChanges, collateralNote } from './collateral'

const slide = (id: string, title: string) => ({ id, layoutId: 'blank', locked: false, validation: { status: 'passed', issues: [] }, elements: [{ id: `${id}-t`, type: 'text', x: 0, y: 0, width: 100, height: 50, text: title }], speakerNotes: '', sources: [] })
const deck = (...s: ReturnType<typeof slide>[]): Presentation => ({ schemaVersion: 1, id: 'p', title: 'T', aspectRatio: '16:9', language: 'en', theme: getTheme('cobalt'), sources: [], slides: s } as unknown as Presentation)
const lock = (slideId: string): Expectation => ({ key: 'k', kind: 'lock', slideId, locked: true, wasLocked: false })

describe('collateral changes (rule R6)', () => {
  it('a slide that was named may change; a slide that was not named must not', () => {
    const before = deck(slide('a', 'one'), slide('b', 'two'), slide('c', 'three'))
    const after = structuredClone(before); after.slides[0]!.locked = true
    expect(collateralChanges(before, after, [lock('a')])).toEqual([])
    after.slides[2]!.elements[0] = { ...(after.slides[2]!.elements[0] as object), text: 'sneaked' } as never
    expect(collateralChanges(before, after, [lock('a')])).toEqual([3])
  })
  it('a slide\'s validation result is not a change; the order of slides is not a change of a slide', () => {
    const before = deck(slide('a', 'one'), slide('b', 'two'))
    const after = structuredClone(before); after.slides[1]!.validation = { status: 'warning', issues: [] } as never
    expect(collateralChanges(before, after, [lock('a')])).toEqual([])
    const swapped = { ...structuredClone(before), slides: [...before.slides].reverse() }
    expect(collateralChanges(before, swapped, [lock('a')])).toEqual([])
  })
  it('a design change, a put-back or a rebuild may touch every slide and is not judged here', () => {
    const before = deck(slide('a', 'one'), slide('b', 'two'))
    const after = structuredClone(before); after.slides[1]!.locked = true
    expect(collateralChanges(before, after, [{ key: 'k', kind: 'theme', to: before.theme, parts: ['colours'] } as Expectation])).toEqual([])
    expect(collateralChanges(before, after, [{ key: 'k', kind: 'revert', theme: false, slideIds: [] } as Expectation])).toEqual([])
  })
  it('an object change names its slide; a copy names the slide it came from too', () => {
    const before = deck(slide('a', 'one'), slide('b', 'two'), slide('c', 'three'))
    const after = structuredClone(before); after.slides[1]!.locked = true; after.slides[2]!.locked = true
    const copy: Expectation = { key: 'k', kind: 'element', already: false, change: { slideId: 'b', elementId: 'x', desc: 'a table', copy: { fromSlideId: 'a', fromElementId: 'a-t' }, verb: 'Copied {}' } }
    expect(collateralChanges(before, after, [copy])).toEqual([3])
  })
  it('says which slides and offers the one-step undo', () => {
    expect(collateralNote([])).toBeNull()
    expect(collateralNote([4])).toMatch(/slide 4\. Ctrl\+Z/)
    expect(collateralNote([2, 3])).toMatch(/slides 2, 3/)
  })
})
