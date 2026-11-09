import { beforeEach, describe, expect, it } from 'vitest'
import { composeSlide, getTheme } from '@prompttoppt/theme'
import type { Presentation, SlideContent } from '@prompttoppt/validation'
import * as T from './transition-commands'
import { useDoc } from './store'

let n = 0
const gen = () => `id${++n}`
const contents: SlideContent[] = [
  { layout: 'title', title: 'Deck', subtitle: 'Sub', speakerNotes: '', sources: [] },
  { layout: 'title-body', title: 'Body', bullets: ['a', 'b', 'c'], speakerNotes: '', sources: [] },
  { layout: 'title-body', title: 'Body 2', bullets: ['a', 'b', 'c'], speakerNotes: '', sources: [] },
]
const mkDoc = (): Presentation => {
  const theme = getTheme('cobalt')
  return { schemaVersion: 1, id: 'p1', title: 'T', aspectRatio: '16:9', language: 'en', theme, sources: [], slides: contents.map((c, i) => ({ id: `s${i}`, locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(c, theme, '16:9', gen) })) }
}
const doc = () => useDoc.getState().doc!
const apply = (label: string, r: (d: Parameters<typeof T.setTransition>[0]) => void) => useDoc.getState().apply(label, r)
const tr = (i: number) => doc().slides[i]!.transition

beforeEach(() => { n = 0; useDoc.getState().load(mkDoc(), 1) })

describe('slide transitions: commands', () => {
  it('sets a basic transition, marks it as chosen, and undoes', () => {
    apply('t', (d) => { T.setTransition(d, 's1', { type: 'push', direction: 'left', duration: 700 }) })
    expect(tr(1)).toMatchObject({ type: 'push', direction: 'left', duration: 700, own: true })
    useDoc.getState().undo()
    expect(tr(1)?.own).not.toBe(true)
  })

  it('same type keeps its options, another type starts from defaults', () => {
    apply('a', (d) => { T.setTransition(d, 's1', { type: 'push', direction: 'up', duration: 900 }) })
    apply('b', (d) => { T.setTransition(d, 's1', { type: 'push', duration: 1000 }) })
    expect(tr(1)).toMatchObject({ direction: 'up', duration: 1000 })
    apply('c', (d) => { T.setTransition(d, 's1', { type: 'fade' }) })
    expect(tr(1)).toMatchObject({ type: 'fade', duration: 500 })
    expect(tr(1)?.direction).toBeUndefined()
  })

  it('Morph starts from the Morph pace; a duration outside the schema is refused', () => {
    apply('m', (d) => { T.setTransition(d, 's1', { type: 'morph' }) })
    expect(tr(1)).toMatchObject({ type: 'morph', duration: 900, easing: 'power2-in-out', own: true })
    let ok = true
    apply('bad', (d) => { ok = T.setTransition(d, 's1', { type: 'morph', duration: 10 }) })
    expect(ok).toBe(false)
    expect(tr(1)?.duration).toBe(900)
  })

  it('a no-op records no history', () => {
    apply('a', (d) => { T.setTransition(d, 's1', { type: 'fade' }) })
    const past = useDoc.getState().past.length
    apply('again', (d) => { T.setTransition(d, 's1', { type: 'fade' }) })
    expect(useDoc.getState().past.length).toBe(past)
  })

  it('locked slides refuse every change', () => {
    apply('lock', (d) => { d.slides[1]!.locked = true })
    let ok = true
    apply('t', (d) => { ok = T.setTransition(d, 's1', { type: 'zoom' }) })
    expect(ok).toBe(false)
    expect(tr(1)?.type).not.toBe('zoom')
  })

  it('Apply to all skips locked slides, and Morph skips the first slide', () => {
    apply('lock', (d) => { d.slides[2]!.locked = true })
    let count = 0
    apply('all', (d) => { count = T.setTransitionAll(d, { type: 'morph' }) })
    expect(count).toBe(1)
    expect(tr(0)?.type).not.toBe('morph')
    expect(tr(1)?.type).toBe('morph')
    expect(tr(2)?.type).not.toBe('morph')
    expect(T.hasMorph(doc())).toBe(true)
    apply('fade', (d) => { T.setTransitionAll(d, { type: 'fade' }) })
    expect(tr(0)?.type).toBe('fade')
    expect(tr(1)?.type).toBe('fade')
  })

  it('removes Morph from one slide or all, leaving other transitions alone', () => {
    apply('a', (d) => { T.setTransitionAll(d, { type: 'morph' }); T.setTransition(d, 's0', { type: 'wipe' }) })
    apply('rm', (d) => { T.removeMorph(d, 's1') })
    expect(tr(1)).toBeUndefined()
    expect(tr(2)?.type).toBe('morph')
    apply('rmall', (d) => { T.removeMorphAll(d) })
    expect(T.hasMorph(doc())).toBe(false)
    expect(tr(0)?.type).toBe('wipe')
    useDoc.getState().undo()
    expect(tr(2)?.type).toBe('morph')
  })
})
