import type { z } from 'zod'
import { lockedSlides } from './preflight.ts'
import { transitionMatches } from '@prompttoppt/theme'
import type { TransitionSpec } from '@prompttoppt/validation'
import { numberOf } from '../state.ts'
import { VALUES } from '../understand.ts'
import type { Capability, RunCtx, Step } from './types.ts'

const n = (ctx: RunCtx, id: string) => numberOf(ctx.state, id) || ctx.virtual.slides.findIndex((s) => s.id === id) + 1
const list = (ns: number[]) => (ns.length === 1 ? `slide ${ns[0]}` : `slides ${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`)
/** the speed WORDS the model may use, as the milliseconds the editor stores: the model never writes a duration */
const SPEED = { fast: 300, normal: 500, slow: 1000 } as const
const WORD = { none: 'no transition', fade: 'a fade', slide: 'a slide', zoom: 'a zoom', push: 'a push', wipe: 'a wipe', morph: 'Morph' } as const

/**
 * How slides arrive. The type and the options asked for are planned here (words to numbers, plan and slide rules), the editor applies them with its own transition command, and the check looks at
 * each slide's own transition. Morph is a Gold and Premium feature and needs a slide before it; locked slides and animated-template slides are left alone, each with its reason.
 */
export const transition: Capability<z.infer<typeof VALUES.transition>> = {
  preflight: lockedSlides,
  family: 'transition', values: VALUES.transition, scope: 'slides', cost: 'action',
  async run(ctx, ids, v): Promise<Step> {
    const notes: string[] = [], refused: string[] = [], already: string[] = []
    // "the same as the previous slide": each slide takes the transition of the slide before it (as it is now), said per slide when there is none to take
    if (v.like === 'previous' && !v.type) {
      const transitions: { slideId: string; to: TransitionSpec }[] = []
      for (const id of ids) {
        const i = ctx.virtual.slides.findIndex((s) => s.id === id), slide = ctx.virtual.slides[i], prev = ctx.virtual.slides[i - 1]
        if (!slide) continue
        if (slide.locked) { refused.push(`Slide ${n(ctx, id)} is locked, so I left it.`); continue }
        if (!prev?.transition) { refused.push(`Slide ${n(ctx, id)}: ${prev ? `slide ${i} has no transition of its own` : 'there is no slide before it'}, so I left it.`); continue }
        if (prev.transition.type === 'morph' && !ctx.ent.features.morph) { refused.push(`Slide ${n(ctx, id)}: the slide before it uses Morph, which is on the Gold and Premium plans.`); continue }
        if (transitionMatches(slide.transition, prev.transition as TransitionSpec)) { already.push(`Slide ${n(ctx, id)} already arrives like the slide before it.`); continue }
        transitions.push({ slideId: id, to: structuredClone(prev.transition) as TransitionSpec })
      }
      if (!transitions.length) return { ops: [], notes, refused, already }
      return { ops: [], notes, refused, already, slideOps: { transitions }, applied: [`Gave ${list(transitions.map((t) => n(ctx, t.slideId)))} the transition of the slide before`] }
    }
    const type = v.type ?? 'fade'
    if (type === 'morph' && !ctx.ent.features.morph) return { ops: [], refused: ['Morph transitions are on the Gold and Premium plans, so I changed nothing. Fade, slide, zoom, push, wipe and none are on every plan.'] }
    const spec: TransitionSpec = { type }
    if (v.speed && type !== 'none') spec.duration = SPEED[v.speed]
    if (v.seconds !== undefined && type !== 'none') spec.duration = Math.round(v.seconds * 1000) // (the person's own time)
    if (v.direction) { if (type === 'push' || type === 'wipe') spec.direction = v.direction; else notes.push(`A direction only applies to push and wipe, so I left it out for ${type === 'none' ? 'no transition' : `a ${type}`}.`) }
    if (v.autoAdvanceSeconds !== undefined && type !== 'none') spec.advanceAfter = Math.round(v.autoAdvanceSeconds * 1000)
    // changing MANY slides to another transition keeps Morph where a slide has it (it is what moves that slide's objects): said, unless the person named Morph
    const keepMorph = ids.length > 1 && type !== 'morph' && !/\bmorph\b/i.test(ctx.instruction)
    const keptMorph: number[] = []
    const transitions: { slideId: string; to: TransitionSpec }[] = []
    const same: number[] = []
    for (const id of ids) {
      const slide = ctx.virtual.slides.find((s) => s.id === id)
      if (!slide) continue
      const no = n(ctx, id)
      if (slide.locked) { refused.push(`Slide ${no} is locked, so I left it.`); continue }
      if (type === 'morph' && ctx.virtual.slides[0]?.id === id) { notes.push('Slide 1 has no slide before it, so Morph cannot be used on it.'); continue }
      if (keepMorph && slide.transition?.type === 'morph') { keptMorph.push(no); continue }
      if (transitionMatches(slide.transition, spec)) { same.push(no); continue }
      transitions.push({ slideId: id, to: spec })
    }
    if (same.length) already.push(`${list(same)} already ${same.length === 1 ? 'arrives' : 'arrive'} with ${WORD[type]}.`)
    if (keptMorph.length) notes.push(`${list(keptMorph)} kept ${keptMorph.length === 1 ? 'its' : 'their'} Morph (it moves the objects between slides). Say "replace Morph too" to change ${keptMorph.length === 1 ? 'it' : 'them'} as well.`)
    if (!transitions.length) return { ops: [], notes, refused, already }
    return { ops: [], notes, refused, already, slideOps: { transitions }, applied: [`Set how ${list(transitions.map((t) => n(ctx, t.slideId)))} arrive: ${WORD[type]}${v.seconds !== undefined && type !== 'none' ? ` (${v.seconds} s)` : ''}`] }
  },
}
