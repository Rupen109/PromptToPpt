import { inflateSync } from 'node:zlib'
import { isBrandable, parseColor } from './extract.ts'

/**
 * The most used brand-like colour in a PNG logo (a site's own logo is usually in its brand colour, so it is a good cross-check for the
 * colours read from the page's CSS). Handles the common PNG kinds (8-bit grey/RGB/palette/RGBA, not interlaced); anything else → null.
 */
export function logoDominantColor(png: Buffer): string | null {
  try {
    if (png.length < 33 || png.toString('ascii', 1, 4) !== 'PNG') return null
    let w = 0, h = 0, depth = 0, type = 0, interlace = 0
    let plte: Buffer | null = null, trns: Buffer | null = null
    const idat: Buffer[] = []
    for (let p = 8; p + 8 <= png.length;) {
      const len = png.readUInt32BE(p), kind = png.toString('ascii', p + 4, p + 8), body = png.subarray(p + 8, p + 8 + len)
      if (kind === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); depth = body[8]!; type = body[9]!; interlace = body[12]! }
      else if (kind === 'PLTE') plte = body
      else if (kind === 'tRNS') trns = body
      else if (kind === 'IDAT') idat.push(body)
      else if (kind === 'IEND') break
      p += 12 + len
    }
    const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type]
    if (!w || !h || depth !== 8 || interlace !== 0 || !channels || w * h > 16_000_000 || (type === 3 && !plte)) return null
    const raw = inflateSync(Buffer.concat(idat))
    const stride = w * channels
    if (raw.length < (stride + 1) * h) return null
    const cur = Buffer.alloc(stride), prev = Buffer.alloc(stride)
    const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
    const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 40_000)))
    for (let y = 0; y < h; y++) {
      const f = raw[y * (stride + 1)]!
      for (let x = 0; x < stride; x++) {
        const v = raw[y * (stride + 1) + 1 + x]!
        const a = x >= channels ? cur[x - channels]! : 0, b = prev[x]!, c = x >= channels ? prev[x - channels]! : 0
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
        cur[x] = (v + (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255
      }
      if (y % step === 0) {
        for (let x = 0; x < w; x += step) {
          let r: number, g: number, bl: number, al = 255
          if (type === 3) { const i = cur[x]!; r = plte![i * 3]!; g = plte![i * 3 + 1]!; bl = plte![i * 3 + 2]!; al = trns?.[i] ?? 255 }
          else if (type === 0 || type === 4) { r = g = bl = cur[x * channels]!; if (type === 4) al = cur[x * 2 + 1]! }
          else { r = cur[x * channels]!; g = cur[x * channels + 1]!; bl = cur[x * channels + 2]!; if (type === 6) al = cur[x * 4 + 3]! }
          if (al < 200) continue
          const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (bl >> 4)
          const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
          e.n++; e.r += r; e.g += g; e.b += bl; buckets.set(key, e)
        }
      }
      cur.copy(prev)
    }
    let best: { n: number; hex: string } | null = null
    for (const e of buckets.values()) {
      const hex = `#${[e.r, e.g, e.b].map((v) => Math.round(v / e.n).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
      if (isBrandable(hex) && (!best || e.n > best.n)) best = { n: e.n, hex }
    }
    return best && best.n >= 12 ? best.hex : null
  } catch { return null }
}

/** The most used brand-like fill in an SVG logo (most company logos are SVG; we cannot place those in a PowerPoint, but their colour tells us the brand). */
export function svgDominantColor(svg: string): string | null {
  const counts = new Map<string, number>()
  for (const m of svg.matchAll(/(?:fill|stroke|stop-color)\s*[=:]\s*["']?\s*(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/g)) {
    const hex = parseColor(m[1]!)
    if (hex && isBrandable(hex)) counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  for (const m of svg.matchAll(/\.([\w-]+)\s*\{[^}]*?(?:fill|stroke)\s*:\s*(#[0-9a-fA-F]{3,8}\b)/g)) { // <style> classes
    const hex = parseColor(m[2]!)
    if (hex && isBrandable(hex)) counts.set(hex, (counts.get(hex) ?? 0) + 2)
  }
  let best: string | null = null, n = 0
  for (const [hex, c] of counts) if (c > n) { best = hex; n = c }
  return best
}
