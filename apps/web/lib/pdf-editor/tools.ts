/** Tool names, the style each tool starts with, and building new items from a drag. Pure. */
import { MIN_SIZE, uid, type Anno, type Family, type Box, type PathAnno, type ShapeAnno } from './model'

export type Tool = 'editText' | 'text' | 'whiteout' | 'highlight' | 'draw' | 'rect' | 'ellipse' | 'line' | 'arrow'
export interface Defaults {
  text: { fam: Family; size: number; bold: boolean; italic: boolean; color: string }
  pen: { color: string; width: number }
  shape: { stroke: string; width: number; fill: string | null }
  highlight: { color: string }
  whiteout: { color: string }
}
export const DEFAULTS: Defaults = {
  text: { fam: 'sans', size: 14, bold: false, italic: false, color: '#000000' },
  pen: { color: '#1d4ed8', width: 2 },
  shape: { stroke: '#dc2626', width: 2, fill: null },
  highlight: { color: '#ffeb3b' },
  whiteout: { color: '#ffffff' },
}
export const HIGHLIGHT_COLORS = ['#ffeb3b', '#a3e635', '#f9a8d4', '#7dd3fc', '#fdba74']

export const TOOL_HINT: Record<Tool, string> = {
  editText: 'Click text or a picture to edit it, as often as you like. Drag to move, use the handles to resize.',
  text: 'Click where the text should go, then type.',
  whiteout: 'Drag a rectangle to cover something with a solid colour (white by default).',
  highlight: 'Drag over text to highlight it.',
  draw: 'Draw with your mouse, finger or pen. Press Escape, or pick Edit text, when you are done.',
  rect: 'Drag to draw a rectangle.',
  ellipse: 'Drag to draw an ellipse.',
  line: 'Drag to draw a line.',
  arrow: 'Drag to draw an arrow. It points where you let go.',
}

export const boxFrom = (a: [number, number], b: [number, number], pw: number, ph: number): Box => {
  const cl = (v: number, m: number) => Math.min(Math.max(v, 0), m)
  const x0 = cl(a[0], pw), y0 = cl(a[1], ph), x1 = cl(b[0], pw), y1 = cl(b[1], ph)
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }
}

/** points (page space) → a path item whose points are stored 0..1 inside its own box */
export function pathFrom(pts: [number, number][], variant: PathAnno['variant'], style: { color: string; width: number }, id = uid()): PathAnno {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const x = Math.min(...xs), y = Math.min(...ys)
  const w = Math.max(Math.max(...xs) - x, MIN_SIZE / 4), h = Math.max(Math.max(...ys) - y, MIN_SIZE / 4)
  return { id, kind: 'path', variant, x, y, w, h, points: pts.map(([px, py]) => [(px - x) / w, (py - y) / h] as [number, number]), color: style.color, width: style.width }
}

/** the item a drag from `start` to `cur` makes with this tool (null for tools that do not drag out a box) */
export function dragItem(tool: Tool, d: Defaults, start: [number, number], cur: [number, number], pw: number, ph: number, id: string): Anno | null {
  switch (tool) {
    case 'whiteout': return { id, kind: 'whiteout', color: d.whiteout.color, ...boxFrom(start, cur, pw, ph) }
    case 'highlight': return { id, kind: 'highlight', color: d.highlight.color, ...boxFrom(start, cur, pw, ph) }
    case 'rect':
    case 'ellipse': return { id, kind: 'shape', shape: tool, stroke: d.shape.stroke, width: d.shape.width, fill: d.shape.fill, ...boxFrom(start, cur, pw, ph) } satisfies ShapeAnno
    case 'line':
    case 'arrow': {
      const cl = (v: number, m: number) => Math.min(Math.max(v, 0), m)
      return pathFrom([[cl(start[0], pw), cl(start[1], ph)], [cl(cur[0], pw), cl(cur[1], ph)]], tool, { color: d.shape.stroke, width: d.shape.width }, id)
    }
    default: return null
  }
}
