/// <reference lib="webworker" />
import { assertSurface, CanvasUnsupportedError, checkPngBlob, verifyReadback, type Surface } from './canvasSupport'
import { compose, coverRect, foregroundColors, parseHex, type Backdrop } from './composite'
import { featherAlpha, growAlpha, matteRadius, matteRefine, needsRefine, normalizeAlpha } from './refine'
import { resampleMask } from './resample'
import type { BackgroundSpec, ForegroundMask } from './types'

/**
 * The heavy pixel work, off the main thread: bringing a provider's mask to the picture's size and making it better (matte refinement, smooth normalisation), feather and expand/contract,
 * the cleaned colours for the preview, and the final PNG (decode the original, clean the edge colours, put the subject on the chosen background, encode). The worker keeps nothing between
 * requests, so a large picture's pixels exist only while one is being worked on.
 *
 * Canvases fail quietly when they are too big for the browser, so every full-size canvas is probed first and what was drawn is read back and compared (canvasSupport.ts): a failure is
 * reported as a CanvasUnsupportedError, never a blank result.
 */
export type EditOp = { kind: 'feather'; radius: number } | { kind: 'grow'; radius: number }

export type WorkerRequest =
  | { id: number; op: 'transparency'; image: Blob }
  | { id: number; op: 'prepare'; mask: ForegroundMask; image: Blob; width: number; height: number; nativeSide: number; refine: boolean }
  | { id: number; op: 'edit'; alpha: Uint8Array; width: number; height: number; edit: EditOp }
  | { id: number; op: 'clean'; image: Blob; alpha: Uint8Array; width: number; height: number }
  | { id: number; op: 'export'; image: Blob; alpha: Uint8Array; width: number; height: number; background: BackgroundSpec; backgroundImage?: Blob | undefined; scale: number }
export type WorkerResponse =
  | { id: number; ok: true; data?: Uint8Array; blob?: Blob; width?: number; height?: number; share?: number; opaque?: ImageBitmap; subject?: ImageBitmap; refined?: boolean }
  | { id: number; ok: false; error: string; canvas?: boolean }

const offscreen = (w: number, h: number) => new OffscreenCanvas(w, h) as unknown as Surface
const ctx2d = (c: OffscreenCanvas) => c.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D

/** The picture's pixels (straight RGBA). The canvas it passes through is checked first and released after. */
async function decode(image: Blob, expectW?: number, expectH?: number, scale = 1): Promise<{ px: Uint8ClampedArray; width: number; height: number }> {
  const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' })
  try {
    if (expectW !== undefined && (bitmap.width !== expectW || bitmap.height !== expectH)) throw new Error('The picture changed size while it was being edited.')
    const tw = Math.max(1, Math.round(bitmap.width * scale)), th = Math.max(1, Math.round(bitmap.height * scale))
    assertSurface(offscreen, tw, th)
    const canvas = new OffscreenCanvas(tw, th)
    const c = ctx2d(canvas)
    c.imageSmoothingQuality = 'high'
    c.drawImage(bitmap, 0, 0, tw, th)
    const px = c.getImageData(0, 0, tw, th).data
    canvas.width = 0; canvas.height = 0
    return { px, width: tw, height: th }
  } finally { bitmap.close() }
}

/** An opaque picture made of the cleaned subject colours (what the preview draws under the mask). */
async function subjectBitmap(px: Uint8ClampedArray, alpha: Uint8Array, w: number, h: number): Promise<ImageBitmap> {
  const fg = foregroundColors(px, alpha, w, h)
  const out = new Uint8ClampedArray(w * h * 4)
  for (let i = 0, j = 0, k = 0; i < w * h; i++) { out[k++] = fg[j++]!; out[k++] = fg[j++]!; out[k++] = fg[j++]!; out[k++] = 255 }
  return createImageBitmap(new ImageData(out as unknown as Uint8ClampedArray<ArrayBuffer>, w, h))
}

async function exportPng(r: Extract<WorkerRequest, { op: 'export' }>): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, Math.max(0.05, r.scale))
  const { px, width: tw, height: th } = await decode(r.image, r.width, r.height, scale)
  const alpha = scale < 1 ? resampleMask(r.alpha, r.width, r.height, tw, th) : r.alpha
  const fg = foregroundColors(px, alpha, tw, th)
  let backdrop: Backdrop = { kind: 'transparent' }
  if (r.background.kind === 'color') backdrop = { kind: 'color', rgb: parseHex(r.background.color) }
  else if (r.background.kind === 'image') {
    if (!r.backgroundImage) throw new Error('Choose the background picture first.')
    const bg = await createImageBitmap(r.backgroundImage, { imageOrientation: 'from-image' })
    const tmp = new OffscreenCanvas(tw, th)
    const t = ctx2d(tmp)
    const f = coverRect(bg.width, bg.height, tw, th)
    t.imageSmoothingQuality = 'high'
    t.drawImage(bg, f.x, f.y, f.w, f.h)
    bg.close()
    backdrop = { kind: 'pixels', rgba: t.getImageData(0, 0, tw, th).data }
    tmp.width = 0; tmp.height = 0
  }
  const out = compose(fg, alpha, tw, th, backdrop)
  assertSurface(offscreen, tw, th)
  const canvas = new OffscreenCanvas(tw, th)
  const c = ctx2d(canvas)
  c.putImageData(new ImageData(out as unknown as Uint8ClampedArray<ArrayBuffer>, tw, th), 0, 0)
  // what was drawn must be there: a canvas that went blank must not become a "finished" picture
  const bad = verifyReadback((x, y) => c.getImageData(x, y, 1, 1).data, out, tw, th)
  if (bad) throw new CanvasUnsupportedError(bad)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  canvas.width = 0; canvas.height = 0
  const why = checkPngBlob(blob)
  if (why) throw new CanvasUnsupportedError(why)
  return { blob, width: tw, height: th }
}

/**
 * A picture that already has a transparent background (a cut-out made before): its own transparency is the first mask, and the picture is shown with that transparency taken out (so
 * the mask is not applied twice). Returns the share of see-through pixels; the mask and the opaque picture only when there is real transparency.
 */
async function transparency(image: Blob): Promise<{ share: number; alpha?: Uint8Array; opaque?: ImageBitmap }> {
  const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' })
  let canvas: OffscreenCanvas | null = null
  try {
    assertSurface(offscreen, bitmap.width, bitmap.height)
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const c = ctx2d(canvas)
    c.drawImage(bitmap, 0, 0)
    const img = c.getImageData(0, 0, canvas.width, canvas.height)
    const n = canvas.width * canvas.height
    let see = 0
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! < 250) see++
    if (see / n <= 0.02) return { share: see / n }
    const alpha = new Uint8Array(n)
    for (let i = 0, j = 3; i < n; i++, j += 4) { alpha[i] = img.data[j]!; img.data[j] = 255 }
    c.putImageData(img, 0, 0)
    return { share: see / n, alpha, opaque: await createImageBitmap(canvas) }
  } finally { bitmap.close(); if (canvas) { canvas.width = 0; canvas.height = 0 } }
}

/** The provider's mask at the picture's size, improved: enlarged, then (if it was enlarged much) refined against the picture's own colours, then normalised; and the cleaned colours for the preview. */
async function prepare(r: Extract<WorkerRequest, { op: 'prepare' }>): Promise<{ data: Uint8Array; subject: ImageBitmap; refined: boolean }> {
  let alpha = resampleMask(r.mask.data, r.mask.width, r.mask.height, r.width, r.height)
  const { px } = await decode(r.image, r.width, r.height)
  const refine = r.refine && needsRefine(r.nativeSide, Math.max(r.width, r.height))
  if (refine) alpha = matteRefine(alpha, px, r.width, r.height, { radius: matteRadius(r.nativeSide, Math.max(r.width, r.height)) })
  alpha = normalizeAlpha(alpha)
  return { data: alpha, subject: await subjectBitmap(px, alpha, r.width, r.height), refined: refine }
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const r = ev.data
  const post = (m: WorkerResponse, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer)
  try {
    if (r.op === 'prepare') {
      const p = await prepare(r)
      post({ id: r.id, ok: true, data: p.data, subject: p.subject, refined: p.refined }, [p.data.buffer, p.subject])
    } else if (r.op === 'edit') {
      const data = r.edit.kind === 'feather' ? featherAlpha(r.alpha, r.width, r.height, r.edit.radius) : growAlpha(r.alpha, r.width, r.height, r.edit.radius)
      post({ id: r.id, ok: true, data }, [data.buffer])
    } else if (r.op === 'clean') {
      const { px } = await decode(r.image, r.width, r.height)
      const subject = await subjectBitmap(px, r.alpha, r.width, r.height)
      post({ id: r.id, ok: true, subject }, [subject])
    } else if (r.op === 'transparency') {
      const t = await transparency(r.image)
      const transfer: Transferable[] = []
      if (t.alpha) transfer.push(t.alpha.buffer)
      if (t.opaque) transfer.push(t.opaque)
      post({ id: r.id, ok: true, share: t.share, data: t.alpha, opaque: t.opaque } satisfies WorkerResponse, transfer)
    } else {
      const { blob, width, height } = await exportPng(r)
      post({ id: r.id, ok: true, blob, width, height })
    }
  } catch (e) {
    post({ id: r.id, ok: false, error: e instanceof Error ? e.message : 'Something went wrong while processing the picture.', ...(e instanceof CanvasUnsupportedError ? { canvas: true } : {}) })
  }
}
