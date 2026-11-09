import type { Presentation } from '@prompttoppt/validation'

/**
 * True when `after` has a Morph transition that `before` did not have, or whose settings changed. Setting a slide to any other transition, taking Morph away, and every object effect are open to every plan (a person who left Gold keeps playing their Morph decks and can remove Morph, but cannot add or change it).
 */
export function morphAdded(before: Presentation | undefined, after: Presentation): boolean {
  const old = new Map((before?.slides ?? []).map((s) => [s.id, s.transition]))
  return after.slides.some((s) => {
    if (s.transition?.type !== 'morph') return false
    const was = old.get(s.id)
    return !was || was.type !== 'morph' || canonT(was) !== canonT(s.transition)
  })
}
const canonT = (t: object) => JSON.stringify(Object.entries(t).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
