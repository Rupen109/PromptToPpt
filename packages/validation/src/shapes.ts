/**
 * The shape library of the editor's Shapes menu. Every shape is ONE outline in a 100×100 box, written with absolute M / L / C / Q / Z commands only, so the same data
 * draws the canvas (inline SVG), the menu previews, and the PowerPoint export (the outline is flattened to points). The six original shapes (rect, ellipse, line,
 * ring, triangle, chevron) keep their own drawing code and are not listed here.
 */
export type ShapeGroup = 'basic' | 'arrows' | 'symbols' | 'callouts'
export interface ShapeDef { id: string; label: string; group: ShapeGroup; path: string; /** keeps the 1:1 ratio when drawn from the menu */ square?: boolean }

const f = (n: number) => Math.round(n * 100) / 100
const poly = (pts: [number, number][]) => `M ${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L ')} Z`
/** regular polygon with n corners, first corner at the top */
const regular = (n: number, rot = -90): string => poly(Array.from({ length: n }, (_, i) => { const a = ((rot + (360 / n) * i) * Math.PI) / 180; return [50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)] as [number, number] }))
const star = (n: number, inner: number): string => poly(Array.from({ length: n * 2 }, (_, i) => { const a = ((-90 + (180 / n) * i) * Math.PI) / 180; const r = i % 2 ? 50 * inner : 50; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)] as [number, number] }))
const bubble = (tail: string) => tail

export const SHAPE_LIBRARY: readonly ShapeDef[] = [
  // basic
  { id: 'roundRect', label: 'Rounded rectangle', group: 'basic', path: 'M 14 0 L 86 0 Q 100 0 100 14 L 100 86 Q 100 100 86 100 L 14 100 Q 0 100 0 86 L 0 14 Q 0 0 14 0 Z' },
  { id: 'snipRect', label: 'Snipped rectangle', group: 'basic', path: poly([[14, 0], [86, 0], [100, 14], [100, 100], [0, 100], [0, 14]]) },
  { id: 'rightTriangle', label: 'Right triangle', group: 'basic', path: poly([[0, 0], [100, 100], [0, 100]]) },
  { id: 'diamond', label: 'Diamond', group: 'basic', path: poly([[50, 0], [100, 50], [50, 100], [0, 50]]) },
  { id: 'parallelogram', label: 'Parallelogram', group: 'basic', path: poly([[25, 0], [100, 0], [75, 100], [0, 100]]) },
  { id: 'trapezoid', label: 'Trapezoid', group: 'basic', path: poly([[20, 0], [80, 0], [100, 100], [0, 100]]) },
  { id: 'pentagon', label: 'Pentagon', group: 'basic', path: regular(5), square: true },
  { id: 'hexagon', label: 'Hexagon', group: 'basic', path: poly([[25, 3], [75, 3], [100, 50], [75, 97], [25, 97], [0, 50]]) },
  { id: 'heptagon', label: 'Heptagon', group: 'basic', path: regular(7), square: true },
  { id: 'octagon', label: 'Octagon', group: 'basic', path: poly([[30, 0], [70, 0], [100, 30], [100, 70], [70, 100], [30, 100], [0, 70], [0, 30]]) },
  { id: 'decagon', label: 'Decagon', group: 'basic', path: regular(10), square: true },
  { id: 'semicircle', label: 'Half circle', group: 'basic', path: 'M 0 100 C 0 45 22 0 50 0 C 78 0 100 45 100 100 Z' },
  { id: 'arc', label: 'Quarter circle', group: 'basic', path: 'M 0 100 L 0 0 C 55 0 100 45 100 100 Z' },
  { id: 'teardrop', label: 'Teardrop', group: 'basic', path: 'M 50 0 C 50 0 100 45 100 65 C 100 85 78 100 50 100 C 22 100 0 85 0 65 C 0 45 50 0 50 0 Z' },
  { id: 'frame', label: 'Frame', group: 'basic', path: 'M 0 0 L 100 0 L 100 100 L 0 100 Z M 14 14 L 14 86 L 86 86 L 86 14 Z' },
  { id: 'cross', label: 'Cross', group: 'basic', path: poly([[35, 0], [65, 0], [65, 35], [100, 35], [100, 65], [65, 65], [65, 100], [35, 100], [35, 65], [0, 65], [0, 35], [35, 35]]), square: true },
  // symbols
  { id: 'plus', label: 'Plus', group: 'symbols', path: poly([[38, 0], [62, 0], [62, 38], [100, 38], [100, 62], [62, 62], [62, 100], [38, 100], [38, 62], [0, 62], [0, 38], [38, 38]]), square: true },
  { id: 'minus', label: 'Minus', group: 'symbols', path: poly([[0, 38], [100, 38], [100, 62], [0, 62]]) },
  { id: 'multiply', label: 'Multiply (x)', group: 'symbols', path: poly([[20, 0], [50, 30], [80, 0], [100, 20], [70, 50], [100, 80], [80, 100], [50, 70], [20, 100], [0, 80], [30, 50], [0, 20]]), square: true },
  { id: 'divide', label: 'Divide', group: 'symbols', path: 'M 0 42 L 100 42 L 100 58 L 0 58 Z M 50 4 C 61 4 68 11 68 21 C 68 31 61 38 50 38 C 39 38 32 31 32 21 C 32 11 39 4 50 4 Z M 50 62 C 61 62 68 69 68 79 C 68 89 61 96 50 96 C 39 96 32 89 32 79 C 32 69 39 62 50 62 Z', square: true },
  { id: 'equals', label: 'Equals', group: 'symbols', path: 'M 0 20 L 100 20 L 100 40 L 0 40 Z M 0 60 L 100 60 L 100 80 L 0 80 Z', square: true },
  { id: 'check', label: 'Check mark', group: 'symbols', path: poly([[0, 55], [14, 41], [38, 65], [86, 12], [100, 26], [38, 94]]), square: true },
  { id: 'heart', label: 'Heart', group: 'symbols', path: 'M 50 95 C 10 62 0 42 0 27 C 0 11 12 2 26 2 C 38 2 46 9 50 18 C 54 9 62 2 74 2 C 88 2 100 11 100 27 C 100 42 90 62 50 95 Z', square: true },
  { id: 'star4', label: '4-point star', group: 'symbols', path: star(4, 0.38), square: true },
  { id: 'star5', label: 'Star', group: 'symbols', path: star(5, 0.4), square: true },
  { id: 'star6', label: '6-point star', group: 'symbols', path: star(6, 0.55), square: true },
  { id: 'star8', label: '8-point star', group: 'symbols', path: star(8, 0.7), square: true },
  { id: 'burst', label: 'Burst', group: 'symbols', path: star(12, 0.78), square: true },
  { id: 'lightning', label: 'Lightning', group: 'symbols', path: poly([[60, 0], [15, 55], [45, 55], [35, 100], [85, 40], [55, 40]]), square: true },
  { id: 'moon', label: 'Moon', group: 'symbols', path: 'M 62 0 C 30 6 8 28 8 52 C 8 78 30 98 62 100 C 44 90 36 72 36 50 C 36 28 44 10 62 0 Z' },
  { id: 'cloud', label: 'Cloud', group: 'symbols', path: 'M 25 85 C 8 85 0 72 5 60 C 8 50 18 46 26 48 C 24 32 38 20 52 24 C 60 10 84 14 86 34 C 100 34 106 52 98 64 C 94 76 84 85 72 85 Z' },
  // arrows
  { id: 'arrowRight', label: 'Arrow right', group: 'arrows', path: poly([[0, 30], [60, 30], [60, 0], [100, 50], [60, 100], [60, 70], [0, 70]]) },
  { id: 'arrowLeft', label: 'Arrow left', group: 'arrows', path: poly([[100, 30], [40, 30], [40, 0], [0, 50], [40, 100], [40, 70], [100, 70]]) },
  { id: 'arrowUp', label: 'Arrow up', group: 'arrows', path: poly([[30, 100], [30, 40], [0, 40], [50, 0], [100, 40], [70, 40], [70, 100]]) },
  { id: 'arrowDown', label: 'Arrow down', group: 'arrows', path: poly([[30, 0], [30, 60], [0, 60], [50, 100], [100, 60], [70, 60], [70, 0]]) },
  { id: 'arrowBoth', label: 'Double arrow', group: 'arrows', path: poly([[0, 50], [25, 15], [25, 35], [75, 35], [75, 15], [100, 50], [75, 85], [75, 65], [25, 65], [25, 85]]) },
  { id: 'arrowUpDown', label: 'Up-down arrow', group: 'arrows', path: poly([[50, 0], [85, 25], [65, 25], [65, 75], [85, 75], [50, 100], [15, 75], [35, 75], [35, 25], [15, 25]]) },
  { id: 'pentagonArrow', label: 'Pentagon arrow', group: 'arrows', path: poly([[0, 0], [72, 0], [100, 50], [72, 100], [0, 100]]) },
  { id: 'notchedArrow', label: 'Notched arrow', group: 'arrows', path: poly([[0, 20], [60, 20], [60, 0], [100, 50], [60, 100], [60, 80], [0, 80], [14, 50]]) },
  { id: 'arrowUturn', label: 'U-turn arrow', group: 'arrows', path: 'M 0 100 L 0 40 C 0 14 18 0 40 0 C 62 0 80 14 80 40 L 100 40 L 66 78 L 32 40 L 52 40 C 52 32 48 28 40 28 C 32 28 28 32 28 40 L 28 100 Z' },
  { id: 'arrowCurved', label: 'Curved arrow', group: 'arrows', path: 'M 0 100 C 0 45 30 20 70 20 L 70 0 L 100 34 L 70 68 L 70 48 C 40 48 24 62 24 100 Z' },
  // callouts
  { id: 'speech', label: 'Speech bubble', group: 'callouts', path: bubble('M 8 0 L 92 0 Q 100 0 100 8 L 100 62 Q 100 70 92 70 L 40 70 L 18 100 L 24 70 L 8 70 Q 0 70 0 62 L 0 8 Q 0 0 8 0 Z') },
  { id: 'speechRound', label: 'Round bubble', group: 'callouts', path: 'M 50 0 C 78 0 100 16 100 38 C 100 60 78 76 50 76 C 44 76 38 75 33 74 L 12 96 L 18 68 C 6 60 0 50 0 38 C 0 16 22 0 50 0 Z' },
  { id: 'speechRight', label: 'Bubble (tail right)', group: 'callouts', path: 'M 8 0 L 92 0 Q 100 0 100 8 L 100 62 Q 100 70 92 70 L 80 70 L 82 100 L 60 70 L 8 70 Q 0 70 0 62 L 0 8 Q 0 0 8 0 Z' },
  { id: 'thought', label: 'Thought bubble', group: 'callouts', path: 'M 30 0 C 44 -6 60 0 66 8 C 80 0 100 10 100 28 C 100 42 92 52 80 54 C 76 66 60 72 46 66 C 38 72 24 70 20 62 C 6 62 0 46 6 36 C -2 24 8 6 30 0 Z M 14 80 C 20 80 24 84 24 88 C 24 92 20 96 14 96 C 8 96 4 92 4 88 C 4 84 8 80 14 80 Z' },
  { id: 'ribbon', label: 'Banner', group: 'callouts', path: poly([[0, 20], [14, 20], [14, 0], [86, 0], [86, 20], [100, 20], [88, 50], [100, 80], [86, 80], [86, 100], [14, 100], [14, 80], [0, 80], [12, 50]]) },
  { id: 'tag', label: 'Tag', group: 'callouts', path: poly([[0, 0], [70, 0], [100, 50], [70, 100], [0, 100]]) },
  { id: 'badge', label: 'Badge', group: 'callouts', path: star(16, 0.86), square: true },
] as const

export const SHAPE_GROUP_LABEL: Record<ShapeGroup, string> = { basic: 'Common shapes', symbols: 'Symbols', arrows: 'Arrows', callouts: 'Callouts and banners' }

export const SHAPE_PATH_IDS = SHAPE_LIBRARY.map((s) => s.id) as [string, ...string[]]
const byId = new Map(SHAPE_LIBRARY.map((s) => [s.id, s]))
export const shapeDef = (id: string): ShapeDef | undefined => byId.get(id)

/** The outline flattened into polygons (one per sub-path), in the 0–100 box: curves are sampled, so PowerPoint receives a faithful free-form shape. */
export function flattenShape(path: string, steps = 12): [number, number][][] {
  const tok = path.match(/[MLCQZ]|-?\d+(?:\.\d+)?/g) ?? []
  const out: [number, number][][] = []
  let cur: [number, number][] = []
  let i = 0
  let at: [number, number] = [0, 0]
  const num = () => Number(tok[i++])
  while (i < tok.length) {
    const c = tok[i++]!
    if (c === 'M') { if (cur.length) out.push(cur); at = [num(), num()]; cur = [at] }
    else if (c === 'L') { at = [num(), num()]; cur.push(at) }
    else if (c === 'Q') {
      const [cx, cy, x, y] = [num(), num(), num(), num()]
      const [x0, y0] = at
      for (let s = 1; s <= steps; s++) { const t = s / steps, u = 1 - t; cur.push([u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y]) }
      at = [x, y]
    } else if (c === 'C') {
      const [c1x, c1y, c2x, c2y, x, y] = [num(), num(), num(), num(), num(), num()]
      const [x0, y0] = at
      for (let s = 1; s <= steps; s++) { const t = s / steps, u = 1 - t; cur.push([u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x, u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y]) }
      at = [x, y]
    } else if (c === 'Z') { if (cur.length) { out.push(cur); cur = [] } }
  }
  if (cur.length) out.push(cur)
  return out
}
