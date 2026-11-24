/**
 * Turning objects: ONE rule for the editor (handle, Arrange menu, keys), the assistant and the PowerPoint file.
 * Charts and tables are never turned: PowerPoint cannot turn them either, so a turned chart would look different in the download than on screen.
 */
export const canRotate = (el: { type: string }) => el.type !== 'chart' && el.type !== 'table'

/** An angle as it is stored: in (-180, 180], to a tenth of a degree (so 270 is -90 and 360 is 0, whichever way it was turned). */
export function normAngle(deg: number): number {
  const a = ((Math.round(deg * 10) / 10) % 360 + 360) % 360
  const r = a > 180 ? a - 360 : a
  return Math.round(r * 10) / 10 || 0 // (no -0)
}

type Box = { x: number; y: number; width: number; height: number }

/** The upright box a turned object takes on the slide (what it looks like it fills): for lining things up and for keeping toolbars clear of it. */
export function visualBox(b: Box, rotation = 0): Box {
  if (!rotation) return { x: b.x, y: b.y, width: b.width, height: b.height }
  const t = (rotation * Math.PI) / 180
  const c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t))
  const w = b.width * c + b.height * s, h = b.width * s + b.height * c
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h }
}

/** The angle an object is DRAWN at: its own, except for charts and tables (an old deck may hold an angle on one; it is drawn and exported upright, the same everywhere). */
export const turnOf = (el: { type: string; rotation?: number | undefined }) => (canRotate(el) ? el.rotation ?? 0 : 0)

/**
 * Mirroring: pictures and shapes only. A text box would mirror its words, and charts and tables cannot be mirrored in PowerPoint (the download would differ), so those never are.
 * A flip happens INSIDE the object's own box, before it is turned (PowerPoint's order), so the box, its handles and its place never change.
 */
export const canFlip = (el: { type: string }) => el.type === 'image' || el.type === 'shape'
/** how an object is mirrored when drawn (nothing for the kinds that cannot be) */
export const flipOf = (el: { type: string; flipH?: boolean | undefined; flipV?: boolean | undefined }) => (canFlip(el) ? { h: !!el.flipH, v: !!el.flipV } : { h: false, v: false })

/**
 * The CSS transform an object is drawn with: its turn and its mirroring (or nothing). `full` always writes both parts, for animations that go from one to the other
 * (a Morph between a picture and its mirror image passes through its edge, as PowerPoint's does).
 */
export function transformOf(el: { type: string; rotation?: number | undefined; flipH?: boolean | undefined; flipV?: boolean | undefined }, full = false): string | undefined {
  const r = turnOf(el), f = flipOf(el)
  if (full) return `rotate(${r}deg) scale(${f.h ? -1 : 1}, ${f.v ? -1 : 1})`
  const parts = [r ? `rotate(${r}deg)` : '', f.h || f.v ? `scale(${f.h ? -1 : 1}, ${f.v ? -1 : 1})` : ''].filter(Boolean)
  return parts.length ? parts.join(' ') : undefined
}
