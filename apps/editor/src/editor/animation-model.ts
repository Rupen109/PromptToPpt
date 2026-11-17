import { EFFECTS, type Effect, type EffectCategory, type Slide } from '@prompttoppt/validation'
import { compileTimeline, compileTriggers } from '@prompttoppt/ui'

/**
 * What the Animation pane and the canvas badges show about a slide's effects, worked out from the same timeline the player uses (so what is drawn is what plays).
 * Pure: no DOM, no store.
 */
export interface TimelineRow {
  effect: Effect
  /** position in the list (play order), 0-based */
  index: number
  /** the number PowerPoint puts on the object: the click that starts it (0 = plays by itself when the slide appears); a trigger effect has none */
  click: number | null
  /** ms from the start of its click step */
  begin: number
  end: number
}
export interface TimelineModel { rows: TimelineRow[]; /** the longest step, in ms (the width of the timeline) */ span: number }

export function timelineModel(slide: Pick<Slide, 'elements' | 'effects'>): TimelineModel {
  const effects = slide.effects ?? []
  const ids = new Set(slide.elements.filter((e) => !e.hidden).map((e) => e.id)) // an object switched off plays nothing, so it takes no click
  const placed = new Map<string, { click: number | null; begin: number; end: number }>()
  const steps = compileTimeline(effects, ids)
  steps.forEach((step, k) => step.effects.forEach((p) => placed.set(p.effect.id, { click: k, begin: p.begin, end: p.end })))
  for (const step of compileTriggers(effects, ids).values()) step.effects.forEach((p) => placed.set(p.effect.id, { click: null, begin: p.begin, end: p.end }))
  const rows = effects.map((effect, index) => {
    const at = placed.get(effect.id)
    return { effect, index, click: at?.click ?? null, begin: at?.begin ?? 0, end: at?.end ?? effect.delay + effect.duration }
  })
  const span = Math.max(1000, ...rows.map((r) => r.end))
  return { rows, span }
}

/** The effect numbers of one element, for the small tags on the canvas: every click number its effects play at. */
export function badgesByElement(model: TimelineModel): Map<string, { click: number | null; effectId: string }[]> {
  const out = new Map<string, { click: number | null; effectId: string }[]>()
  for (const r of model.rows) {
    const list = out.get(r.effect.elementId) ?? []
    list.push({ click: r.click, effectId: r.effect.id })
    out.set(r.effect.elementId, list)
  }
  return out
}

/** The effects of the gallery in the order PowerPoint lists them, by category. */
export const GALLERY: { category: EffectCategory; label: string; types: readonly Effect['type'][] }[] = [
  { category: 'entrance', label: 'Entrance', types: EFFECTS.entrance },
  { category: 'emphasis', label: 'Emphasis', types: EFFECTS.emphasis },
  { category: 'exit', label: 'Exit', types: EFFECTS.exit },
  { category: 'path', label: 'Motion paths', types: EFFECTS.path },
]

/** Which effect the Timing group edits: the one the person picked while its object is still selected, else the first effect of the selected object, else none. */
export function activeEffect(slide: Pick<Slide, 'effects'>, activeId: string | null, selection: string[]): Effect | undefined {
  const list = slide.effects ?? []
  const picked = list.find((e) => e.id === activeId)
  // the picked effect stays active while its object is selected (or nothing is); selecting another object moves the Timing group to that object's first effect
  if (picked && (selection.length === 0 || selection.includes(picked.elementId))) return picked
  return list.find((e) => selection.includes(e.elementId)) ?? picked
}

/** `1.2` seconds from ms, for a field. */
export const toSeconds = (ms: number) => Math.round(ms) / 1000
/** ms from the text of a seconds field; null when it is not a number. */
export const fromSeconds = (text: string): number | null => { const v = Number(text.replace(',', '.')); return text.trim() !== '' && Number.isFinite(v) ? Math.round(v * 1000) : null }
