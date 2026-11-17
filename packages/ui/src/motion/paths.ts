import type { Effect } from '@prompttoppt/validation'

/**
 * Motion paths as plain points: offsets from where the element sits, in canvas units. Every shape (line, arc, turn, circle, hand-drawn) is stored the same way, so the
 * engine only has to walk a list of points. Pure functions, no DOM.
 */
export type Pt = readonly [number, number]
const SEGMENTS = 24

/** the unit vector of a direction (screen coordinates: y grows downwards) */
export const DIRECTION_VECTOR: Record<NonNullable<Effect['direction']>, Pt> = {
  right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1],
  'up-left': [-Math.SQRT1_2, -Math.SQRT1_2], 'up-right': [Math.SQRT1_2, -Math.SQRT1_2], 'down-left': [-Math.SQRT1_2, Math.SQRT1_2], 'down-right': [Math.SQRT1_2, Math.SQRT1_2],
}
const r1 = (n: number) => Math.round(n * 10) / 10
/** a point at (u along the direction, v to its right-hand side) */
const place = (dir: Pt, u: number, v: number): [number, number] => [r1(dir[0] * u - dir[1] * v), r1(dir[1] * u + dir[0] * v)]

/** The points of a preset path of the given size. `custom` has no preset: it returns a straight line to start from. */
export function presetPath(type: Effect['type'], direction: NonNullable<Effect['direction']> = 'right', size = 300): [number, number][] {
  const dir = DIRECTION_VECTOR[direction]
  const n = SEGMENTS
  const out: [number, number][] = []
  switch (type) {
    case 'path-arc': // a half-moon bump on the left-hand side of the way
      for (let i = 0; i <= n; i++) out.push(place(dir, size * (i / n), -size * 0.4 * Math.sin(Math.PI * (i / n))))
      return out
    case 'path-turn': // a quarter circle: heads along the direction and bends to its right-hand side
      for (let i = 0; i <= n; i++) { const a = (Math.PI / 2) * (i / n); out.push(place(dir, size * Math.sin(a), size * (1 - Math.cos(a)))) }
      return out
    case 'path-circle': { // a full circle that begins and ends where the element is; `size` is its diameter
      const r = size / 2
      for (let i = 0; i <= n; i++) { const a = 2 * Math.PI * (i / n); out.push([r1(r * Math.sin(a)), r1(r * (1 - Math.cos(a)))]) }
      out[n] = [0, 0]
      return out
    }
    default: return [[0, 0], place(dir, size, 0)]
  }
}

/** Where along a path (0 to 1 of its total length) the element is, interpolated between points. */
export function samplePath(points: readonly Pt[], t: number): [number, number] {
  if (points.length === 0) return [0, 0]
  if (points.length === 1 || t <= 0) return [points[0]![0], points[0]![1]]
  const lens: number[] = []
  let total = 0
  for (let i = 1; i < points.length; i++) { const l = Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]); lens.push(l); total += l }
  if (total === 0 || t >= 1) { const last = points[points.length - 1]!; return [last[0], last[1]] }
  let want = t * total
  for (let i = 0; i < lens.length; i++) {
    if (want <= lens[i]! || i === lens.length - 1) {
      const k = lens[i]! === 0 ? 0 : Math.min(1, want / lens[i]!)
      const a = points[i]!, b = points[i + 1]!
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
    }
    want -= lens[i]!
  }
  const last = points[points.length - 1]!
  return [last[0], last[1]]
}

/** The path an effect follows: its own points, or the preset of its type when none were stored. */
export function pathOf(e: Pick<Effect, 'type' | 'direction' | 'distance' | 'path'>): readonly Pt[] {
  if (e.path && e.path.length >= 2) return e.path
  return presetPath(e.type, e.direction ?? 'right', e.distance ?? 300)
}

/** Total length of a path in canvas units. */
export const pathLength = (points: readonly Pt[]) => points.reduce((sum, p, i) => (i === 0 ? 0 : sum + Math.hypot(p[0] - points[i - 1]![0], p[1] - points[i - 1]![1])), 0)

/** Where the element ends up: the last point. */
export const pathEnd = (points: readonly Pt[]): Pt => points[points.length - 1] ?? [0, 0]

/** An SVG path `d` for drawing a path preview (the offsets are relative to `origin`). */
export const pathToSvg = (points: readonly Pt[], origin: Pt = [0, 0]) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${r1(origin[0] + p[0])} ${r1(origin[1] + p[1])}`).join(' ')

/** A hand-drawn stroke thinned to at most `max` points (always keeps the first and the last), relative to its first point. */
export function simplifyStroke(raw: readonly Pt[], max = 100, minStep = 6): [number, number][] {
  if (raw.length < 2) return []
  const [ox, oy] = raw[0]!
  const kept: [number, number][] = [[0, 0]]
  for (let i = 1; i < raw.length - 1; i++) {
    const last = kept[kept.length - 1]!
    const p: [number, number] = [r1(raw[i]![0] - ox), r1(raw[i]![1] - oy)]
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= minStep) kept.push(p)
  }
  const end = raw[raw.length - 1]!
  kept.push([r1(end[0] - ox), r1(end[1] - oy)])
  if (kept.length <= max) return kept
  const out: [number, number][] = []
  for (let i = 0; i < max; i++) out.push(kept[Math.round((i * (kept.length - 1)) / (max - 1))]!)
  return out
}
