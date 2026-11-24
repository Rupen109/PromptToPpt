import sharp from 'sharp'

/**
 * The brand colours of a logo picture, read from its pixels (no model): the colour the logo uses most and, when it has a clearly different second one, that too. Transparent pixels, white and near-white
 * backgrounds, and greys are ignored (a black and white logo has no brand colour: null). Pure over raw RGBA pixels so it can be tested on pictures made in the test.
 */
export function dominantColours(rgba: Uint8Array, width: number, height: number): { primary: string | null; accent: string | null } {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  let counted = 0
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4]!, g = rgba[i * 4 + 1]!, b = rgba[i * 4 + 2]!, a = rgba[i * 4 + 3]!
    if (a < 128) continue
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const sat = max === 0 ? 0 : (max - min) / max
    if (max > 235 && sat < 0.12) continue // white background
    if (sat < 0.22) continue // grey or black: not a brand colour
    counted++
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    e.n++; e.r += r; e.g += g; e.b += b
    buckets.set(key, e)
  }
  if (counted < Math.max(20, width * height * 0.01)) return { primary: null, accent: null }
  const hex = (e: { n: number; r: number; g: number; b: number }) => `#${[e.r, e.g, e.b].map((v) => Math.round(v / e.n).toString(16).padStart(2, '0')).join('')}`
  const hue = (e: { n: number; r: number; g: number; b: number }) => { const r = e.r / e.n / 255, g = e.g / e.n / 255, b = e.b / e.n / 255; const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); const h = d === 0 ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return ((h * 60) + 360) % 360 }
  const ranked = [...buckets.values()].sort((a, b) => b.n - a.n)
  const first = ranked[0]!
  // merge neighbouring shades of the first colour; the accent is the biggest colour whose hue is clearly different
  const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
  const second = ranked.find((e) => e !== first && hueGap(hue(e), hue(first)) >= 40 && e.n >= counted * 0.05)
  return { primary: hex(first), accent: second ? hex(second) : null }
}

export type LogoBrand = { ok: true; primary: string | null; accent: string | null; aspect: number } | { ok: false; say: string }

/** the logo's shape and colours from its stored bytes */
export async function readLogo(bytes: Uint8Array): Promise<LogoBrand> {
  try {
    const meta = await sharp(bytes, { limitInputPixels: 100_000_000 }).metadata()
    if (!meta.width || !meta.height) return { ok: false, say: 'I could not read that picture, so nothing was changed.' }
    const small = await sharp(bytes, { limitInputPixels: 100_000_000 }).resize(96, 96, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const { primary, accent } = dominantColours(small.data, small.info.width, small.info.height)
    return { ok: true, primary, accent, aspect: Math.round(Math.min(6, Math.max(0.2, meta.width / meta.height)) * 1000) / 1000 }
  } catch {
    return { ok: false, say: 'I could not read that picture, so nothing was changed.' }
  }
}
