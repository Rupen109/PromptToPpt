import { z } from 'zod'
import { slideContentSchema, type SlideContent } from './presentation'

/**
 * What a TEXT request asks for, as checkable facts (docs/AI_EDIT_V3_ARCHITECTURE.md §6): code turns the request into this goal, and a slide counts as done only when its
 * new content meets it. The limits come from the slide schema itself (`slideContentSchema`), so a capacity can never disagree with what a slide may hold.
 */
export interface TextGoal {
  /** "add 2 more points": every point list the request is about ends with exactly N more items */
  addPoints?: number | undefined
  /** "5 points in total": every point list the request is about ends with exactly N items */
  totalPoints?: number | undefined
  /** "add more content / detail" (longer) or "make it shorter" (shorter) */
  length?: 'longer' | 'shorter' | undefined
}

/** a point list of one slide: where it is, how many items it has, and how many the layout allows */
export interface PointList { path: string; count: number; min: number; max: number }

type Js = { type?: string; properties?: Record<string, Js>; items?: Js; minItems?: number; maxItems?: number; const?: string; oneOf?: Js[] }
/** arrays that are data or metadata, never "points" (chart and table figures, citations) */
const NOT_POINTS = new Set(['sources', 'labels', 'series', 'values', 'rows', 'header', 'columns'])
let byLayout: Map<string, Js> | null = null
function layoutSchema(layout: string): Js | undefined {
  if (!byLayout) {
    const js = z.toJSONSchema(slideContentSchema, { io: 'input', unrepresentable: 'any' }) as Js
    byLayout = new Map((js.oneOf ?? []).map((v) => [String(v.properties?.['layout']?.const ?? ''), v]))
  }
  return byLayout.get(layout)
}

/**
 * The point lists of a slide's content, with their real limits. The MAIN lists are the growable lists at the top of the content or one object below it (bullets, steps,
 * items, phases, left.bullets, right.bullets); a layout without one (a matrix: four fixed quadrants) offers the lists inside its items instead (quadrants[0].bullets …).
 * Fixed-length lists (exactly N items) are not points: nothing can be added to them.
 */
export function pointLists(c: SlideContent): PointList[] {
  const schema = layoutSchema(c.layout)
  if (!schema?.properties) return []
  const main: PointList[] = [], nested: PointList[] = []
  const growable = (s: Js) => s.type === 'array' && (s.maxItems ?? 0) > (s.minItems ?? 0)
  for (const [k, s] of Object.entries(schema.properties)) {
    if (NOT_POINTS.has(k)) continue
    const v = (c as Record<string, unknown>)[k]
    if (s.type === 'array' && Array.isArray(v)) {
      if (growable(s)) main.push({ path: k, count: v.length, min: s.minItems ?? 0, max: s.maxItems ?? 99 })
      else if (s.items?.properties) v.forEach((item, i) => { for (const [kk, ss] of Object.entries(s.items!.properties!)) { const vv = (item as Record<string, unknown>)?.[kk]; if (!NOT_POINTS.has(kk) && growable(ss) && Array.isArray(vv)) nested.push({ path: `${k}[${i}].${kk}`, count: vv.length, min: ss.minItems ?? 0, max: ss.maxItems ?? 99 }) } })
    } else if (s.type === 'object' && s.properties && v && typeof v === 'object') {
      for (const [kk, ss] of Object.entries(s.properties)) { const vv = (v as Record<string, unknown>)[kk]; if (!NOT_POINTS.has(kk) && growable(ss) && Array.isArray(vv)) main.push({ path: `${k}.${kk}`, count: vv.length, min: ss.minItems ?? 0, max: ss.maxItems ?? 99 }) }
    }
  }
  return main.length ? main : nested
}

/** keys whose words are not the slide's visible words */
const NOT_WORDS = new Set(['layout', 'speakerNotes', 'sources', 'imagePrompt', 'imageAlt', 'imageUrl', 'imageAttribution', 'scene', 'chartType', 'sourceId', 'locator'])
/** the visible words of a slide's content (not its notes, its picture search or its citations) */
export function contentWords(c: SlideContent): number {
  let n = 0
  const walk = (v: unknown, key = '') => {
    if (NOT_WORDS.has(key)) return
    if (typeof v === 'string') n += v.split(/\s+/).filter(Boolean).length
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k)
  }
  walk(c)
  return n
}

/** how much a "longer" / "shorter" request must change the visible words, at least */
export const LONGER_BY = 1.15
export const SHORTER_BY = 0.9

/** the count each point list must end with, or null when the goal says nothing about points */
export function wantedCounts(before: SlideContent, g: TextGoal): { path: string; want: number; max: number; min: number }[] | null {
  if (!g.addPoints && !g.totalPoints) return null
  return pointLists(before).map((l) => ({ path: l.path, want: g.totalPoints ?? l.count + (g.addPoints ?? 0), max: l.max, min: l.min }))
}

/**
 * BEFORE writing: can this slide hold what is asked? `ok` when every list can reach its wanted count; otherwise the most the layout allows, so the person can be asked
 * ("This timeline holds at most 6 points") instead of getting a silent "what fits".
 */
export function textGoalFit(before: SlideContent, g: TextGoal): { ok: true } | { ok: false; why: string; fits: number } {
  const w = wantedCounts(before, g)
  if (w === null) return { ok: true }
  if (!w.length) return { ok: false, why: `a ${before.layout} slide has no list of points`, fits: 0 }
  const over = w.find((x) => x.want > x.max)
  if (over) return { ok: false, why: `this ${before.layout} slide holds at most ${over.max} points${w.length > 1 ? ' in each list' : ''}`, fits: over.max }
  const under = w.find((x) => x.want < x.min)
  if (under) return { ok: false, why: `this ${before.layout} slide needs at least ${under.min} points${w.length > 1 ? ' in each list' : ''}`, fits: under.min }
  return { ok: true }
}

/** AFTER writing: what the new content does not do of the goal, in words for the writer's retry and for the person; null when the goal is met */
export function textGoalProblem(before: SlideContent, after: SlideContent, g: TextGoal): string | null {
  const w = wantedCounts(before, g)
  if (w) {
    const now = new Map(pointLists(after).map((l) => [l.path, l.count]))
    const wrong = w.filter((x) => now.get(x.path) !== x.want)
    if (wrong.length) return `it has ${wrong.map((x) => `${now.get(x.path) ?? 0} points${w.length > 1 ? ` in ${x.path.replace(/\[(\d+)\]/, (_, i) => ` ${Number(i) + 1}`)}` : ''}`).join(' and ')}; it needs exactly ${[...new Set(wrong.map((x) => x.want))].join(' and ')}`
  }
  if (g.length) {
    const b = contentWords(before), a = contentWords(after)
    if (g.length === 'longer' && a < Math.ceil(b * LONGER_BY)) return `it has ${a} words; it needs at least ${Math.ceil(b * LONGER_BY)} (more detail, not just other words)`
    if (g.length === 'shorter' && a > Math.floor(b * SHORTER_BY)) return `it has ${a} words; it needs at most ${Math.floor(b * SHORTER_BY)}`
  }
  return null
}
