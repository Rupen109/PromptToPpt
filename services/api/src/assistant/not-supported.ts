/**
 * What the assistant does NOT do, in one place: the model's own instructions ("put these in unsupported"), the answer to "what can you do?" and the way a refusal is worded all read THIS list, so
 * none of them can drift from what is really built (a stale line here once made the model call working features unsupported). Two kinds, said differently to the person:
 * - NOT_YET: could come later (it needs an editor feature, or has not been built).
 * - NEVER: a decision, not a gap: SlidesDone does not offer it, and the person is told what to do instead.
 */
/** `objects`: it is about an OBJECT on a slide. Those are refused in the second step (which has the full list of object operations and a task to refuse), never in the first, where a model that sees them also flags requests it is already doing. */
export interface Unsupported { /** a short word the model copies (long wording is not copied reliably) */ id: string; label: string; instead: string; objects?: true }

export const NEVER: Unsupported[] = [
  { id: 'video', label: 'video in a presentation', instead: 'video is not supported in SlidesDone presentations' },
  { id: 'icons', label: 'icons and emoji stickers', instead: 'use a picture or a shape instead' },
  // (cropping a picture to a shape, a side or its subject is supported now: element op crop)
  // (a chart's colours, legend, trend line and the figures on it are supported now: element op chart_style)
]

export const NOT_YET: Unsupported[] = [
  { id: 'shape_shadow', label: 'a shadow on a shape or on text such as a heading or a title (only pictures can have a shadow)', instead: 'give a shape an outline or a different colour', objects: true },
  { id: 'hand_path', label: 'draw a motion path by hand', instead: 'draw it in the Animation pane (I can add a line, arc, turn or circle path)', objects: true },
]

/** `deck`: what the first step is told (not the object-level ones); `all`: what the second step is told */
/** the ids the second step must choose from (plus `other` with the person's own words) */
export const UNSUPPORTED_IDS = [...NEVER, ...NOT_YET].map((x) => x.id) as [string, ...string[]]
export const unsupportedLabels = (scope: 'deck' | 'all' = 'all'): string => [...NEVER, ...NOT_YET].filter((x) => scope === 'all' || !x.objects).map((x) => `${x.id} = ${x.label}`).join('; ')

/** the plain answer for one thing that cannot be done: when the model gave the id (or the label) of an item in the lists above, the way forward is added from the list (never worded by the model) */
export function refusalNote(said: string): string {
  const clean = said.replace(/[.\s]+$/, '')
  const hit = [...NEVER, ...NOT_YET].find((x) => x.id === clean.toLowerCase() || x.label.toLowerCase() === clean.toLowerCase())
  return hit ? `I can't do that from the chat: ${hit.label}. ${hit.instead.charAt(0).toUpperCase()}${hit.instead.slice(1)}.` : `I can't do that yet: ${clean}. Ask me "what can you do?" to see what I can.`
}
