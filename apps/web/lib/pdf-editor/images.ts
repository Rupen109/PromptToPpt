/** Reading a picture the visitor chose (or drew) into bytes the editor and pdf-lib can use. Browser only. */
import type { AlphaMask, ImageAnno } from './model'

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024
export interface Loaded { url: string; mime: ImageAnno['mime']; bytes: Uint8Array; w: number; h: number; /** see-through plane when the picture is a JPEG with a soft mask (rounded corners, fit-inside margins) */ alpha?: AlphaMask }

const canvasBlob = (c: HTMLCanvasElement, type: string): Promise<Blob> =>
  new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that picture.'))), type))
const toLoaded = async (blob: Blob, mime: Loaded['mime'], w: number, h: number): Promise<Loaded> => ({ url: URL.createObjectURL(blob), mime, bytes: new Uint8Array(await blob.arrayBuffer()), w, h })

/** PNG and JPEG are used as they are; anything else the browser can show (WebP, GIF, SVG…) is converted to PNG. Throws a plain sentence. */
export async function loadImageFile(file: File): Promise<Loaded> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`That picture is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB. Try a smaller one.`)
  if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name)) throw new Error('Please choose a picture file (PNG, JPG, WebP…).')
  let bmp: ImageBitmap
  try { bmp = await createImageBitmap(file) } catch { throw new Error('Could not read that picture. Try a PNG or JPG.') }
  try {
    if (file.type === 'image/png' || file.type === 'image/jpeg') return await toLoaded(file, file.type, bmp.width, bmp.height)
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
    c.getContext('2d')!.drawImage(bmp, 0, 0)
    return await toLoaded(await canvasBlob(c, 'image/png'), 'image/png', c.width, c.height)
  } finally { bmp.close() }
}

/** a canvas (the signature pad) → PNG, cropped to what was drawn, on a transparent background */
export async function canvasToCroppedPng(canvas: HTMLCanvasElement, pad = 6): Promise<Loaded | null> {
  const c = canvas.getContext('2d')!
  const { data, width, height } = c.getImageData(0, 0, canvas.width, canvas.height)
  let x0 = width, y0 = height, x1 = -1, y1 = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3]! > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  if (x1 < 0) return null
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad)
  const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1
  out.getContext('2d')!.drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
  return toLoaded(await canvasBlob(out, 'image/png'), 'image/png', out.width, out.height)
}

/** let the browser decode picture bytes and give back a plain PNG (used when pdf-lib cannot read a PNG/JPEG variant) */
export async function reencodePng(bytes: Uint8Array): Promise<Uint8Array> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart]))
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
  c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close()
  return new Uint8Array(await (await canvasBlob(c, 'image/png')).arrayBuffer())
}

/**
 * A picture with see-through parts (rounded corners, margins) saved SMALL: the colours go into a JPEG, the see-through plane into an 8-bit mask the PDF
 * stores beside it (a PNG with alpha is 5 to 10 times larger). `rgba` is split in place: the colours under see-through pixels are replaced by the nearest
 * solid colour (so the JPEG has no hard step at the edge and no halo), the alpha channel is set to 255 and the mask is returned.
 */
export function splitAlpha(rgba: { data: Uint8ClampedArray; width: number; height: number }): AlphaMask {
  const { data, width: w, height: h } = rgba
  const mask = new Uint8Array(w * h), solid = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) { mask[i] = data[i * 4 + 3]!; solid[i] = mask[i]! >= 250 ? 1 : 0 }
  const have = Uint8Array.from(solid)
  const copy = (to: number, from: number): void => { data[to * 4] = data[from * 4]!; data[to * 4 + 1] = data[from * 4 + 1]!; data[to * 4 + 2] = data[from * 4 + 2]!; have[to] = 1 }
  // along each row: from the left, then from the right, a missing pixel takes the colour of the nearest solid one; rows with none at all take it from the rows above / below
  for (let y = 0; y < h; y++) {
    let last = -1
    for (let x = 0; x < w; x++) { const i = y * w + x; if (solid[i]) last = i; else if (last >= 0) copy(i, last) }
    last = -1
    for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (solid[i]) last = i; else if (last >= 0 && !have[i]) copy(i, last) }
  }
  for (let x = 0; x < w; x++) {
    let last = -1
    for (let y = 0; y < h; y++) { const i = y * w + x; if (have[i]) last = i; else if (last >= 0) copy(i, last) }
    last = -1
    for (let y = h - 1; y >= 0; y--) { const i = y * w + x; if (have[i]) last = i; else if (last >= 0) copy(i, last) }
  }
  for (let i = 0; i < w * h; i++) data[i * 4 + 3] = 255
  return { w, h, data: mask }
}
/** does the mask hide anything? (a picture whose corners are all solid needs no mask) */
export const hasSeeThrough = (m: AlphaMask): boolean => { for (let i = 0; i < m.data.length; i++) if (m.data[i]! < 250) return true; return false }

const MAX_FIT_SIDE = 4000
/**
 * Fit a chosen picture into a box of `boxW` x `boxH` (any unit, only the shape matters).
 * 'cover': scaled to fill the box and centre-cropped. 'contain': whole picture inside the box, the rest see-through.
 * The result is as sharp as the chosen picture (never scaled up), JPEG unless something in it is see-through (then PNG).
 * A picture that already has the box's shape and needs no change is returned as it came.
 */
export async function fitIntoBox(src: { mime: ImageAnno['mime']; bytes: Uint8Array; url: string; w: number; h: number }, boxW: number, boxH: number, fit: 'cover' | 'contain'): Promise<Loaded> {
  const ba = boxW / boxH, sa = src.w / src.h
  if (fit === 'cover' && Math.abs(sa - ba) / ba < 0.005 && Math.max(src.w, src.h) <= MAX_FIT_SIDE) return { ...src }
  const bmp = await createImageBitmap(new Blob([src.bytes as BlobPart], { type: src.mime }))
  try {
    let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height, cw: number, ch: number, dx = 0, dy = 0, dw: number, dh: number
    if (fit === 'cover') {
      if (sa > ba) { sw = bmp.height * ba; sx = (bmp.width - sw) / 2 } else { sh = bmp.width / ba; sy = (bmp.height - sh) / 2 }
      cw = dw = Math.max(1, Math.round(sw)); ch = dh = Math.max(1, Math.round(sh))
    } else if (sa > ba) { cw = dw = bmp.width; ch = Math.max(1, Math.round(cw / ba)); dh = Math.round(cw / sa); dy = (ch - dh) / 2 }
    else { ch = dh = bmp.height; cw = Math.max(1, Math.round(ch * ba)); dw = Math.round(ch * sa); dx = (cw - dw) / 2 }
    const k = Math.min(1, MAX_FIT_SIDE / Math.max(cw, ch))
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(cw * k)); c.height = Math.max(1, Math.round(ch * k))
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.imageSmoothingQuality = 'high'
    g.drawImage(bmp, sx, sy, sw, sh, dx * k, dy * k, dw * k, dh * k)
    let alpha = fit === 'contain' && (dx > 0.5 || dy > 0.5)
    if (!alpha && src.mime === 'image/png') { const d = g.getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]! < 250) { alpha = true; break } }
    const blobOf = (type: string, q?: number): Promise<Blob> => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not use that picture.'))), type, q))
    // a photo (JPEG) with see-through margins: JPEG + soft mask. A PNG the visitor chose (a logo, flat colours) stays a PNG: JPEG would ring around its edges.
    if (alpha && src.mime === 'image/jpeg') {
      const shown = await toLoaded(await blobOf('image/png'), 'image/png', c.width, c.height) // what the screen draws
      const px = g.getImageData(0, 0, c.width, c.height), mask = splitAlpha(px)
      g.putImageData(px, 0, 0)
      const jpg = await blobOf('image/jpeg', 0.92)
      c.width = 0
      return { url: shown.url, mime: 'image/jpeg', bytes: new Uint8Array(await jpg.arrayBuffer()), w: mask.w, h: mask.h, alpha: mask }
    }
    const mime = alpha ? 'image/png' : 'image/jpeg'
    const out = await toLoaded(await blobOf(mime, 0.92), mime, c.width, c.height)
    c.width = 0
    return out
  } finally { bmp.close() }
}
