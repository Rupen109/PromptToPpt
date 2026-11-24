import { getMorphTemplate, sceneSlidesOfPicture } from '@prompttoppt/theme/morph-templates'
import type { Presentation, Slide } from '@prompttoppt/validation'

/**
 * What the assistant says about animated (Morph) template slides, from the document: the facts are computed here, never guessed. (Section 5 of docs/AI_EDIT_HONESTY_AND_SCENARIOS.md.)
 */
export const isSceneSlide = (s: Slide | undefined) => !!s && (s.content?.layout === 'morph-template' || s.layoutId === 'morph-template' || s.layoutId === 'morph')

/** a new slide in a deck of an animated template is an ordinary slide: it has no scene of the template's own */
export const addSlideNote = (doc: Presentation): string | null =>
  doc.slides.some(isSceneSlide) ? "This deck uses an animated template, so the new slide is an ordinary slide in the deck's colours and fonts: it has no Morph scene of its own." : null

/** taking a scene out of its place changes what the Morph does between its neighbours */
export function sceneMoveNote(doc: Presentation, ids: string[], verb: 'delete' | 'move'): string | null {
  const nos = ids.map((id) => doc.slides.findIndex((s) => s.id === id)).filter((i) => i >= 0 && isSceneSlide(doc.slides[i])).map((i) => i + 1)
  if (!nos.length) return null
  const list = nos.length === 1 ? `Slide ${nos[0]} is a scene` : `Slides ${nos.slice(0, 6).join(', ')} are scenes`
  return `${list} of an animated template, so the Morph between ${verb === 'delete' ? 'the slides next to it' : 'its old and new neighbours'} may look different now. Ctrl+Z puts ${nos.length === 1 ? 'it' : 'them'} back.`
}

/** a picture that is part of a template's artwork is one picture wherever it is used: how many slides show it (and how many of those are locked, which keep theirs) */
export function templatePictureScenes(doc: Presentation, slideId: string, elementId: string): { total: number; locked: number } | null {
  const scenes = sceneSlidesOfPicture(doc.slides, slideId, elementId, getMorphTemplate)
  if (!scenes) return null
  return { total: scenes.length, locked: scenes.filter((s) => s.locked).length }
}

/**
 * Measured on a real Morph deck (a palette change and dark mode both leave every slide exactly as it was: the artwork keeps the template's own colours): the deck's colours change, the template's slides do not.
 * What is said is only that, and where the new colours DO show (slides added later).
 */
export const colourSceneNote = (doc: Presentation): string | null => {
  const scenes = doc.slides.filter(isSceneSlide).length
  return scenes ? `${scenes === doc.slides.length ? 'All' : `${scenes} of the`} ${scenes === doc.slides.length ? `${scenes} slides` : `${doc.slides.length} slides`} use an animated template, whose artwork keeps the template's own colours, so they look the same as before. The new colours show on slides you add later.` : null
}
