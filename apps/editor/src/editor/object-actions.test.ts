import { beforeEach, describe, expect, it } from 'vitest'
import { getTheme } from '@prompttoppt/theme'
import type { Presentation } from '@prompttoppt/validation'
import * as A from './object-actions'
import * as C from './commands'
import { stackOrder } from './selection-commands'
import { useDoc } from './store'
import { useUi } from './ui'

const ok = () => true
const no = () => false
const box = (id: string, z: number) => C.makeElement({ id, type: 'shape', shape: 'rect', x: 100 * z, y: 100, width: 200, height: 200, rotation: 0, locked: false, zIndex: z, opacity: 1, fill: '#123456' } as never)
function load() {
  const theme = getTheme('cobalt')
  const p: Presentation = { schemaVersion: 1, id: 'p', title: 'T', aspectRatio: '16:9', language: 'en', theme, sources: [], slides: [{ ...C.blankSlide(theme, 's0'), elements: [box('a', 1), box('b', 2), box('c', 3), box('d', 4)] as never }] }
  useDoc.getState().load(p, 1)
  useUi.setState({ activeSlideId: 's0', selection: [], clipboard: [], clipboardEffects: [] })
}
const doc = () => useDoc.getState().doc!
const order = () => stackOrder(doc().slides[0]!).map((e) => e.id).join('') // front to back
const sel = (...ids: string[]) => useUi.setState({ selection: ids })

beforeEach(load)

describe('object actions (shared by the keyboard and the right-click menu)', () => {
  it('layer order: front, forward, backward, back; several objects keep their order among themselves; one undo step each', () => {
    expect(order()).toBe('dcba')
    sel('a'); expect(A.layer('front', ok)).toBe(true); expect(order()).toBe('adcb')
    sel('a'); A.layer('down', ok); expect(order()).toBe('dacb')
    sel('d'); A.layer('back', ok); expect(order()).toBe('acbd')
    useDoc.getState().undo(); expect(order()).toBe('dacb')
    load(); sel('a', 'b'); A.layer('front', ok); expect(order()).toBe('badc') // b stays in front of a
    load(); sel('c', 'd'); A.layer('back', ok); expect(order()).toBe('badc') // d stays in front of c
  })
  it('cut = copy + delete; paste brings it back as a new object; duplicate makes a copy', () => {
    sel('b'); expect(A.cut(ok)).toBe(true)
    expect(doc().slides[0]!.elements.map((e) => e.id)).not.toContain('b')
    expect(useUi.getState().clipboard.map((e) => e.id)).toEqual(['b'])
    expect(A.paste(ok)).toBe(true); expect(doc().slides[0]!.elements).toHaveLength(4)
    sel('a'); A.duplicate(ok); expect(doc().slides[0]!.elements).toHaveLength(5)
  })
  it('group then ungroup; group needs two or more objects', () => {
    sel('a'); expect(A.group(ok)).toBe(false)
    sel('a', 'b'); expect(A.group(ok)).toBe(true)
    const g = doc().slides[0]!.elements.filter((e) => e.groupId)
    expect(g).toHaveLength(2)
    sel('a'); expect(A.ungroup(ok)).toBe(true)
    expect(doc().slides[0]!.elements.some((e) => e.groupId)).toBe(false)
  })
  it('lock toggles (locks all unless all are locked), hide takes the objects out of sight, select all picks every visible object', () => {
    sel('a', 'b'); A.toggleLockSelection(ok)
    expect(doc().slides[0]!.elements.filter((e) => e.locked).map((e) => e.id)).toEqual(['a', 'b'])
    A.toggleLockSelection(ok); expect(doc().slides[0]!.elements.some((e) => e.locked)).toBe(false)
    sel('c'); A.hideSelection(ok); expect(doc().slides[0]!.elements.find((e) => e.id === 'c')!.hidden).toBe(true)
    A.selectAll(); expect(useUi.getState().selection.sort()).toEqual(['a', 'b', 'd'])
  })
  it('the plan gate and a locked slide stop every change (copy still works)', () => {
    sel('a')
    expect(A.remove(no)).toBe(false); expect(A.layer('front', no)).toBe(false); expect(A.duplicate(no)).toBe(false)
    useDoc.getState().apply('lock', (d) => { d.slides[0]!.locked = true })
    expect(A.remove(ok)).toBe(false); expect(A.layer('back', ok)).toBe(false); expect(A.cut(ok)).toBe(false)
    expect(A.copySelection()).toBe(true)
    expect(doc().slides[0]!.elements).toHaveLength(4)
  })
})
