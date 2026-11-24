/** Brings a mask to another size with bilinear sampling (pixel centres line up, so a 2x upscale does not shift the edge). Pure; runs in the worker. */
export function resampleMask(src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  if (src.length !== sw * sh) throw new Error(`mask has ${src.length} values for ${sw} x ${sh} pixels`)
  if (sw === dw && sh === dh) return Uint8Array.from(src)
  const out = new Uint8Array(dw * dh)
  const fx = sw / dw, fy = sh / dh
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.max(0, (y + 0.5) * fy - 0.5))
    const y0 = Math.floor(sy), y1 = Math.min(sh - 1, y0 + 1), wy = sy - y0
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.max(0, (x + 0.5) * fx - 0.5))
      const x0 = Math.floor(sx), x1 = Math.min(sw - 1, x0 + 1), wx = sx - x0
      const top = src[y0 * sw + x0]! * (1 - wx) + src[y0 * sw + x1]! * wx
      const bot = src[y1 * sw + x0]! * (1 - wx) + src[y1 * sw + x1]! * wx
      out[y * dw + x] = Math.round(top * (1 - wy) + bot * wy)
    }
  }
  return out
}
