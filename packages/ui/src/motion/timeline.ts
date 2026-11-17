import type { Effect } from '@prompttoppt/validation'

/**
 * A slide's effects as a timeline of steps, the way PowerPoint reads it. One clock: every time here is milliseconds from the start of the step, and the player
 * hands each effect to the browser's animation clock with that offset, so nothing runs on its own timer.
 *
 *  · Step 0 is the automatic one: the effects before the first "On Click" (they play when the slide appears). Every "On Click" effect starts a new step.
 *  · "With Previous" starts when the previous effect starts; "After Previous" when the previous one ends. An effect's own delay is added to that.
 */
export interface Placed {
  effect: Effect
  /** where the effect's own timing starts (the moment it is triggered), ms from the step's start */
  at: number
  /** when it begins to move: `at` plus its delay */
  begin: number
  /** when it is done, repeats and playing back included */
  end: number
}
export interface Step { effects: Placed[]; /** ms until everything in the step is finished */ duration: number }

/** how long an effect plays once it has begun: its duration, repeated, and doubled when it plays back to the start. An effect that loops until the end of the slide counts as one round for the timing of what follows. */
export const playTime = (e: Effect) => e.duration * (e.loop ? 1 : e.repeat) * (e.reverse ? 2 : 1)

/** The effects that play when their trigger object is clicked, one group per trigger object, in list order. Inside a group the first effect starts at once; the rest follow With / After Previous. */
export function compileTriggers(effects: readonly Effect[], elementIds: ReadonlySet<string>): Map<string, Step> {
  const groups = new Map<string, Step>()
  const state = new Map<string, { at: number; end: number }>()
  for (const effect of effects) {
    if (!effect.trigger || !elementIds.has(effect.elementId) || !elementIds.has(effect.trigger)) continue
    const step = groups.get(effect.trigger) ?? { effects: [], duration: 0 }
    const st = state.get(effect.trigger) ?? { at: 0, end: 0 }
    const at = step.effects.length === 0 || effect.start === 'click' ? 0 : effect.start === 'with' ? st.at : st.end
    const begin = at + effect.delay, end = begin + playTime(effect)
    step.effects.push({ effect, at, begin, end })
    step.duration = Math.max(step.duration, end)
    groups.set(effect.trigger, step); state.set(effect.trigger, { at, end })
  }
  return groups
}

export function compileTimeline(effects: readonly Effect[], elementIds: ReadonlySet<string>): Step[] {
  const steps: Step[] = [{ effects: [], duration: 0 }]
  let prevAt = 0, prevEnd = 0
  for (const effect of effects) {
    if (effect.trigger) continue // played by a click on its trigger object, not by the slide's sequence
    if (!elementIds.has(effect.elementId)) continue // an effect whose element is gone plays nothing
    if (effect.start === 'click') { steps.push({ effects: [], duration: 0 }); prevAt = 0; prevEnd = 0 } // each On Click starts a step; step 0 stays the automatic one (possibly empty)
    const step = steps[steps.length - 1]!
    const at = effect.start === 'with' ? prevAt : effect.start === 'after' ? prevEnd : 0
    const begin = at + effect.delay
    const end = begin + playTime(effect)
    step.effects.push({ effect, at, begin, end })
    step.duration = Math.max(step.duration, end)
    prevAt = at; prevEnd = end
  }
  return steps
}

/** The elements that are hidden until their first effect plays: those whose first effect is an entrance. (Everything else is on screen from the start.) */
export function initiallyHidden(effects: readonly Effect[], elementIds: ReadonlySet<string>): Set<string> {
  const seen = new Set<string>(), hidden = new Set<string>()
  for (const e of effects) {
    if (!elementIds.has(e.elementId) || seen.has(e.elementId)) continue
    seen.add(e.elementId)
    if (e.category === 'entrance') hidden.add(e.elementId)
  }
  return hidden
}
