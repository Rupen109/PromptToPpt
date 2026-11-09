import { beforeEach, describe, expect, it } from 'vitest'
import { composeSlide, getTheme } from '@prompttoppt/theme'
import { applyDiff, diffDocs, effectSchema, presentationSchema, type Presentation, type SlideContent } from '@prompttoppt/validation'
import * as C from './commands'
import * as E from './effect-commands'
import { useDoc } from './store'

let n = 0
const gen = () => `id${++n}`
const contents: SlideContent[] = [
  { layout: 'title', title: 'Deck', subtitle: 'Sub', speakerNotes: '', sources: [] },
  { layout: 'title-body', title: 'Body', bullets: ['a', 'b', 'c'], speakerNotes: '', sources: [] },
]
const mkDoc = (): Presentation => {
  const theme = getTheme('cobalt')
  return { schemaVersion: 1, id: 'p1', title: 'T', aspectRatio: '16:9', language: 'en', theme, sources: [], slides: contents.map((c, i) => ({ id: `s${i}`, locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(c, theme, '16:9', gen) })) }
}
const doc = () => useDoc.getState().doc!
const apply = (label: string, r: (d: C.D) => void) => useDoc.getState().apply(label, r)
const els = (si = 0) => doc().slides[si]!.elements
const fx = (si = 0) => doc().slides[si]!.effects ?? []

beforeEach(() => { n = 0; useDoc.getState().load(mkDoc(), 1) })

describe('object effects: the schema', () => {
  const ok = { id: 'a', elementId: 'e', category: 'entrance', type: 'fade-in' }
  it('fills every default, so a minimal effect is a complete one', () => {
    expect(effectSchema.parse(ok)).toMatchObject({ start: 'click', duration: 600, delay: 0, easing: 'ease-out', repeat: 1, reverse: false })
  })
  it('refuses an effect that does not belong to its category, a bad range, or a bad colour', () => {
    expect(effectSchema.safeParse({ ...ok, type: 'fade-out' }).success).toBe(false) // an exit effect filed as an entrance
    expect(effectSchema.safeParse({ ...ok, duration: 5 }).success).toBe(false)
    expect(effectSchema.safeParse({ ...ok, repeat: 0 }).success).toBe(false)
    expect(effectSchema.safeParse({ ...ok, category: 'emphasis', type: 'color-change', color: 'red' }).success).toBe(false)
  })
  it('a deck without effects (every deck saved before this) still parses, and the field stays absent', () => {
    const p = presentationSchema.parse(mkDoc())
    expect(p.slides.every((s) => s.effects === undefined)).toBe(true)
  })
  it('a deck with effects survives the save schema (no field is stripped)', () => {
    const d = mkDoc(); const e = d.slides[0]!.elements[0]!
    d.slides[0]!.effects = [effectSchema.parse({ id: 'a', elementId: e.id, category: 'emphasis', type: 'color-change', color: '#ff0000', direction: 'left', distance: 120, scale: 1.2, rotation: 15, opacity: 0.5, repeat: 2, reverse: true })]
    expect(presentationSchema.parse(d).slides[0]!.effects).toEqual(d.slides[0]!.effects)
  })
})

describe('object effects: commands', () => {
  const first = () => els(0)[0]!.id

  it('adds effects in play order; one element can have several, each with its own id', () => {
    let a = '', b = '', c = ''
    apply('a', (d) => { a = E.addEffect(d, 's0', first(), 'entrance', 'fade-in', gen)! })
    apply('b', (d) => { b = E.addEffect(d, 's0', first(), 'emphasis', 'pulse', gen)! })
    apply('c', (d) => { c = E.addEffect(d, 's0', first(), 'exit', 'fade-out', gen)! })
    expect(fx().map((e) => e.id)).toEqual([a, b, c])
    expect(new Set([a, b, c]).size).toBe(3)
    expect(fx().every((e) => e.elementId === first())).toBe(true)
    expect(doc().slides[0]!.manual).toBe(true) // so a theme or layout swap keeps these elements (and their ids)
  })

  it('refuses a missing element, a locked slide, a locked element, or a type from another category', () => {
    apply('x', (d) => { expect(E.addEffect(d, 's0', 'nope', 'entrance', 'fade-in', gen)).toBeNull() })
    apply('y', (d) => { expect(E.addEffect(d, 's0', first(), 'entrance', 'fade-out' as never, gen)).toBeNull() })
    apply('lock el', (d) => { d.slides[0]!.elements[0]!.locked = true })
    apply('z', (d) => { expect(E.addEffect(d, 's0', first(), 'entrance', 'fade-in', gen)).toBeNull() })
    apply('lock slide', (d) => { d.slides[1]!.locked = true })
    apply('w', (d) => { expect(E.addEffect(d, 's1', els(1)[0]!.id, 'entrance', 'fade-in', gen)).toBeNull() })
    expect(doc().slides.every((s) => !s.effects)).toBe(true)
  })

  it('updates options, refuses an invalid change, and records nothing for a change that changes nothing', () => {
    let id = ''
    apply('add', (d) => { id = E.addEffect(d, 's0', first(), 'entrance', 'fly-in', gen)! })
    apply('edit', (d) => { E.updateEffect(d, 's0', id, { start: 'after', duration: 900, delay: 200, direction: 'left', easing: 'power2-in-out' }) })
    expect(fx()[0]).toMatchObject({ start: 'after', duration: 900, delay: 200, direction: 'left', easing: 'power2-in-out' })
    const before = doc()
    apply('bad', (d) => { expect(E.updateEffect(d, 's0', id, { duration: 1 })).toBe(false) })
    apply('bad type', (d) => { expect(E.updateEffect(d, 's0', id, { type: 'pulse' })).toBe(false) }) // an emphasis name on an entrance effect
    const seq = useDoc.getState().seq
    apply('same', (d) => { E.updateEffect(d, 's0', id, { duration: 900 }) })
    expect(doc()).toEqual(before)
    expect(useDoc.getState().seq).toBe(seq) // nothing was recorded
  })

  it('removes, duplicates (right after the original, new id) and reorders', () => {
    const ids: string[] = []
    for (const t of ['fade-in', 'zoom-in', 'pop-in'] as const) apply(t, (d) => { ids.push(E.addEffect(d, 's0', first(), 'entrance', t, gen)!) })
    apply('dup', (d) => { E.duplicateEffect(d, 's0', ids[0]!, gen) })
    expect(fx().map((e) => e.type)).toEqual(['fade-in', 'fade-in', 'zoom-in', 'pop-in'])
    expect(new Set(fx().map((e) => e.id)).size).toBe(4)
    apply('move', (d) => { E.moveEffect(d, 's0', 3, 0) })
    expect(fx().map((e) => e.type)).toEqual(['pop-in', 'fade-in', 'fade-in', 'zoom-in'])
    apply('rm', (d) => { E.removeEffect(d, 's0', ids[1]!) })
    expect(fx().map((e) => e.type)).toEqual(['pop-in', 'fade-in', 'fade-in'])
    for (const e of fx()) apply('rm', (d) => { E.removeEffect(d, 's0', e.id) })
    expect(doc().slides[0]!.effects).toBeUndefined() // an empty list is not kept
  })

  it('undo and redo include effect changes', () => {
    const before = doc()
    apply('add', (d) => { E.addEffect(d, 's0', first(), 'entrance', 'fade-in', gen) })
    const withFx = doc()
    useDoc.getState().undo()
    expect(doc()).toEqual(before)
    useDoc.getState().redo()
    expect(doc()).toEqual(withFx)
  })

  it('a collaborator\'s effect edit merges by the same diff the editor uses (nothing is lost on undo)', () => {
    const base = doc()
    apply('add', (d) => { E.addEffect(d, 's0', first(), 'entrance', 'fade-in', gen) })
    const diff = diffDocs(base, doc())
    expect(applyDiff(base, diff, 'forward', true).slides[0]!.effects).toEqual(fx())
  })
})

describe('object effects: they follow their elements', () => {
  const first = () => els(0)[0]!.id
  it('deleting an element removes its effects, and only its effects', () => {
    const other = els(0)[1]!.id
    apply('add', (d) => { E.addEffect(d, 's0', first(), 'entrance', 'fade-in', gen); E.addEffect(d, 's0', other, 'entrance', 'zoom-in', gen) })
    apply('del', (d) => C.deleteElements(d, 's0', [first()]))
    expect(fx().map((e) => e.elementId)).toEqual([other])
    apply('del2', (d) => C.deleteElements(d, 's0', [other]))
    expect(doc().slides[0]!.effects).toBeUndefined()
  })

  it('duplicating a slide copies the effects (new effect ids) onto the copy\'s elements', () => {
    apply('add', (d) => { E.addEffect(d, 's0', first(), 'entrance', 'fade-in', gen); E.addEffect(d, 's0', first(), 'exit', 'fade-out', gen) })
    apply('dup', (d) => { C.duplicateSlide(d, 's0', gen) })
    const copy = doc().slides[1]!
    expect(copy.effects).toHaveLength(2)
    const copyEls = new Set(copy.elements.map((e) => e.id))
    expect(copy.effects!.every((e) => copyEls.has(e.elementId))).toBe(true)
    expect(copy.effects!.map((e) => e.elementId)).toEqual(fx(0).map((e) => e.elementId)) // the copy's elements are the same elements
    expect(copy.effects!.some((e) => fx(0).some((o) => o.id === e.id))).toBe(false)
    expect(copy.effects!.map((e) => e.type)).toEqual(['fade-in', 'fade-out'])
  })

  it('laying the slide out again (new elements) drops effects that would point at nothing', () => {
    apply('add', (d) => { E.addEffect(d, 's1', els(1)[0]!.id, 'entrance', 'fade-in', gen) })
    const to = C.compatibleLayouts(doc().slides[1]!.content).find((l) => l !== doc().slides[1]!.layoutId)!
    expect(to).toBeTruthy()
    apply('relayout', (d) => C.relayout(d, 's1', to))
    expect(doc().slides[1]!.effects).toBeUndefined()
  })

  it('a theme swap keeps the effects of a slide that has them (the slide is hand-edited, so its elements stay)', () => {
    apply('add', (d) => { E.addEffect(d, 's1', els(1)[0]!.id, 'entrance', 'fade-in', gen) })
    const ids = fx(1).map((e) => e.elementId)
    apply('theme', (d) => C.applyTheme(d, 'ember'))
    expect(fx(1).map((e) => e.elementId)).toEqual(ids)
    expect(els(1).some((e) => e.id === ids[0])).toBe(true)
  })
})
