import { describe, expect, it } from 'vitest'
import { getTheme } from '@prompttoppt/theme'
import { presentationSchema, type Effect, type Presentation, type SlideElement } from '@prompttoppt/validation'
import { produce } from 'immer'
import * as C from './commands'
import { addEffect } from './effect-commands'

let n = 0
const gen = () => `n${++n}`
const theme = getTheme('midnight')!
const box = (id: string, extra: Record<string, unknown> = {}) => C.makeElement({ type: 'shape', id, shape: 'rect', x: 100, y: 100, width: 200, height: 120, ...extra })
const base = (): Presentation => {
  const s0 = { ...C.blankSlide(theme, 's0'), elements: [box('a'), box('b'), box('c')] as SlideElement[] }
  const s1 = C.blankSlide(theme, 's1')
  return { schemaVersion: 1, id: 'p', title: 'T', aspectRatio: '16:9', language: 'en', theme, sources: [], slides: [s0, s1] } as Presentation
}
/** a deck whose slide 0 has: a fades in on click, b flies in after it, c has a click-triggered pulse that is triggered by a */
const withEffects = () => produce(base(), (d) => {
  addEffect(d, 's0', 'a', 'entrance', 'fade-in', () => 'fx-a')
  addEffect(d, 's0', 'b', 'entrance', 'fly-in', () => 'fx-b', { start: 'after' })
  addEffect(d, 's0', 'c', 'emphasis', 'pulse', () => 'fx-c', { trigger: 'a' })
})
const fxOf = (d: Presentation, slide: string) => (d.slides.find((s) => s.id === slide)!.effects ?? []) as Effect[]

describe('copying elements copies their effects', () => {
  it('Duplicate: each copy plays the effects of its original; the originals keep theirs', () => {
    const d = produce(withEffects(), (x) => { C.duplicateElements(x, 's0', ['a', 'b'], gen) })
    const els = d.slides[0]!.elements
    const [a2, b2] = [els[3]!.id, els[4]!.id]
    const fx = fxOf(d, 's0')
    expect(fx).toHaveLength(5)
    expect(fx.find((e) => e.id === 'fx-a')!.elementId).toBe('a') // untouched
    const copies = fx.filter((e) => ![ 'fx-a', 'fx-b', 'fx-c' ].includes(e.id))
    expect(copies.map((e) => [e.elementId, e.type, e.start]).sort()).toEqual([[a2, 'fade-in', 'click'], [b2, 'fly-in', 'after']].sort())
    expect(new Set(fx.map((e) => e.id)).size).toBe(5) // fresh ids, never the original's
    expect(presentationSchema.safeParse(d).success).toBe(true)
  })

  it('an effect triggered by another element follows that element\'s copy when both were copied, and loses the trigger otherwise', () => {
    const both = produce(withEffects(), (x) => { C.duplicateElements(x, 's0', ['a', 'c'], gen) })
    const els = both.slides[0]!.elements
    const [a2, c2] = [els[3]!.id, els[4]!.id]
    const pulse = fxOf(both, 's0').find((e) => e.elementId === c2)!
    expect(pulse.trigger).toBe(a2) // the copy of c is clicked by the copy of a
    const alone = produce(withEffects(), (x) => { C.duplicateElements(x, 's0', ['c'], gen) })
    const c3 = alone.slides[0]!.elements[3]!.id
    const lone = fxOf(alone, 's0').find((e) => e.elementId === c3)!
    expect(lone.trigger).toBeUndefined() // a trigger on a click of "a" would point at an element that is not part of this copy
    expect(fxOf(alone, 's0').find((e) => e.id === 'fx-c')!.trigger).toBe('a') // the original keeps its own
  })

  it('Copy and Paste on another slide brings the effects along, without a trigger that points back at the first slide', () => {
    const src = withEffects()
    const els = src.slides[0]!.elements.filter((e) => ['a', 'c'].includes(e.id))
    const fx = fxOf(src, 's0').filter((e) => els.some((x) => x.id === e.elementId))
    const d = produce(src, (x) => { C.pasteElements(x, 's1', els, gen, fx) })
    const pasted = d.slides[1]!
    expect(pasted.elements).toHaveLength(2)
    expect(fxOf(d, 's1').map((e) => e.type).sort()).toEqual(['fade-in', 'pulse'])
    expect(fxOf(d, 's1').every((e) => pasted.elements.some((x) => x.id === e.elementId))).toBe(true) // every effect points at an element of THIS slide
    expect(fxOf(d, 's1').find((e) => e.type === 'pulse')!.trigger).toBe(fxOf(d, 's1').find((e) => e.type === 'fade-in')!.elementId)
    expect(fxOf(d, 's0')).toHaveLength(3) // the first slide is unchanged
    expect(presentationSchema.safeParse(d).success).toBe(true)
  })

  it('pasting without effects (an element copied before this change, or one with none) still works, and an effect of an element that was not copied is not brought along', () => {
    const src = withEffects()
    const a = src.slides[0]!.elements.find((e) => e.id === 'a')!
    const plain = produce(src, (x) => { C.pasteElements(x, 's1', [a], gen) })
    expect(plain.slides[1]!.elements).toHaveLength(1); expect(fxOf(plain, 's1')).toHaveLength(0)
    const stray = produce(src, (x) => { C.pasteElements(x, 's1', [a], gen, fxOf(src, 's0')) }) // all three effects offered, only a's element was copied
    expect(fxOf(stray, 's1').map((e) => e.type)).toEqual(['fade-in'])
  })

  it('stops at the schema\'s limit of effects on a slide instead of producing an invalid slide', () => {
    let k = 0
    const full = produce(withEffects(), (x) => {
      const s = x.slides[0]!
      s.effects = Array.from({ length: 199 }, () => ({ ...(fxOf(withEffects(), 's0')[0] as Effect), id: `f${k++}` })) as typeof s.effects
    })
    const d = produce(full, (x) => { C.duplicateElements(x, 's0', ['a', 'b'], gen) })
    expect(fxOf(d, 's0').length).toBeLessThanOrEqual(200)
    expect(presentationSchema.safeParse(d).success).toBe(true)
  })
})
