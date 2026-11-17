import { SHAPE_PATH_IDS } from '@prompttoppt/validation'
import { kid, kids, num, type XNode } from './xml.ts'

/** OOXML preset geometry -> what the editor's shape model can draw. Sizes are canvas px; polygon points are fractions of the box. */
export type Pt = [number, number]
export type Geo =
  | { kind: 'basic'; shape: 'rect' | 'ellipse'; radius?: number }
  | { kind: 'triangle' }
  | { kind: 'ring'; width: number }
  | { kind: 'path'; id: string }
  | { kind: 'poly'; points: Pt[] }
  | { kind: 'line' }
  | { kind: 'none'; reason: string }
  | { kind: 'rect-fallback'; reason: string }

const PATH_IDS = new Set<string>(SHAPE_PATH_IDS)
const r3 = (n: number) => Math.round(n * 1000) / 1000
/** max / min of a long list (a custom outline can have hundreds of thousands of points: spreading them into Math.max would overflow the stack) */
const mx = (a: number[]) => a.reduce((m, v) => (v > m ? v : m), -Infinity)
const mn = (a: number[]) => a.reduce((m, v) => (v < m ? v : m), Infinity)

export function adjustments(geom: XNode | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const gd of kids(kid(geom, 'avLst'), 'gd')) { const m = /^val\s+(-?\d+)/.exec(gd.a['fmla'] ?? ''); if (m && gd.a['name']) out[gd.a['name']] = Number(m[1]) }
  return out
}

const star = (n: number, inner: number): Pt[] => Array.from({ length: n * 2 }, (_, i) => { const a = ((-90 + (180 / n) * i) * Math.PI) / 180; const r = i % 2 ? 0.5 * inner : 0.5; return [r3(0.5 + r * Math.cos(a)), r3(0.5 + r * Math.sin(a))] as Pt })

export function presetGeometry(prst: string, adj: Record<string, number>, w: number, h: number): Geo {
  const ss = Math.min(w, h)
  const a = (k: string, d: number) => (adj[k] ?? d) / 100000
  switch (prst) {
    case 'rect': case 'flowChartProcess': case 'flowChartPredefinedProcess': case 'flowChartAlternateProcess': case 'flowChartInternalStorage': case 'flowChartDocument': case 'flowChartMultidocument': case 'flowChartPunchedCard': case 'bevel': case 'foldedCorner': case 'plaque': case 'can': case 'cube':
      return prst === 'rect' || prst.startsWith('flowChart') ? { kind: 'basic', shape: 'rect' } : { kind: 'rect-fallback', reason: prst }
    case 'roundRect': return { kind: 'basic', shape: 'rect', radius: Math.min(a('adj', 16667), 0.5) * ss }
    case 'round1Rect': case 'round2SameRect': case 'round2DiagRect': return { kind: 'basic', shape: 'rect', radius: Math.min(a('adj1', 16667), 0.5) * ss }
    case 'snip1Rect': case 'snip2SameRect': case 'snip2DiagRect': case 'snipRoundRect': return { kind: 'path', id: 'snipRect' }
    case 'flowChartTerminator': return { kind: 'basic', shape: 'rect', radius: ss / 2 }
    case 'ellipse': case 'flowChartConnector': case 'flowChartSummingJunction': case 'flowChartOr': case 'smileyFace': case 'noSmoking': return { kind: 'basic', shape: 'ellipse' }
    case 'triangle': { const x = a('adj', 50000); return x === 0.5 ? { kind: 'triangle' } : { kind: 'poly', points: [[x, 0], [1, 1], [0, 1]] } }
    case 'rtTriangle': return { kind: 'path', id: 'rightTriangle' }
    case 'diamond': case 'flowChartDecision': return { kind: 'poly', points: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]] }
    case 'parallelogram': case 'flowChartData': { const x = Math.min(0.9, (prst === 'flowChartData' ? 0.2 : (a('adj', 25000) * ss) / w)); return { kind: 'poly', points: [[r3(x), 0], [1, 0], [r3(1 - x), 1], [0, 1]] } }
    case 'trapezoid': case 'flowChartManualOperation': { const x = Math.min(0.49, prst === 'flowChartManualOperation' ? 0.2 : (a('adj', 25000) * ss) / w); return { kind: 'poly', points: [[r3(x), 0], [r3(1 - x), 0], [1, 1], [0, 1]] } }
    case 'pentagon': return { kind: 'path', id: 'pentagon' }
    case 'hexagon': { const x = Math.min(0.49, (a('adj', 25000) * ss) / w); return { kind: 'poly', points: [[r3(x), 0], [r3(1 - x), 0], [1, 0.5], [r3(1 - x), 1], [r3(x), 1], [0, 0.5]] } }
    case 'heptagon': return { kind: 'path', id: 'heptagon' }
    case 'octagon': { const x = Math.min(0.49, (a('adj', 29289) * ss) / w), y = Math.min(0.49, (a('adj', 29289) * ss) / h); return { kind: 'poly', points: [[r3(x), 0], [r3(1 - x), 0], [1, r3(y)], [1, r3(1 - y)], [r3(1 - x), 1], [r3(x), 1], [0, r3(1 - y)], [0, r3(y)]] } }
    case 'decagon': return { kind: 'path', id: 'decagon' }
    case 'chevron': { const x = Math.min(0.95, (a('adj', 50000) * ss) / w); return { kind: 'poly', points: [[0, 0], [r3(1 - x), 0], [1, 0.5], [r3(1 - x), 1], [0, 1], [r3(x), 0.5]] } }
    case 'homePlate': { const x = Math.min(0.95, (a('adj', 50000) * ss) / w); return { kind: 'poly', points: [[0, 0], [r3(1 - x), 0], [1, 0.5], [r3(1 - x), 1], [0, 1]] } }
    case 'rightArrow': case 'leftArrow': {
      const t = Math.min(1, a('adj1', 50000)), hl = Math.min(1, (a('adj2', 50000) * ss) / w), y1 = (1 - t) / 2, y2 = 1 - y1
      const p: Pt[] = [[0, y1], [1 - hl, y1], [1 - hl, 0], [1, 0.5], [1 - hl, 1], [1 - hl, y2], [0, y2]].map(([x, y]) => [r3(x!), r3(y!)] as Pt)
      return { kind: 'poly', points: prst === 'leftArrow' ? p.map(([x, y]) => [r3(1 - x), y] as Pt) : p }
    }
    case 'upArrow': case 'downArrow': {
      const t = Math.min(1, a('adj1', 50000)), hl = Math.min(1, (a('adj2', 50000) * ss) / h), x1 = (1 - t) / 2, x2 = 1 - x1
      const p: Pt[] = [[x1, 1], [x1, hl], [0, hl], [0.5, 0], [1, hl], [x2, hl], [x2, 1]].map(([x, y]) => [r3(x!), r3(y!)] as Pt)
      return { kind: 'poly', points: prst === 'downArrow' ? p.map(([x, y]) => [x, r3(1 - y)] as Pt) : p }
    }
    case 'leftRightArrow': return { kind: 'path', id: 'arrowBoth' }
    case 'upDownArrow': return { kind: 'path', id: 'arrowUpDown' }
    case 'notchedRightArrow': return { kind: 'path', id: 'notchedArrow' }
    case 'uturnArrow': return { kind: 'path', id: 'arrowUturn' }
    case 'curvedRightArrow': case 'curvedLeftArrow': case 'bentArrow': return { kind: 'path', id: 'arrowCurved' }
    case 'plus': case 'mathPlus': case 'cross': { const x = Math.min(0.49, (a('adj', prst === 'mathPlus' ? 23520 : 25000) * ss) / w), y = Math.min(0.49, (a('adj', prst === 'mathPlus' ? 23520 : 25000) * ss) / h); return { kind: 'poly', points: [[x, 0], [1 - x, 0], [1 - x, y], [1, y], [1, 1 - y], [1 - x, 1 - y], [1 - x, 1], [x, 1], [x, 1 - y], [0, 1 - y], [0, y], [x, y]].map(([px, py]) => [r3(px!), r3(py!)] as Pt) } }
    case 'mathMinus': return { kind: 'path', id: 'minus' }
    case 'mathMultiply': return { kind: 'path', id: 'multiply' }
    case 'mathDivide': return { kind: 'path', id: 'divide' }
    case 'mathEqual': return { kind: 'path', id: 'equals' }
    case 'donut': return { kind: 'ring', width: Math.max(1, a('adj', 25000) * ss) }
    case 'heart': return { kind: 'path', id: 'heart' }
    case 'lightningBolt': return { kind: 'path', id: 'lightning' }
    case 'moon': return { kind: 'path', id: 'moon' }
    case 'cloud': return { kind: 'path', id: 'cloud' }
    case 'sun': return { kind: 'path', id: 'star8' }
    case 'star4': return { kind: 'path', id: 'star4' }
    case 'star5': return { kind: 'path', id: 'star5' }
    case 'star6': return { kind: 'path', id: 'star6' }
    case 'star7': return { kind: 'poly', points: star(7, 0.5) }
    case 'star8': return { kind: 'path', id: 'star8' }
    case 'star10': return { kind: 'poly', points: star(10, 0.7) }
    case 'star12': return { kind: 'path', id: 'burst' }
    case 'star16': return { kind: 'poly', points: star(16, 0.8) }
    case 'star24': return { kind: 'poly', points: star(24, 0.85) }
    case 'star32': return { kind: 'poly', points: star(32, 0.9) }
    case 'wedgeRectCallout': case 'wedgeRoundRectCallout': case 'borderCallout1': case 'callout1': return { kind: 'path', id: 'speech' }
    case 'wedgeEllipseCallout': return { kind: 'path', id: 'speechRound' }
    case 'cloudCallout': return { kind: 'path', id: 'thought' }
    case 'ribbon': case 'ribbon2': return { kind: 'path', id: 'ribbon' }
    case 'teardrop': return { kind: 'path', id: 'teardrop' }
    case 'frame': return { kind: 'path', id: 'frame' }
    case 'line': case 'straightConnector1': case 'bentConnector2': case 'bentConnector3': case 'bentConnector4': case 'bentConnector5': case 'curvedConnector2': case 'curvedConnector3': case 'curvedConnector4': case 'curvedConnector5': return { kind: 'line' }
    case 'arc': case 'blockArc': case 'pie': case 'pieWedge': case 'chord': case 'leftBracket': case 'rightBracket': case 'leftBrace': case 'rightBrace': case 'bracketPair': case 'bracePair': return { kind: 'none', reason: prst }
    default: return PATH_IDS.has(prst) ? { kind: 'path', id: prst } : { kind: 'rect-fallback', reason: prst }
  }
}

/** a custom outline (a:custGeom) as the corners of its largest closed sub-path, in fractions of the shape box; null when it cannot be read (guide formulas, no path) */
export interface Custom { points: Pt[]; subpaths: number; /** the outline is round and has a round hole in it: a ring, with this wall thickness as a share of the shape's smaller side */ ring?: number }
export function customGeometry(spPr: XNode | undefined): Custom | null {
  const pathLst = kid(kid(spPr, 'custGeom'), 'pathLst')
  const paths = kids(pathLst, 'path')
  if (!paths.length) return null
  const result: { pts: Pt[]; area: number }[] = []
  for (const path of paths) {
    const W = num(path.a['w']), H = num(path.a['h'])
    const raw: Pt[][] = []
    let cur: Pt[] = [], last: Pt = [0, 0]
    let bad = false
    const flush = () => { if (cur.length >= 3) raw.push(cur); cur = [] }
    const xy = (n: XNode | undefined): Pt | null => {
      if (!n) return null
      const x = Number(n.a['x']), y = Number(n.a['y'])
      if (!Number.isFinite(x) || !Number.isFinite(y)) { bad = true; return null } // a guide-formula name: not handled
      return [x, y]
    }
    for (const c of path.c) {
      if (c.n === 'moveTo') { flush(); const p = xy(kid(c, 'pt')); if (p) { cur = [p]; last = p } }
      else if (c.n === 'lnTo') { const p = xy(kid(c, 'pt')); if (p) { cur.push(p); last = p } }
      else if (c.n === 'cubicBezTo') {
        const ps = kids(c, 'pt').map(xy)
        if (ps.length === 3 && ps.every(Boolean)) { const [p1, p2, p3] = ps as [Pt, Pt, Pt]; for (let s = 1; s <= 8; s++) { const t = s / 8, u = 1 - t; cur.push([u * u * u * last[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * last[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]) } last = p3 }
      } else if (c.n === 'quadBezTo') {
        const ps = kids(c, 'pt').map(xy)
        if (ps.length === 2 && ps.every(Boolean)) { const [p1, p2] = ps as [Pt, Pt]; for (let s = 1; s <= 6; s++) { const t = s / 6, u = 1 - t; cur.push([u * u * last[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * last[1] + 2 * u * t * p1[1] + t * t * p2[1]]) } last = p2 }
      } else if (c.n === 'arcTo') {
        const wR = num(c.a['wR']), hR = num(c.a['hR']), st = (num(c.a['stAng']) / 60000) * (Math.PI / 180), sw = (num(c.a['swAng']) / 60000) * (Math.PI / 180)
        if (wR > 0 && hR > 0 && cur.length) { const cx = last[0] - wR * Math.cos(st), cy = last[1] - hR * Math.sin(st), steps = Math.max(4, Math.ceil(Math.abs(sw) / (Math.PI / 12))); for (let s = 1; s <= steps; s++) { const ang = st + (sw * s) / steps; cur.push([cx + wR * Math.cos(ang), cy + hR * Math.sin(ang)]) } last = cur[cur.length - 1]! }
      } else if (c.n === 'close') flush()
    }
    flush()
    if (bad) return null
    const flat = raw.flat()
    if (!flat.length) continue
    const maxX = W || mx(flat.map((p) => p[0])), maxY = H || mx(flat.map((p) => p[1]))
    if (!maxX || !maxY) continue
    for (const sub of raw) { const pts = sub.map(([x, y]) => [r3(x / maxX), r3(y / maxY)] as Pt); result.push({ pts, area: bboxArea(pts) }) }
  }
  if (!result.length) return null
  result.sort((x, y) => y.area - x.area)
  const outerFull = dedupe(result[0]!.pts)
  const best = simplify(outerFull, 64)
  if (best.length < 3) return null
  // a round outline with a round hole (a ring drawn as two circles)
  let ring: number | undefined
  const hole = result[1]
  if (hole) {
    const box = (pts: Pt[]) => { const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]); return { x0: mn(xs), x1: mx(xs), y0: mn(ys), y1: mx(ys) } }
    const round = (pts: Pt[], b: ReturnType<typeof box>) => pts.every(([x, y]) => { const u = ((x - (b.x0 + b.x1) / 2) / ((b.x1 - b.x0) / 2 || 1)) ** 2 + ((y - (b.y0 + b.y1) / 2) / ((b.y1 - b.y0) / 2 || 1)) ** 2; return u > 0.8 && u < 1.2 })
    const ob = box(outerFull), hb = box(hole.pts)
    const inside = hb.x0 >= ob.x0 && hb.x1 <= ob.x1 && hb.y0 >= ob.y0 && hb.y1 <= ob.y1
    if (inside && ob.x1 - ob.x0 > 0 && round(outerFull, ob) && round(hole.pts, hb)) {
      const wall = ((ob.x1 - ob.x0) - (hb.x1 - hb.x0)) / 2 / Math.max(ob.x1 - ob.x0, 1e-6)
      ring = Math.max(0.02, Math.min(0.5, wall))
    }
  }
  return { points: best, subpaths: result.length, ...(ring !== undefined ? { ring } : {}) }
}

const bboxArea = (p: Pt[]) => { const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]); return (mx(xs) - mn(xs)) * (mx(ys) - mn(ys)) }
function dedupe(p: Pt[]): Pt[] { const out: Pt[] = []; for (const q of p) { const l = out[out.length - 1]; if (!l || Math.abs(l[0] - q[0]) > 0.0005 || Math.abs(l[1] - q[1]) > 0.0005) out.push(q) } const f = out[0]!, l = out[out.length - 1]!; if (out.length > 3 && Math.abs(f[0] - l[0]) < 0.0005 && Math.abs(f[1] - l[1]) < 0.0005) out.pop(); return out }
/** at most `max` corners, keeping the sharpest turns (Visvalingam-style area removal) */
function simplify(p: Pt[], max: number): Pt[] {
  // a hostile or very detailed outline: thin it evenly first, so the removal loop below stays cheap
  const step = Math.ceil(p.length / 512)
  const pts = step > 1 ? p.filter((_, i) => i % step === 0) : p.slice()
  while (pts.length > max) {
    let best = 0, bestA = Infinity
    for (let i = 0; i < pts.length; i++) { const a = pts[(i + pts.length - 1) % pts.length]!, b = pts[i]!, c = pts[(i + 1) % pts.length]!; const area = Math.abs((a[0] - c[0]) * (b[1] - a[1]) - (a[0] - b[0]) * (c[1] - a[1])) / 2; if (area < bestA) { bestA = area; best = i } }
    pts.splice(best, 1)
  }
  return pts
}
