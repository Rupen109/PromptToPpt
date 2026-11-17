import { kid, num, type XNode } from './xml.ts'

/** 2D affine maps (EMU space -> canvas px), group transforms composed innermost-last, and how an element's own box ends up on the canvas. */
export interface Aff { a: number; b: number; c: number; d: number; e: number; f: number }
export const IDENT: Aff = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
/** the map that applies `n` first, then `m` */
export const mul = (m: Aff, n: Aff): Aff => ({ a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b, c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d, e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f })
export const apply = (m: Aff, x: number, y: number): [number, number] => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]
const T = (x: number, y: number): Aff => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y })
const S = (x: number, y: number): Aff => ({ a: x, b: 0, c: 0, d: y, e: 0, f: 0 })
const R = (deg: number): Aff => { const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t); return { a: c, b: s, c: -s, d: c, e: 0, f: 0 } }

export interface Xfrm { x: number; y: number; w: number; h: number; rot: number; flipH: boolean; flipV: boolean; chX: number; chY: number; chW: number; chH: number }
export function readXfrm(xf: XNode | undefined): Xfrm | null {
  const off = kid(xf, 'off'), ext = kid(xf, 'ext')
  if (!xf || !off || !ext) return null
  const x = num(off.a['x']), y = num(off.a['y']), w = num(ext.a['cx']), h = num(ext.a['cy'])
  const choff = kid(xf, 'chOff'), chext = kid(xf, 'chExt')
  return { x, y, w, h, rot: num(xf.a['rot']) / 60000, flipH: xf.a['flipH'] === '1' || xf.a['flipH'] === 'true', flipV: xf.a['flipV'] === '1' || xf.a['flipV'] === 'true', chX: num(choff?.a['x'], x), chY: num(choff?.a['y'], y), chW: num(chext?.a['cx'], w), chH: num(chext?.a['cy'], h) }
}

/** child space -> parent space for a group (flip and rotation are about the group's own centre; the child space is scaled to the group's extent) */
export function groupMap(g: Xfrm): Aff {
  const sx = g.chW ? g.w / g.chW : 1, sy = g.chH ? g.h / g.chH : 1
  let m = mul(S(sx, sy), T(-g.chX, -g.chY)) // child space -> group box space (0..w, 0..h)
  m = mul(T(-g.w / 2, -g.h / 2), m)
  m = mul(S(g.flipH ? -1 : 1, g.flipV ? -1 : 1), m)
  m = mul(R(g.rot), m)
  return mul(T(g.x + g.w / 2, g.y + g.h / 2), m)
}

export interface Placed { cx: number; cy: number; w: number; h: number; rot: number; flipH: boolean; flipV: boolean }
const norm360 = (d: number) => { const r = ((d % 360) + 360) % 360; return Math.round(r * 100) / 100 }
/** Where a box (in the space `m` maps from) lands: centre, size, total rotation, and the flips left over once the mirror part of `m` is folded in. */
export function place(m: Aff, x: Xfrm): Placed {
  const [cx, cy] = apply(m, x.x + x.w / 2, x.y + x.h / 2)
  const sx = Math.hypot(m.a, m.b), sy = Math.hypot(m.c, m.d)
  const mirror = m.a * m.d - m.b * m.c < 0
  const theta = ((mirror ? Math.atan2(-m.b, -m.a) : Math.atan2(m.b, m.a)) * 180) / Math.PI
  return { cx, cy, w: x.w * sx, h: x.h * sy, rot: norm360(mirror ? theta - x.rot : theta + x.rot), flipH: mirror ? !x.flipH : x.flipH, flipV: x.flipV }
}
