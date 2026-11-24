import { beforeEach, describe, expect, it } from 'vitest'
import { getTheme } from '@prompttoppt/theme'
import { expandToGroups, groupsOf, isWholeGroup, presentationSchema, type Presentation } from '@prompttoppt/validation'
import * as C from './commands'
import { useDoc } from './store'

const theme = getTheme('cobalt')
const shape = (id: string, x: number, extra: Record<string, unknown> = {}) => ({ type: 'shape', id, x, y: 100, width: 200, height: 100, rotation: 0, locked: false, zIndex: 1, opacity: 1, shape: 'rect', fill: '#ff0000', ...extra })
const text = (id: string, x: number) => ({ type: 'text', id, x, y: 300, width: 400, height: 80, rotation: 0, locked: false, zIndex: 2, opacity: 1, role: 'body', fontSize: 40, color: '#000000', align: 'left', paragraphs: [{ runs: [{ text: 'Hi' }] }] })
const mk = (els: unknown[]): Presentation => ({ schemaVersion: 1, id: 'p1', title: 'T', aspectRatio: '16:9', language: 'en', theme, sources: [], slides: [{ ...C.blankSlide(theme, 's0'), elements: els as never }] })
const doc = () => useDoc.getState().doc!
const apply = (r: (d: C.D) => void) => useDoc.getState().apply('t', r)
const el = (id: string) => doc().slides[0]!.elements.find((e) => e.id === id) as unknown as { groupId?: string; x: number; width: number; fontSize?: number }
let n = 0
const gen = () => `n${++n}`

beforeEach(() => { n = 0; useDoc.getState().load(mk([shape('a', 0), shape('b', 300), text('t', 600), shape('c', 900)]), 1) })

describe('grouping objects', () => {
  it('two or more objects become one group with one id, in one undo step; the document stays valid', () => {
    let gid: string | null = null
    apply((d) => { gid = C.groupElements(d, 's0', ['a', 'b'], gen) })
    expect(gid).toBe('gn1'); expect(el('a').groupId).toBe('gn1'); expect(el('b').groupId).toBe('gn1'); expect(el('c').groupId).toBeUndefined()
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
    useDoc.getState().undo()
    expect(el('a').groupId).toBeUndefined()
  })
  it('one object, a locked object or a locked slide cannot be grouped', () => {
    apply((d) => { expect(C.groupElements(d, 's0', ['a'], gen)).toBeNull() })
    useDoc.getState().load(mk([shape('a', 0), shape('b', 300, { locked: true })]), 1)
    apply((d) => { expect(C.groupElements(d, 's0', ['a', 'b'], gen)).toBeNull() })
    expect(el('a').groupId).toBeUndefined()
  })
  it('grouping a member of a group brings its whole group (two groups become one)', () => {
    apply((d) => { C.groupElements(d, 's0', ['a', 'b'], gen) })
    apply((d) => { C.groupElements(d, 's0', ['b', 'c'], gen) })
    expect([el('a').groupId, el('b').groupId, el('c').groupId]).toEqual(['gn2', 'gn2', 'gn2'])
  })
  it('ungrouping frees every member of the touched group and nothing else', () => {
    apply((d) => { C.groupElements(d, 's0', ['a', 'b'], gen); C.groupElements(d, 's0', ['t', 'c'], gen) })
    let freed = 0
    apply((d) => { freed = C.ungroupElements(d, 's0', ['a']) })
    expect(freed).toBe(2); expect(el('a').groupId).toBeUndefined(); expect(el('b').groupId).toBeUndefined(); expect(el('t').groupId).toBe('gn2')
    apply((d) => { expect(C.ungroupElements(d, 's0', ['a'])).toBe(0) }) // nothing left to ungroup
  })
  it('a copy of a group is a NEW group; a lone copy of one member is in no group', () => {
    apply((d) => { C.groupElements(d, 's0', ['a', 'b'], gen) })
    let copies: string[] = []
    apply((d) => { copies = C.duplicateElements(d, 's0', ['a', 'b'], gen) })
    const ids = copies.map((c) => el(c).groupId)
    expect(ids[0]).toBeTruthy(); expect(ids[0]).toBe(ids[1]); expect(ids[0]).not.toBe(el('a').groupId)
    apply((d) => { copies = C.duplicateElements(d, 's0', ['a'], gen) })
    expect(el(copies[0]!).groupId).toBeUndefined()
  })
  it('resizing a group as one: every member gets its new box, text follows the scale, a locked member keeps its own', () => {
    useDoc.getState().load(mk([shape('a', 0), text('t', 600), shape('c', 900, { locked: true })]), 1)
    apply((d) => C.setBoxes(d, 's0', { a: { x: 0, y: 0, width: 400, height: 200 }, t: { x: 1200, y: 0, width: 800, height: 160 }, c: { x: 1800, y: 0, width: 1, height: 1 } }, 2))
    expect(el('a').width).toBe(400); expect(el('t').fontSize).toBe(80); expect(el('t').x).toBe(1200); expect(el('c').width).toBe(200)
  })
})

describe('group helpers', () => {
  const els = [{ id: 'a', groupId: 'g' }, { id: 'b', groupId: 'g' }, { id: 'c' }, { id: 'd', groupId: 'h' }]
  it('selecting any member selects the whole group', () => {
    expect(expandToGroups(els, ['a'])).toEqual(['a', 'b'])
    expect(expandToGroups(els, ['c'])).toEqual(['c'])
    expect(expandToGroups(els, ['a', 'c'])).toEqual(['a', 'b', 'c'])
  })
  it('groups are listed (a group of one is not a group) and a selection can be exactly one whole group', () => {
    expect([...groupsOf(els).keys()]).toEqual(['g'])
    expect(isWholeGroup(els, ['a', 'b'])).toBe(true)
    expect(isWholeGroup(els, ['a', 'b', 'c'])).toBe(false)
    expect(isWholeGroup(els, ['a'])).toBe(false)
  })
})
