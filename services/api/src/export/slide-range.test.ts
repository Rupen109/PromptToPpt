import { describe, expect, it } from 'vitest'
import { compactSlides, describeSlides, parseSlideRange, slidesFileSuffix } from '@prompttoppt/validation'

describe('reading the slides of an export ("3", "1-3, 5")', () => {
  it('numbers, runs, spaces, "and", an open end; deck order, no repeats', () => {
    expect(parseSlideRange('3', 10)).toEqual({ ok: true, numbers: [3] })
    expect(parseSlideRange('1-3, 5', 10)).toEqual({ ok: true, numbers: [1, 2, 3, 5] })
    expect(parseSlideRange(' 5 , 1 - 3 ', 10)).toEqual({ ok: true, numbers: [1, 2, 3, 5] })
    expect(parseSlideRange('2 and 4', 10)).toEqual({ ok: true, numbers: [2, 4] })
    expect(parseSlideRange('8-', 10)).toEqual({ ok: true, numbers: [8, 9, 10] })
    expect(parseSlideRange('4–2', 10)).toEqual({ ok: true, numbers: [2, 3, 4] })
    expect(parseSlideRange('2 2 3', 10)).toEqual({ ok: true, numbers: [2, 3] })
  })
  it('says what is wrong: nothing typed, not a number, past the end', () => {
    expect(parseSlideRange('', 10)).toMatchObject({ ok: false })
    expect(parseSlideRange('two', 10)).toMatchObject({ ok: false, why: expect.stringMatching(/"two" is not a slide number/) })
    expect(parseSlideRange('9-12', 10)).toMatchObject({ ok: false, why: 'This deck has 10 slides, so there is no slide 12.' })
    expect(parseSlideRange('0', 10)).toMatchObject({ ok: false })
  })
  it('written short, in words, in a file name', () => {
    expect(compactSlides([5, 1, 2, 3])).toBe('1-3, 5')
    expect(describeSlides([7], 12)).toBe('slide 7')
    expect(describeSlides([1, 2, 3, 5], 12)).toBe('slides 1-3, 5')
    expect(describeSlides([], 12)).toBe('all 12 slides')
    expect(slidesFileSuffix([7], 12)).toBe('-slide-7')
    expect(slidesFileSuffix([1, 2, 3, 5], 12)).toBe('-slides-1-3_5')
    expect(slidesFileSuffix([1, 2], 2)).toBe('')
  })
})
