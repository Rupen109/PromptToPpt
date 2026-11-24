import { MORPH_PROFILES } from './profiles'
import type { MorphTemplate } from './types'

/**
 * Which scenes of a template a deck shows. A template is drawn with a fixed story (11 to 20 scenes), but a request may not suit every scene (a scene built around figures when the
 * request has none, a "who is who" scene when no people are named), and a person may want a shorter deck. Scenes can be left out, as long as the Morph still moves as one piece:
 *
 *  · the first scene and the last are never left out;
 *  · after a scene goes, the scenes on either side of it must still share enough visible objects to morph into each other (MIN_SHARED, the rule templates are authored to);
 *  · for a SHORTER deck only the template's `droppable` scenes go (its profile), the least important first; scenes that cannot be filled go regardless, when they can.
 *
 * Pure: the create page, the start of a job and the job itself all get the same answer from the same inputs.
 */
export const MIN_SHARED = 3

const SLIDE_W = 1920, SLIDE_H = 1080
/** the ids of the objects a viewer sees on a scene (on the slide, not a parked staging copy) */
function visible(t: MorphTemplate, sceneId: string): Set<string> {
  const n = Number(sceneId.replace(/^s/, ''))
  const slide = t.data.slides.find((s) => s.n === n)
  return new Set((slide?.objects ?? []).filter((o) => (o.alpha ?? 1) >= 0.5 && o.x + o.w > 0 && o.x < SLIDE_W && o.y + o.h > 0 && o.y < SLIDE_H).map((o) => o.id))
}
/** how many visible objects two scenes have in common */
export function sharedObjects(t: MorphTemplate, a: string, b: string): number {
  const x = visible(t, a), y = visible(t, b)
  let n = 0
  for (const id of x) if (y.has(id)) n++
  return n
}

export interface SceneChoice {
  /** the scenes the deck shows, in order */
  scenes: string[]
  /** the scenes left out, and why */
  dropped: { scene: string; why: 'cannot-fill' | 'shorter' }[]
  /** every length this request can have, longest first (the first is the deck without the scenes that cannot be filled) */
  lengths: number[]
}

/**
 * @param drop   scenes the request cannot fill: left out whenever the Morph can still bridge the gap (the others stay, and their empty boxes are reported)
 * @param length the number of slides wanted (shorter than the template's); omitted or not reachable → as many as can be kept
 */
export function chooseScenes(t: MorphTemplate, o: { drop?: readonly string[]; length?: number | undefined } = {}): SceneChoice {
  const all = t.scenes.map((s) => s.id)
  const keep = [...all]
  const dropped: SceneChoice['dropped'] = []
  const canGo = (list: string[], id: string) => {
    const i = list.indexOf(id)
    if (i <= 0 || i >= list.length - 1) return false // never the first or the last
    return sharedObjects(t, list[i - 1]!, list[i + 1]!) >= MIN_SHARED
  }
  const remove = (list: string[], id: string) => { list.splice(list.indexOf(id), 1) }
  for (const id of o.drop ?? []) if (keep.includes(id) && canGo(keep, id)) { remove(keep, id); dropped.push({ scene: id, why: 'cannot-fill' }) }
  const order = (MORPH_PROFILES[t.id]?.droppable ?? []).filter((id) => all.includes(id))
  // every length reachable by leaving out the template's droppable scenes in order
  const sim = [...keep]
  const lengths = [sim.length]
  for (const id of order) if (sim.includes(id) && canGo(sim, id)) { remove(sim, id); lengths.push(sim.length) }
  // the deck itself
  if (o.length !== undefined && o.length < keep.length) {
    for (const id of order) {
      if (keep.length <= o.length) break
      if (keep.includes(id) && canGo(keep, id)) { remove(keep, id); dropped.push({ scene: id, why: 'shorter' }) }
    }
  }
  return { scenes: keep, dropped, lengths }
}
