/**
 * Page space ↔ PDF user space, and the screen maths around it. Pure numbers, no DOM.
 *
 * Page space: pdf.js viewport at scale 1 for the page's own /Rotate (top-left origin, y down, pt).
 * User space: the PDF's own coordinates (bottom-left origin, y up) inside the page box `view` = [x0, y0, x1, y1] (CropBox ∩ MediaBox).
 * With u = x - x0 and v = y - y0 (v measured upward) and W, H the unrotated box size, /Rotate turns the page clockwise:
 *   0:   dx = u      dy = H - v       |  90:  dx = v      dy = u
 *   180: dx = W - u  dy = v           |  270: dx = H - v  dy = W - u
 */
import type { Box, Geom, Turn } from './model'

export type Point = [number, number]

export function toUser(g: Geom, dx: number, dy: number): Point {
  const [x0, y0, x1, y1] = g.view
  const W = x1 - x0, H = y1 - y0
  switch (g.rotate) {
    case 0: return [x0 + dx, y0 + (H - dy)]
    case 90: return [x0 + dy, y0 + dx]
    case 180: return [x0 + (W - dx), y0 + dy]
    default: return [x0 + (W - dy), y0 + (H - dx)]
  }
}
export function fromUser(g: Geom, x: number, y: number): Point {
  const [x0, y0, x1, y1] = g.view
  const W = x1 - x0, H = y1 - y0
  const u = x - x0, v = y - y0
  switch (g.rotate) {
    case 0: return [u, H - v]
    case 90: return [v, u]
    case 180: return [W - u, v]
    default: return [H - v, W - u]
  }
}
/** a page-space box as the axis-aligned box it covers in user space */
export function boxToUser(g: Geom, b: Box): { x: number; y: number; w: number; h: number } {
  const [ax, ay] = toUser(g, b.x, b.y), [bx, by] = toUser(g, b.x + b.w, b.y + b.h)
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) }
}

/** multiply two PDF matrices [a b c d e f]: apply `m` first, then `n` */
export type Matrix = [number, number, number, number, number, number]
export const multiply = (n: Matrix, m: Matrix): Matrix => [
  n[0] * m[0] + n[2] * m[1], n[1] * m[0] + n[3] * m[1],
  n[0] * m[2] + n[2] * m[3], n[1] * m[2] + n[3] * m[3],
  n[0] * m[4] + n[2] * m[5] + n[4], n[1] * m[4] + n[3] * m[5] + n[5],
]
/** the matrix that takes user space to page space (what pdf.js calls viewport.transform at scale 1) */
export function userToPageMatrix(g: Geom): Matrix {
  const [ox, oy] = fromUser(g, 0, 0), [ex, ey] = fromUser(g, 1, 0), [fx, fy] = fromUser(g, 0, 1)
  return [ex - ox, ey - oy, fx - ox, fy - oy, ox, oy]
}

/** screen point (client px) → page space, for a stage that is shown rotated by `turn` and scaled by `zoom` (rect = its bounding box on screen) */
export function clientToPage(cx: number, cy: number, rect: { left: number; top: number; width: number; height: number }, turn: Turn, zoom: number, shown: { w: number; h: number }): Point {
  const vx = cx - (rect.left + rect.width / 2), vy = cy - (rect.top + rect.height / 2)
  // undo the clockwise turn
  const [rx, ry] = turn === 0 ? [vx, vy] : turn === 90 ? [vy, -vx] : turn === 180 ? [-vx, -vy] : [-vy, vx]
  const stageW = turn % 180 === 0 ? shown.w : shown.h, stageH = turn % 180 === 0 ? shown.h : shown.w
  return [(rx + (stageW * zoom) / 2) / zoom, (ry + (stageH * zoom) / 2) / zoom]
}

/** zoom that makes the page exactly as wide as the available width */
export const fitWidthZoom = (availableCss: number, pageWidth: number, max = 3): number => Math.max(0.2, Math.min(max, availableCss / pageWidth))
export const clampZoom = (z: number): number => Math.min(4, Math.max(0.25, Math.round(z * 100) / 100))

// ---------- text runs from pdf.js ----------
export interface RunBox { x: number; y: number; w: number; h: number; baseline: number; size: number; /** text that is turned (degrees clockwise on screen): the box is the UNTURNED box, `rot` turns it about its top-left corner */ rot?: number }

/** the axis-aligned box that holds `b` after it is turned by `rot` degrees about its TOP-LEFT corner (the point the text starts from, so it stays put when the text grows) */
export function turnedBounds(b: { x: number; y: number; w: number; h: number }, rot = 0): { x: number; y: number; w: number; h: number } {
  if (!rot) return { x: b.x, y: b.y, w: b.w, h: b.h }
  const t = (rot * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  const xs = [0, b.w * c, b.w * c - b.h * s, -b.h * s], ys = [0, b.w * s, b.w * s + b.h * c, b.h * c]
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  return { x: b.x + x0, y: b.y + y0, w: x1 - x0, h: y1 - y0 }
}
/** normalise an angle to (-180, 180] */
export const normAngle = (deg: number): number => { let d = ((deg % 360) + 360) % 360; if (d > 180) d -= 360; return d }
/**
 * an item's text matrix (user space) → box in page space, or null when the text is mirrored / skewed.
 * Horizontal text gives the plain box. TURNED text (any angle) gives `rot` (degrees clockwise on screen) and a box in the text's OWN frame: x runs along the
 * baseline (distance from the origin of the page measured along the text direction), `baseline` across it; `unturnRun` below converts that to the unturned
 * box once the pieces of a line are joined.
 */
export function runFromItem(g: Geom, transform: number[], width: number): RunBox | null {
  const t = multiply(userToPageMatrix(g), transform as Matrix)
  const [a, b, c, d, e, f] = t
  const size = Math.hypot(a, b)
  if (!(size > 0.5)) return null
  if (Math.abs(b) <= size * 0.02 && a > 0 && Math.abs(d) >= size * 0.5) {
    // the page matrix is a pure rotation + shift, so lengths are unchanged: item.width is already in page points
    return { x: e, y: f - size * 0.95, w: width, h: size * 1.25, baseline: f, size }
  }
  // turned: a pure turn (the page matrix flips y, so a text turned by th has c = b and d = -a); anything else is mirrored or skewed
  if (Math.hypot(c - b, d + a) > size * 0.06) return null
  const rot = normAngle((Math.atan2(b, a) * 180) / Math.PI)
  const th = (rot * Math.PI) / 180, co = Math.cos(th), si = Math.sin(th)
  const u = e * co + f * si, v = -e * si + f * co // origin of the item along / across the text direction
  return { x: u, y: v - size * 0.95, w: width, h: size * 1.25, baseline: v, size, rot }
}
/** a box in the text's own frame (see runFromItem) → the unturned box that `rot` turns about its top-left corner, in page space */
export function unturnRun(b: RunBox): RunBox {
  const rot = b.rot ?? 0
  if (!rot) return b
  const th = (rot * Math.PI) / 180, co = Math.cos(th), si = Math.sin(th)
  // the top-left corner of the box in the own frame, then back to page space
  const x = b.x * co - b.y * si, y = b.x * si + b.y * co
  return { x, y, w: b.w, h: b.h, baseline: y + (b.baseline - b.y), size: b.size, rot }
}

/** a move on screen (dx right, dy down) as a move in page space, for a page shown turned clockwise by `turn` */
export function screenToPageDelta(turn: Turn, dx: number, dy: number): Point {
  return turn === 0 ? [dx, dy] : turn === 90 ? [dy, -dx] : turn === 180 ? [-dx, -dy] : [-dy, dx]
}
