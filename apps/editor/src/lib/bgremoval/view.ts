/**
 * Where the picture sits in the view and how gestures move it. Pure maths (no DOM) so the brush position at every zoom level, zoom about a point, pinch and pan are unit-tested.
 * All positions here are in the canvas's own pixels; `canvasPoint` converts from the page.
 */
/** A picture pixel (x, y) is at (x * scale + ox, y * scale + oy) in the canvas's own pixels. */
export interface View { scale: number; ox: number; oy: number }
export interface Pt { x: number; y: number }

/** The scale and offset that fit the whole picture in a view with some breathing room. */
export function fitView(iw: number, ih: number, cw: number, ch: number, pad = 24): View {
  const scale = Math.max(0.01, Math.min((cw - pad * 2) / iw, (ch - pad * 2) / ih))
  return { scale, ox: (cw - iw * scale) / 2, oy: (ch - ih * scale) / 2 }
}

/** A page position (clientX/Y) in the canvas's own pixels. Uses the real ratio of the canvas's pixels to its size on the page (not a device pixel ratio guess), so it is exact at any zoom, DPR or rounding. */
export function canvasPoint(rect: { left: number; top: number; width: number; height: number }, canvasW: number, canvasH: number, clientX: number, clientY: number): Pt {
  return { x: ((clientX - rect.left) * canvasW) / (rect.width || 1), y: ((clientY - rect.top) * canvasH) / (rect.height || 1) }
}

/** The picture pixel under a canvas position. */
export const toImage = (v: View, p: Pt): Pt => ({ x: (p.x - v.ox) / v.scale, y: (p.y - v.oy) / v.scale })

export interface ZoomLimits { min: number; max: number }

/** Zoom by `factor` keeping the picture point under (cx, cy) where it is. */
export function zoomAbout(v: View, factor: number, cx: number, cy: number, lim: ZoomLimits): View {
  const next = Math.min(lim.max, Math.max(lim.min, v.scale * factor))
  const k = next / v.scale
  return { scale: next, ox: cx - (cx - v.ox) * k, oy: cy - (cy - v.oy) * k }
}

/**
 * Two fingers moved from (a0, b0) to (a1, b1): zoom by the change of distance and move by the change of midpoint, so the picture point that was under the fingers' midpoint is under
 * the new midpoint. This one rule is pinch zoom and two-finger pan together.
 */
export function pinchView(v: View, a0: Pt, b0: Pt, a1: Pt, b1: Pt, lim: ZoomLimits): View {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y), d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y)
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 }
  const anchor = toImage(v, m0)
  const scale = Math.min(lim.max, Math.max(lim.min, d0 > 1 ? v.scale * (d1 / d0) : v.scale))
  return { scale, ox: m1.x - anchor.x * scale, oy: m1.y - anchor.y * scale }
}

/**
 * What a mouse wheel event means. Ctrl/Cmd + wheel (and a trackpad pinch, which browsers send as ctrl + wheel) always zooms. A plain wheel zooms when it is a notched mouse wheel and
 * the person chose "wheel zooms"; a trackpad's smooth two-finger scroll (small, fractional, often sideways) pans.
 */
export function wheelAction(e: { ctrlKey: boolean; metaKey: boolean; deltaX: number; deltaY: number; deltaMode: number }, wheelZooms: boolean): 'zoom' | 'pan' {
  if (e.ctrlKey || e.metaKey) return 'zoom'
  if (!wheelZooms) return 'pan'
  const notched = e.deltaMode !== 0 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40)
  return notched ? 'zoom' : 'pan'
}

/** Zoom factor of one wheel event (normalised for line/page deltas). */
export function wheelFactor(e: { deltaY: number; deltaMode: number; ctrlKey: boolean }): number {
  const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY
  return Math.exp(-px * (e.ctrlKey ? 0.01 : 0.0025)) // a trackpad pinch sends small ctrl+wheel steps
}
