import type { Draft } from 'immer'
import type { Presentation, Slide } from '@prompttoppt/validation'

/** Commands of the Selection pane: the slide's objects by name, and their stacking order. Pure mutators over an immer draft (undoable). Locked slides and locked objects refuse every change. */
type D = Draft<Presentation>
const slideOf = (d: D, slideId: string) => d.slides.find((s) => s.id === slideId)

/** Gives an object a name (its `label`) (Morph and the Animation pane show it). An empty name takes the name away. Returns false when refused. */
export function renameElement(d: D, slideId: string, elementId: string, name: string): boolean {
  const s = slideOf(d, slideId)
  const el = s?.elements.find((e) => e.id === elementId)
  if (!s || s.locked || !el || el.locked) return false
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 80)
  if ((el.label ?? '') === clean) return true
  if (clean) el.label = clean; else delete el.label
  return true
}

/** The slide's objects from the front to the back (the order the Selection pane lists them). */
export const stackOrder = (s: Pick<Slide, 'elements'>) => s.elements.map((e, i) => ({ e, i })).sort((a, b) => b.e.zIndex - a.e.zIndex || b.i - a.i).map((x) => x.e)

/** Moves an object one place towards the front (`up`) or the back (`down`), or all the way (`front`, `back`). The stacking numbers are written again 1..n so they never collide. */
export function moveLayer(d: D, slideId: string, elementId: string, to: 'up' | 'down' | 'front' | 'back'): boolean {
  const s = slideOf(d, slideId)
  if (!s || s.locked) return false
  const front = stackOrder(s as Slide)
  const i = front.findIndex((e) => e.id === elementId)
  if (i < 0 || front[i]!.locked) return false
  const j = to === 'up' ? i - 1 : to === 'down' ? i + 1 : to === 'front' ? 0 : front.length - 1
  if (j < 0 || j >= front.length || j === i) return false
  const [item] = front.splice(i, 1)
  front.splice(j, 0, item!)
  const n = front.length
  front.forEach((e, k) => {
    const z = n - k
    const real = s.elements.find((x) => x.id === e.id)!
    if (real.zIndex !== z) real.zIndex = z
  })
  return true
}

/** Puts an object right in front of (`above`) or right behind (`behind`) another object of the same slide; the others keep their order. Returns false when refused. */
export function placeNextTo(d: D, slideId: string, elementId: string, otherId: string, where: 'above' | 'behind'): boolean {
  const s = slideOf(d, slideId)
  if (!s || s.locked || elementId === otherId) return false
  const front = stackOrder(s as Slide)
  const i = front.findIndex((e) => e.id === elementId)
  if (i < 0 || front[i]!.locked || !front.some((e) => e.id === otherId)) return false
  const [item] = front.splice(i, 1)
  const j = front.findIndex((e) => e.id === otherId)
  front.splice(where === 'above' ? j : j + 1, 0, item!)
  const n = front.length
  front.forEach((e, k) => { const real = s.elements.find((x) => x.id === e.id)!; if (real.zIndex !== n - k) real.zIndex = n - k })
  return true
}

/** Switches an object off (hidden) or on (the eye in the Selection pane). Not drawn anywhere and left out of animations and Morph while hidden; still in the deck. Locked slides and locked objects refuse. `hidden` omitted = toggle. Returns false when refused. */
export function setHidden(d: D, slideId: string, elementId: string, hidden?: boolean): boolean {
  const s = slideOf(d, slideId)
  const el = s?.elements.find((e) => e.id === elementId)
  if (!s || s.locked || !el || el.locked) return false
  const next = hidden ?? !el.hidden
  if (!!el.hidden === next) return true
  if (next) el.hidden = true; else delete el.hidden
  return true
}
