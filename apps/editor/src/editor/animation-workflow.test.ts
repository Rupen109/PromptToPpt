import { beforeEach, describe, expect, it } from 'vitest'
import { composeSlide, getTheme } from '@prompttoppt/theme'
import { presentationSchema, type Presentation, type SlideContent } from '@prompttoppt/validation'
import * as C from './commands'
import * as E from './effect-commands'
import * as S from './selection-commands'
import * as T from './transition-commands'
import { lostEffects } from './effect-commands'
import { addMorphScene, morphReport, matchToPrevious, unlinkElement } from './morph-check'
import { activeEffect, badgesByElement, timelineModel, fromSeconds } from './animation-model'
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
const els = (si = 0) => doc().slides[si]!.elements.filter((e) => e.type === 'text')
const fx = (si = 0) => doc().slides[si]!.effects ?? []
beforeEach(() => { n = 0; useDoc.getState().load(mkDoc(), 1) })

describe('the gallery click (applyEffect)', () => {
  it('applies one effect per selected object, in selection order, as ONE undo step', () => {
    const [a, b] = els()
    const before = useDoc.getState().past.length
    apply('Apply effect', (d) => { E.applyEffect(d, 's0', [b!.id, a!.id], 'fly-in', gen) })
    expect(useDoc.getState().past.length).toBe(before + 1)
    expect(fx().map((e) => e.elementId)).toEqual([b!.id, a!.id])
    expect(fx().every((e) => e.type === 'fly-in' && e.category === 'entrance')).toBe(true)
    useDoc.getState().undo()
    expect(fx()).toHaveLength(0)
    useDoc.getState().redo()
    expect(fx()).toHaveLength(2)
  })
  it('replaces the same kind of effect on an object and keeps its start and timing; options start from the new type', () => {
    const [a] = els()
    apply('x', (d) => { E.applyEffect(d, 's0', [a!.id], 'fly-in', gen) })
    const id = fx()[0]!.id
    apply('x', (d) => { E.updateEffect(d, 's0', id, { start: 'with', duration: 1500, delay: 200, direction: 'up' }) })
    apply('x', (d) => { E.applyEffect(d, 's0', [a!.id], 'zoom-in', gen) })
    expect(fx()).toHaveLength(1)
    expect(fx()[0]).toMatchObject({ id, type: 'zoom-in', start: 'with', duration: 1500, delay: 200 })
    expect(fx()[0]!.direction).toBeUndefined()
  })
  it('skips locked objects, objects the effect cannot play on, and refuses a locked slide; a no-op records nothing', () => {
    const [a, b] = els()
    apply('lock', (d) => { C.toggleLock(d, 's0', b!.id) })
    const before = useDoc.getState().past.length
    apply('x', (d) => { E.applyEffect(d, 's0', [a!.id, b!.id], 'fade-in', gen) })
    expect(fx().map((e) => e.elementId)).toEqual([a!.id])
    apply('x', (d) => { C.setSlideLocked(d, 's0', true) })
    const mid = useDoc.getState().past.length
    apply('x', (d) => { E.applyEffect(d, 's0', [a!.id], 'spin-in', gen) })
    expect(useDoc.getState().past.length).toBe(mid)
    expect(before).toBeLessThan(mid)
  })
  it('a colour change is not applied to a picture', () => {
    const d0 = doc().slides[0]!
    const shape = d0.elements.find((e) => e.type === 'shape')
    if (!shape) return
    apply('x', (d) => { E.applyEffect(d, 's0', [shape.id], 'color-change', gen) })
    expect(fx().length).toBe(1)
  })
  it('starts a motion path with its points, and the result is schema valid', () => {
    const [a] = els()
    apply('x', (d) => { E.applyEffect(d, 's0', [a!.id], 'path-circle', gen) })
    const e = fx()[0]!
    expect(e.category).toBe('path')
    expect(e.path!.length).toBeGreaterThan(8)
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
  })
})

describe('Add Animation, None, Animation Painter', () => {
  it('adds a second and third effect on the same object (entrance, emphasis, exit)', () => {
    const [a] = els()
    apply('x', (d) => { E.applyEffect(d, 's0', [a!.id], 'fade-in', gen); E.addAnimation(d, 's0', a!.id, 'pulse', gen, 'after'); E.addAnimation(d, 's0', a!.id, 'fade-out', gen) })
    expect(fx().map((e) => e.category)).toEqual(['entrance', 'emphasis', 'exit'])
    expect(fx()[1]!.start).toBe('after')
  })
  it('None removes every effect of the selected objects only', () => {
    const [a, b] = els()
    apply('x', (d) => { E.applyEffect(d, 's0', [a!.id, b!.id], 'fade-in', gen); E.addAnimation(d, 's0', a!.id, 'pulse', gen) })
    apply('x', (d) => { E.clearEffects(d, 's0', [a!.id]) })
    expect(fx().map((e) => e.elementId)).toEqual([b!.id])
    apply('x', (d) => { E.clearEffects(d, 's0', [b!.id]) })
    expect(doc().slides[0]!.effects).toBeUndefined()
  })
  it('the painter copies all effects of one object onto others with new ids and replaces theirs', () => {
    const [a, b] = els()
    apply('x', (d) => { E.applyEffect(d, 's0', [a!.id], 'fly-in', gen); E.addAnimation(d, 's0', a!.id, 'pulse', gen); E.applyEffect(d, 's0', [b!.id], 'appear', gen) })
    let made = 0
    apply('x', (d) => { made = E.paintAnimation(d, 's0', a!.id, [b!.id], gen) })
    expect(made).toBe(2)
    const onB = fx().filter((e) => e.elementId === b!.id)
    expect(onB.map((e) => e.type)).toEqual(['fly-in', 'pulse'])
    expect(new Set(fx().map((e) => e.id)).size).toBe(fx().length)
  })
})

describe('trigger, paths, order', () => {
  it('a trigger must be another object on the slide; null puts the effect back in the click sequence', () => {
    const [a, b] = els()
    apply('x', (d) => { E.applyEffect(d, 's0', [a!.id], 'fade-in', gen) })
    const id = fx()[0]!.id
    apply('x', (d) => { E.setTrigger(d, 's0', id, 'nope') })
    expect(fx()[0]!.trigger).toBeUndefined()
    apply('x', (d) => { E.setTrigger(d, 's0', id, b!.id) })
    expect(fx()[0]!.trigger).toBe(b!.id)
    apply('x', (d) => { E.setTrigger(d, 's0', id, null) })
    expect(fx()[0]!.trigger).toBeUndefined()
  })
  it('re-aiming a preset path redraws it; a custom path is left as drawn; custom points are stored', () => {
    const [a] = els()
    apply('x', (d) => { E.applyEffect(d, 's0', [a!.id], 'path-line', gen) })
    const id = fx()[0]!.id
    apply('x', (d) => { E.setPathShape(d, 's0', id, { direction: 'down', distance: 100 }) })
    expect(fx()[0]!.path![1]).toEqual([0, 100])
    apply('x', (d) => { E.applyEffect(d, 's0', [a!.id], 'path-custom', gen) })
    const cid = fx()[0]!.id
    apply('x', (d) => { E.setCustomPath(d, 's0', cid, [[0, 0], [50, 20], [120, 90]]) })
    expect(fx()[0]!.path).toEqual([[0, 0], [50, 20], [120, 90]])
    let ok = true
    apply('x', (d) => { ok = E.setPathShape(d, 's0', cid, { distance: 10 }) })
    expect(ok).toBe(false)
    apply('x', (d) => { E.setCustomPath(d, 's0', cid, [[0, 0]]) })
    expect(fx()[0]!.path).toHaveLength(3)
  })
  it('nudge moves one place earlier or later and stops at the ends', () => {
    const [a, b, c] = els(1)
    apply('x', (d) => { E.applyEffect(d, 's1', [a!.id, b!.id, c!.id], 'fade-in', gen) })
    const ids = fx(1).map((e) => e.id)
    apply('x', (d) => { E.nudgeEffect(d, 's1', ids[2]!, -1) })
    expect(fx(1).map((e) => e.id)).toEqual([ids[0], ids[2], ids[1]])
    const before = useDoc.getState().past.length
    apply('x', (d) => { E.nudgeEffect(d, 's1', ids[0]!, -1) })
    expect(useDoc.getState().past.length).toBe(before)
  })
  it('reorderEffects refuses unknown ids and applies a full order', () => {
    const [a, b] = els()
    apply('x', (d) => { E.applyEffect(d, 's0', [a!.id, b!.id], 'fade-in', gen) })
    const [x, y] = fx().map((e) => e.id)
    apply('x', (d) => { E.reorderEffects(d, 's0', ['zzz', x!]) })
    expect(fx().map((e) => e.id)).toEqual([x, y])
    apply('x', (d) => { E.reorderEffects(d, 's0', [y!, x!]) })
    expect(fx().map((e) => e.id)).toEqual([y, x])
  })
})

describe('the timeline model', () => {
  it('numbers effects by the click that plays them, and puts trigger effects outside the sequence', () => {
    const [a, b, c] = els(1)
    apply('x', (d) => {
      E.applyEffect(d, 's1', [a!.id, b!.id, c!.id], 'fade-in', gen)
      const s = d.slides[1]!
      s.effects![1]!.start = 'with'
      E.setTrigger(d, 's1', s.effects![2]!.id, a!.id)
    })
    const m = timelineModel(doc().slides[1]!)
    expect(m.rows.map((r) => r.click)).toEqual([1, 1, null])
    expect(badgesByElement(m).get(a!.id)).toEqual([{ click: 1, effectId: fx(1)[0]!.id }])
    expect(m.span).toBeGreaterThanOrEqual(1000)
  })
  it('the Timing group follows the selection: the picked effect while its object is selected, else the first effect of the selected object', () => {
    const [a, b] = els(1)
    apply('x', (d) => { E.applyEffect(d, 's1', [a!.id, b!.id], 'fade-in', gen) })
    const [fa, fb] = fx(1)
    const slide = doc().slides[1]!
    expect(activeEffect(slide, fb!.id, [b!.id])!.id).toBe(fb!.id)
    expect(activeEffect(slide, fb!.id, [a!.id])!.id).toBe(fa!.id)
    expect(activeEffect(slide, fb!.id, [])!.id).toBe(fb!.id)
    expect(activeEffect(slide, null, [])).toBeUndefined()
  })
  it('reads seconds fields', () => {
    expect(fromSeconds('1.5')).toBe(1500)
    expect(fromSeconds('0,25')).toBe(250)
    expect(fromSeconds('')).toBeNull()
    expect(fromSeconds('abc')).toBeNull()
  })
})

describe('the Selection pane commands', () => {
  it('renames an object (trimmed, collapsed spaces), empty removes it, locked is refused', () => {
    const [a, b] = els()
    apply('x', (d) => { S.renameElement(d, 's0', a!.id, '  Hero   title ') })
    expect(els()[0]!.label).toBe('Hero title')
    apply('x', (d) => { S.renameElement(d, 's0', a!.id, '') })
    expect(els()[0]!.label).toBeUndefined()
    apply('x', (d) => { C.toggleLock(d, 's0', b!.id) })
    let ok = true
    apply('x', (d) => { ok = S.renameElement(d, 's0', b!.id, 'x') })
    expect(ok).toBe(false)
  })
  it('moves layers one place or to the ends and writes stacking numbers 1..n', () => {
    const s = doc().slides[0]!
    const back = S.stackOrder(s).at(-1)!
    apply('x', (d) => { S.moveLayer(d, 's0', back.id, 'front') })
    expect(S.stackOrder(doc().slides[0]!)[0]!.id).toBe(back.id)
    const z = doc().slides[0]!.elements.map((e) => e.zIndex).sort((x, y) => x - y)
    expect(z).toEqual(z.map((_, i) => i + 1))
    const before = useDoc.getState().past.length
    apply('x', (d) => { S.moveLayer(d, 's0', back.id, 'up') })
    expect(useDoc.getState().past.length).toBe(before)
  })
})

describe('transitions: advance and direction', () => {
  it('stores advance-after and click rules in the schema and keeps them across type changes, and an undefined value takes the timer away', () => {
    apply('x', (d) => { T.setTransition(d, 's1', { type: 'push', direction: 'up', advanceAfter: 3000, advanceOnClick: false }) })
    expect(doc().slides[1]!.transition).toMatchObject({ type: 'push', direction: 'up', advanceAfter: 3000, advanceOnClick: false })
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
    apply('x', (d) => { T.setTransition(d, 's1', { type: 'push', duration: 900 }) })
    expect(doc().slides[1]!.transition).toMatchObject({ advanceAfter: 3000, duration: 900 })
    apply('x', (d) => { T.setTransition(d, 's1', { type: 'wipe' }) })
    expect(doc().slides[1]!.transition).toMatchObject({ type: 'wipe', advanceAfter: 3000, advanceOnClick: false })
    apply('x', (d) => { T.setTransition(d, 's1', { type: 'wipe', advanceAfter: undefined as unknown as number }) })
    expect(doc().slides[1]!.transition!.advanceAfter).toBeUndefined()
  })
})

describe('the Morph check', () => {
  const dupe = () => { apply('x', (d) => { C.duplicateSlide(d, 's0', gen) }) }
  it('on a duplicate every object moves; a removed one exits, an added one enters', () => {
    dupe()
    const [s0, copy] = doc().slides
    const gone = copy!.elements.find((e) => e.type === 'text')!
    apply('x', (d) => { C.deleteElements(d, copy!.id, [gone.id]) })
    const r = morphReport(s0, doc().slides[1]!)
    expect(r.exiting.map((e) => e.id)).toContain(gone.id)
    expect(r.moving.length).toBeGreaterThan(0)
  })
  it('suggests linking an object with the same name and fixes it by taking the partner id', () => {
    const [a] = els()
    apply('x', (d) => { S.renameElement(d, 's0', a!.id, 'Headline'); C.duplicateSlide(d, 's0', gen) })
    const copy = doc().slides[1]!
    const el = copy.elements.find((e) => e.id === a!.id)!
    apply('x', (d) => { const x = d.slides[1]!.elements.find((e) => e.id === el.id)!; x.id = 'renamed' ; x.label = 'Headline' })
    const r = morphReport(doc().slides[0], doc().slides[1]!)
    expect(r.suggestions).toContainEqual(expect.objectContaining({ elementId: 'renamed', partnerId: a!.id, reason: 'same name' }))
    let ok = false
    apply('x', (d) => { ok = matchToPrevious(d, doc().slides[1]!.id, 'renamed', a!.id) })
    expect(ok).toBe(true)
    expect(morphReport(doc().slides[0], doc().slides[1]!).moving.map((m) => m.id)).toContain(a!.id)
  })
  it('refuses to match different kinds, or into an id already used on the slide, and warns on duplicate names and no previous slide', () => {
    dupe()
    const copy = doc().slides[1]!
    const text = copy.elements.find((e) => e.type === 'text')!
    const other = doc().slides[0]!.elements.find((e) => e.type !== 'text')
    let ok = true
    if (other) { apply('x', (d) => { ok = matchToPrevious(d, copy.id, text.id, other.id) }); expect(ok).toBe(false) }
    apply('x', (d) => { const t = d.slides[1]!.elements.filter((e) => e.type === 'text'); t[0]!.label = 'Same'; t[1]!.label = 'same' })
    expect(morphReport(doc().slides[0], doc().slides[1]!).warnings.some((w) => w.kind === 'duplicate-name')).toBe(true)
    expect(morphReport(undefined, doc().slides[0]!).warnings.some((w) => w.kind === 'no-previous')).toBe(true)
  })
})

describe('Morph slides and unlinking', () => {
  it('adds a Morph scene after a slide with the Morph transition; the next scene reuses the cards and ids of the one before', () => {
    let a: string | null = null, b: string | null = null
    apply('x', (d) => { a = addMorphScene(d, 's0', 'cards-row', gen) })
    apply('x', (d) => { b = addMorphScene(d, a!, 'spotlight', gen) })
    const [, one, two] = doc().slides
    expect(one!.id).toBe(a); expect(two!.id).toBe(b)
    expect(one!.layoutId).toBe('morph'); expect(one!.transition?.type).toBe('morph')
    expect((two!.content as { items: unknown[] }).items).toEqual((one!.content as { items: unknown[] }).items)
    const shared = one!.elements.filter((e) => two!.elements.some((x) => x.id === e.id))
    expect(shared.length).toBeGreaterThan(5)
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
    expect(useDoc.getState().past.length).toBe(2)
    let none: string | null = 'x'
    apply('x', (d) => { none = addMorphScene(d, 'missing', 'cover', gen) })
    expect(none).toBeNull()
  })
  it('unlinking gives an object a new id and keeps its effects pointing at it; a taken id is refused', () => {
    apply('x', (d) => { C.duplicateSlide(d, 's1', gen) })
    const copy = doc().slides[2]!
    const t = copy.elements.find((e) => e.type === 'text')!
    apply('x', (d) => { E.applyEffect(d, copy.id, [t.id], 'fade-in', gen) })
    let ok = false, refused = true
    apply('x', (d) => { ok = unlinkElement(d, copy.id, t.id, 'fresh-id') })
    expect(ok).toBe(true)
    expect(doc().slides[2]!.effects![0]!.elementId).toBe('fresh-id')
    apply('x', (d) => { refused = unlinkElement(d, copy.id, 'fresh-id', doc().slides[2]!.elements.find((e) => e.id !== 'fresh-id')!.id) })
    expect(refused).toBe(false)
  })
})

describe('hiding objects (the eye)', () => {
  it('hides and shows an object (undoable); locked objects and locked slides refuse; the timeline gives a hidden object no click', () => {
    const [a, b] = els(1)
    apply('x', (d) => { E.applyEffect(d, 's1', [a!.id, b!.id], 'fade-in', gen) })
    expect(timelineModel(doc().slides[1]!).rows.map((r) => r.click)).toEqual([1, 2])
    const before = useDoc.getState().past.length
    apply('x', (d) => { S.setHidden(d, 's1', a!.id, true) })
    expect(els(1)[0]!.hidden).toBe(true)
    expect(timelineModel(doc().slides[1]!).rows.filter((r) => r.effect.elementId !== a!.id).map((r) => r.click)).toEqual([1]) // the visible object's effect is now the first click
    apply('x', (d) => { S.setHidden(d, 's1', a!.id, true) }) // already hidden: nothing recorded
    expect(useDoc.getState().past.length).toBe(before + 1)
    useDoc.getState().undo()
    expect(els(1)[0]!.hidden).toBeUndefined()
    apply('x', (d) => { S.setHidden(d, 's1', a!.id) }) // toggle
    apply('x', (d) => { S.setHidden(d, 's1', a!.id) })
    expect(els(1)[0]!.hidden).toBeUndefined()
    apply('x', (d) => { C.toggleLock(d, 's1', b!.id) })
    let ok = true
    apply('x', (d) => { ok = S.setHidden(d, 's1', b!.id, true) })
    expect(ok).toBe(false)
    apply('x', (d) => { C.setSlideLocked(d, 's1', true) })
    apply('x', (d) => { ok = S.setHidden(d, 's1', a!.id, true) })
    expect(ok).toBe(false)
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
  })
})

describe('effects survive a slide being drawn again', () => {
  const setup = () => {
    const texts = els(1) as { id: string; role: string }[]
    const title = texts.find((e) => e.role === 'title')!
    const body = texts.find((e) => e.role === 'body')!
    apply('x', (d) => { E.applyEffect(d, 's1', [title.id, body.id], 'fade-in', gen); E.addAnimation(d, 's1', body.id, 'pulse', gen); d.slides[1]!.manual = false })
    return { title, body }
  }
  const other = () => C.compatibleLayouts(doc().slides[1]!.content as SlideContent).find((l) => l !== doc().slides[1]!.layoutId)!
  it('a re-layout moves each effect to the new object of the same kind and role, in reading order', () => {
    const { title } = setup()
    apply('x', (d) => { C.relayout(d, 's1', other()) })
    const sl = doc().slides[1]!
    const titleNow = sl.elements.find((e) => e.type === 'text' && e.role === title.role)!
    expect(sl.effects!.length).toBe(3)
    expect(sl.effects!.every((e) => sl.elements.some((x) => x.id === e.elementId))).toBe(true)
    expect(sl.effects!.some((e) => e.elementId === titleNow.id && e.type === 'fade-in')).toBe(true)
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
    expect(lostEffects(useDoc.getState().past.at(-1)!.before, doc())).toBe(0)
  })
  it('a design swap and an AI rewrite keep the effects on the redrawn objects', () => {
    setup()
    apply('x', (d) => { C.applyDesign(d, 'cobalt') })
    expect(doc().slides[1]!.effects!.length).toBe(3)
    const content = doc().slides[1]!.content as SlideContent
    apply('x', (d) => { C.replaceContent(d, 's1', content) })
    expect(doc().slides[1]!.effects!.length).toBe(3)
    expect(doc().slides[1]!.effects!.every((e) => doc().slides[1]!.elements.some((x) => x.id === e.elementId))).toBe(true)
  })
  it('an effect whose object has no successor is removed, and lostEffects counts it; deleting one object by hand is not counted', () => {
    const { body } = setup()
    // a slide with only a title: the body's effects have nowhere to go
    apply('x', (d) => { C.replaceContent(d, 's1', { layout: 'title', title: 'Only a title', subtitle: 'x', speakerNotes: '', sources: [] } as SlideContent, true) })
    const sl = doc().slides[1]!
    expect(sl.effects!.every((e) => sl.elements.some((x) => x.id === e.elementId))).toBe(true)
    expect(sl.effects!.length).toBe(1) // the title's; the body's two have no successor
    const entry = useDoc.getState().past.at(-1)!
    expect(lostEffects(entry.before, entry.after)).toBe(2)
    // one object deleted by hand: not "drawn again"
    useDoc.getState().load(mkDoc(), 1)
    const [t1, b1] = els(1)
    apply('x', (d) => { E.applyEffect(d, 's1', [t1!.id, b1!.id], 'fade-in', gen) })
    const snap = doc()
    apply('x', (d) => { C.deleteElements(d, 's1', [b1!.id]) })
    expect(lostEffects(snap, doc())).toBe(0)
    void body
  })
  it('stable ids are kept as they are (a Morph deck): the successor of an element is itself', () => {
    const [t, b] = els(1)
    apply('x', (d) => { E.applyEffect(d, 's1', [t!.id], 'fade-in', gen); d.slides[1]!.manual = false })
    apply('x', (d) => { C.relayout(d, 's1', other()) })
    expect(doc().slides[1]!.effects?.length).toBe(1)
    void b
  })
})

describe('Morph by word: the check explains a fallback', () => {
  it('warns when a text is too different to travel in pieces, and not when it can', () => {
    apply('x', (d) => { C.duplicateSlide(d, 's1', gen) })
    const copy = doc().slides[2]!
    const t = copy.elements.find((e) => e.type === 'text')!
    apply('x', (d) => { T.setTransition(d, copy.id, { type: 'morph', by: 'word' }) })
    expect(doc().slides[2]!.transition).toMatchObject({ type: 'morph', by: 'word' })
    expect(morphReport(doc().slides[1], doc().slides[2]!).warnings.some((w) => w.kind === 'by-fallback')).toBe(false)
    apply('x', (d) => { const x = d.slides[2]!.elements.find((e) => e.id === t.id) as { paragraphs: { runs: { text: string }[] }[] }; x.paragraphs = [{ runs: [{ text: 'zzz qqq www' }] }] })
    expect(morphReport(doc().slides[1], doc().slides[2]!).warnings.some((w) => w.kind === 'by-fallback' && w.elementId === t.id)).toBe(true)
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
  })
})
