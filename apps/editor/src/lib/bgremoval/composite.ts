/**
 * Putting the subject on a background, in pixels. A photo's edge pixels carry the OLD background (a white or black halo); cutting with a soft mask and then showing them on a new
 * background is what makes the familiar light or dark fringe. `foregroundColors` replaces the colour of every semi-transparent pixel with the colour of the solid subject next to it
 * before anything is composed, so the edge has the subject's own colour whatever it is placed on. Pure typed-array code (no DOM): it runs in the worker and is unit-tested.
 */

/** RGB (3 bytes per pixel) of the subject with the old background's colour taken out of the edge. `rgba` is the picture (straight alpha, only RGB is read). */
/**
 * The old background's colour is taken out of every semi-transparent pixel by replacing its colour with the average of the solid subject pixels next to it, working outward from the
 * subject one ring per pass. The number of rings is NOT fixed: the soft edge of a mask is wider the more a small mask was enlarged (about 2 pixels per pixel of enlargement), so it
 * keeps going until every soft pixel that has any solid subject within `maxReach` pixels is done (a fixed 8 left halos on large pictures). Pixels with no solid subject that near
 * (an isolated wisp, a strand of hair on its own) keep their own colour, which is the best information there is for them.
 */
export function foregroundColors(rgba: Uint8ClampedArray | Uint8Array, alpha: Uint8Array, w: number, h: number, o: { solid?: number; maxReach?: number; passes?: number } = {}): Uint8ClampedArray {
  const solid = o.solid ?? 250, passes = o.passes ?? o.maxReach ?? 64
  const n = w * h
  const rgb = new Uint8ClampedArray(n * 3)
  for (let i = 0, j = 0, k = 0; i < n; i++, j += 4, k += 3) { rgb[k] = rgba[j]!; rgb[k + 1] = rgba[j + 1]!; rgb[k + 2] = rgba[j + 2]! }
  const known = new Uint8Array(n)
  for (let i = 0; i < n; i++) if (alpha[i]! >= solid) known[i] = 1
  let todo: number[] = []
  for (let i = 0; i < n; i++) if (!known[i] && alpha[i]! > 0) todo.push(i)
  for (let pass = 0; pass < passes && todo.length > 0; pass++) {
    const fill: number[] = [], colour: number[] = []
    const rest: number[] = []
    for (const i of todo) {
      const x = i % w, y = (i - x) / w
      let r = 0, g = 0, b = 0, c = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w || (dx === 0 && dy === 0)) continue
          const q = yy * w + xx
          if (!known[q]) continue
          r += rgb[q * 3]!; g += rgb[q * 3 + 1]!; b += rgb[q * 3 + 2]!; c++
        }
      }
      if (c > 0) { fill.push(i); colour.push(Math.round(r / c), Math.round(g / c), Math.round(b / c)) } else rest.push(i)
    }
    for (let k = 0; k < fill.length; k++) { const i = fill[k]!; rgb[i * 3] = colour[k * 3]!; rgb[i * 3 + 1] = colour[k * 3 + 1]!; rgb[i * 3 + 2] = colour[k * 3 + 2]!; known[i] = 1 }
    todo = rest
  }
  return rgb
}

export type Backdrop = { kind: 'transparent' } | { kind: 'color'; rgb: [number, number, number] } | { kind: 'pixels'; rgba: Uint8ClampedArray | Uint8Array }

/** The picture's subject over the backdrop: straight (not premultiplied) RGBA, ready for a PNG. Transparent keeps the alpha; anything else is fully opaque. */
export function compose(fg: Uint8ClampedArray, alpha: Uint8Array, w: number, h: number, backdrop: Backdrop): Uint8ClampedArray {
  const n = w * h
  const out = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) {
    const a = alpha[i]!, k = i * 3, o = i * 4
    if (backdrop.kind === 'transparent') { out[o] = fg[k]!; out[o + 1] = fg[k + 1]!; out[o + 2] = fg[k + 2]!; out[o + 3] = a; continue }
    const br = backdrop.kind === 'color' ? backdrop.rgb[0] : backdrop.rgba[o]!
    const bg = backdrop.kind === 'color' ? backdrop.rgb[1] : backdrop.rgba[o + 1]!
    const bb = backdrop.kind === 'color' ? backdrop.rgb[2] : backdrop.rgba[o + 2]!
    out[o] = Math.round((fg[k]! * a + br * (255 - a)) / 255)
    out[o + 1] = Math.round((fg[k + 1]! * a + bg * (255 - a)) / 255)
    out[o + 2] = Math.round((fg[k + 2]! * a + bb * (255 - a)) / 255)
    out[o + 3] = 255
  }
  return out
}

/** Where a picture is drawn to cover a w x h area completely (centred, cropped at the sides that overflow). */
export function coverRect(srcW: number, srcH: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const s = Math.max(w / srcW, h / srcH)
  return { x: (w - srcW * s) / 2, y: (h - srcH * s) / 2, w: srcW * s, h: srcH * s }
}

export function parseHex(color: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return [255, 255, 255]
  const v = parseInt(m[1]!, 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
