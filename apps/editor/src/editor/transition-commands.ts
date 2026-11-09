import type { Draft } from 'immer'
import { MORPH_DEFAULTS, transitionSchema, type Presentation, type Transition } from '@prompttoppt/validation'

/**
 * Commands for how a slide arrives (its transition). Pure mutators over an immer draft, so every one is undoable. A transition set here is marked `own`: a
 * layout change, theme swap or AI rewrite keeps it, where a transition taken from the theme is replaced. Locked slides refuse every change.
 */
type D = Draft<Presentation>
export type TransitionPatch = Partial<Omit<Transition, 'own'>> & Pick<Transition, 'type'>

const slideOf = (d: D, slideId: string) => d.slides.find((s) => s.id === slideId)

/** The transition a type starts with: Morph has its own pace and easing, the others the schema's defaults. */
const initial = (type: Transition['type']): Partial<Transition> => (type === 'morph' ? { ...MORPH_DEFAULTS } : {})

/** Sets a slide's transition. Switching to another type starts from that type's defaults; the same type keeps its options and only takes the patch. Returns false when refused (locked, unknown slide, schema). */
export function setTransition(d: D, slideId: string, patch: TransitionPatch): boolean {
  const s = slideOf(d, slideId)
  if (!s || s.locked) return false
  const old = s.transition as Transition | undefined
  const base = old && old.type === patch.type ? old : initial(patch.type)
  const next = transitionSchema.safeParse({ ...base, ...patch, own: true })
  if (!next.success) return false
  if (JSON.stringify(next.data) === JSON.stringify(old)) return true
  s.transition = next.data as Draft<Transition>
  return true
}

/** Sets the same transition on every slide that can take it (not locked; Morph also skips the first slide, which has no previous slide to move from). Returns how many slides changed. */
export function setTransitionAll(d: D, patch: TransitionPatch): number {
  let n = 0
  d.slides.forEach((s, i) => {
    if (patch.type === 'morph' && i === 0) return
    const before = JSON.stringify(s.transition)
    if (setTransition(d, s.id, patch) && JSON.stringify(s.transition) !== before) n++
  })
  return n
}

/** Takes Morph off one slide: it goes back to the theme's own transition. Anything else is left alone. */
export function removeMorph(d: D, slideId: string): boolean {
  const s = slideOf(d, slideId)
  if (!s || s.locked || s.transition?.type !== 'morph') return false
  delete s.transition
  return true
}

/** Takes Morph off every slide that has it. Returns how many changed. */
export function removeMorphAll(d: D): number {
  let n = 0
  for (const s of d.slides) if (removeMorph(d, s.id)) n++
  return n
}

export const hasMorph = (doc: Pick<Presentation, 'slides'>) => doc.slides.some((s) => s.transition?.type === 'morph')
