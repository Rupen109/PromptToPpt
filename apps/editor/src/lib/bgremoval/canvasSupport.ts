/**
 * Canvases fail QUIETLY when they are too big for the browser: no exception, the context is simply null, or drawing does nothing and reading back gives zeros. A background removal that
 * trusts such a canvas shows a blank picture or exports an empty file. These checks make the failure loud and early, in the page and in the worker alike (they only need a way to make a
 * canvas, so they are plain TypeScript and can be tested without a browser).
 */
export class CanvasUnsupportedError extends Error {
  constructor(message: string) { super(message); this.name = 'CanvasUnsupportedError' }
}

interface Ctx { fillStyle: unknown; fillRect(x: number, y: number, w: number, h: number): void; getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> } }
export interface Surface { width: number; height: number; getContext(id: '2d', o?: unknown): Ctx | null }

/** The plain-words explanation shown to the person (the picture is untouched). */
export const tooBigForBrowser = (w: number, h: number) => `This browser cannot work on a picture of ${w} × ${h} pixels. Your picture was not changed. Try a smaller copy of it, or open it on a computer.`

/**
 * Makes a w x h canvas, draws on its first and last pixel and reads them back. Returns the reason in plain words when anything is off, null when the canvas really works.
 * Always releases the canvas (width 0) so the probe itself leaves no memory behind.
 */
export function probeSurface(make: (w: number, h: number) => Surface, w: number, h: number): string | null {
  let s: Surface | null = null
  try {
    s = make(w, h)
    if (s.width !== w || s.height !== h) return tooBigForBrowser(w, h)
    const c = s.getContext('2d', { willReadFrequently: false })
    if (!c) return tooBigForBrowser(w, h)
    const marks: Array<[number, number, [number, number, number]]> = [[0, 0, [12, 34, 56]], [w - 1, h - 1, [200, 100, 50]]]
    for (const [x, y, [r, g, b]] of marks) {
      c.fillStyle = `rgb(${r},${g},${b})`
      c.fillRect(x, y, 1, 1)
      const px = c.getImageData(x, y, 1, 1).data
      if (px[0] !== r || px[1] !== g || px[2] !== b || px[3] !== 255) return tooBigForBrowser(w, h)
    }
    return null
  } catch {
    return tooBigForBrowser(w, h)
  } finally {
    if (s) { try { s.width = 0; s.height = 0 } catch { /* a canvas that cannot even be shrunk is gone anyway */ } }
  }
}

/** Throws CanvasUnsupportedError when a w x h canvas does not work here. */
export function assertSurface(make: (w: number, h: number) => Surface, w: number, h: number): void {
  const why = probeSurface(make, w, h)
  if (why) throw new CanvasUnsupportedError(why)
}

/** Points to compare when checking that what was drawn is really there: the corners, the centre and a few more, never the whole picture. */
export function samplePoints(w: number, h: number): Array<[number, number]> {
  const xs = [0, Math.floor(w / 4), Math.floor(w / 2), Math.floor((3 * w) / 4), w - 1], ys = [0, Math.floor(h / 4), Math.floor(h / 2), Math.floor((3 * h) / 4), h - 1]
  const out: Array<[number, number]> = []
  for (const y of ys) for (const x of xs) out.push([x, y])
  return out
}

/**
 * After a canvas was filled from `expected` (RGBA bytes, straight alpha), read the sample points back and compare. A canvas that went blank or invalid returns different numbers.
 * `tolerance` allows the rounding that premultiplied alpha causes on semi-transparent pixels. Returns null when it matches, otherwise the reason.
 */
export function verifyReadback(read: (x: number, y: number) => ArrayLike<number>, expected: ArrayLike<number>, w: number, h: number, tolerance = 3): string | null {
  for (const [x, y] of samplePoints(w, h)) {
    const got = read(x, y), o = (y * w + x) * 4
    const a = expected[o + 3]!
    // colour of a fully transparent pixel is not preserved by canvases; compare it only where there is something to see
    const channels = a < 8 ? [3] : [0, 1, 2, 3]
    for (const k of channels) if (Math.abs((got[k] ?? -1000) - expected[o + k]!) > (k === 3 ? 1 : tolerance + (a < 255 ? 8 : 0))) return 'The picture came out blank or damaged on this browser. Your picture was not changed.'
  }
  return null
}

/** A finished PNG that is obviously not one (empty, wrong type) is refused before anything is saved. */
export function checkPngBlob(blob: Blob): string | null {
  if (blob.type !== 'image/png') return 'This browser could not make a PNG. Your picture was not changed.'
  if (blob.size < 67) return 'The picture came out empty on this browser. Your picture was not changed.' // the smallest possible PNG is 67 bytes
  return null
}
