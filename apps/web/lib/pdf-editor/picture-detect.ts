/**
 * Finding photos in a page that is only a picture (a scan, a deck saved as one JPEG per page). Pure pixel maths on RGBA arrays: no DOM, no pdf.js,
 * so it can be tried on any image.
 *
 * Idea: a photo is the part of a slide that is neither flat background nor text. Work on a small copy (about 480 px wide), cut it into 4 px tiles,
 * call a tile "textured" when its brightness varies, take away the tiles that hold text lines, join what is left into components, keep the big,
 * filled, plausibly shaped ones, and then snap each edge to the real pixel on the full-size copy (where a flat background stops and the picture starts).
 * Flat coloured cards and gradients are not textured, so they are not reported. Rounded photo corners are handled by `cornerAlpha`.
 */
export interface Img { data: Uint8ClampedArray; w: number; h: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const TILE = 4
export const SMALL_WIDTH = 480
/** a found region must cover at least this share of the page, and be at least this wide / tall as a share of the page side */
const MIN_AREA = 0.03, MIN_SIDE = 0.06
const MAX_AREA = 0.8

/** area-average copy `tw` px wide */
export function downscale(img: Img, tw: number): Img {
  if (img.w <= tw) return img
  const f = img.w / tw, th = Math.max(1, Math.round(img.h / f))
  const out = new Uint8ClampedArray(tw * th * 4)
  const { data, w } = img
  for (let dy = 0; dy < th; dy++) {
    const y0 = Math.floor(dy * f), y1 = Math.min(img.h, Math.max(y0 + 1, Math.floor((dy + 1) * f)))
    for (let dx = 0; dx < tw; dx++) {
      const x0 = Math.floor(dx * f), x1 = Math.min(w, Math.max(x0 + 1, Math.floor((dx + 1) * f)))
      let r = 0, g = 0, b = 0
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * w + x) * 4; r += data[o]!; g += data[o + 1]!; b += data[o + 2]! }
      const n = (y1 - y0) * (x1 - x0), o = (dy * tw + dx) * 4
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255
    }
  }
  return { data: out, w: tw, h: th }
}

const lumaAt = (d: Uint8ClampedArray, o: number): number => (77 * d[o]! + 150 * d[o + 1]! + 29 * d[o + 2]!) >> 8

export interface TileInfo { gw: number; gh: number; std: Float32Array; threshold: number }
/** per tile: how much the brightness varies, and the threshold above which a tile counts as textured (adapts to the page's own noise) */
export function tileTexture(d: Img): TileInfo {
  const gw = Math.ceil(d.w / TILE), gh = Math.ceil(d.h / TILE)
  const std = new Float32Array(gw * gh)
  for (let ty = 0; ty < gh; ty++) for (let tx = 0; tx < gw; tx++) {
    let s = 0, s2 = 0, n = 0
    for (let y = ty * TILE; y < Math.min(d.h, (ty + 1) * TILE); y++) for (let x = tx * TILE; x < Math.min(d.w, (tx + 1) * TILE); x++) { const l = lumaAt(d.data, (y * d.w + x) * 4); s += l; s2 += l * l; n++ }
    const m = s / n
    std[ty * gw + tx] = Math.sqrt(Math.max(0, s2 / n - m * m))
  }
  const sorted = [...std].sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length * 0.2)]! // the quietest fifth of the page is background: its noise level (a photo can cover far more than half of a slide)
  return { gw, gh, std, threshold: Math.min(12, Math.max(4.5, floor * 2.5 + 2)) }
}

function dilate(m: Uint8Array, gw: number, gh: number, r: number): Uint8Array {
  const tmp = new Uint8Array(m.length), out = new Uint8Array(m.length)
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { let v = 0; for (let k = -r; k <= r && !v; k++) { const xx = x + k; if (xx >= 0 && xx < gw && m[y * gw + xx]) v = 1 } tmp[y * gw + x] = v }
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { let v = 0; for (let k = -r; k <= r && !v; k++) { const yy = y + k; if (yy >= 0 && yy < gh && tmp[yy * gw + x]) v = 1 } out[y * gw + x] = v }
  return out
}

/** drop everything thinner than k tiles (rules, borders, the thin lines that screenshots and scans carry): erode with a k x k square, then grow back */
function open(m: Uint8Array, gw: number, gh: number, k: number): Uint8Array {
  const er = new Uint8Array(m.length), out = new Uint8Array(m.length)
  for (let y = 0; y + k <= gh; y++) for (let x = 0; x + k <= gw; x++) {
    let all = 1
    for (let j = 0; j < k && all; j++) for (let i = 0; i < k; i++) if (!m[(y + j) * gw + x + i]) { all = 0; break }
    er[y * gw + x] = all
  }
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    if (!er[y * gw + x]) continue
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) out[(y + j) * gw + x + i] = 1
  }
  return out
}

/** the colour most of the quiet (flat) tiles of the page have: the slide's background (a gradient stays close to it) */
function pageBackground(d: Img, std: Float32Array, gw: number, threshold: number): [number, number, number] | null {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  const gh = std.length / gw
  for (let ty = 0; ty < gh; ty++) for (let tx = 0; tx < gw; tx++) {
    if (std[ty * gw + tx]! > threshold) continue
    const x = Math.min(d.w - 1, tx * TILE + 2), y = Math.min(d.h - 1, ty * TILE + 2), o = (y * d.w + x) * 4
    const k = ((d.data[o]! >> 4) << 8) | ((d.data[o + 1]! >> 4) << 4) | (d.data[o + 2]! >> 4)
    const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += d.data[o]!; e.g += d.data[o + 1]!; e.b += d.data[o + 2]!; buckets.set(k, e)
  }
  const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0]
  return top ? [top.r / top.n, top.g / top.n, top.b / top.n] : null
}
/**
 * A real photo sits ON the slide: just outside it is the slide's background. A fragment of a photo (the bright screen of a phone inside a DARK photo,
 * whose darkest parts have no texture to find) has more photo around it. At least 3 sides that can be looked at must look like the background.
 */
function sitsOnBackground(d: Img, r: Rect, bg: [number, number, number]): boolean {
  const strip = (x0: number, y0: number, x1: number, y1: number): number | null => {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(d.w, x1); y1 = Math.min(d.h, y1)
    if (x1 - x0 < 1 || y1 - y0 < 1) return null
    let rr = 0, gg = 0, bb = 0, n = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * d.w + x) * 4; rr += d.data[o]!; gg += d.data[o + 1]!; bb += d.data[o + 2]!; n++ }
    return Math.hypot(rr / n - bg[0], gg / n - bg[1], bb / n - bg[2])
  }
  const T = 4, x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h
  const sides = [strip(x0, y0 - T, x1, y0), strip(x0, y1, x1, y1 + T), strip(x0 - T, y0, x0, y1), strip(x1, y0, x1 + T, y1)].filter((v): v is number => v !== null)
  if (sides.length < 2) return true
  return sides.filter((v) => v <= 28).length >= Math.min(3, sides.length)
}

export interface Candidate { rect: Rect; density: number; inner: number; /** low confidence: outlined as "Picture?", one click confirms */ maybe?: boolean }
/** coarse photo regions in pixels of the small copy `d`. `text` = text boxes in the same pixels (their tiles are ignored). */
export function photoRegions(d: Img, text: Rect[], minDensity = 0.3): Candidate[] {
  const { gw, gh, std, threshold } = tileTexture(d)
  const raw = new Uint8Array(gw * gh)
  for (let i = 0; i < raw.length; i++) raw[i] = std[i]! > threshold ? 1 : 0
  for (const t of text) {
    const x0 = Math.max(0, Math.floor((t.x - 2) / TILE)), x1 = Math.min(gw - 1, Math.floor((t.x + t.w + 2) / TILE)), y0 = Math.max(0, Math.floor((t.y - 2) / TILE)), y1 = Math.min(gh - 1, Math.floor((t.y + t.h + 2) / TILE))
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) raw[y * gw + x] = 0
  }
  const m = open(raw, gw, gh, 3)
  const joined = dilate(m, gw, gh, 2)
  const seen = new Uint8Array(gw * gh)
  const out: Candidate[] = []
  for (let s = 0; s < joined.length; s++) {
    if (!joined[s] || seen[s]) continue
    const stack = [s]; seen[s] = 1
    let minX = gw, minY = gh, maxX = -1, maxY = -1, n = 0
    const members: number[] = []
    while (stack.length) {
      const i = stack.pop()!, x = i % gw, y = (i / gw) | 0
      if (m[i]) { n++; members.push(i); if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
      for (const j of [x > 0 ? i - 1 : -1, x < gw - 1 ? i + 1 : -1, y > 0 ? i - gw : -1, y < gh - 1 ? i + gw : -1]) if (j >= 0 && joined[j] && !seen[j]) { seen[j] = 1; stack.push(j) }
    }
    if (maxX < 0) continue
    const tw = maxX - minX + 1, th = maxY - minY + 1
    const fw = (tw * TILE) / d.w, fh = (th * TILE) / d.h
    if (fw * fh < MIN_AREA || fw < MIN_SIDE || fh < MIN_SIDE) continue
    if (fw * fh > MAX_AREA || (fw > 0.93 && fh > 0.93)) continue // the page picture itself, not a picture on it
    const aspect = tw / th
    if (aspect < 0.2 || aspect > 5) continue
    const density = n / (tw * th)
    // the inside (without a 2-tile rim): a flat card has only its outline, a photo is textured throughout
    let inner = 0, innerN = 0
    for (let y = minY + 2; y <= maxY - 2; y++) for (let x = minX + 2; x <= maxX - 2; x++) { innerN++; if (m[y * gw + x]) inner++ }
    const innerDensity = innerN ? inner / innerN : density
    if (density < minDensity || innerDensity < minDensity) continue
    out.push({ rect: { x: minX * TILE, y: minY * TILE, w: Math.min(d.w, (maxX + 1) * TILE) - minX * TILE, h: Math.min(d.h, (maxY + 1) * TILE) - minY * TILE }, density, inner: innerDensity })
  }
  const bg = pageBackground(d, std, gw, threshold)
  return bg ? out.filter((c) => sitsOnBackground(d, c.rect, bg)) : out
}


// ---------- the background MODEL: what the slide looks like where nothing is drawn ----------
export type RGB = [number, number, number]
/** a smooth colour surface (a plane per channel, fitted to the pixels that are background: a slide gradient is nearly planar) */
export interface BgModel { at(x: number, y: number): RGB; /** share of the page the fit was based on */ support: number }

/** solve a 3x3 linear system (Cramer's rule) */
function solve3(a: number[][], b: number[]): [number, number, number] | null {
  const det = (m: number[][]): number => m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) + m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!)
  const d = det(a)
  if (Math.abs(d) < 1e-9) return null
  const col = (k: number): number[][] => a.map((row, i) => row.map((v, j) => (j === k ? b[i]! : v)))
  return [det(col(0)) / d, det(col(1)) / d, det(col(2)) / d]
}
const inAny = (rs: Rect[], x: number, y: number): boolean => rs.some((t) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h)

/**
 * Fit the slide's background from areas that are known to be background. Starts from the page's outer rim (a photo or a card almost never touches it),
 * then keeps every pixel that the current fit explains (within `tol`) and fits again. Text boxes are never used. Works on a small copy.
 */
export function fitBackground(d: Img, text: Rect[], tol = 14): BgModel {
  const rim = Math.max(2, Math.round(d.w * 0.012))
  const n = d.w * d.h
  const use = new Uint8Array(n)
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if ((x < rim || y < rim || x >= d.w - rim || y >= d.h - rim) && !inAny(text, x, y)) use[y * d.w + x] = 1
  let coef: [number, number, number][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  const fit = (): boolean => {
    // normal equations for [1, x, y] (x, y scaled to 0..1), shared across channels
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], B = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    let cnt = 0
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      const i = y * d.w + x
      if (!use[i]) continue
      const u = x / d.w, v = y / d.h, f = [1, u, v]; cnt++
      for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) A[r]![c]! += f[r]! * f[c]!; for (let ch = 0; ch < 3; ch++) B[ch]![r]! += f[r]! * d.data[i * 4 + ch]! }
    }
    if (cnt < 20) return false
    const out: [number, number, number][] = []
    for (let ch = 0; ch < 3; ch++) { const s = solve3(A, B[ch]!); if (!s) return false; out.push(s) }
    coef = out
    return true
  }
  const eval_ = (x: number, y: number): RGB => { const u = x / d.w, v = y / d.h; return [0, 1, 2].map((ch) => coef[ch]![0]! + coef[ch]![1]! * u + coef[ch]![2]! * v) as RGB }
  let ok = fit()
  for (let it = 0; it < 4 && ok; it++) {
    let kept = 0
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      const i = y * d.w + x, m = eval_(x, y)
      const near = Math.hypot(d.data[i * 4]! - m[0], d.data[i * 4 + 1]! - m[1], d.data[i * 4 + 2]! - m[2]) <= tol && !inAny(text, x, y)
      use[i] = near ? 1 : 0; if (near) kept++
    }
    if (kept < n * 0.05) break
    ok = fit()
  }
  let support = 0; for (let i = 0; i < n; i++) if (use[i]) support++
  const c = coef
  return { at: (x, y) => { const u = x / d.w, v = y / d.h; return [c[0]![0]! + c[0]![1]! * u + c[0]![2]! * v, c[1]![0]! + c[1]![1]! * u + c[1]![2]! * v, c[2]![0]! + c[2]![1]! * u + c[2]![2]! * v] }, support: support / n }
}


function erode(m: Uint8Array, gw: number, gh: number, r: number): Uint8Array {
  const inv = new Uint8Array(m.length)
  for (let i = 0; i < m.length; i++) inv[i] = 1 - m[i]!
  const g = dilate(inv, gw, gh, r), out = new Uint8Array(m.length)
  for (let i = 0; i < m.length; i++) out[i] = 1 - g[i]!
  return out
}

export interface DevCandidate { rect: Rect; fill: number; stats: FlatStats }
export interface FlatStats { tex2: number; tex3: number; tex5: number; mode: number; blockStd: number; buckets: number; bins90: number; lumaSpread: number; straight: number }
/** how "alive" the inside of a rectangle is: share of 4 px tiles whose brightness varies, share of the commonest colour, spread of the colour between 16 px blocks */
export function flatStats(d: Img, r: Rect, text: Rect[], rim = 0): FlatStats {
  const x0 = Math.max(0, Math.round(r.x) + rim), y0 = Math.max(0, Math.round(r.y) + rim), x1 = Math.min(d.w, Math.round(r.x + r.w) - rim), y1 = Math.min(d.h, Math.round(r.y + r.h) - rim)
  let tiles = 0, t2 = 0, t3 = 0, t5 = 0
  const buckets = new Map<number, number>(); let px = 0
  for (let ty = y0; ty + TILE <= y1; ty += TILE) for (let tx = x0; tx + TILE <= x1; tx += TILE) {
    if (inAny(text, tx + 2, ty + 2)) continue
    let s = 0, s2 = 0
    for (let y = ty; y < ty + TILE; y++) for (let x = tx; x < tx + TILE; x++) { const l = lumaAt(d.data, (y * d.w + x) * 4); s += l; s2 += l * l }
    const m = s / (TILE * TILE), sd = Math.sqrt(Math.max(0, s2 / (TILE * TILE) - m * m))
    tiles++; if (sd > 2) t2++; if (sd > 3) t3++; if (sd > 5) t5++
    const o = ((ty + 2) * d.w + tx + 2) * 4, k = ((d.data[o]! >> 3) << 10) | ((d.data[o + 1]! >> 3) << 5) | (d.data[o + 2]! >> 3)
    buckets.set(k, (buckets.get(k) ?? 0) + 1); px++
  }
  // continuity of the colours: how many fine colour bins hold 90 % of the tiles (a card is a few exact colours, a photo is a continuous cloud)
  const fine = new Map<number, number>(); const lums: number[] = []
  for (let ty = y0; ty + TILE <= y1; ty += TILE) for (let tx = x0; tx + TILE <= x1; tx += TILE) {
    if (inAny(text, tx + 2, ty + 2)) continue
    let r = 0, g = 0, b = 0
    for (let y = ty; y < ty + TILE; y++) for (let x = tx; x < tx + TILE; x++) { const o = (y * d.w + x) * 4; r += d.data[o]!; g += d.data[o + 1]!; b += d.data[o + 2]! }
    r /= TILE * TILE; g /= TILE * TILE; b /= TILE * TILE
    const k = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2); fine.set(k, (fine.get(k) ?? 0) + 1); lums.push(0.3 * r + 0.59 * g + 0.11 * b)
  }
  const counts = [...fine.values()].sort((a, b) => b - a); let acc = 0, bins90 = 0
  for (const v of counts) { acc += v; bins90++; if (acc >= px * 0.9) break }
  lums.sort((a, b) => a - b)
  const lumaSpread = lums.length ? lums[Math.floor(lums.length * 0.95)]! - lums[Math.floor(lums.length * 0.05)]! : 0
  const top = Math.max(0, ...buckets.values())
  const sig = [...buckets.values()].filter((v) => v >= px * 0.02).length
  return { tex2: tiles ? t2 / tiles : 0, tex3: tiles ? t3 / tiles : 0, tex5: tiles ? t5 / tiles : 0, mode: px ? top / px : 1, blockStd: 0, buckets: sig, bins90, lumaSpread, straight: 0 }
}

/**
 * Regions that do not look like the slide's background, whatever their texture: a dark photo on a dark slide has dark, untextured areas, but its colours still
 * differ from the slide's. `dev` is the colour distance to the background model; the mask is closed (bridge small gaps), opened (drop text remnants, thin
 * shapes and decorations), split into components. Flat cards pass here too: `flatStats` is what tells them from photos.
 */
export function deviationRegions(d: Img, text: Rect[], bg: BgModel, thr = 14): DevCandidate[] {
  const gw = d.w, gh = d.h
  const raw = new Uint8Array(gw * gh)
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    if (inAny(text, x, y)) continue
    const o = (y * gw + x) * 4, b = bg.at(x, y)
    if (Math.hypot(d.data[o]! - b[0], d.data[o + 1]! - b[1], d.data[o + 2]! - b[2]) > thr) raw[y * gw + x] = 1
  }
  const m = open(erode(dilate(raw, gw, gh, 1), gw, gh, 1), gw, gh, Math.max(6, Math.round(gw * 0.025)))
  const seen = new Uint8Array(gw * gh), out: DevCandidate[] = []
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || seen[s]) continue
    const stack = [s]; seen[s] = 1
    let x0 = gw, y0 = gh, x1 = -1, y1 = -1, n = 0
    while (stack.length) {
      const i = stack.pop()!, x = i % gw, y = (i / gw) | 0
      n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      for (const j of [x > 0 ? i - 1 : -1, x < gw - 1 ? i + 1 : -1, y > 0 ? i - gw : -1, y < gh - 1 ? i + gw : -1]) if (j >= 0 && m[j] && !seen[j]) { seen[j] = 1; stack.push(j) }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1
    const fw = w / gw, fh = h / gh
    if (fw * fh < MIN_AREA || fw < MIN_SIDE || fh < MIN_SIDE || fw * fh > MAX_AREA || (fw > 0.93 && fh > 0.93)) continue
    const rect = { x: x0, y: y0, w, h }
    out.push({ rect, fill: n / (w * h), stats: flatStats(d, rect, text, 3) })
  }
  return out
}



/** a deviation region is a photo (and not a card, a panel, a gradient bar or a group of tiles): continuous colours AND some fine texture */
export function photoLike(c: DevCandidate, strict = false): boolean {
  return c.fill >= 0.6 && c.stats.bins90 >= (strict ? 200 : 60) && c.stats.tex2 >= (strict ? 0.5 : 0.2)
}
const overlapOfSmaller = (a: Rect, b: Rect): number => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? (w * h) / Math.min(a.w * a.h, b.w * b.h) : 0
}
const iouRect = (a: Rect, b: Rect): number => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? (w * h) / (a.w * a.h + b.w * b.h - w * h) : 0 }

/** the full-size copy and how many of its pixels one pixel of the small copy is (`scale` = full.w / small.w) */
export interface FullCopy { img: Img; scale: number }

// ---------- non-local evidence: is this region camera output, or a synthetic fill? ----------
export interface Evidence {
  /** how many exact colours hold 90 % of the pixels (a flat card: 1-2; a photo, even a dark or flat one: dozens to thousands) */
  colours: number
  /** noise floor: median over 8 px blocks of the pixel's difference from the mean of its 4 neighbours (levels). A flat fill or a smooth gradient: ~0-0.15; camera noise, even after JPEG: 0.25 and more */
  noise: number
  /** how far the 8 px block means are from the best plane (a gradient is a plane: ~0; a photo, a vignette or an object on a backdrop: more) */
  planar: number
  /** share of the region's blocks that could be looked at (text is left out) */
  blocks: number
}
const lumAt = (d: Uint8ClampedArray, o: number): number => 0.3 * d[o]! + 0.59 * d[o + 1]! + 0.11 * d[o + 2]!

/** measure `r` (pixels of `f`) without its rim and without text */
export function regionEvidence(f: Img, r: Rect, text: Rect[]): Evidence {
  const m = Math.round(Math.min(r.w, r.h) * 0.06) + 3
  const x0 = Math.max(1, Math.round(r.x) + m), y0 = Math.max(1, Math.round(r.y) + m), x1 = Math.min(f.w - 1, Math.round(r.x + r.w) - m), y1 = Math.min(f.h - 1, Math.round(r.y + r.h) - m)
  const D = f.data, W = f.w, B = 8
  const hit = (x: number, y: number): boolean => text.some((t) => x >= t.x - 4 && x < t.x + t.w + 4 && y >= t.y - 4 && y < t.y + t.h + 4)
  const hist = new Map<number, number>(); let n = 0
  const bx = Math.floor((x1 - x0) / B), by = Math.floor((y1 - y0) / B)
  const noise: number[] = [], pts: [number, number, number][] = []
  for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) {
    let s = 0, c = 0, v = 0, hc = 0, skip = false
    for (let y = y0 + j * B; y < y0 + (j + 1) * B && !skip; y++) for (let x = x0 + i * B; x < x0 + (i + 1) * B; x++) {
      if (hit(x, y)) { skip = true; break }
      const o = (y * W + x) * 4; s += lumAt(D, o); c++
      const k = (D[o]! << 16) | (D[o + 1]! << 8) | D[o + 2]!; hist.set(k, (hist.get(k) ?? 0) + 1); n++
    }
    if (skip) continue
    for (let y = y0 + j * B + 1; y < y0 + (j + 1) * B - 1; y++) for (let x = x0 + i * B + 1; x < x0 + (i + 1) * B - 1; x++) {
      const hp = lumAt(D, (y * W + x) * 4) - (lumAt(D, (y * W + x - 1) * 4) + lumAt(D, (y * W + x + 1) * 4) + lumAt(D, ((y - 1) * W + x) * 4) + lumAt(D, ((y + 1) * W + x) * 4)) / 4
      v += hp * hp; hc++
    }
    noise.push(Math.sqrt(v / Math.max(1, hc))); pts.push([i, j, s / c])
  }
  if (pts.length < 12) return { colours: 0, noise: 0, planar: 0, blocks: 0 }
  noise.sort((a, b) => a - b)
  const counts = [...hist.values()].sort((a, b) => b - a)
  let acc = 0, colours = 0; for (const c of counts) { acc += c; colours++; if (acc >= n * 0.9) break }
  let Sx = 0, Sy = 0, Sm = 0, Sxx = 0, Syy = 0, Sxy = 0, Sxm = 0, Sym = 0; const N = pts.length
  for (const [i, j, mm] of pts) { Sx += i; Sy += j; Sm += mm; Sxx += i * i; Syy += j * j; Sxy += i * j; Sxm += i * mm; Sym += j * mm }
  const co = solve3([[N, Sx, Sy], [Sx, Sxx, Sxy], [Sy, Sxy, Syy]], [Sm, Sxm, Sym])
  let rs = 0
  if (co) for (const [i, j, mm] of pts) { const e = mm - (co[0] + co[1] * i + co[2] * j); rs += e * e }
  return { colours, noise: noise[noise.length >> 1]!, planar: Math.sqrt(rs / N), blocks: N }
}
/** the verdict of the evidence (tuned on generated JPEG slides: flat fills measure exactly 0, smooth gradients <= 0.17, photos from 0.27 up) */
export function verdict(e: Evidence): 'photo' | 'maybe' | 'weak' | 'synthetic' {
  if (e.blocks < 12 || e.colours < 3) return 'synthetic' // one or two exact colours: a fill, whatever its colour
  if (e.noise >= 0.25) return 'photo'
  if (e.noise >= 0.2) return 'maybe'
  // JPEG at a low quality wipes the camera noise of a flat, dark or white photo: what is left is a handful of exact colours that are not a plane. A smooth gradient has
  // far more colours (35 to 160 measured), a fill has 1. Only offered as "Picture?" and only for big regions without text (the caller checks).
  if (e.colours <= 30 && e.planar >= 0.25) return 'weak'
  return 'synthetic'
}

const BG_TOL = 8
/**
 * Photos closer together than the tile grid can tell (a 2 px gutter is a quarter of a small-copy tile) arrive as ONE region. On the full-size copy, look for
 * a gutter: a run of 2..30 columns (or rows) where at least 92 % of the pixels are the slide's background (within BG_TOL levels of the background model),
 * with real content on both sides. Cut there, trim each part to its content, and look again inside the parts. A dark photo whose colours differ from the
 * background by more than BG_TOL never counts as a gutter.
 */
export function splitMerged(f: Img, r: Rect, bgAt: (x: number, y: number) => RGB, text: Rect[], depth = 0): Rect[] {
  const x0 = Math.max(0, Math.round(r.x)), y0 = Math.max(0, Math.round(r.y)), x1 = Math.min(f.w, Math.round(r.x + r.w)), y1 = Math.min(f.h, Math.round(r.y + r.h))
  const w = x1 - x0, h = y1 - y0
  if (w < 40 || h < 40 || depth > 4) return [r]
  const D = f.data, W = f.w
  const isBg = (x: number, y: number): boolean => {
    if (inAny(text, x, y)) return false
    const o = (y * W + x) * 4, b = bgAt(x, y)
    // brightness counts fully, colour only at 40 %: JPEG stores colour at half resolution, so next to a differently coloured photo a 2 px gutter is brightness-exact but colour-smeared
    const dr = D[o]! - b[0], dg = D[o + 1]! - b[1], db = D[o + 2]! - b[2], dl = 0.3 * dr + 0.59 * dg + 0.11 * db
    return Math.max(Math.abs(dl), 0.4 * Math.hypot(dr - dl, dg - dl, db - dl)) <= BG_TOL
  }
  const col = new Float32Array(w), row = new Float32Array(h)
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (isBg(x, y)) { col[x - x0]! += 1 / h; row[y - y0]! += 1 / w }
  const MIN_PART = 0.12
  /**
   * JPEG ringing turns a 2 px gutter into one or two columns that are only partly background-coloured, so the test is a DIP: a run of columns (rows) where at
   * least 30 % of the pixels are background, at least one of them 60 %, flanked on both sides by columns that are nearly all picture (<= 20 % background).
   */
  const find = (prof: Float32Array, len: number): [number, number] | null => {
    let i = 0
    while (i < len) {
      if (prof[i]! < 0.3) { i++; continue }
      let j = i + 1, peak = prof[i]!
      for (let gapLeft = 2; j < len && gapLeft >= 0;) { if (prof[j]! >= 0.3) { peak = Math.max(peak, prof[j]!); gapLeft = 2; j++ } else { gapLeft--; j++ } }
      while (j > i + 1 && prof[j - 1]! < 0.3) j-- // the run ends at its last background-ish column
      const gap = j - i
      const flank = (a: number, b: number): number => { let sum = 0, n = 0; for (let x = Math.max(0, a); x < Math.min(len, b); x++) { sum += prof[x]!; n++ } return n ? sum / n : 1 }
      if (gap >= 1 && gap <= 30 && peak >= 0.6 && i >= len * MIN_PART && len - j >= len * MIN_PART && flank(i - 12, i - 3) <= 0.2 && flank(j + 3, j + 12) <= 0.2) return [i, j]
      i = j
    }
    return null
  }
  const cutV = find(col, w), cutH = find(row, h)
  // cut along the longer-running gutter first (columns when wider than tall, else rows)
  const pick = cutV && cutH ? (w >= h ? 'v' : 'h') : cutV ? 'v' : cutH ? 'h' : null
  if (!pick) return [r]
  const parts: Rect[] = pick === 'v'
    ? [{ x: x0, y: y0, w: x0 + cutV![0] - x0, h }, { x: x0 + cutV![1], y: y0, w: x1 - (x0 + cutV![1]), h }]
    : [{ x: x0, y: y0, w, h: cutH![0] }, { x: x0, y: y0 + cutH![1], w, h: y1 - (y0 + cutH![1]) }]
  const out: Rect[] = []
  for (const p of parts) {
    const t = trimToContent(f, p, isBg)
    if (t) out.push(...splitMerged(f, t, bgAt, text, depth + 1))
  }
  return out.length >= 2 ? out : [r]
}
/** shrink a rect to the rows and columns that are not (almost) all background */
function trimToContent(f: Img, r: Rect, isBg: (x: number, y: number) => boolean): Rect | null {
  const x0 = Math.round(r.x), y0 = Math.round(r.y), x1 = Math.round(r.x + r.w), y1 = Math.round(r.y + r.h)
  const colBg = (x: number): number => { let c = 0; for (let y = y0; y < y1; y++) if (isBg(x, y)) c++; return c / Math.max(1, y1 - y0) }
  const rowBg = (y: number, a: number, b: number): number => { let c = 0; for (let x = a; x < b; x++) if (isBg(x, y)) c++; return c / Math.max(1, b - a) }
  let a = x0, b = x1
  while (a < b && colBg(a) >= 0.97) a++
  while (b > a && colBg(b - 1) >= 0.97) b--
  let c = y0, d = y1
  while (c < d && rowBg(c, a, b) >= 0.97) c++
  while (d > c && rowBg(d - 1, a, b) >= 0.97) d--
  return b - a >= 24 && d - c >= 24 ? { x: a, y: c, w: b - a, h: d - c } : null
}

/**
 * Photo regions of a page, in pixels of the small copy `d`: independent cues, merged.
 *  1. texture (photoRegions): tiles whose brightness varies, without the text.
 *  2. the background MODEL (deviationRegions): everything that does not look like the slide, then only the parts whose colours are continuous (a photo) and not
 *     a few exact colours (a card). This one finds dark photos on dark slides, whose darkest parts have no texture at all.
 *  3. (with `full`) the same model at a lower threshold, and each region judged by its NOISE FLOOR on the full-size copy: flat blue, almost black or white
 *     photos have no texture tiles and few colours, but camera noise (and the exact-colour count) still tell them from a card. Sure ones are photos, weaker
 *     ones come back with `maybe` (outlined "Picture?").
 *  4. (with `full`) regions that are really two photos a few pixels apart are cut at the gutter.
 * `strict` (the page's text could not be read, so its boxes are unknown) asks more of the first two.
 */
export function findPhotos(d: Img, text: Rect[], strict = false, full?: FullCopy): Candidate[] {
  const tex = photoRegions(d, text, strict ? 0.6 : 0.3)
  const bg = fitBackground(d, text)
  const dev = bg.support >= 0.2 ? deviationRegions(d, text, bg).filter((c) => photoLike(c, strict)) : []
  const out: Candidate[] = dev.map((c) => ({ rect: c.rect, density: c.stats.tex2, inner: c.stats.tex2 }))
  for (const t of tex) {
    // a texture region inside a model region is a fragment of the same photo; one that is (nearly) the same region is the same photo
    if (out.some((o) => overlapOfSmaller(t.rect, o.rect) >= 0.7 || iouRect(t.rect, o.rect) > 0.5)) continue
    out.push(t)
  }
  if (!full) return out
  const k = full.scale, fText = text.map((t) => ({ x: t.x * k, y: t.y * k, w: t.w * k, h: t.h * k }))
  if (bg.support >= 0.2) {
    for (const c of deviationRegions(d, text, bg, 6)) {
      if (out.some((o) => overlapOfSmaller(c.rect, o.rect) >= 0.5)) continue
      if (c.fill < 0.7) continue
      const fr = { x: c.rect.x * k, y: c.rect.y * k, w: c.rect.w * k, h: c.rect.h * k }
      // a region that is mostly text is a panel with words on it, never a photo
      const textArea = fText.reduce((s, t) => s + Math.max(0, Math.min(t.x + t.w, fr.x + fr.w) - Math.max(t.x, fr.x)) * Math.max(0, Math.min(t.y + t.h, fr.y + fr.h) - Math.max(t.y, fr.y)), 0)
      if (textArea > 0.2 * fr.w * fr.h) continue
      let v = verdict(regionEvidence(full.img, fr, fText))
      if (v === 'synthetic') continue
      if (v === 'weak') {
        // a weak sign needs the layout to agree: a sizeable region (5 % of the page), photo-like proportions, no text near it, background all round
        const share = (c.rect.w * c.rect.h) / (d.w * d.h), asp = c.rect.w / c.rect.h
        if (share < 0.05 || asp < 0.45 || asp > 2.4 || textArea > 0.02 * fr.w * fr.h) continue
        v = 'maybe'
      }
      out.push({ rect: c.rect, density: c.stats.tex2, inner: c.stats.tex2, ...(v === 'maybe' ? { maybe: true } : {}) })
    }
  }
  // cut regions that are several photos with a thin gutter between them
  const cut: Candidate[] = []
  for (const c of out) {
    const fr = { x: c.rect.x * k, y: c.rect.y * k, w: c.rect.w * k, h: c.rect.h * k }
    const parts = splitMerged(full.img, fr, (x, y) => bg.at(x / k, y / k), fText)
    if (parts.length < 2) { cut.push(c); continue }
    for (const p of parts) cut.push({ ...c, rect: { x: p.x / k, y: p.y / k, w: p.w / k, h: p.h / k } })
  }
  return cut
}

/**
 * Snap the edges of `r` (pixels of `f`) to where the flat background ends: for each edge, the first row / column near it where most of the
 * pixels along it jump in brightness (a step edge across the whole side). Rows or columns that run through text boxes are not counted.
 * Edges within `reach` px of the page border snap to the border. An edge with no clear step stays where it was.
 */
export function refineRect(f: Img, r: Rect, text: Rect[], reach: number): Rect {
  const { data, w, h } = f
  r = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }
  const G = 10, FRAC = 0.4
  const inText = (x: number, y: number): boolean => text.some((t) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h)
  /** the biggest change of any colour channel between two pixels (a dark teal photo next to a dark maroon slide differs in colour more than in brightness) */
  const diff = (x: number, y: number, x2: number, y2: number): number => { const a = (y * w + x) * 4, b = (y2 * w + x2) * 4; return Math.max(Math.abs(data[a]! - data[b]!), Math.abs(data[a + 1]! - data[b + 1]!), Math.abs(data[a + 2]! - data[b + 2]!)) }
  /** share of the pixels along row y (x from a to b) that differ from the row above by more than G */
  const rowStep = (y: number, a: number, b: number, dy: number): number => { let n = 0, c = 0; for (let x = a; x < b; x++) { if (inText(x, y) || inText(x, y + dy)) continue; n++; if (diff(x, y, x, y + dy) > G) c++ } return n > 8 ? c / n : 0 }
  const colStep = (x: number, a: number, b: number, dx: number): number => { let n = 0, c = 0; for (let y = a; y < b; y++) { if (inText(x, y) || inText(x + dx, y)) continue; n++; if (diff(x, y, x + dx, y) > G) c++ } return n > 8 ? c / n : 0 }
  const xa = Math.round(r.x + r.w * 0.15), xb = Math.round(r.x + r.w * 0.85), ya = Math.round(r.y + r.h * 0.15), yb = Math.round(r.y + r.h * 0.85)
  /** the position in lo..hi with the strongest step (at least FRAC); on equal strength the one nearest `from`. Another shape just beyond the photo (a row of chevrons) makes a weaker, partial step: the photo's own edge runs across the whole side and wins. */
  const best = (lo: number, hi: number, from: number, score: (p: number) => number): number | null => {
    let bp: number | null = null, bs = 0
    for (let p = lo; p <= hi; p++) { const sc = score(p); if (sc >= FRAC && (sc > bs + 0.05 || (Math.abs(sc - bs) <= 0.05 && bp !== null && Math.abs(p - from) < Math.abs(bp - from)))) { bp = p; bs = Math.max(bs, sc) } }
    return bp
  }
  let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h
  // a real step edge near the found edge wins; only when there is none does an edge close to the page border mean "the picture bleeds off the page"
  { const p = best(Math.max(1, y0 - reach), Math.min(h - 1, y0 + reach), y0, (y) => rowStep(y, xa, xb, -1)); y0 = p !== null ? p : y0 <= reach ? 0 : y0 }
  { const p = best(Math.max(1, y1 - reach), Math.min(h - 2, y1 + reach), y1, (y) => rowStep(y, xa, xb, 1)); y1 = p !== null ? p + 1 : y1 >= h - reach ? h : y1 }
  { const p = best(Math.max(1, x0 - reach), Math.min(w - 1, x0 + reach), x0, (x) => colStep(x, ya, yb, -1)); x0 = p !== null ? p : x0 <= reach ? 0 : x0 }
  { const p = best(Math.max(1, x1 - reach), Math.min(w - 2, x1 + reach), x1, (x) => colStep(x, ya, yb, 1)); x1 = p !== null ? p + 1 : x1 >= w - reach ? w : x1 }
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) }
}

/**
 * Rounded corners: `img` holds a picture with `margin` px of its surroundings on every side; `inner` is the picture's rectangle inside it.
 * In each corner, the pixels that still look like the background just outside (grown from the corner pixel) are made see-through. Returns how many
 * pixels were made see-through (0 = square corners, nothing changed). Safe against leaks: a corner region must be small and hollow like a
 * rounded corner (at most half of its own bounding box, within 30 % of the picture's short side), otherwise that corner stays solid.
 */
export function cornerAlpha(img: Img, inner: Rect, tol = 26): number {
  const { data, w } = img
  const ix0 = inner.x, iy0 = inner.y, ix1 = inner.x + inner.w - 1, iy1 = inner.y + inner.h - 1
  const reachMax = Math.max(3, Math.floor(Math.min(inner.w, inner.h) * 0.3))
  const px = (x: number, y: number): [number, number, number] => { const o = (y * w + x) * 4; return [data[o]!, data[o + 1]!, data[o + 2]!] }
  let total = 0
  const corners: { sx: number; sy: number; ox: number; oy: number }[] = [
    { sx: ix0, sy: iy0, ox: -1, oy: -1 }, { sx: ix1, sy: iy0, ox: 1, oy: -1 }, { sx: ix0, sy: iy1, ox: -1, oy: 1 }, { sx: ix1, sy: iy1, ox: 1, oy: 1 },
  ]
  for (const c of corners) {
    // background colour near this corner: the middle value of the pixels just outside the picture along the two sides that meet here
    // (only the first few: if the found rectangle is a pixel or two off, the pixels further along may already be picture)
    const rs: number[] = [], gs: number[] = [], bs: number[] = []
    const span = Math.min(reachMax, 6)
    for (let k = 0; k < span; k++) {
      for (const [x, y] of [[c.sx + c.ox * 2, c.sy - c.oy * k], [c.sx - c.ox * k, c.sy + c.oy * 2]] as [number, number][]) {
        if (x < 0 || y < 0 || x >= w || y >= img.h) continue
        const p = px(x, y); rs.push(p[0]); gs.push(p[1]); bs.push(p[2])
      }
    }
    if (!rs.length) continue
    const med = (v: number[]): number => v.sort((a, b) => a - b)[v.length >> 1]!
    const ref: [number, number, number] = [med(rs), med(gs), med(bs)]
    const near = (x: number, y: number): boolean => { const p = px(x, y); return Math.hypot(p[0] - ref[0], p[1] - ref[1], p[2] - ref[2]) <= tol }
    // the corner pixel itself, or (when the rectangle is a pixel or two out) the first background-like pixel just inside it on the diagonal
    let seedX = -1, seedY = -1
    for (let d = 0; d <= 3 && seedX < 0; d++) { const x = c.sx - c.ox * d, y = c.sy - c.oy * d; if (x >= 0 && y >= 0 && x < w && y < img.h && near(x, y)) { seedX = x; seedY = y } }
    if (seedX < 0) continue
    const inside = (x: number, y: number): boolean => x >= ix0 && x <= ix1 && y >= iy0 && y <= iy1 && Math.abs(x - c.sx) < reachMax && Math.abs(y - c.sy) < reachMax
    const seen = new Set<number>([seedY * w + seedX]), stack = [[seedX, seedY]] as [number, number][]
    let mx0 = seedX, mx1 = seedX, my0 = seedY, my1 = seedY
    while (stack.length) {
      const [x, y] = stack.pop()!
      if (x < mx0) mx0 = x; if (x > mx1) mx1 = x; if (y < my0) my0 = y; if (y > my1) my1 = y
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
        const k = ny * w + nx
        if (!inside(nx, ny) || seen.has(k) || !near(nx, ny)) continue
        seen.add(k); stack.push([nx, ny])
      }
    }
    const bw = mx1 - mx0 + 1, bh = my1 - my0 + 1
    if (seen.size < 3 || seen.size / (bw * bh) > 0.5) continue
    // grow by one pixel (the soft edge of the rounded corner), then feather the next ring
    const solid = new Set<number>(seen)
    for (const k of seen) { const x = k % w, y = (k / w) | 0; for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) if (inside(nx, ny)) solid.add(ny * w + nx) }
    const soft = new Set<number>()
    for (const k of solid) { const x = k % w, y = (k / w) | 0; for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) { const kk = ny * w + nx; if (inside(nx, ny) && !solid.has(kk)) soft.add(kk) } }
    for (const k of solid) data[k * 4 + 3] = 0
    for (const k of soft) data[k * 4 + 3] = Math.min(data[k * 4 + 3]!, 140)
    total += solid.size
  }
  return total
}
