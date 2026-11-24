import { describe, expect, it } from 'vitest'
import { MIN, fitShape, fractionRatio, frameForCrop, moveCrop, resizeCrop } from './crop-geometry'

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6)
describe('crop rectangle geometry', () => {
  it('moves but never leaves the picture', () => {
    expect(moveCrop({ x: 0.5, y: 0.5, w: 0.3, h: 0.3 }, 0.5, -0.9)).toEqual({ x: 0.7, y: 0, w: 0.3, h: 0.3 })
    expect(moveCrop({ x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, -1, 0.1)).toEqual({ x: 0, y: 0.2, w: 0.3, h: 0.3 })
  })
  it('an edge or corner moves only its sides, stays inside the picture and never gets smaller than the minimum', () => {
    const e = resizeCrop({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, 'e', 0.1, 0)
    near(e.x, 0.2); near(e.w, 0.5); near(e.h, 0.4)
    expect(resizeCrop({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, 'e', 5, 0).w).toBeCloseTo(0.8)
    near(resizeCrop({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, 'w', 5, 0).w, MIN)
    const nw = resizeCrop({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, 'nw', -0.5, -0.5)
    expect(nw).toMatchObject({ x: 0, y: 0 }); near(nw.w, 0.6); near(nw.h, 0.6)
  })
  it('with a locked shape the shape holds and the opposite corner stays put', () => {
    const r = resizeCrop({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, 'se', 0.2, 0.01, 1)
    near(r.w / r.h, 1); near(r.x, 0.2); near(r.y, 0.2)
    const edge = resizeCrop({ x: 0.3, y: 0.3, w: 0.2, h: 0.2 }, 'e', 0.2, 0, 2) // wider edge, shape 2:1: the height follows around the middle
    near(edge.w / edge.h, 2); near(edge.x, 0.3); near(edge.y + edge.h / 2, 0.4)
  })
  it('a locked shape that would leave the picture is scaled down, not pushed out', () => {
    const r = resizeCrop({ x: 0.6, y: 0.6, w: 0.3, h: 0.3 }, 'se', 0.5, 0.5, 1)
    expect(r.x + r.w).toBeLessThanOrEqual(1.000001); expect(r.y + r.h).toBeLessThanOrEqual(1.000001); near(r.w / r.h, 1)
  })
  it('the biggest rectangle of a shape fits the picture in the middle', () => {
    const wide = fitShape(fractionRatio(16 / 9, 1)) // a square-ish picture asked for 16:9: full width, short
    near(wide.w, 1); near(wide.h, 9 / 16); near(wide.y, (1 - 9 / 16) / 2)
    const tall = fitShape(fractionRatio(1, 2)) // a wide 2:1 picture asked for a square: half its width
    near(tall.w, 0.5); near(tall.h, 1); near(tall.x, 0.25)
  })
  it('the frame takes the cut-out\'s shape without distortion, around the old middle, inside the slide', () => {
    // a 2:1 picture, cut to its left half (a square of pixels): a frame 600 wide becomes 600 x 600
    const f = frameForCrop({ x: 100, y: 100, width: 600, height: 300 }, { x: 0, y: 0, w: 0.5, h: 1 }, 2, { width: 1920, height: 1080 })
    expect(f).toMatchObject({ width: 600, height: 600 }); expect(f.y).toBe(-50 < 0 ? 0 : -50)
    // too tall for the slide: both sides shrink together
    const big = frameForCrop({ x: 0, y: 0, width: 1500, height: 300 }, { x: 0, y: 0, w: 0.25, h: 1 }, 1, { width: 1920, height: 1080 })
    expect(big.height).toBeLessThanOrEqual(1080); expect(big.height / big.width).toBeCloseTo(4, 1)
  })
})
