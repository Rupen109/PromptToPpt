import { describe, expect, it } from 'vitest'
import { resampleMask } from './resample'

describe('resampleMask', () => {
  it('keeps the size and the values when nothing changes, and returns a copy', () => {
    const a = Uint8Array.from([0, 255, 128, 7])
    const b = resampleMask(a, 2, 2, 2, 2)
    expect(Array.from(b)).toEqual(Array.from(a)); expect(b).not.toBe(a)
  })
  it('upscales to the target size with a smooth edge that stays where it was', () => {
    const src = new Uint8Array(4 * 4); for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) src[y * 4 + x] = 255 // left half subject
    const up = resampleMask(src, 4, 4, 16, 16)
    expect(up.length).toBe(256)
    expect(up[2 * 16 + 0]).toBe(255); expect(up[2 * 16 + 15]).toBe(0)
    expect(up[8 * 16 + 7]).toBeGreaterThan(up[8 * 16 + 9]!) // the edge falls from left to right, in the middle
    const mid = up.slice(8 * 16, 8 * 16 + 16)
    for (let x = 1; x < 16; x++) expect(mid[x]!).toBeLessThanOrEqual(mid[x - 1]!) // monotone: no ringing
    expect(Array.from(mid).filter((v) => v > 0 && v < 255).length).toBeGreaterThan(0) // a soft transition, not a staircase
  })
  it('downscales and rejects a wrong source size', () => {
    expect(resampleMask(new Uint8Array(64).fill(200), 8, 8, 4, 4).every((v) => v === 200)).toBe(true)
    expect(() => resampleMask(new Uint8Array(5), 2, 2, 4, 4)).toThrow()
  })
})
