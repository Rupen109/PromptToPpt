import { CanvasUnsupportedError, tooBigForBrowser } from './canvasSupport'
import { MaskEditor } from './mask'
import { coverRect } from './composite'
import type { Rect } from './types'
import type { View } from './view'

export type { View } from './view'
export { fitView } from './view'
export type Backdrop = { kind: 'transparent' } | { kind: 'color'; color: string } | { kind: 'image'; bitmap: ImageBitmap }

/**
 * Draws the picture with the current mask over a background (a checkerboard for "transparent"), or before/after. The picture stays an image bitmap and the mask lives in its own canvas
 * that is updated only where a stroke changed it; each frame is two scaled draws on the GPU, never a pass over every pixel of a large picture.
 */
export class Renderer {
  private maskCanvas: HTMLCanvasElement | null = document.createElement('canvas')
  private scratch: HTMLCanvasElement | null = document.createElement('canvas')
  private checker: CanvasPattern | null = null
  /** the picture's colours with the old background's tint taken out of the edge (what the export will use); drawn under the mask instead of the original when present */
  private subject: ImageBitmap | null = null

  /**
   * Throws CanvasUnsupportedError (with a plain sentence) when this browser cannot hold a canvas as large as the picture, or when what was drawn on it did not stay there: a canvas that
   * is too big fails quietly (no exception, nothing drawn), and a mask that silently never reaches the screen would show a blank picture.
   */
  constructor(private original: ImageBitmap | null, private editor: MaskEditor) {
    const cv = this.maskCanvas!
    cv.width = editor.width
    cv.height = editor.height
    if (cv.width !== editor.width || cv.height !== editor.height || !cv.getContext('2d')) { this.dispose(); throw new CanvasUnsupportedError(tooBigForBrowser(editor.width, editor.height)) }
    this.syncMask()
    const bad = this.checkMask()
    if (bad) { this.dispose(); throw new CanvasUnsupportedError(bad) }
  }

  /** Reads a few pixels of the mask canvas back and compares them with the mask: a canvas that went blank or invalid gives other numbers. */
  checkMask(): string | null {
    const c = this.maskCanvas?.getContext('2d')
    if (!c) return tooBigForBrowser(this.editor.width, this.editor.height)
    const W = this.editor.width, H = this.editor.height
    for (const fx of [0, 0.25, 0.5, 0.75, 1]) for (const fy of [0, 0.25, 0.5, 0.75, 1]) {
      const x = Math.min(W - 1, Math.floor(fx * W)), y = Math.min(H - 1, Math.floor(fy * H))
      let got: number
      try { got = c.getImageData(x, y, 1, 1).data[3]! } catch { return tooBigForBrowser(W, H) }
      if (Math.abs(got - this.editor.alpha[y * W + x]!) > 1) return 'The picture came out blank or damaged on this browser. Your picture was not changed.'
    }
    return null
  }

  /** The cleaned colours of the subject for the current mask (replaces the previous layer and closes it). */
  setSubject(bitmap: ImageBitmap | null) { this.subject?.close(); this.subject = bitmap }

  /** Copies the mask into the mask canvas's alpha channel (the colour is irrelevant: it is only used to cut the picture out). `rect` limits the work to what changed. */
  syncMask(rect?: Rect) {
    const c = this.maskCanvas?.getContext('2d')
    if (!c) { if (this.maskCanvas) throw new CanvasUnsupportedError(tooBigForBrowser(this.editor.width, this.editor.height)); return } // (a disposed renderer has no canvas and nothing to do)
    const W = this.editor.width, a = this.editor.alpha
    const r = rect ?? { x: 0, y: 0, w: W, h: this.editor.height }
    const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y), x1 = Math.min(W, r.x + r.w), y1 = Math.min(this.editor.height, r.y + r.h)
    for (let y = y0; y < y1; y += 128) {
      const h = Math.min(128, y1 - y), w = x1 - x0
      if (w <= 0 || h <= 0) continue
      const img = new ImageData(w, h)
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) img.data[(yy * w + xx) * 4 + 3] = a[(y + yy) * W + x0 + xx]!
      c.putImageData(img, x0, y)
    }
  }

  private pattern(c: CanvasRenderingContext2D): CanvasPattern | null {
    if (this.checker) return this.checker
    const t = document.createElement('canvas'); t.width = t.height = 20
    const x = t.getContext('2d')!
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 20, 20)
    x.fillStyle = '#d9dde3'; x.fillRect(0, 0, 10, 10); x.fillRect(10, 10, 10, 10)
    this.checker = c.createPattern(t, 'repeat')
    return this.checker
  }

  draw(c: CanvasRenderingContext2D, cw: number, ch: number, o: { view: View; backdrop: Backdrop; compare: { on: boolean; at: number } }) {
    const { scale, ox, oy } = o.view
    const W = this.editor.width, H = this.editor.height
    const iw = W * scale, ih = H * scale
    c.clearRect(0, 0, cw, ch)
    if (!this.original || !this.maskCanvas || !this.scratch) return
    const smooth = scale < 1.5 // at high zoom the pixels are shown as they are, so the brush edge can be judged
    c.imageSmoothingEnabled = smooth; c.imageSmoothingQuality = 'high'
    const splitX = o.compare.on ? ox + iw * o.compare.at : ox
    if (o.compare.on && splitX > ox) {
      c.save(); c.beginPath(); c.rect(ox, oy, Math.min(iw, splitX - ox), ih); c.clip()
      c.drawImage(this.original, ox, oy, iw, ih)
      c.restore()
    }
    c.save(); c.beginPath(); c.rect(splitX, oy, Math.max(0, ox + iw - splitX), ih); c.clip()
    const b = o.backdrop
    if (b.kind === 'transparent') { const p = this.pattern(c); if (p) { c.fillStyle = p; c.fillRect(ox, oy, iw, ih) } }
    else if (b.kind === 'color') { c.fillStyle = b.color; c.fillRect(ox, oy, iw, ih) }
    else { const f = coverRect(b.bitmap.width, b.bitmap.height, iw, ih); c.drawImage(b.bitmap, ox + f.x, oy + f.y, f.w, f.h) }
    // the subject: the picture, cut by the mask (destination-in keeps only what the mask covers)
    if (this.scratch.width !== cw || this.scratch.height !== ch) { this.scratch.width = cw; this.scratch.height = ch }
    const s = this.scratch.getContext('2d')!
    s.clearRect(0, 0, cw, ch)
    s.imageSmoothingEnabled = smooth; s.imageSmoothingQuality = 'high'
    s.globalCompositeOperation = 'source-over'
    s.drawImage(this.subject ?? this.original, ox, oy, iw, ih)
    s.globalCompositeOperation = 'destination-in'
    s.drawImage(this.maskCanvas, ox, oy, iw, ih)
    s.globalCompositeOperation = 'source-over'
    c.drawImage(this.scratch, 0, 0)
    c.restore()
  }

  /** Lets go of the canvases and the picture so the memory is free as soon as the dialog closes. */
  dispose() {
    for (const cv of [this.maskCanvas, this.scratch]) if (cv) { cv.width = 0; cv.height = 0 }
    this.maskCanvas = null; this.scratch = null; this.checker = null
    this.original?.close(); this.original = null
    this.subject?.close(); this.subject = null
  }
}
