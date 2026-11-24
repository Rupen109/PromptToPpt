/**
 * The rectangle of a picture that is kept when cropping, as fractions of the WHOLE picture (0-1). Pure geometry, no screen: the crop dialog turns pointer movement into fractions
 * (dx, dy) and these functions keep the rectangle inside the picture, never smaller than MIN, and, when a shape is locked, in that shape.
 */
export interface Rect { x: number; y: number; w: number; h: number }
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export const MIN = 0.05

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** the whole rectangle moves; it stays inside the picture */
export function moveCrop(r: Rect, dx: number, dy: number): Rect {
  return { ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) }
}

/** the width ÷ height a locked shape has IN FRACTIONS, for a shape of `shape` (width ÷ height, in pixels) on a picture of `sourceAspect` (width ÷ height, in pixels) */
export const fractionRatio = (shape: number, sourceAspect: number) => shape / sourceAspect

/** a handle is dragged by (dx, dy); with `ratio` (w ÷ h in fractions) the shape stays and the opposite side or corner stays put */
export function resizeCrop(r: Rect, handle: Handle, dx: number, dy: number, ratio?: number): Rect {
  let l = r.x, t = r.y, rt = r.x + r.w, b = r.y + r.h
  if (handle.includes('w')) l += dx
  if (handle.includes('e')) rt += dx
  if (handle.includes('n')) t += dy
  if (handle.includes('s')) b += dy
  l = clamp(l, 0, rt - MIN); rt = clamp(rt, l + MIN, 1); t = clamp(t, 0, b - MIN); b = clamp(b, t + MIN, 1)
  if (!ratio) return { x: l, y: t, w: rt - l, h: b - t }
  let w = rt - l, h = b - t
  if (handle === 'n' || handle === 's') w = h * ratio; else h = w / ratio
  // the side opposite the handle stays; on the other axis of an edge handle the rectangle stays centred
  const ax = handle.includes('w') ? { fixed: rt, dir: -1 } : handle.includes('e') ? { fixed: l, dir: 1 } : { fixed: (l + rt) / 2, dir: 0 }
  const ay = handle.includes('n') ? { fixed: b, dir: -1 } : handle.includes('s') ? { fixed: t, dir: 1 } : { fixed: (t + b) / 2, dir: 0 }
  const availW = ax.dir === -1 ? ax.fixed : ax.dir === 1 ? 1 - ax.fixed : 2 * Math.min(ax.fixed, 1 - ax.fixed)
  const availH = ay.dir === -1 ? ay.fixed : ay.dir === 1 ? 1 - ay.fixed : 2 * Math.min(ay.fixed, 1 - ay.fixed)
  const k = Math.min(1, availW / w, availH / h)
  w *= k; h *= k
  w = Math.max(w, MIN); h = Math.max(h, MIN)
  const x = ax.dir === -1 ? ax.fixed - w : ax.dir === 1 ? ax.fixed : ax.fixed - w / 2
  const y = ay.dir === -1 ? ay.fixed - h : ay.dir === 1 ? ay.fixed : ay.fixed - h / 2
  return { x: clamp(x, 0, 1 - w), y: clamp(y, 0, 1 - h), w, h }
}

/** the biggest rectangle of this shape (w ÷ h in fractions) that fits the picture, in the middle: the start of a locked-shape crop */
export function fitShape(ratio: number): Rect {
  const w = ratio >= 1 ? 1 : ratio, h = ratio >= 1 ? 1 / ratio : 1
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}

/** the frame (width, height in canvas units) that shows a crop without distortion: the frame keeps its width and takes the cut-out's shape, kept in the middle of where it was and inside the slide */
export function frameForCrop(frame: { x: number; y: number; width: number; height: number }, crop: Rect, sourceAspect: number, slide: { width: number; height: number }) {
  let width = frame.width
  let height = width * (crop.h / crop.w) / sourceAspect
  const k = Math.min(1, slide.width / width, slide.height / height)
  width *= k; height *= k
  const cx = frame.x + frame.width / 2, cy = frame.y + frame.height / 2
  return { x: Math.round(clamp(cx - width / 2, 0, slide.width - width)), y: Math.round(clamp(cy - height / 2, 0, slide.height - height)), width: Math.round(width), height: Math.round(height) }
}
