import { join } from 'node:path'
import sharp from 'sharp'
import { ChildProcessEngine, type CutoutEngine } from './cutout-engine.ts'
import { InferenceQueue, QueueError } from './cutout-queue.ts'

/**
 * Background removal: the subject of a picture is cut out and everything behind it becomes transparent. Done on OUR server with an open model, so no picture leaves for an outside
 * service and there is no per-picture bill.
 *
 * Model: BiRefNet (lite), https://github.com/ZhengPeng7/BiRefNet : MIT licence (the code, and the model card of the ONNX conversion says "license: mit"). Run with Transformers.js
 * (Apache-2.0) on onnxruntime-node (MIT). The revision is PINNED: what we run cannot change under us when the repository is updated.
 *
 * DEVELOPMENT ONLY (not approved for production: docs/BACKGROUND_REMOVAL_EVALUATION.md). The model itself runs in cutout-child.ts, a child process the engine can kill.
 */
export const CUTOUT_MODEL = { id: 'onnx-community/BiRefNet_lite-ONNX', revision: 'de15b22ba131738a16dff04aab8bdf8dc32e3ac1', dtype: 'fp32' } as const

/** The longest side of the result: a bigger picture is brought down first (memory, and a slide never shows more). */
export const CUTOUT_MAX_SIDE = 2048
const MAX_INPUT_PIXELS = 50_000_000
const TIMEOUT_MS = 120_000

/** A sentence a person can act on. */
export class CutoutError extends Error {}
/** Too many pictures are waiting for the model. */
export class CutoutBusyError extends Error {}
/** The person went away (closed the dialog, lost the connection) before the model finished: the work was stopped. */
export class CutoutCancelledError extends Error {}

export type { CutoutEngine }

/**
 * The model's memory use is the limit, not the CPU: BiRefNet (lite, fixed 1024 input) peaks at several GB. `slots` jobs may run at once = memory budget / memory one job needs
 * (never below 1). The model runs in a child process per slot (cutout-engine.ts) so that a timeout or a cancel really stops it.
 */
const num = (name: string, fallback: number) => { const v = Number(process.env[name]); return Number.isFinite(v) && v > 0 ? v : fallback }
export const cutoutLimits = () => ({
  slots: Math.max(1, Math.floor(num('CUTOUT_MEMORY_BUDGET_MB', 4608) / num('CUTOUT_JOB_MB', 4608))),
  maxWaiting: num('CUTOUT_MAX_WAITING', 6),
  timeoutMs: num('CUTOUT_TIMEOUT_MS', TIMEOUT_MS),
})

let queue: InferenceQueue | null = null
let override: CutoutEngine | null = null
const engines = new Map<number, CutoutEngine>()
/** Tests (and nothing else) replace the model. */
export const setCutoutEngine = (e: CutoutEngine | null) => { override = e; if (!e) { for (const x of engines.values()) if (x instanceof ChildProcessEngine) void x.kill(); engines.clear(); queue = null } }
/** Tests: a queue with other limits (null = back to the settings). */
export const setCutoutQueue = (q: InferenceQueue | null) => { queue = q }
const engineFor = (slot: number): CutoutEngine => override ?? (engines.get(slot) ?? (engines.set(slot, new ChildProcessEngine()), engines.get(slot)!))
const theQueue = () => (queue ??= new InferenceQueue(cutoutLimits()))

export const modelDir = () => process.env['CUTOUT_MODEL_DIR'] ?? join(process.cwd(), '.local', 'models')

export interface CutoutResult { png: Buffer; width: number; height: number }

/** Bounding box of what the model calls the subject (with a margin), so the result is the product and not the room round it. */
function subjectBox(mask: Uint8Array, w: number, h: number): { left: number; top: number; width: number; height: number } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) if (mask[row + x]! > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  if (x1 < 0) return null
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02)
  const left = Math.max(0, x0 - pad), top = Math.max(0, y0 - pad)
  return { left, top, width: Math.min(w, x1 + pad + 1) - left, height: Math.min(h, y1 + pad + 1) - top }
}

/** The foreground mask of a picture at its (orientation-corrected, at most CUTOUT_MAX_SIDE) working size: one 0-255 value per pixel, 255 = the subject. Nothing is cropped or composed here. */
export interface ForegroundMask { mask: Uint8Array; width: number; height: number; rgb: Buffer }

/** Throws CutoutError for what a person can fix (not a picture, too big, no clear subject, already transparent). */
export async function segmentForeground(input: Uint8Array, o: { signal?: AbortSignal | undefined } = {}): Promise<ForegroundMask> {
  o.signal?.throwIfAborted()
  let rgba: Buffer, width: number, height: number
  try {
    const info = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: true }).metadata()
    if ((info.pages ?? 1) > 1) throw new CutoutError('Animated pictures cannot be edited here. Use a still PNG, JPEG or WebP picture.')
    const decoded = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: CUTOUT_MAX_SIDE, height: CUTOUT_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    rgba = decoded.data; width = decoded.info.width; height = decoded.info.height
  } catch (e) {
    if (e instanceof CutoutError) throw e
    throw new CutoutError('I could not read that picture. Use a PNG, JPEG or WebP picture.')
  }
  let see = 0
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i]! < 250) see++
  if (see / (width * height) > 0.02) throw new CutoutError('That picture already has a transparent background.')
  const rgb = Buffer.alloc(width * height * 3)
  for (let i = 0, j = 0; i < rgba.length; i += 4) { rgb[j++] = rgba[i]!; rgb[j++] = rgba[i + 1]!; rgb[j++] = rgba[i + 2]! }

  let mask: Uint8Array
  try {
    mask = await theQueue().run((signal, slot) => engineFor(slot).mask(rgb, width, height, signal), { signal: o.signal, timeoutMs: cutoutLimits().timeoutMs })
  } catch (e) {
    if (e instanceof QueueError) {
      if (e.kind === 'busy') throw new CutoutBusyError(e.message)
      if (e.kind === 'cancelled') throw new CutoutCancelledError(e.message)
      throw new CutoutError(e.message)
    }
    throw e
  }
  if (mask.length !== width * height) throw new Error(`the model returned ${mask.length} values for ${width * height} pixels`)
  let on = 0
  for (let i = 0; i < mask.length; i++) if (mask[i]! > 127) on++
  if (on / mask.length < 0.005) throw new CutoutError('I could not find a clear subject in that picture, so nothing was changed.')
  return { mask, width, height, rgb }
}

/** A grey-scale PNG of the mask (what the editor's background removal dialog receives): lossless, 8 bits, the mask's own size. */
export async function maskToPng(m: Pick<ForegroundMask, 'mask' | 'width' | 'height'>): Promise<Buffer> {
  return sharp(Buffer.from(m.mask), { raw: { width: m.width, height: m.height, channels: 1 } }).toColourspace('b-w').png({ compressionLevel: 6 }).toBuffer()
}

/**
 * How much of a picture is see-through (alpha under 250), 0 to 1, measured on the PNG's real pixels. This is what "the background was removed" is judged by: a result that is opaque is not a
 * cut-out, whatever the model said.
 */
export async function transparentShareOfPng(png: Uint8Array): Promise<number> {
  const { data, info } = await sharp(png, { limitInputPixels: MAX_INPUT_PIXELS }).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true })
  let see = 0
  for (let i = 0; i < data.length; i++) if (data[i]! < 250) see++
  return see / Math.max(1, info.width * info.height)
}

/** The picture with its background removed, as a PNG cropped to the subject. */
export async function removeBackground(input: Uint8Array, o: { signal?: AbortSignal | undefined } = {}): Promise<CutoutResult> {
  const { mask, width, height, rgb } = await segmentForeground(input, o)
  const box = subjectBox(mask, width, height)!
  // the picture with the model's matte as its alpha, then cropped to the subject (built by hand: the crop must come after the alpha, whatever order a library applies its steps in)
  const out = Buffer.alloc(width * height * 4)
  for (let i = 0, j = 0, k = 0; i < width * height; i++) { out[k++] = rgb[j++]!; out[k++] = rgb[j++]!; out[k++] = rgb[j++]!; out[k++] = mask[i]! }
  const cut = await sharp(out, { raw: { width, height, channels: 4 } }).extract(box).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
  return { png: cut.data, width: cut.info.width, height: cut.info.height }
}
