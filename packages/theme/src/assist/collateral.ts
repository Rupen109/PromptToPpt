import type { Expectation, Presentation, Slide } from '@prompttoppt/validation'
import { getMorphTemplate } from '../morph-templates/registry'
import { sceneSlidesOfPicture } from '../morph-templates/pictures'

/**
 * "Preserve everything not asked for" (rule R6), checked on the document: after an answer is applied, every slide the answer did not name must be exactly as it was. Returns the numbers (in the deck
 * after) of the slides that changed although nothing there was asked. A design change, a put-back or a rebuild may touch every slide, so those answers are not judged here; the per-change checks
 * (evaluate.ts) already cover what each of them promised. A slide's own validation result is recomputed whenever it is touched and is not a change of the person's content.
 */
export function collateralChanges(before: Presentation, after: Presentation, expectations: readonly Pick<Expectation, 'kind'>[] & readonly Expectation[]): number[] {
  const all = expectations.some((e) => e.kind === 'theme' || e.kind === 'revert' || e.kind === 'rewrite')
  if (all) return []
  const named = new Set<string>()
  for (const e of expectations) {
    if (e.kind === 'element') { named.add(e.change.slideId); if (e.change.copy) named.add(e.change.copy.fromSlideId) }
    else if ('slideId' in e) named.add(e.slideId)
    // a template picture replaced (or cut out) changes on every scene that shows it: that is the asked change, not something else (and it is said in its own note)
    if (e.kind === 'picture_swap') for (const s of sceneSlidesOfPicture(before.slides, e.slideId, e.elementId, getMorphTemplate) ?? []) named.add(s.id)
    else if (e.kind === 'addition') named.add(e.id)
  }
  const was = new Map(before.slides.map((s) => [s.id, s]))
  const plain = (s: Slide) => JSON.stringify({ ...s, validation: undefined })
  const out: number[] = []
  after.slides.forEach((s, i) => {
    const old = was.get(s.id)
    if (old && !named.has(s.id) && plain(old) !== plain(s)) out.push(i + 1)
  })
  return out
}

/** the sentence for what changed without being asked (the person can undo the whole answer with one Ctrl+Z) */
export function collateralNote(slides: number[]): string | null {
  if (!slides.length) return null
  const list = slides.length === 1 ? `slide ${slides[0]}` : `slides ${slides.slice(0, 8).join(', ')}${slides.length > 8 ? ' and more' : ''}`
  return `Something else changed that you did not ask for: ${list}. Ctrl+Z puts the whole answer back.`
}
