import type { Draft } from 'immer'
import { effectSchema, EFFECTS, type Effect, type EffectCategory, type Presentation, type Slide } from '@prompttoppt/validation'
import { EFFECT_INFO, effectApplies, presetPath } from '@prompttoppt/ui'

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
  const keep = s.effects.filter((e) => ids.has(e.elementId) && (!e.trigger || ids.has(e.trigger)))
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
  // the slide is NOT marked hand-edited: a layout or theme swap may redraw it, and the effects follow their objects (remapEffects)
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

/**
 * The effects of elements that are being copied (Ctrl+D, Copy and Paste), pointing at the copies (`map`: each source element's id → its copy's id). An effect whose click trigger is
 * another element follows that element's copy when it was copied too; otherwise it loses its trigger and plays in the click sequence (the trigger would point at nothing on another slide).
 */
export function effectsForCopies(effects: Effect[] | undefined, map: Map<string, string>, gen: IdGen): Effect[] {
  return (effects ?? []).filter((e) => map.has(e.elementId)).map((e) => {
    const { trigger, ...rest } = e
    return { ...rest, id: gen(), elementId: map.get(e.elementId)!, ...(trigger && map.has(trigger) ? { trigger: map.get(trigger)! } : {}) }
  })
}

const categoryOf = (type: Effect['type']): EffectCategory => (Object.keys(EFFECTS) as EffectCategory[]).find((c) => (EFFECTS[c] as readonly string[]).includes(type))!

/** The options a freshly chosen effect type starts with (its catalogue defaults), and for a path its points. */
export function startOptions(type: Effect['type'], carry: Partial<Effect> = {}): Partial<Effect> {
  const info = EFFECT_INFO[type]
  const out: Partial<Effect> = { ...info.defaults }
  // a motion path stores its points: the preset of its type, at the direction and size it starts with
  if (info.path && type !== 'path-custom') out.path = presetPath(type, out.direction ?? 'right', out.distance ?? 300)
  if (type === 'path-custom') out.path = carry.path ?? presetPath(type, 'right', 300)
  return out
}

/**
 * The gallery click (PowerPoint's behaviour): the effect is applied to every selected object, in selection order, as one undo step. An object that already has an
 * effect of that kind has it replaced (its start, timing and easing are kept; its options start from the new type's defaults); an object without one gets a new
 * effect at the end of the timeline. Objects the effect cannot play on (a colour change on a picture) and locked ones are skipped. Returns the ids of the effects set.
 */
export function applyEffect(d: D, slideId: string, elementIds: string[], type: Effect['type'], gen: IdGen): string[] {
  const s = slideOf(d, slideId)
  if (!s || s.locked) return []
  const category = categoryOf(type)
  const out: string[] = []
  for (const elementId of elementIds) {
    const el = s.elements.find((e) => e.id === elementId)
    if (!el || el.locked || !effectApplies(type, el)) continue
    const old = s.effects?.find((e) => e.elementId === elementId && e.category === category && !e.trigger)
    if (old) {
      const keep = { start: old.start, duration: old.duration, delay: old.delay, easing: old.easing, repeat: old.repeat, loop: old.loop, trigger: old.trigger }
      const made = effectSchema.safeParse({ ...startOptions(type, old as Effect), ...keep, id: old.id, elementId, category, type })
      if (!made.success) continue
      const i = s.effects!.findIndex((e) => e.id === old.id)
      s.effects![i] = made.data as Draft<Effect>
      out.push(old.id)
    } else {
      const id = addEffect(d, slideId, elementId, category, type, gen, startOptions(type))
      if (id) out.push(id)
    }
  }
  return out
}

/** PowerPoint's "Add Animation": a further effect on an object that already has some (entrance, then emphasis, then exit). It starts With Previous only when asked; the default is On Click. */
export function addAnimation(d: D, slideId: string, elementId: string, type: Effect['type'], gen: IdGen, start: Effect['start'] = 'click'): string | null {
  const s = slideOf(d, slideId)
  const el = s?.elements.find((e) => e.id === elementId)
  if (!el || !effectApplies(type, el)) return null
  return addEffect(d, slideId, elementId, categoryOf(type), type, gen, { ...startOptions(type), start })
}

/** "None": takes every effect off the selected objects (also the ones that wait for them as trigger). Returns how many were removed. */
export function clearEffects(d: D, slideId: string, elementIds: string[]): number {
  const s = slideOf(d, slideId)
  if (!s || s.locked || !s.effects) return 0
  const ids = new Set(elementIds.filter((id) => !s.elements.find((e) => e.id === id)?.locked))
  const keep = s.effects.filter((e) => !ids.has(e.elementId))
  const n = s.effects.length - keep.length
  if (n === 0) return 0
  if (keep.length) s.effects = keep; else delete s.effects
  return n
}

/** Animation Painter: copies the effects of one object onto the others (new ids, same timing and options; the targets' own effects are replaced). Returns the number of effects made. */
export function paintAnimation(d: D, slideId: string, fromId: string, toIds: string[], gen: IdGen): number {
  const s = slideOf(d, slideId)
  if (!s || s.locked || !s.effects) return 0
  const source = s.effects.filter((e) => e.elementId === fromId && !e.trigger)
  if (source.length === 0) return 0
  const targets = toIds.filter((id) => id !== fromId && s.elements.some((e) => e.id === id && !e.locked))
  let made = 0
  for (const id of targets) {
    const el = s.elements.find((e) => e.id === id)!
    const fits = source.filter((e) => effectApplies(e.type, el))
    if (fits.length === 0) continue
    s.effects = s.effects.filter((e) => e.elementId !== id)
    for (const e of fits) {
      if (s.effects.length >= MAX_EFFECTS) break
      s.effects.push({ ...(JSON.parse(JSON.stringify(e)) as Effect), id: gen(), elementId: id } as Draft<Effect>)
      made++
    }
  }
  return made
}

/** Plays when another object is clicked (PowerPoint's Trigger); null puts it back in the slide's click sequence. The trigger must be another object on the slide. */
export function setTrigger(d: D, slideId: string, effectId: string, triggerId: string | null): boolean {
  const s = slideOf(d, slideId)
  if (!s || s.locked) return false
  const i = s.effects?.findIndex((e) => e.id === effectId) ?? -1
  if (i < 0) return false
  if (triggerId !== null && !s.elements.some((e) => e.id === triggerId)) return false
  const next = { ...(s.effects![i] as Effect) }
  if (triggerId === null) delete next.trigger; else next.trigger = triggerId
  const made = effectSchema.safeParse(next)
  if (!made.success) return false
  if (JSON.stringify(made.data) !== JSON.stringify(s.effects![i])) s.effects![i] = made.data as Draft<Effect>
  return true
}

/** Resizes or re-aims a preset motion path (line, arc, turn, circle): its points are drawn again. A custom path is left as drawn. */
export function setPathShape(d: D, slideId: string, effectId: string, shape: { direction?: NonNullable<Effect['direction']>; distance?: number }): boolean {
  const s = slideOf(d, slideId)
  const e = s?.effects?.find((x) => x.id === effectId)
  if (!s || s.locked || !e || !EFFECT_INFO[e.type].path || e.type === 'path-custom') return false
  const direction = shape.direction ?? e.direction ?? 'right', distance = shape.distance ?? e.distance ?? 300
  return updateEffect(d, slideId, effectId, { direction, distance, path: presetPath(e.type, direction, distance) })
}

/** A hand-drawn path (points as offsets from the object's place). Fewer than two points is refused. */
export function setCustomPath(d: D, slideId: string, effectId: string, points: [number, number][]): boolean {
  if (points.length < 2) return false
  return updateEffect(d, slideId, effectId, { path: points })
}

/** Moves one effect a step earlier / later in the play order (the pane's up and down buttons). */
export function nudgeEffect(d: D, slideId: string, effectId: string, by: -1 | 1) {
  const s = slideOf(d, slideId)
  const i = s?.effects?.findIndex((e) => e.id === effectId) ?? -1
  if (i >= 0) moveEffect(d, slideId, i, i + by)
}

/** Moves a group of effects (all those of one object, say) so each ends up where the list says: the whole list is replaced by `order` (ids). Unknown ids are refused; missing ones keep their relative place at the end. */
export function reorderEffects(d: D, slideId: string, order: string[]) {
  const s = slideOf(d, slideId)
  if (!s || s.locked || !s.effects) return
  const byId = new Map(s.effects.map((e) => [e.id, e]))
  if (order.some((id) => !byId.has(id))) return
  const rest = s.effects.filter((e) => !order.includes(e.id))
  const next = [...order.map((id) => byId.get(id)!), ...rest]
  if (next.every((e, i) => e.id === s.effects![i]!.id)) return
  s.effects = next
}

/** What an element was before its slide was drawn again: enough to find its successor. */
export interface ElementSnapshot { id: string; type: string; role?: string | undefined; decorative?: boolean | undefined }
export const snapshotElements = (els: readonly { id: string; type: string; decorative?: boolean | undefined }[]): ElementSnapshot[] => els.map((e) => ({ id: e.id, type: e.type, role: (e as { role?: string }).role, decorative: e.decorative }))

/**
 * A slide was drawn again (another layout, a theme or design swap, an AI rewrite, a picture placed behind it): its elements are new objects with new ids. Instead of dropping the
 * effects, each effect follows its object to the element that takes its place: the same id when the new slide keeps it (Morph decks do), otherwise the same KIND of object in the same
 * ROLE and the same place in reading order (the second body text becomes the second body text; the first picture the first picture). Shapes and icons have no successor of their own (only their id).
 * Effects whose object has none are removed (and `lostEffects` tells the page). Triggers follow the same way. Returns how many effects were removed.
 */
export function remapEffects(s: Draft<Slide>, old: readonly ElementSnapshot[]): number {
  const before = s.effects?.length ?? 0
  if (!s.effects || before === 0) return 0
  const fresh = s.elements
  const freshIds = new Set(fresh.map((e) => e.id))
  const key = (e: { type: string; role?: string | undefined }) => `${e.type}:${e.type === 'text' ? e.role ?? '' : ''}`
  const successor = new Map<string, string>()
  const used = new Set<string>()
  // objects that kept their id are their own successor and are not up for taking by another
  for (const o of old) if (freshIds.has(o.id)) { successor.set(o.id, o.id); used.add(o.id) }
  const MEANINGFUL = new Set(['text', 'image', 'chart', 'table']) // a shape or an icon has no identity beyond its id: a layout's accent bar is not the same object as another layout's
  const pools = new Map<string, string[]>()
  for (const e of fresh) { if (e.decorative || !MEANINGFUL.has(e.type) || used.has(e.id)) continue; const k = key({ type: e.type, role: (e as { role?: string }).role }); (pools.get(k) ?? pools.set(k, []).get(k)!).push(e.id) }
  const taken = new Map<string, number>()
  for (const o of old) {
    if (successor.has(o.id) || o.decorative || !MEANINGFUL.has(o.type)) continue
    const k = key(o), pool = pools.get(k) ?? [], i = taken.get(k) ?? 0
    taken.set(k, i + 1)
    if (pool[i]) successor.set(o.id, pool[i]!)
  }
  s.effects = s.effects.flatMap((e) => {
    const to = successor.get(e.elementId) ?? (freshIds.has(e.elementId) ? e.elementId : undefined)
    if (!to) return []
    const next = { ...e, elementId: to } as Draft<Effect>
    if (e.trigger) { const t = successor.get(e.trigger) ?? (freshIds.has(e.trigger) ? e.trigger : undefined); if (!t) return []; next.trigger = t }
    return [next]
  })
  if (s.effects.length === 0) delete s.effects
  return before - (s.effects?.length ?? 0)
}

/**
 * Effects lost when a slide was DRAWN AGAIN (a re-layout, a design swap, an AI rewrite): the slide is still there but at least half of its old objects are gone, and some effects with them.
 * Deleting a few objects by hand is not counted (that is a choice). The editor tells the person when this happens.
 */
export function lostEffects(before: Presentation, after: Presentation): number {
  let n = 0
  const now = new Map(after.slides.map((s) => [s.id, s]))
  for (const old of before.slides) {
    const cur = now.get(old.id)
    if (!cur || !old.effects?.length) continue
    const els = new Set(cur.elements.map((e) => e.id))
    const gone = old.elements.filter((e) => !els.has(e.id)).length
    if (old.elements.length === 0 || gone / old.elements.length < 0.5) continue
    const live = new Set((cur.effects ?? []).map((e) => e.id))
    for (const e of old.effects) if (!live.has(e.id) && !els.has(e.elementId)) n++
  }
  return n
}
