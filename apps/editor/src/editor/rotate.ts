import type { Draft } from 'immer'
import { canFlip, canRotate, normAngle, visualBox, type Presentation } from '@prompttoppt/validation'
import { resizeBox, type Box, type Handle } from './commands'

/**
 * The geometry of turning objects on the canvas (pure, no store): the rotate handle, resizing an object that is turned, and the resize cursors of its handles.
 * The stored angle is clockwise in degrees, around the object's centre (the same as the slide, Present and the PowerPoint file draw it).
 */

/** The angle the handle sits at for a pointer at (px, py), for an object centred at (cx, cy). The handle is BELOW the object, so pointing straight down is 0°. */
export function handleAngle(cx: number, cy: number, px: number, py: number): number {
  return normAngle((Math.atan2(py - cy, px - cx) * 180) / Math.PI - 90)
}

/**
 * Where a dragged angle lands. With Shift: steps of 15°. Without: free, but it clicks onto straight, a quarter turn and a half turn (every 45°) when it comes within 3°,
 * so getting an object upright again never takes a steady hand.
 */
export function snapAngle(deg: number, steps: boolean): number {
  if (steps) return normAngle(Math.round(deg / 15) * 15)
  const near = Math.round(deg / 45) * 45
  return normAngle(Math.abs(deg - near) <= 3 ? near : Math.round(deg))
}

/**
 * Resizing an object that is turned: the pointer moved (dx, dy) on the slide; the handle moves along the object's OWN sides, and the opposite side stays where it is
 * on the slide (as in PowerPoint). The box returned is the stored (unturned) box.
 */
export function resizeTurned(b: Box, rotation: number, handle: Handle, dx: number, dy: number, min = 24): Box {
  if (!rotation) return resizeBox(b, handle, dx, dy, min)
  const t = (rotation * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t)
  // the pointer's move in the object's own directions
  const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos
  const nb = resizeBox({ x: 0, y: 0, width: b.width, height: b.height }, handle, lx, ly, min)
  // how far the centre moved, in the object's directions, then on the slide
  const mx = nb.x + nb.width / 2 - b.width / 2, my = nb.y + nb.height / 2 - b.height / 2
  const cx = b.x + b.width / 2 + mx * cos - my * sin, cy = b.y + b.height / 2 + mx * sin + my * cos
  return { x: cx - nb.width / 2, y: cy - nb.height / 2, width: nb.width, height: nb.height }
}

const HANDLE_DEG: Record<Handle, number> = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 }
const CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'] as const
/** The resize cursor of a handle on a turned object: the arrow points the way the handle really moves. */
export function handleCursor(h: Handle, rotation = 0): string {
  const a = (((HANDLE_DEG[h] + rotation) % 180) + 180) % 180
  return CURSORS[Math.round(a / 45) % 4]!
}

/** The centre of a box. */
export const centreOf = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })

/** A point turned by `deg` around a centre. */
export function turnPoint(p: { x: number; y: number }, c: { x: number; y: number }, deg: number) {
  const t = (deg * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t)
  const dx = p.x - c.x, dy = p.y - c.y
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
}

type D = Draft<Presentation>
/**
 * Turns objects: to an angle (`to`) or by an angle (`by`). `together` (a whole group): the objects turn as ONE piece around the middle of all of them, each keeping its place
 * in the piece; otherwise each turns around its own centre. Locked objects, charts and tables are never turned (and a group holding one is not turned at all, so it never
 * comes apart). Returns how many objects changed (0 = nothing recorded).
 */
export function rotateElements(d: D, slideId: string, ids: string[], how: { to: number } | { by: number }, together = false): number {
  const s = d.slides.find((x) => x.id === slideId)
  if (!s || s.locked) return 0
  const els = s.elements.filter((e) => ids.includes(e.id))
  if (!els.length) return 0
  if (together && els.some((e) => e.locked || !canRotate(e))) return 0
  const turnable = els.filter((e) => !e.locked && canRotate(e))
  let n = 0
  if (together && 'by' in how) {
    const all = turnable.map((e) => visualBox(e, e.rotation)) // the middle of what is SEEN, so a quarter turn and back lands exactly where it was
    const x0 = Math.min(...all.map((b) => b.x)), y0 = Math.min(...all.map((b) => b.y))
    const mid = { x: (x0 + Math.max(...all.map((b) => b.x + b.width))) / 2, y: (y0 + Math.max(...all.map((b) => b.y + b.height))) / 2 }
    for (const e of turnable) {
      const c = turnPoint(centreOf(e), mid, how.by)
      const r = normAngle((e.rotation ?? 0) + how.by)
      const x = Math.round(c.x - e.width / 2), y = Math.round(c.y - e.height / 2)
      if (x === e.x && y === e.y && r === normAngle(e.rotation ?? 0)) continue
      e.x = x; e.y = y; e.rotation = r; n++
    }
  } else {
    for (const e of turnable) {
      const r = normAngle('to' in how ? how.to : (e.rotation ?? 0) + how.by)
      if (r === normAngle(e.rotation ?? 0)) continue
      e.rotation = r; n++
    }
  }
  if (n) s.manual = true
  return n
}

/**
 * Mirrors objects left-right (`h`) or upside down (`v`), as SEEN on the slide (PowerPoint's Flip): a turned object's angle reverses too (a box turned 30° mirrors to -30°).
 * Pictures and shapes only (`canFlip`): a text box would mirror its words, and charts and tables cannot be mirrored in PowerPoint. `together` (a whole group): the group
 * mirrors as one piece around its middle, so its members swap sides; its pictures and shapes mirror, its words only move and stay readable. Locked objects never change
 * (a group holding one is not flipped at all). Returns how many objects changed.
 */
export function flipElements(d: D, slideId: string, ids: string[], axis: 'h' | 'v', together = false): number {
  const s = d.slides.find((x) => x.id === slideId)
  if (!s || s.locked) return 0
  const els = s.elements.filter((e) => ids.includes(e.id))
  if (!els.length) return 0
  if (together && els.some((e) => e.locked)) return 0
  const key = axis === 'h' ? 'flipH' : 'flipV'
  const mirrorTurn = (e: (typeof els)[number]) => { if (canRotate(e) && normAngle(e.rotation ?? 0)) e.rotation = normAngle(-(e.rotation ?? 0)) }
  let n = 0
  if (together) {
    const all = els.map((e) => visualBox(e, e.rotation))
    const x0 = Math.min(...all.map((b) => b.x)), x1 = Math.max(...all.map((b) => b.x + b.width))
    const y0 = Math.min(...all.map((b) => b.y)), y1 = Math.max(...all.map((b) => b.y + b.height))
    for (const e of els) {
      const c = centreOf(e)
      if (axis === 'h') e.x = Math.round(x0 + x1 - c.x - e.width / 2); else e.y = Math.round(y0 + y1 - c.y - e.height / 2)
      mirrorTurn(e)
      if (canFlip(e)) { if (e[key]) delete e[key]; else e[key] = true }
      n++
    }
  } else {
    for (const e of els) {
      if (e.locked || !canFlip(e)) continue
      mirrorTurn(e)
      if (e[key]) delete e[key]; else e[key] = true
      n++
    }
  }
  if (n) s.manual = true
  return n
}
