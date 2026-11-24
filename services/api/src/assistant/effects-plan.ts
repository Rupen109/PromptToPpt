import { EFFECT_INFO, effectApplies } from '@prompttoppt/ui/motion-core'
import { describeElement, type ElementOp } from '@prompttoppt/theme'
import type { EffectPlan, ElementChange, Slide, SlideElement } from '@prompttoppt/validation'

/** the speed WORDS a model may use, as milliseconds: it never writes a duration */
export const EFFECT_SPEED_MS = { fast: 300, normal: 600, slow: 1200 } as const
/** how far a moving effect travels, by name (canvas units) */
export const EFFECT_DISTANCE = { small: 150, medium: 300, large: 600 } as const

/** how the speed changes while it plays, by name (the editor's own curves) */
export const EFFECT_EASING = { smooth: 'ease-in-out', 'slow-start': 'ease-in', 'slow-end': 'ease-out', steady: 'linear', bounce: 'back-out' } as const

export type PlannedEffect = { ok: true; change: ElementChange; notes: string[] } | { ok: false; why: string }

/**
 * Plans ONE animation for ONE object from the same catalogue the editor uses (`EFFECT_INFO`: which objects an effect can play on, which options it understands), or the taking off of all of its
 * animations. An option the effect does not have (a direction on a fade) is dropped WITH a note, never passed on. Nothing here is a number from a model: speed is a word, the rest are the effect's defaults.
 */
export function planEffect(slide: Slide, el: SlideElement, o: Extract<ElementOp, { op: 'animate' | 'animate_clear' | 'animate_order' | 'animate_start' }>, trigger?: { id: string; desc: string }): PlannedEffect {
  const desc = describeElement(el)
  if (slide.locked) return { ok: false, why: 'its slide is locked' }
  if (el.locked) return { ok: false, why: `${desc} is locked` }
  if (slide.layoutId === 'morph' || slide.layoutId === 'morph-template') return { ok: false, why: 'its animation belongs to the template design (change the template or its words instead)' }
  const base = { slideId: slide.id, elementId: el.id, desc }
  if (o.op === 'animate_clear') return { ok: true, notes: [], change: { ...base, effect: o.kind ? { clear: true, kind: o.kind } : { clear: true }, verb: o.kind ? `Removed the ${o.kind} animations from {}` : 'Removed the animations from {}' } }
  if (o.op === 'animate_start') {
    if (!(slide.effects ?? []).some((x) => x.elementId === el.id)) return { ok: false, why: `${desc} has no animation` }
    return { ok: true, notes: [], change: { ...base, effect: { setStart: o.start }, verb: o.start === 'click' ? 'Made the animations of {} start on a click' : o.start === 'after' ? 'Made the animations of {} start by themselves, one after the other' : 'Made the animations of {} start together with the one before' } }
  }
  if (o.op === 'animate_order') {
    // the place in the play order is worked out here, from the slide's own list of animations (the model only says first, last, earlier or later)
    const all = slide.effects ?? []
    const at = all.findIndex((x) => x.elementId === el.id)
    if (at < 0) return { ok: false, why: `${desc} has no animation to move` }
    const to = o.to === 'first' ? 0 : o.to === 'last' ? all.length - 1 : o.to === 'earlier' ? Math.max(0, at - 1) : Math.min(all.length - 1, at + 1)
    return { ok: true, notes: [], change: { ...base, effect: { moveTo: to }, verb: to === at ? `The animation of {} is already ${o.to === 'first' ? 'first' : o.to === 'last' ? 'last' : 'as far as it can go'}` : `Moved the animation of {} ${o.to === 'first' ? 'to the start' : o.to === 'last' ? 'to the end' : o.to} (now ${to + 1} of ${all.length})` } }
  }
  const info = (EFFECT_INFO as Record<string, (typeof EFFECT_INFO)[keyof typeof EFFECT_INFO] | undefined>)[o.effect]
  if (!info || o.effect === 'path-custom') return { ok: false, why: `"${o.effect}" is not an animation I can set (a hand-drawn path needs the editor)` }
  if (!effectApplies(o.effect as never, el)) return { ok: false, why: `${desc} cannot play "${info.label}" (it works on ${(info.on ?? []).map((t) => (t === 'image' ? 'pictures' : `${t}s`)).join(', ')})` }
  const notes: string[] = []
  const plan: Exclude<EffectPlan, { clear: true }> = { type: o.effect }
  if (o.start) plan.start = o.start
  if (o.speed) plan.duration = EFFECT_SPEED_MS[o.speed]
  // exact timing, in seconds as people say it, clamped to what the editor allows
  if (o.seconds !== undefined) plan.duration = Math.round(Math.min(20, Math.max(0.1, o.seconds)) * 1000)
  if (o.delay !== undefined) plan.delay = Math.round(Math.min(20, Math.max(0, o.delay)) * 1000)
  if (o.easing) plan.easing = EFFECT_EASING[o.easing]
  if (trigger) plan.trigger = trigger.id
  if (o.rewind) plan.reverse = true
  if (o.loop) plan.loop = true
  else if (o.repeat !== undefined) plan.repeat = Math.min(20, Math.max(1, Math.round(o.repeat)))
  if (o.distance) { if (info.options.includes('distance')) plan.distance = EFFECT_DISTANCE[o.distance]; else notes.push(`"${info.label}" has no distance, so I left it out.`) }
  if (o.direction) { if (info.options.includes('direction')) plan.direction = o.direction; else notes.push(`"${info.label}" has no direction, so I left it out.`) }
  if (o.by) { if (el.type === 'text' && info.options.includes('textBy')) plan.textBy = o.by; else notes.push(`"${info.label}" cannot be played ${o.by} by ${o.by} on ${desc}, so it plays all at once.`) }
  return { ok: true, notes, change: { ...base, effect: plan, verb: trigger ? `Added the "${info.label}" animation to {}, played when ${trigger.desc} is clicked` : `Added the "${info.label}" animation to {}` } }
}
