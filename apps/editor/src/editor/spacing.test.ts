import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import type { Presentation, TextElement, Theme } from '@prompttoppt/validation'
import { setTextSpacing, textFit } from './spacing'

const text = (id: string, extra: Partial<TextElement> = {}) => ({ id, type: 'text', role: 'body', x: 100, y: 100, width: 800, height: 200, rotation: 0, locked: false, zIndex: 1, opacity: 1, fontSize: 40, align: 'left', valign: 'top', color: 'textPrimary', bullet: '•', paragraphs: [{ runs: [{ text: 'One' }] }, { runs: [{ text: 'Two' }] }], ...extra })
const deck = () => ({ aspectRatio: '16:9', slides: [{ id: 's', elements: [text('a'), text('b', { lineHeight: 2 }), text('l', { locked: true }), { id: 'p', type: 'shape' }] }] }) as unknown as Presentation
const el = (d: Presentation, id: string) => d.slides[0]!.elements.find((e) => e.id === id) as TextElement
const theme = { fonts: { heading: 'Inter', body: 'Inter' } } as Theme

describe('setTextSpacing', () => {
  it('every selected text box gets it in one step; locked boxes and shapes are left alone', () => {
    let n = 0
    const d = produce(deck(), (x) => { n = setTextSpacing(x, 's', ['a', 'b', 'l', 'p'], { lineHeight: 1.5 }) })
    expect(n).toBe(2)
    expect(el(d, 'a').lineHeight).toBe(1.5)
    expect(el(d, 'b').lineHeight).toBe(1.5)
    expect(el(d, 'l').lineHeight).toBeUndefined()
    expect((d.slides[0] as { manual?: boolean }).manual).toBe(true)
  })
  it('the deck normal is stored as "not set" (it follows the deck again); Reset removes all three; values stay in range', () => {
    const d = produce(deck(), (x) => { setTextSpacing(x, 's', ['b'], { lineHeight: 1.3 }) })
    expect('lineHeight' in el(d, 'b')).toBe(false)
    const r = produce(deck(), (x) => { setTextSpacing(x, 's', ['a'], { lineHeight: 9, paraGap: -1, letterSpacing: 99 }) })
    expect(el(r, 'a')).toMatchObject({ lineHeight: 2.2, letterSpacing: 30 })
    expect('paraGap' in el(r, 'a')).toBe(true); expect(el(r, 'a').paraGap).toBe(0)
    const reset = produce(r, (x) => { setTextSpacing(x, 's', ['a'], { lineHeight: null, paraGap: null, letterSpacing: null }) })
    expect(['lineHeight', 'paraGap', 'letterSpacing'].some((k) => k in el(reset, 'a'))).toBe(false)
  })
  it('nothing to change records nothing', () => {
    let n = -1
    const d0 = deck()
    const d = produce(d0, (x) => { n = setTextSpacing(x, 's', ['b'], { lineHeight: 2 }) })
    expect(n).toBe(0); expect(d).toBe(d0)
  })
})

describe('textFit: does the text still fit its box at its spacing', () => {
  it('more space between lines or paragraphs makes the same words taller (the paragraph gap is the box\'s own)', () => {
    const a = textFit(text('a') as TextElement, theme, '16:9').need
    expect(textFit(text('a', { lineHeight: 2 }) as TextElement, theme, '16:9').need).toBeGreaterThan(a)
    expect(textFit(text('a', { paraGap: 2 }) as TextElement, theme, '16:9').need).toBeGreaterThan(a)
  })
  it('a box too small is said; it can grow only to the bottom of the slide', () => {
    const f = textFit(text('a', { height: 40, lineHeight: 2.2, paraGap: 2 }) as TextElement, theme, '16:9')
    expect(f.fits).toBe(false)
    const low = textFit(text('a', { y: 1060, height: 10, lineHeight: 2.2 }) as TextElement, theme, '16:9')
    expect(low.canGrowTo).toBe(20)
  })
})
