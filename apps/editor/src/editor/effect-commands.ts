import type { Draft } from 'immer'
import { effectSchema, type Effect, type EffectCategory, type Presentation, type Slide } from '@prompttoppt/validation'

/**
 * Commands for a slide's object effects (its animation timeline). Pure mutators over an immer draft, like the rest of the document commands: the store records
 * patches, so every one of these is undoable. A slide's `effects` is one list in play order; each effect names the element it plays on.
 */
type D = Draft<Presentation>
type IdGen = () => string
const MAX_EFFECTS = 200 // the same cap as the schema

const slideOf = (d: D, slideId: string) => d.slides.find((s) => s.id === slideId)

/** Removes the effects whose element is gone (an element was deleted, or the slide was laid out again), so no effect points at nothing. Records nothing when nothing is orphaned. */
export function pruneEffects(s: Draft<Slide>) {
  if (!s.effects) return
  const ids = new Set(s.elements.map((e) => e.id))
  const keep = s.effects.filter((e) => ids.has(e.elementId))
  if (keep.length === s.effects.length) return
  if (keep.length) s.effects = keep
  else delete s.effects
}

/** Adds an effect at the end of the slide's timeline. The first one on a slide starts On Click, like PowerPoint; the options are the schema's defaults unless given. Returns its id, or null when it cannot be added. */
export function addEffect(d: D, slideId: string, elementId: string, category: EffectCategory, type: Effect['type'], gen: IdGen, options: Partial<Effect> = {}): string | null {
  const s = slideOf(d, slideId)
  const el = s?.elements.find((e) => e.id === elementId)
  if (!s || s.locked || !el || el.locked || (s.effects?.length ?? 0) >= MAX_EFFECTS) return null
  const made = effectSchema.safeParse({ ...options, id: gen(), elementId, category, type })
  if (!made.success) return null
  s.effects = [...(s.effects ?? []), made.data] as Draft<Slide>['effects']
  s.manual = true // a slide with its own effects is never laid out again by a theme or layout swap, which would give its elements new ids
  return made.data.id
}

/** Changes the options of one effect. A change the schema refuses (a type from another category, a duration out of range) is not applied; a change that changes nothing records nothing. */
export function updateEffect(d: D, slideId: string, effectId: string, patch: Partial<Omit<Effect, 'id' | 'elementId'>>): boolean {
  const s = slideOf(d, slideId)
  const i = s?.effects?.findIndex((e) => e.id === effectId) ?? -1
  if (!s || s.locked || !s.effects || i < 0) return false
  const old = s.effects[i]! as Effect
  const next = effectSchema.safeParse({ ...old, ...patch })
  if (!next.success) return false
  if (JSON.stringify(next.data) === JSON.stringify(old)) return true
  s.effects[i] = next.data as Draft<Effect>
  return true
}

export function removeEffect(d: D, slideId: string, effectId: string) {
  const s = slideOf(d, slideId)
  if (!s || s.locked || !s.effects?.some((e) => e.id === effectId)) return
  const keep = s.effects.filter((e) => e.id !== effectId)
  if (keep.length) s.effects = keep
  else delete s.effects
}

/** A copy of an effect, placed right after it. Returns the new id. */
export function duplicateEffect(d: D, slideId: string, effectId: string, gen: IdGen): string | null {
  const s = slideOf(d, slideId)
  const i = s?.effects?.findIndex((e) => e.id === effectId) ?? -1
  if (!s || s.locked || !s.effects || i < 0 || s.effects.length >= MAX_EFFECTS) return null
  const copy = { ...(JSON.parse(JSON.stringify(s.effects[i])) as Effect), id: gen() }
  s.effects.splice(i + 1, 0, copy as Draft<Effect>)
  return copy.id
}

/** Moves an effect to another place in the play order (drag and drop in the animation pane). */
export function moveEffect(d: D, slideId: string, from: number, to: number) {
  const s = slideOf(d, slideId)
  const n = s?.effects?.length ?? 0
  if (!s || s.locked || !s.effects || from < 0 || from >= n || to < 0 || to >= n || from === to) return
  const [item] = s.effects.splice(from, 1)
  s.effects.splice(to, 0, item!)
}

/** The effects of a copied slide: new ids, pointing at the copy's elements (`elementIds` maps each old element id to its new one). Effects on an element that was not copied are dropped. */
export function copyEffects(effects: Effect[] | undefined, elementIds: Map<string, string>, gen: IdGen): Effect[] | undefined {
  const out = (effects ?? []).filter((e) => elementIds.has(e.elementId)).map((e) => ({ ...e, id: gen(), elementId: elementIds.get(e.elementId)! }))
  return out.length ? out : undefined
}
