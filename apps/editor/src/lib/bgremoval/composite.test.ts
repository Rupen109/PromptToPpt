import { describe, expect, it } from 'vitest'
import { compose, coverRect, foregroundColors, parseHex } from './composite'

/** A 12 x 1 strip photographed against WHITE: 4 red subject pixels, then 3 edge pixels (red mixed with white, as a camera would record them), then white background. */
function strip() {
  const w = 12, rgba = new Uint8ClampedArray(w * 4), alpha = new Uint8Array(w)
  const set = (x: number, r: number, g: number, b: number, a: number) => { rgba.set([r, g, b, 255], x * 4); alpha[x] = a }
  for (let x = 0; x < 4; x++) set(x, 200, 20, 20, 255)
  set(4, 228, 138, 138, 192) // 75% red over white
  set(5, 228 + 12, 138 + 58, 138 + 58, 128) // about 50%
  set(6, 247, 211, 211, 64) // 25%
  for (let x = 7; x < 12; x++) set(x, 255, 255, 255, 0)
  return { w, rgba, alpha }
}

describe('foregroundColors: no halo from the old background', () => {
  it('edge pixels take the colour of the solid subject next to them, instead of the white they were mixed with', () => {
    const { w, rgba, alpha } = strip()
    const fg = foregroundColors(rgba, alpha, w, 1)
    for (const x of [4, 5, 6]) expect([fg[x * 3], fg[x * 3 + 1], fg[x * 3 + 2]], `pixel ${x}`).toEqual([200, 20, 20])
    expect(fg[0]).toBe(200) // solid pixels are untouched
  })
  it('on a dark background the edge is not light either (and not the other way round): composing over black has no white fringe', () => {
    const { w, rgba, alpha } = strip()
    const fg = foregroundColors(rgba, alpha, w, 1)
    const onBlack = compose(fg, alpha, w, 1, { kind: 'color', rgb: [0, 0, 0] })
    // pixel 5 (50%): red 200 * 0.5 = 100 and nothing light added
    expect(onBlack[5 * 4]).toBe(Math.round((200 * 128) / 255))
    expect(onBlack[5 * 4 + 1]).toBe(Math.round((20 * 128) / 255))
    // without the clean-up the green channel would be 138+58 mixed: clearly lighter than the subject's 20
    const dirty = compose(Uint8ClampedArray.from(Array.from({ length: w * 3 }, (_, i) => rgba[Math.floor(i / 3) * 4 + (i % 3)]!)), alpha, w, 1, { kind: 'color', rgb: [0, 0, 0] })
    expect(dirty[5 * 4 + 1]!).toBeGreaterThan(onBlack[5 * 4 + 1]! + 40)
  })
  it('fully transparent pixels and far-away semi-transparent ones are left as they are (no crash, no work wasted)', () => {
    const { w, rgba, alpha } = strip()
    const fg = foregroundColors(rgba, alpha, w, 1, { passes: 1 })
    expect(fg[11 * 3]).toBe(255)
    expect(fg[6 * 3]).toBe(247) // beyond one pass of the solid area: kept
  })
})

describe('compose', () => {
  const fg = Uint8ClampedArray.from([200, 20, 20, 200, 20, 20, 200, 20, 20])
  const alpha = Uint8Array.from([255, 128, 0])
  it('transparent: straight RGBA with the mask as alpha', () => {
    const o = compose(fg, alpha, 3, 1, { kind: 'transparent' })
    expect(Array.from(o)).toEqual([200, 20, 20, 255, 200, 20, 20, 128, 200, 20, 20, 0])
  })
  it('a colour: opaque, subject over the colour by the mask', () => {
    const o = compose(fg, alpha, 3, 1, { kind: 'color', rgb: [255, 255, 255] })
    expect(Array.from(o.slice(0, 4))).toEqual([200, 20, 20, 255])
    expect(o[4]).toBe(Math.round((200 * 128 + 255 * 127) / 255)); expect(o[7]).toBe(255)
    expect(Array.from(o.slice(8, 12))).toEqual([255, 255, 255, 255])
  })
  it('a picture as the background: its pixels show where the mask is empty', () => {
    const bg = Uint8ClampedArray.from([1, 2, 3, 255, 1, 2, 3, 255, 9, 8, 7, 255])
    const o = compose(fg, alpha, 3, 1, { kind: 'pixels', rgba: bg })
    expect(Array.from(o.slice(8, 12))).toEqual([9, 8, 7, 255])
  })
})

describe('helpers', () => {
  it('coverRect fills the area and centres the overflow', () => {
    const r = coverRect(200, 100, 100, 100) // wide picture into a square: scaled to height, cropped at the sides
    expect(r).toEqual({ x: -50, y: 0, w: 200, h: 100 })
    const t = coverRect(100, 200, 100, 100)
    expect(t).toEqual({ x: 0, y: -50, w: 100, h: 200 })
  })
  it('parseHex reads #rrggbb and falls back to white for anything else', () => {
    expect(parseHex('#ff8000')).toEqual([255, 128, 0]); expect(parseHex('0A0B0C')).toEqual([10, 11, 12]); expect(parseHex('nope')).toEqual([255, 255, 255])
  })
})
