/**
 * List markers. When the words of a bullet are removed, the visitor expects the bullet symbol to go too. For real text the marker is known from the file
 * (`Run.marker`, see render.ts). In a picture page it is found here as a small blob of ink just left of the words: inside a strip left of the block, on
 * the block's first line, everything that differs from the page background is one blob; it counts as a marker when it is about as small as a bullet or
 * a number (a fraction of the text size), clear of the strip's outer edge (else it is part of something bigger: a card edge, a photo) and not empty.
 * Pure maths on pixel data, no DOM (the caller reads the pixels).
 */
import type { Box } from './model'

export interface Pixels { data: Uint8ClampedArray | Uint8Array; width: number; height: number }

/** the strip left of a block where a marker may sit, in page space */
export function markerStrip(run: { x: number; baseline: number; size: number }): Box {
  const x0 = run.x - run.size * 3.2, x1 = run.x - run.size * 0.12
  return { x: Math.max(0, x0), y: run.baseline - run.size * 0.95, w: x1 - Math.max(0, x0), h: run.size * 1.2 }
}

/**
 * `px`: the pixels of the strip (`markerStrip`) at `scale` pixels per point; `bg` its background [r, g, b]. Returns the marker box in page space, or null.
 */
export function markerIn(px: Pixels, strip: Box, scale: number, bg: [number, number, number], size: number): Box | null {
  const { data, width, height } = px
  let x0 = width, y0 = height, x1 = -1, y1 = -1, n = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const o = (y * width + x) * 4
    if (Math.abs(data[o]! - bg[0]) + Math.abs(data[o + 1]! - bg[1]) + Math.abs(data[o + 2]! - bg[2]) > 90) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  if (n < 4 || x1 < 0) return null
  const w = (x1 - x0 + 1) / scale, h = (y1 - y0 + 1) / scale
  if (w < size * 0.1 || h < size * 0.1 || w > size * 1.2 || h > size * 1.2) return null
  if (x0 <= 1 || y0 <= 0 || y1 >= height - 1) return null // touches the strip's outer edge: part of something bigger
  const pad = 1
  return { x: strip.x + x0 / scale - pad, y: strip.y + y0 / scale - pad, w: w + pad * 2, h: h + pad * 2 }
}
