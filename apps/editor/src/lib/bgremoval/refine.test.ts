import { describe, expect, it } from 'vitest'
import { foregroundColors } from './composite'
import { alphaCurve, featherAlpha, growAlpha, matteRadius, matteRefine, needsRefine, normalizeAlpha } from './refine'
import { resampleMask } from './resample'

const sum = (a: Uint8Array) => a.reduce((s, v) => s + v, 0)

describe('normalizeAlpha (continuous levels, never a threshold)', () => {
  it('confident values become fully opaque or fully clear; the soft edge in between is kept, in order', () => {
    const lut = alphaCurve()
    expect(lut[0]).toBe(0); expect(lut[6]).toBe(0); expect(lut[245]).toBe(255); expect(lut[250]).toBe(255); expect(lut[255]).toBe(255)
    expect(Math.abs(lut[128]! - 128)).toBeLessThanOrEqual(2)
    for (let v = 1; v < 256; v++) expect(lut[v]!).toBeGreaterThanOrEqual(lut[v - 1]!) // never reverses
    // the transition is still a transition: nearly all of the in-between values stay distinct and in between
    const distinct = new Set(Array.from(lut).slice(7, 245)).size
    expect(distinct).toBeGreaterThan(180)
    // no step: neighbouring values never jump
    for (let v = 1; v < 256; v++) expect(lut[v]! - lut[v - 1]!).toBeLessThanOrEqual(2) // no step anywhere: a straight line between the ends
  })

  it('lifts the model\'s 250-254 core to 255 (the audit\'s measured case) without touching the edge', () => {
    const core = new Uint8Array([250, 252, 254, 255, 247])
    expect(Array.from(normalizeAlpha(core))).toEqual([255, 255, 255, 255, 255])
    const edge = new Uint8Array([20, 60, 100, 128, 160, 200, 230])
    const out = normalizeAlpha(edge)
    out.forEach((v, i) => expect(Math.abs(v - edge[i]!)).toBeLessThanOrEqual(20))
    expect(out[3]).toBeGreaterThan(110); expect(out[3]).toBeLessThan(146)
    expect(Array.from(normalizeAlpha(new Uint8Array([0, 1, 3, 6])))).toEqual([0, 0, 0, 0])
  })

  it('returns a new array and leaves its input alone', () => {
    const a = new Uint8Array([251, 3]); const b = normalizeAlpha(a)
    expect(Array.from(a)).toEqual([251, 3]); expect(b).not.toBe(a)
  })
})

describe('featherAlpha', () => {
  it('spreads a hard edge into a ramp, keeps the total about the same and does nothing at radius 0', () => {
    const w = 60, h = 40, a = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 30; x < w; x++) a[y * w + x] = 255
    expect(Array.from(featherAlpha(a, w, h, 0))).toEqual(Array.from(a))
    const f = featherAlpha(a, w, h, 4)
    const row = (x: number) => f[20 * w + x]!
    expect(row(10)).toBeLessThan(5); expect(row(50)).toBeGreaterThan(250)
    expect(row(28)).toBeGreaterThan(5); expect(row(28)).toBeLessThan(row(31)); expect(row(31)).toBeLessThan(row(34))
    expect(Math.abs(row(29) + row(30) - 255)).toBeLessThanOrEqual(6) // symmetric about the edge
    // total is kept except for what the image border lets out
    expect(Math.abs(sum(f) - sum(a)) / sum(a)).toBeLessThan(0.02)
  })
})

describe('growAlpha (expand and contract)', () => {
  const square = (n: number, from: number, to: number) => { const a = new Uint8Array(n * n); for (let y = from; y < to; y++) for (let x = from; x < to; x++) a[y * n + x] = 255; return a }
  const reach = (a: Uint8Array, n: number, y: number, x0: number, dir: 1 | -1) => { let k = 0; for (let x = x0; x >= 0 && x < n && a[y * n + x] === 255; x += dir) k++; return k }

  it('expands by the chosen number of pixels along the straight directions, and shrinks back', () => {
    const n = 60, a = square(n, 25, 35) // 10 x 10
    for (const r of [1, 2, 3, 5, 8, 10]) {
      const g = growAlpha(a, n, n, r)
      expect(reach(g, n, 30, 30, 1), `grow ${r} right`).toBe(5 + r) // from x=30 to the right edge of the square: (35-30) + r
      expect(g[30 * n + 25 - r]).toBe(255)
      expect(g[30 * n + 25 - r - 1]).toBe(0)
      const s = growAlpha(g, n, n, -r)
      expect(Array.from(s)).toEqual(Array.from(a)) // grow then shrink returns the square exactly
    }
    const shrunk = growAlpha(a, n, n, -3)
    expect(shrunk[30 * n + 28]).toBe(255); expect(shrunk[30 * n + 27]).toBe(0) // 10 -> 4 wide
  })

  it('a round subject stays round: growth in the diagonal is close to growth along the axes', () => {
    const n = 101, a = new Uint8Array(n * n)
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot(x - 50, y - 50) <= 20) a[y * n + x] = 255
    const r = 10, g = growAlpha(a, n, n, r)
    let axis = 0, diag = 0
    for (let k = 0; k < 50; k++) { if (g[50 * n + 50 + k] === 255) axis = k; if (g[(50 + k) * n + 50 + k] === 255) diag = Math.round(k * Math.SQRT2) }
    expect(Math.abs(axis - 30)).toBeLessThanOrEqual(1)
    expect(Math.abs(diag - 30)).toBeLessThanOrEqual(2) // a plain square would reach 44
  })

  it('keeps soft values soft, does not change a mask for radius 0, and survives the image border', () => {
    const n = 20, a = new Uint8Array(n * n).fill(0); a[10 * n + 10] = 128
    const g = growAlpha(a, n, n, 2)
    expect(g[10 * n + 12]).toBe(128); expect(Math.max(...g)).toBe(128)
    expect(Array.from(growAlpha(a, n, n, 0))).toEqual(Array.from(a))
    const edge = new Uint8Array(n * n).fill(255)
    expect(Array.from(growAlpha(edge, n, n, 5))).toEqual(Array.from(edge)) // a full mask cannot grow, nothing breaks at the border
    expect(Math.min(...growAlpha(edge, n, n, -5))).toBe(255) // and edge replication means the border is not eaten
  })
})

describe('matteRefine: the picture\'s own colours bring back the detail that enlarging a mask smeared', () => {
  // deterministic noise so the scenes are the same on every run
  const noise = (seed: number) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }
  const W = 240, H = 240

  /** A scene with a KNOWN alpha: a red subject on a blue-green background, composited the way a camera records it (edge pixels are a mix). */
  function scene(kind: 'edge' | 'hair' | 'texture') {
    const rnd = noise(12345)
    const truth = new Float32Array(W * H), rgba = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - 120, y - 120)
      truth[y * W + x] = kind === 'edge' ? (x >= 100 ? 1 : 0) : Math.min(1, Math.max(0, (70 - d) / 1.2 + 0.5))
    }
    if (kind === 'hair') for (let k = 0; k < 40; k++) { // thin, semi-transparent strands leaving the disc
      const ang = rnd() * Math.PI * 2, len = 14 + rnd() * 22, al = 0.35 + rnd() * 0.6
      for (let t = 68; t < 68 + len; t += 0.5) { const x = Math.round(120 + Math.cos(ang + t * 0.004) * t), y = Math.round(120 + Math.sin(ang + t * 0.004) * t); if (x >= 0 && x < W && y >= 0 && y < H) truth[y * W + x] = Math.max(truth[y * W + x]!, al) }
    }
    const tex = kind === 'texture' ? 25 : 8
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const fg = [190 + tex * (rnd() - 0.5), 60 + tex * (rnd() - 0.5), 50 + tex * (rnd() - 0.5)]
      const bg = [60 + 40 * (x / W) + tex * (rnd() - 0.5), 110 + 30 * (y / H) + tex * (rnd() - 0.5), 150 + tex * (rnd() - 0.5)]
      const a = truth[y * W + x]!
      for (let c = 0; c < 3; c++) rgba[(y * W + x) * 4 + c] = Math.round(fg[c]! * a + bg[c]! * (1 - a))
      rgba[(y * W + x) * 4 + 3] = 255
    }
    return { truth, rgba }
  }
  /** What a model at 1/6 of the size gives (the true alpha averaged into big cells, and 2 pixels off), enlarged the way the editor enlarges it. */
  function coarseOf(truth: Float32Array, f = 6) {
    const sw = Math.round(W / f), sh = Math.round(H / f), small = new Uint8Array(sw * sh)
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      let s = 0
      for (let yy = 0; yy < f; yy++) for (let xx = 0; xx < f; xx++) s += truth[Math.min(H - 1, y * f + yy) * W + Math.max(0, Math.min(W - 1, x * f + xx - 2))]!
      small[y * sw + x] = Math.round((255 * s) / (f * f))
    }
    return { coarse: resampleMask(small, sw, sh, W, H), sw }
  }
  const err = (a: Uint8Array, t: Float32Array) => { let e = 0; for (let i = 0; i < a.length; i++) e += Math.abs(a[i]! / 255 - t[i]!); return e / a.length }

  for (const [kind, factor] of [['edge', 0.1], ['texture', 0.35], ['hair', 0.5]] as const) {
    it(`${kind}: the error against the true alpha falls to ${Math.round(factor * 100)}% of the plain enlargement or less`, () => {
      const { truth, rgba } = scene(kind)
      const { coarse, sw } = coarseOf(truth)
      const refined = normalizeAlpha(matteRefine(coarse, rgba, W, H, { radius: matteRadius(sw, W) }))
      expect(err(refined, truth)).toBeLessThan(err(coarse, truth) * factor)
    })
  }

  it('puts a blurry, misplaced edge back where the picture has it: sharp transition, within a pixel of the true place', () => {
    const { truth, rgba } = scene('edge')
    const { coarse, sw } = coarseOf(truth)
    const refined = matteRefine(coarse, rgba, W, H, { radius: matteRadius(sw, W) })
    const ramp = (a: Uint8Array) => { let lo = -1, hi = -1; for (let x = 0; x < W; x++) { const v = a[120 * W + x]!; if (lo < 0 && v > 25) lo = x; if (hi < 0 && v > 230) hi = x } return hi - lo }
    expect(ramp(coarse)).toBeGreaterThanOrEqual(4)
    expect(ramp(refined)).toBeLessThanOrEqual(2)
    let at = 0; for (let x = 0; x < W; x++) if (refined[120 * W + x]! >= 128) { at = x; break }
    expect(Math.abs(at - 100)).toBeLessThanOrEqual(1)
  })

  it('works when the colours are worked out at a smaller size than the picture, and the result is about as good', () => {
    const { truth, rgba } = scene('texture')
    const { coarse, sw } = coarseOf(truth)
    const full = matteRefine(coarse, rgba, W, H, { radius: matteRadius(sw, W), workSide: 240 })
    const small = matteRefine(coarse, rgba, W, H, { radius: matteRadius(sw, W), workSide: 60 })
    expect(err(small, truth)).toBeLessThan(err(coarse, truth) * 0.5)
    expect(err(small, truth)).toBeLessThan(err(full, truth) * 3 + 0.01)
  })

  it('does nothing where it cannot know: subject and background of the same colour keep the mask as it was', () => {
    const { truth } = scene('texture')
    const { coarse } = coarseOf(truth)
    const grey = new Uint8ClampedArray(W * H * 4).fill(128)
    expect(Array.from(matteRefine(coarse, grey, W, H, { radius: 20 }))).toEqual(Array.from(coarse))
  })

  it('leaves a mask that is entirely clear or entirely subject, and the far background, exactly as it was', () => {
    const { truth, rgba } = scene('texture')
    expect(Math.max(...matteRefine(new Uint8Array(W * H), rgba, W, H, { radius: 12 }))).toBe(0)
    expect(Math.min(...matteRefine(new Uint8Array(W * H).fill(255), rgba, W, H, { radius: 12 }))).toBe(255)
    const { coarse, sw } = coarseOf(truth)
    const out = matteRefine(coarse, rgba, W, H, { radius: matteRadius(sw, W) })
    for (const [x, y] of [[3, 3], [236, 5], [4, 230], [235, 235]] as const) expect(out[y * W + x]).toBe(coarse[y * W + x]) // the corners are far from any edge
  })

  it('does not pull in a background that merely looks like the subject, and does not punch a hole in the subject (only the pixels the mask is unsure about change)', () => {
    const { truth, rgba } = scene('texture')
    const { coarse, sw } = coarseOf(truth)
    // a poster the same red as the subject, on the background 20 px from the subject's edge (the mask is sure it is background: exactly 0)
    const poster = rgba.slice(), x0 = 205, x1 = 236, y0 = 100, y1 = 140
    for (let y = y0; y < y1 + 40; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; poster[i] = 192; poster[i + 1] = 62; poster[i + 2] = 52 }
    for (let y = y0; y < y1 + 40; y++) for (let x = x0; x < x1; x++) expect(coarse[y * W + x], 'the test poster must be in a place where the mask is sure it is background').toBe(0)
    // and a dark spot inside the subject (the mask is sure it is subject: 255)
    const spot = poster.slice()
    for (let y = 118; y < 126; y++) for (let x = 116; x < 124; x++) { const i = (y * W + x) * 4; spot[i] = 20; spot[i + 1] = 90; spot[i + 2] = 130 }
    expect(coarse[122 * W + 120]).toBe(255)
    const out = matteRefine(coarse, spot, W, H, { radius: matteRadius(sw, W) })
    for (let y = y0; y < y1 + 40; y++) for (let x = x0; x < x1; x++) expect(out[y * W + x], `poster pixel ${x},${y}`).toBe(0)
    for (let y = 118; y < 126; y++) for (let x = 116; x < 124; x++) expect(out[y * W + x], `spot pixel ${x},${y}`).toBe(255)
  })

  it('finds the subject and background colours even when the blurry edge is wider than the first search window (wider windows are tried)', () => {
    const { truth, rgba } = scene('edge')
    const { coarse } = coarseOf(truth, 12) // an even smaller mask: an edge about 50 px wide
    const refined = matteRefine(coarse, rgba, W, H, { radius: 5 }) // a window far too small to see clear colours on both sides
    expect(err(refined, truth)).toBeLessThan(err(coarse, truth) * 0.2)
  })

  it('only masks that were enlarged are refined, and the window grows with the enlargement', () => {
    expect(needsRefine(1024, 1024)).toBe(false); expect(needsRefine(1024, 1100)).toBe(false); expect(needsRefine(1024, 1500)).toBe(true)
    expect(matteRadius(1024, 1024)).toBe(5)
    expect(matteRadius(1024, 5000)).toBeGreaterThan(matteRadius(1024, 2048))
  })
})

describe('foregroundColors: the clean-up reaches as far as the soft edge does (no fixed 8 rings)', () => {
  it('a 30 pixel wide soft edge is cleaned all the way, not only its first 8 pixels', () => {
    const w = 60, rgba = new Uint8ClampedArray(w * 4), alpha = new Uint8Array(w)
    for (let x = 0; x < w; x++) {
      const a = x < 10 ? 255 : x < 40 ? Math.round(255 * (1 - (x - 10) / 30)) : 0
      alpha[x] = a
      // the camera recorded subject (red) mixed with the old white background
      const t = a / 255
      rgba.set([Math.round(200 * t + 255 * (1 - t)), Math.round(20 * t + 255 * (1 - t)), Math.round(20 * t + 255 * (1 - t)), 255], x * 4)
    }
    const fg = foregroundColors(rgba, alpha, w, 1)
    for (let x = 10; x < 40; x++) expect([fg[x * 3], fg[x * 3 + 1], fg[x * 3 + 2]], `pixel ${x}`).toEqual([200, 20, 20])
    const fixed8 = foregroundColors(rgba, alpha, w, 1, { passes: 8 })
    expect(fixed8[30 * 3 + 1]).toBeGreaterThan(20) // the old behaviour left a white halo in the far part of the edge
  })

  it('an isolated wisp with no solid subject near keeps its own colour', () => {
    const w = 200, rgba = new Uint8ClampedArray(w * 4), alpha = new Uint8Array(w)
    for (let x = 0; x < 5; x++) { alpha[x] = 255; rgba.set([200, 20, 20, 255], x * 4) }
    alpha[150] = 90; rgba.set([10, 200, 10, 255], 150 * 4)
    const fg = foregroundColors(rgba, alpha, w, 1)
    expect([fg[150 * 3], fg[150 * 3 + 1], fg[150 * 3 + 2]]).toEqual([10, 200, 10])
  })
})
