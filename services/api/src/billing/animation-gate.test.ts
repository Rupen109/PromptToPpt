import { describe, expect, it } from 'vitest'
import type { Presentation } from '@prompttoppt/validation'
import { morphAdded } from './animation-gate.ts'

describe('morphAdded (Morph is a Gold feature; object effects are open to every plan)', () => {
  const morph = (extra: object = {}) => ({ type: 'morph', duration: 1200, ...extra })
  const slide = (id: string, transition?: object) => ({ id, ...(transition ? { transition } : {}) })
  const d = (...slides: object[]) => ({ slides }) as unknown as Presentation
  it('setting a slide to Morph, or changing its Morph settings, needs the plan; every other transition does not', () => {
    expect(morphAdded(d(slide('s1')), d(slide('s1', morph())))).toBe(true)
    expect(morphAdded(d(slide('s1', { type: 'fade', duration: 500 })), d(slide('s1', morph())))).toBe(true)
    expect(morphAdded(d(slide('s1', morph())), d(slide('s1', morph({ duration: 2000 }))))).toBe(true)
    expect(morphAdded(d(slide('s1')), d(slide('s1', { type: 'push', duration: 600 })))).toBe(false)
  })
  it('a deck that already has Morph can be saved as it is, and Morph can be taken away', () => {
    const before = d(slide('s1', morph({ own: true })))
    expect(morphAdded(before, d(slide('s1', morph({ own: true }))))).toBe(false)
    expect(morphAdded(before, d(slide('s1', { type: 'fade', duration: 500 })))).toBe(false)
    expect(morphAdded(before, d(slide('s1')))).toBe(false)
  })
})
