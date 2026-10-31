import { describe, expect, it } from 'vitest'
import { pickKeyframes, sampleCount, type Sample } from './keyframes.ts'
import { mergeTimeline, parseTimedLines } from './pipeline.ts'
import { PART_BYTES, partSize, partsFor } from './store.ts'

const gray = (v: number, noise = 0) => Uint8Array.from({ length: 64 * 36 }, (_, i) => Math.max(0, Math.min(255, v + ((i * 7) % 40) - 20 + noise)))

describe('timed lines from the model', () => {
  it('reads "m:ss words" lines, adds the piece offset, joins unlabelled lines to the one before', () => {
    const l = parseTimedLines('0:00 Hello everyone.\n0:25 We sold 4,200 bicycles\nin 2025.\n1:05:30 Late line', 1200)
    expect(l).toEqual([{ t: 1200, text: 'Hello everyone.' }, { t: 1225, text: 'We sold 4,200 bicycles in 2025.' }, { t: 1200 + 3930, text: 'Late line' }])
  })
  it('keeps text that has no time at all (the model forgot the markers)', () => {
    expect(parseTimedLines('Just some words without a time.', 0)).toEqual([{ t: 0, text: 'Just some words without a time.' }])
  })
})

describe('speech and screen text in one timeline', () => {
  it('sorts by time, speech first at the same moment, marks the screen lines', () => {
    const text = mergeTimeline([{ t: 0, text: 'Welcome' }, { t: 70, text: 'Next topic' }], [{ t: 0, text: 'Title slide' }, { t: 65, text: 'Revenue\n86 crore' }])
    expect(text).toBe('0:00 Welcome\n0:00 [on screen] Title slide\n1:05 [on screen] Revenue / 86 crore\n1:10 Next topic')
  })
})

describe('which moments of a video are worth reading', () => {
  it('keeps the first frame and each clear change, skips repeats and blank frames', () => {
    const samples: Sample[] = [
      { t: 0, gray: gray(200) }, { t: 5, gray: gray(200, 1) }, { t: 10, gray: gray(200, 2) }, // same slide
      { t: 15, gray: new Uint8Array(64 * 36).fill(0) }, // black transition: skipped
      { t: 20, gray: gray(60) }, { t: 25, gray: gray(60, 1) }, // new slide
      { t: 30, gray: gray(140) }, // another
    ]
    expect(pickKeyframes(samples, { minGapSec: 10 })).toEqual([0, 20, 30])
  })
  it('never looks at more than the cap, keeping the biggest changes in time order', () => {
    const samples: Sample[] = Array.from({ length: 100 }, (_, i) => ({ t: i * 20, gray: gray(i % 2 ? 40 : 200) }))
    const picked = pickKeyframes(samples, { max: 10 })
    expect(picked).toHaveLength(10); expect(picked[0]).toBe(0); expect([...picked].sort((a, b) => a - b)).toEqual(picked)
  })
  it('samples about every 5-15 seconds, between 12 and 200 moments', () => {
    expect([30, 300, 3600, 5400, 20_000].map(sampleCount)).toEqual([12, 60, 240 > 200 ? 200 : 240, 200, 200])
  })
})

describe('upload parts', () => {
  it('splits a file into 8 MB parts; the last part holds the rest', () => {
    const bytes = 2 * PART_BYTES + 1000
    expect(partsFor(bytes)).toBe(3)
    expect([0, 1, 2].map((n) => partSize(bytes, n))).toEqual([PART_BYTES, PART_BYTES, 1000])
    expect(partsFor(5000)).toBe(1); expect(partSize(5000, 0)).toBe(5000)
    expect(partsFor(PART_BYTES)).toBe(1); expect(partSize(PART_BYTES, 0)).toBe(PART_BYTES)
  })
})
