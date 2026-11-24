/**
 * Working on the mask itself, whatever provider made it. Pure typed-array code (no DOM) so it runs in the worker and is unit-tested.
 *
 *  - normalizeAlpha: the model's matte rarely reaches exactly 255 or 0 (a sigmoid cut to 8 bits), so the core of the subject is a little see-through and the far background a little
 *    visible. A smooth curve lifts confident values to full and drops faint ones to nothing and leaves everything in between (the real soft edge) practically as it was. NOT a threshold.
 *  - matteRefine: a small mask enlarged to the picture's size has a wide, blurry, slightly misplaced edge, and thin hair is lost. Near the edge, the colours of the clearly-subject and
 *    clearly-background pixels give two local colours; each soft pixel is placed on the line between them (how much subject colour it contains), which puts the edge where the picture
 *    shows it and recovers hair and fine detail. Where the two colours are too alike, or the pixel is neither, the mask is kept. (A guided filter was tried first and was WORSE than the
 *    plain enlargement on the benchmark in refine.test.ts: it moves edges but keeps the blurry values on both sides.)
 *  - featherAlpha: a soft edge of a chosen width. growAlpha: expand (or, negative, contract) the selection by whole pixels.
 * Every function returns a NEW array and leaves its input alone (the editor keeps the original mask for Reset).
 */

// ── alpha normalisation ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * 256-entry table: `low` and below -> 0, `high` and above -> 255, and a straight line in between (a "levels" adjustment: continuous, no step, and for the soft edge in the middle
 * almost the identity: 128 stays within 2 of 128). Not a threshold: a value of 200 stays 200-ish, it does not jump to 255.
 */
export function alphaCurve(low = 6, high = 245): Uint8Array {
  const lut = new Uint8Array(256)
  const span = Math.max(1, high - low)
  for (let v = 0; v < 256; v++) lut[v] = v <= low ? 0 : v >= high ? 255 : Math.round((255 * (v - low)) / span)
  return lut
}

export function normalizeAlpha(a: Uint8Array, o: { low?: number; high?: number } = {}): Uint8Array {
  const lut = alphaCurve(o.low, o.high)
  const out = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = lut[a[i]!]!
  return out
}

// ── feather ───────────────────────────────────────────────────────────────────────────────────────────────────────────

function boxBlurH(src: Uint8Array, dst: Uint8Array, w: number, h: number, r: number) {
  const n = 2 * r + 1
  for (let y = 0; y < h; y++) {
    const row = y * w
    let sum = 0
    for (let i = -r; i <= r; i++) sum += src[row + Math.min(w - 1, Math.max(0, i))]!
    for (let x = 0; x < w; x++) {
      dst[row + x] = Math.round(sum / n)
      sum += src[row + Math.min(w - 1, x + r + 1)]! - src[row + Math.max(0, x - r)]!
    }
  }
}

function boxBlurV(src: Uint8Array, dst: Uint8Array, w: number, h: number, r: number) {
  const n = 2 * r + 1
  const sums = new Int32Array(w)
  for (let i = -r; i <= r; i++) { const row = Math.min(h - 1, Math.max(0, i)) * w; for (let x = 0; x < w; x++) sums[x]! += src[row + x]! }
  for (let y = 0; y < h; y++) {
    const out = y * w, add = Math.min(h - 1, y + r + 1) * w, sub = Math.max(0, y - r) * w
    for (let x = 0; x < w; x++) { dst[out + x] = Math.round(sums[x]! / n); sums[x]! += src[add + x]! - src[sub + x]! }
  }
}

/** A soft edge about `radius` pixels wide (three box blurs approximate a Gaussian whose spread is about `radius`). 0 changes nothing. */
export function featherAlpha(a: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const r = Math.round(radius)
  if (r <= 0) return Uint8Array.from(a)
  const cur = Uint8Array.from(a)
  const tmp = new Uint8Array(a.length)
  for (let pass = 0; pass < 3; pass++) {
    boxBlurH(cur, tmp, w, h, r)
    boxBlurV(tmp, cur, w, h, r)
  }
  return cur
}

// ── expand / contract ─────────────────────────────────────────────────────────────────────────────────────────────────

/** dst = max (or min) of src over the shifts s * (dx, dy), s = -half..half, edges repeated. */
function slide(src: Uint8Array, dst: Uint8Array, w: number, h: number, dx: number, dy: number, half: number, max: boolean) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = src[y * w + x]!
      for (let s = -half; s <= half; s++) {
        if (s === 0) continue
        const xx = Math.min(w - 1, Math.max(0, x + s * dx)), yy = Math.min(h - 1, Math.max(0, y + s * dy))
        const q = src[yy * w + xx]!
        if (max ? q > v : q < v) v = q
      }
      dst[y * w + x] = v
    }
  }
}

/**
 * Grow the subject by `radius` pixels (negative: shrink it), keeping a soft edge soft. The shape that is grown by is an octagon (a square for the straight directions and a diamond for
 * the diagonals), which is close to a circle, so a round subject stays round; radius up to 10 is meant, larger works but is slow on big pictures.
 */
export function growAlpha(a: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const r = Math.round(Math.abs(radius))
  if (r === 0) return Uint8Array.from(a)
  const max = radius > 0
  const d = Math.round(r * 0.2929), side = r - 2 * d // axis reach = side + 2d = r; diagonal reach = side + d on each axis
  let cur = Uint8Array.from(a)
  let tmp = new Uint8Array(a.length)
  const run = (dx: number, dy: number, half: number) => { if (half <= 0) return; slide(cur, tmp, w, h, dx, dy, half, max); const t = cur; cur = tmp; tmp = t }
  run(1, 0, side); run(0, 1, side) // the square
  run(1, 1, d); run(1, -1, d) // the diamond
  return cur
}

// ── matte refinement (local colour line) ─────────────────────────────────────────────────────────────────────────────

/** Mean over a (2r+1) square window clipped at the edges (so the border is not darkened), by running sums: O(n) whatever r is. */
function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = y * w
    let sum = 0
    for (let x = 0; x < Math.min(w, r + 1); x++) sum += src[row + x]!
    for (let x = 0; x < w; x++) {
      const lo = Math.max(0, x - r), hi = Math.min(w - 1, x + r)
      tmp[row + x] = sum / (hi - lo + 1)
      if (x + r + 1 < w) sum += src[row + x + r + 1]!
      if (x - r >= 0) sum -= src[row + x - r]!
    }
  }
  const col = new Float64Array(w)
  for (let y = 0; y < Math.min(h, r + 1); y++) for (let x = 0; x < w; x++) col[x]! += tmp[y * w + x]!
  for (let y = 0; y < h; y++) {
    const lo = Math.max(0, y - r), hi = Math.min(h - 1, y + r), n = hi - lo + 1
    for (let x = 0; x < w; x++) out[y * w + x] = col[x]! / n
    if (y + r + 1 < h) for (let x = 0; x < w; x++) col[x]! += tmp[(y + r + 1) * w + x]!
    if (y - r >= 0) for (let x = 0; x < w; x++) col[x]! -= tmp[(y - r) * w + x]!
  }
  return out
}

export interface MatteOptions {
  /** how far from an edge to look for the two local colours, in full-size pixels (see matteRadius). If a pixel's window holds no clear subject or no clear background (the mask's edge is wider than that), windows twice and four times as wide are tried. */
  radius: number
  /** a pixel counts as clearly subject above this (0..1) and clearly background below `bgBelow`; only used to pick the reference colours */
  fgAbove?: number
  bgBelow?: number
  /**
   * Only pixels the mask itself is unsure about (between these two values, 0..1) are refined. Where the mask is sure it is left alone: a background that merely looks like the subject
   * (a poster of the same red as a red shirt) is not pulled in, and a dark spot inside the subject does not become a hole. Edge pixels are inside this band by construction.
   */
  uncertain?: [number, number]
  /** the two colours must be at least this far apart (RGB distance, 0..441) for the estimate to be trusted at all, and fully trusted at twice this */
  minSeparation?: number
  /** how far (RGB distance) a pixel may be from the colour line before the estimate is distrusted */
  tolerance?: number
  /** the colours are worked out at about this many pixels on the long side (the estimate for each pixel is always full size) */
  workSide?: number
}

interface Level { F: Float32Array[]; B: Float32Array[]; ok: Uint8Array }

/** The two local colours (subject, background) of every small cell for a window radius, and whether both exist. */
function localColours(nF: Float32Array, nB: Float32Array, sF: Float32Array[], sB: Float32Array[], lw: number, lh: number, r: number, cell: number): Level {
  const L = lw * lh
  const mNF = boxMean(nF, lw, lh, r), mNB = boxMean(nB, lw, lh, r)
  const mSF = sF.map((c) => boxMean(c, lw, lh, r)), mSB = sB.map((c) => boxMean(c, lw, lh, r))
  const need = 0.01 * cell // at least 1% of the window
  const F = [new Float32Array(L), new Float32Array(L), new Float32Array(L)], B = [new Float32Array(L), new Float32Array(L), new Float32Array(L)], ok = new Uint8Array(L)
  for (let k = 0; k < L; k++) {
    if (mNF[k]! < need || mNB[k]! < need) continue
    ok[k] = 1
    for (let c = 0; c < 3; c++) { F[c]![k] = mSF[c]![k]! / mNF[k]!; B[c]![k] = mSB[c]![k]! / mNB[k]! }
  }
  return { F, B, ok }
}

/**
 * `alpha` is a mask already at the picture's size (blurry because it was enlarged); `rgba` the picture (only the colours are read). Returns a refined mask. Only the pixels the mask is
 * unsure about are touched, each a blend of the old value and the colour-line estimate by how much the estimate can be trusted, so where nothing can be said (alike colours, colours
 * that are not on the line, nothing clear nearby) the mask is returned unchanged.
 */
export function matteRefine(alpha: Uint8Array, rgba: ArrayLike<number>, w: number, h: number, o: MatteOptions): Uint8Array {
  const fgT = o.fgAbove ?? 0.93, bgT = o.bgBelow ?? 0.07, minSep = o.minSeparation ?? 30, tol = o.tolerance ?? 25
  const [uLo, uHi] = o.uncertain ?? [0.02, 0.98]
  const u0 = Math.round(uLo * 255), u1 = Math.round(uHi * 255)
  const s = Math.max(1, Math.ceil(Math.max(w, h) / (o.workSide ?? 1024)))
  const lw = Math.ceil(w / s), lh = Math.ceil(h / s), L = lw * lh
  // per small cell: how many clearly-subject / clearly-background pixels it holds and the sum of their colours
  const nF = new Float32Array(L), nB = new Float32Array(L)
  const sF = [new Float32Array(L), new Float32Array(L), new Float32Array(L)], sB = [new Float32Array(L), new Float32Array(L), new Float32Array(L)]
  const t0 = Math.round(fgT * 255), t1 = Math.round(bgT * 255)
  for (let y = 0; y < h; y++) {
    const ly = Math.min(lh - 1, Math.floor(y / s)), row = y * w
    for (let x = 0; x < w; x++) {
      const a = alpha[row + x]!
      if (a < t0 && a > t1) continue
      const k = ly * lw + Math.min(lw - 1, Math.floor(x / s)), i = (row + x) * 4
      if (a >= t0) { nF[k]! += 1; sF[0]![k]! += rgba[i]!; sF[1]![k]! += rgba[i + 1]!; sF[2]![k]! += rgba[i + 2]! }
      else { nB[k]! += 1; sB[0]![k]! += rgba[i]!; sB[1]![k]! += rgba[i + 1]!; sB[2]![k]! += rgba[i + 2]! }
    }
  }
  const base = Math.max(1, Math.round(o.radius / s))
  const levels = [base, base * 2, base * 4].map((r) => localColours(nF, nB, sF, sB, lw, lh, r, s * s))
  const out = new Uint8Array(alpha.length)
  const x0s = new Int32Array(w), x1s = new Int32Array(w), wxs = new Float32Array(w)
  for (let x = 0; x < w; x++) { const fx = Math.min(lw - 1, Math.max(0, (x + 0.5) / s - 0.5)); x0s[x] = Math.floor(fx); x1s[x] = Math.min(lw - 1, x0s[x]! + 1); wxs[x] = fx - x0s[x]! }
  for (let y = 0; y < h; y++) {
    const fy = Math.min(lh - 1, Math.max(0, (y + 0.5) / s - 0.5)), y0 = Math.floor(fy), y1 = Math.min(lh - 1, y0 + 1), wy = fy - y0, row = y * w
    for (let x = 0; x < w; x++) {
      const i = row + x, av = alpha[i]!
      out[i] = av
      if (av < u0 || av > u1) continue // the mask is sure here: leave it
      const a = y0 * lw + x0s[x]!, b = y0 * lw + x1s[x]!, c = y1 * lw + x0s[x]!, d = y1 * lw + x1s[x]!
      const lv = levels.find((l) => l.ok[a]! && l.ok[b]! && l.ok[c]! && l.ok[d]!)
      if (!lv) continue
      const wx = wxs[x]!, w00 = (1 - wx) * (1 - wy), w10 = wx * (1 - wy), w01 = (1 - wx) * wy, w11 = wx * wy
      const F = lv.F, B = lv.B
      const fr = F[0]![a]! * w00 + F[0]![b]! * w10 + F[0]![c]! * w01 + F[0]![d]! * w11
      const fg = F[1]![a]! * w00 + F[1]![b]! * w10 + F[1]![c]! * w01 + F[1]![d]! * w11
      const fb = F[2]![a]! * w00 + F[2]![b]! * w10 + F[2]![c]! * w01 + F[2]![d]! * w11
      const br = B[0]![a]! * w00 + B[0]![b]! * w10 + B[0]![c]! * w01 + B[0]![d]! * w11
      const bg = B[1]![a]! * w00 + B[1]![b]! * w10 + B[1]![c]! * w01 + B[1]![d]! * w11
      const bb = B[2]![a]! * w00 + B[2]![b]! * w10 + B[2]![c]! * w01 + B[2]![d]! * w11
      const dr = fr - br, dg = fg - bg, db = fb - bb, dd = dr * dr + dg * dg + db * db
      const sep = Math.sqrt(dd)
      if (sep < minSep) continue
      const px = i * 4, ir = rgba[px]! - br, ig = rgba[px + 1]! - bg, ib = rgba[px + 2]! - bb
      const q = Math.min(1, Math.max(0, (ir * dr + ig * dg + ib * db) / dd))
      const er = ir - q * dr, eg = ig - q * dg, eb = ib - q * db
      const trust = Math.min(1, (sep - minSep) / minSep) * Math.exp(-(er * er + eg * eg + eb * eb) / (2 * tol * tol))
      out[i] = Math.round(trust * 255 * q + (1 - trust) * av)
    }
  }
  return out
}

/** How far from an edge to look for the two local colours, for a mask of `nativeSide` pixels enlarged to `pictureSide`: wider for a bigger enlargement (the blurry edge is about that many pixels wide), never tiny. */
export function matteRadius(nativeSide: number, pictureSide: number): number {
  const up = Math.max(1, pictureSide / Math.max(1, nativeSide))
  return Math.max(4, Math.round(up * 3) + 2) // measured on the benchmark in refine.test.ts: hair strands reach well past the edge, a small window never sees the subject's colour
}

/** Whether a mask was enlarged enough to need refining (a mask already at the picture's size, or a picture's own transparency, is left alone). */
export const needsRefine = (nativeSide: number, pictureSide: number) => pictureSide > nativeSide * 1.15
