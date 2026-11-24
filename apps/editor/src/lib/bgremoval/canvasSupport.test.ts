import { describe, expect, it } from 'vitest'
import { assertSurface, CanvasUnsupportedError, checkPngBlob, probeSurface, samplePoints, verifyReadback, type Surface } from './canvasSupport'

/** A tiny fake canvas: remembers what was drawn; `broken` modes imitate the quiet failures of a canvas that is too big. */
function fake(mode: 'ok' | 'no-context' | 'blank' | 'throws' | 'shrunk'): (w: number, h: number) => Surface {
  return (w, h) => {
    const painted = new Map<string, number[]>()
    let fill = [0, 0, 0]
    const s: Surface = {
      width: mode === 'shrunk' ? 0 : w, height: h,
      getContext: () => mode === 'no-context' ? null : ({
        set fillStyle(v: unknown) { fill = String(v).match(/\d+/g)!.map(Number) },
        get fillStyle() { return '' },
        fillRect: (x: number, y: number) => { if (mode !== 'blank') painted.set(`${x},${y}`, fill) },
        getImageData: (x: number, y: number) => { if (mode === 'throws') throw new Error('The canvas is too large'); const p = painted.get(`${x},${y}`); return { data: p ? [...p, 255] : [0, 0, 0, 0] } },
      }),
    }
    return s
  }
}

describe('canvas support checks', () => {
  it('a canvas that really works passes, and is released afterwards', () => {
    let made: Surface | null = null
    const make = (w: number, h: number) => (made = fake('ok')(w, h))
    expect(probeSurface(make, 5000, 4000)).toBeNull()
    expect(made!.width).toBe(0)
  })

  it('every quiet failure is caught: no context, drawing that does nothing, a read-back that throws, a canvas that did not keep its size', () => {
    for (const mode of ['no-context', 'blank', 'throws', 'shrunk'] as const) {
      const why = probeSurface(fake(mode), 20000, 20000)
      expect(why, mode).toMatch(/cannot work on a picture of 20000 × 20000 pixels/)
      expect(() => assertSurface(fake(mode), 100, 100), mode).toThrow(CanvasUnsupportedError)
    }
    expect(() => assertSurface(fake('ok'), 100, 100)).not.toThrow()
  })

  it('a canvas that went blank is noticed by comparing a few pixels with what was drawn', () => {
    const w = 40, h = 30
    const expected = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) { expected[i * 4] = 200; expected[i * 4 + 1] = 100; expected[i * 4 + 2] = 50; expected[i * 4 + 3] = 255 }
    expect(verifyReadback((x, y) => expected.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), expected, w, h)).toBeNull()
    expect(verifyReadback(() => [0, 0, 0, 0], expected, w, h)).toMatch(/blank or damaged/)
    expect(verifyReadback(() => [200, 100, 50, 0], expected, w, h)).toMatch(/blank or damaged/) // right colour, no alpha
    // a fully transparent pixel does not have to keep its colour
    const clear = new Uint8ClampedArray(w * h * 4)
    expect(verifyReadback(() => [0, 0, 0, 0], clear, w, h)).toBeNull()
    // premultiplied rounding on a half-transparent pixel is tolerated
    const half = new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? 128 : 200))
    expect(verifyReadback(() => [199, 201, 198, 128], half, w, h)).toBeNull()
    expect(samplePoints(1, 1)).toContainEqual([0, 0])
    expect(samplePoints(40, 30).length).toBe(25)
  })

  it('an empty or mistyped PNG is refused before anything is saved', () => {
    expect(checkPngBlob(new Blob([new Uint8Array(500)], { type: 'image/png' }))).toBeNull()
    expect(checkPngBlob(new Blob([new Uint8Array(0)], { type: 'image/png' }))).toMatch(/empty/)
    expect(checkPngBlob(new Blob([new Uint8Array(500)], { type: 'image/webp' }))).toMatch(/could not make a PNG/)
  })
})
