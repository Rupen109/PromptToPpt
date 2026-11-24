import { describe, expect, it } from 'vitest'
import { canvasPoint, fitView, pinchView, toImage, wheelAction, wheelFactor, zoomAbout } from './view'

const lim = { min: 0.05, max: 40 }
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e

describe('view maths', () => {
  it('a position on the page lands on the right picture pixel at every zoom, pan and pixel ratio', () => {
    // a canvas shown 400 x 300 CSS px that holds 800 x 600 pixels (ratio 2) and one at a fractional ratio (1.25 -> 500 x 375)
    for (const [cw, ch, w, h] of [[800, 600, 400, 300], [500, 375, 400, 300], [601, 451, 400, 300]] as const) {
      for (const v of [{ scale: 0.3, ox: 40, oy: 22 }, { scale: 1, ox: -300, oy: 17 }, { scale: 17.5, ox: -9000, oy: -4000 }]) {
        const rect = { left: 100, top: 50, width: w, height: h }
        for (const [px, py] of [[10, 20], [123.4, 77.7], [350, 290]] as const) {
          const c = canvasPoint(rect, cw, ch, rect.left + px, rect.top + py)
          const img = toImage(v, c)
          // going back: the picture point drawn at its canvas position, then to the page, is where we clicked
          const backCanvas = { x: img.x * v.scale + v.ox, y: img.y * v.scale + v.oy }
          expect(near(backCanvas.x, c.x, 1e-9) && near(backCanvas.y, c.y, 1e-9)).toBe(true)
          expect(near((backCanvas.x * rect.width) / cw, px, 1e-6)).toBe(true)
          expect(near((backCanvas.y * rect.height) / ch, py, 1e-6)).toBe(true)
        }
      }
    }
  })

  it('zooming about a point keeps the picture point under it where it is, and respects the limits', () => {
    const v = { scale: 1, ox: 10, oy: 20 }
    const z = zoomAbout(v, 2, 300, 200, lim)
    const before = toImage(v, { x: 300, y: 200 }), after = toImage(z, { x: 300, y: 200 })
    expect(near(before.x, after.x) && near(before.y, after.y)).toBe(true)
    expect(zoomAbout(v, 1000, 0, 0, lim).scale).toBe(40)
    expect(zoomAbout(v, 0.0001, 0, 0, lim).scale).toBe(0.05)
  })

  it('a pinch zooms by the change of distance and the picture point under the fingers\' midpoint follows the midpoint (zoom and two-finger pan are one rule)', () => {
    const v = { scale: 1, ox: 0, oy: 0 }
    const a0 = { x: 100, y: 100 }, b0 = { x: 200, y: 100 }
    // spread apart to twice the distance, and the midpoint moves right by 30 and down by 10
    const a1 = { x: 80 + 30, y: 100 + 10 }, b1 = { x: 280 + 30, y: 100 + 10 }
    const next = pinchView(v, a0, b0, a1, b1, lim)
    expect(near(next.scale, 2)).toBe(true)
    const m0 = { x: 150, y: 100 }, m1 = { x: 210, y: 110 }
    const was = toImage(v, m0), now = toImage(next, m1)
    expect(near(was.x, now.x) && near(was.y, now.y)).toBe(true)
    // two fingers moving together without changing distance is a pure pan
    const pan = pinchView(v, a0, b0, { x: 125, y: 90 }, { x: 225, y: 90 }, lim)
    expect(near(pan.scale, 1)).toBe(true); expect(near(pan.ox, 25)).toBe(true); expect(near(pan.oy, -10)).toBe(true)
    // fingers on the same spot do not divide by zero
    expect(pinchView(v, { x: 5, y: 5 }, { x: 5, y: 5 }, a1, b1, lim).scale).toBe(1)
  })

  it('fit leaves the whole picture inside the view', () => {
    const f = fitView(4000, 3000, 800, 600)
    expect(4000 * f.scale + f.ox).toBeLessThanOrEqual(800 - 24 + 1e-9)
    expect(f.ox).toBeGreaterThanOrEqual(24 - 1e-9)
  })

  it('the wheel: ctrl/cmd and a pinch always zoom; a notched mouse wheel zooms by choice; a trackpad scroll pans', () => {
    expect(wheelAction({ ctrlKey: true, metaKey: false, deltaX: 0, deltaY: 3.2, deltaMode: 0 }, false)).toBe('zoom')
    expect(wheelAction({ ctrlKey: false, metaKey: true, deltaX: 0, deltaY: 3.2, deltaMode: 0 }, false)).toBe('zoom')
    expect(wheelAction({ ctrlKey: false, metaKey: false, deltaX: 0, deltaY: 100, deltaMode: 0 }, true)).toBe('zoom') // a mouse wheel notch
    expect(wheelAction({ ctrlKey: false, metaKey: false, deltaX: 0, deltaY: 3, deltaMode: 1 }, true)).toBe('zoom') // Firefox lines
    expect(wheelAction({ ctrlKey: false, metaKey: false, deltaX: 4.5, deltaY: 12.25, deltaMode: 0 }, true)).toBe('pan') // trackpad
    expect(wheelAction({ ctrlKey: false, metaKey: false, deltaX: 0, deltaY: 100, deltaMode: 0 }, false)).toBe('pan') // chosen: wheel pans
    expect(wheelFactor({ deltaY: -100, deltaMode: 0, ctrlKey: false })).toBeGreaterThan(1)
    expect(wheelFactor({ deltaY: 100, deltaMode: 0, ctrlKey: false })).toBeLessThan(1)
  })
})
