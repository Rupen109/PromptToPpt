import { describe, expect, it } from 'vitest'
import { placeBar } from './toolbarPlace'

const stage = { w: 1100, floor: 860 } // the slide is 620 tall; the page below it is free down to 860
const cover = (o: { left: number; top: number; width: number; height: number }, at: { left: number; top: number }, bar: { w: number; h: number }) => !(at.left + bar.w <= o.left || o.left + o.width <= at.left || at.top + bar.h <= o.top || o.top + o.height <= at.top)

describe('placeBar: a toolbar never covers the object it works on when there is any clear place', () => {
  it('room above: above', () => {
    expect(placeBar({ left: 100, top: 300, width: 400, height: 100 }, { w: 600, h: 44 }, stage)).toEqual({ top: 248, left: 100 })
  })
  it('a title at the top: below it, clear of the rotate handle', () => {
    expect(placeBar({ left: 100, top: 20, width: 400, height: 60 }, { w: 600, h: 44 }, stage).top).toBe(20 + 60 + 8 + 52)
  })
  it('a tall box with a tall panel open: below the slide, in the free page (the case that covered the bullets)', () => {
    const obj = { left: 54, top: 160, width: 480, height: 400 }, bar = { w: 1040, h: 230 }
    const at = placeBar(obj, bar, stage, 0)
    expect(cover(obj, at, bar)).toBe(false)
  })
  it('no room above or below but room beside: beside', () => {
    const obj = { left: 40, top: 100, width: 300, height: 700 }, bar = { w: 400, h: 200 }
    const at = placeBar(obj, bar, stage)
    expect(at.left).toBe(348)
    expect(cover(obj, at, bar)).toBe(false)
  })
  it('a tall panel over a tall picture: below it anyway, squeezed to the room there (its panel scrolls), never over the picture being tuned', () => {
    const obj = { left: 560, top: 50, width: 480, height: 510 }, bar = { w: 1090, h: 300 }
    const at = placeBar(obj, bar, stage)
    expect(at.top).toBe(50 + 510 + 8 + 52)
    expect(at.maxHeight).toBe(860 - at.top)
  })
  it('nowhere clear: the place that covers the least, kept on the page', () => {
    const at = placeBar({ left: 0, top: 0, width: 1100, height: 850 }, { w: 1000, h: 300 }, stage)
    expect(at.top).toBeGreaterThanOrEqual(4)
    expect(at.top + 300).toBeLessThanOrEqual(860)
  })
})
