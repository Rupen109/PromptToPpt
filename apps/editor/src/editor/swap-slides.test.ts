import { describe, expect, it } from 'vitest'
import { getTheme } from '@prompttoppt/theme'
import type { Presentation } from '@prompttoppt/validation'
import * as C from './commands'
import { useDoc } from './store'

const deck = (n: number): Presentation => ({ schemaVersion: 1, id: 'p', title: 'T', aspectRatio: '16:9', language: 'en', theme: getTheme('cobalt'), sources: [], slides: Array.from({ length: n }, (_, i) => C.blankSlide(getTheme('cobalt'), `s${i + 1}`)) })
const order = () => useDoc.getState().doc!.slides.map((s) => s.id).join(',')
/** the moves the swap capability plans (services/api capabilities/slides.ts), applied by the editor's own step */
const swap = (n: number, x: number, y: number) => {
  useDoc.getState().load(deck(n), 1)
  const ids = Array.from({ length: n }, (_, i) => `s${i + 1}`)
  const ia = Math.min(x, y) - 1, ib = Math.max(x, y) - 1
  const moves = ib === ia + 1 ? [{ slideId: ids[ib]!, afterSlideId: ids[ia - 1] ?? null }] : [{ slideId: ids[ib]!, afterSlideId: ids[ia - 1] ?? null }, { slideId: ids[ia]!, afterSlideId: ids[ib - 1]! }]
  useDoc.getState().apply('swap', (d) => C.applyAssist(d, { edits: [], moves } as never))
  return order()
}
describe('swapping two slides (the moves the assistant plans)', () => {
  it('slides far apart exchange places and nothing else moves', () => { expect(swap(6, 2, 5)).toBe('s1,s5,s3,s4,s2,s6') })
  it('neighbours exchange places', () => { expect(swap(6, 3, 4)).toBe('s1,s2,s4,s3,s5,s6') })
  it('the first and the last slide exchange places', () => { expect(swap(5, 1, 5)).toBe('s5,s2,s3,s4,s1') })
  it('the first and the second', () => { expect(swap(4, 1, 2)).toBe('s2,s1,s3,s4') })
  it('it is one undo step', () => { swap(6, 2, 5); useDoc.getState().undo(); expect(order()).toBe('s1,s2,s3,s4,s5,s6') })
})
