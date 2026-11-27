import { z } from 'zod'

/**
 * The plan of a whole-deck change ("make it more professional", "turn it into an investor pitch", "fit 15 minutes"): ONE action per slide, the slides to add
 * and where, the new order, and the brief every writing call shares. It is written by the model, checked by code (capabilities/transform.ts checkPlan), shown
 * to the person, and comes back as `confirm: { kind: 'transform', plan }` when they say "Go ahead". Nothing in it is trusted on the way back: it is checked again
 * against the deck as it is then. This file holds only the shape (zod), so both the route's input schema and the capability can use it without a cycle.
 */
const nullsOut = (v: unknown): unknown => (Array.isArray(v) ? v.map(nullsOut) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, nullsOut(x)])) : v)

export const TRANSFORM_ACTIONS = ['keep', 'rewrite', 'shorten', 'expand', 'layout', 'delete'] as const
export type TransformAction = (typeof TRANSFORM_ACTIONS)[number]

export const transformPlanSchema = z.preprocess(nullsOut, z.object({
  /** what the deck is to become, in the person's words (the goal), and the brief every writer follows (audience, tone, what to lead with): written by the model from the goal */
  goal: z.string().min(2).max(400),
  brief: z.string().min(10).max(700),
  actions: z.array(z.object({
    slideId: z.string().min(1).max(64),
    action: z.enum(TRANSFORM_ACTIONS),
    /** for rewrite / shorten / expand / layout: one line of direction for that slide ("lead with the 32% saving; drop the history") */
    note: z.string().max(240).optional(),
    /** for layout: the layout to use (one of the deck's layouts); absent = the writer chooses */
    layout: z.string().max(40).optional(),
    /** for delete: why (shown to the person) */
    reason: z.string().max(160).optional(),
  })).max(80),
  /** new slides: after which existing slide (null = at the end), with a title and what they say; a pitch section the deck has no material for gets blanks, never invented figures */
  add: z.array(z.object({ afterSlideId: z.string().max(64).nullable(), title: z.string().min(1).max(120), about: z.string().min(1).max(300), layout: z.string().max(40).optional(), /** before every other slide */ atStart: z.boolean().optional() })).max(10).default([]),
  /** the surviving existing slides in their new order (ids); absent = the order stays */
  order: z.array(z.string().max(64)).max(80).optional(),
  /** section divider slides to add, each before the slide named */
  sections: z.array(z.object({ title: z.string().min(1).max(60), beforeSlideId: z.string().max(64) })).max(8).optional(),
  /** a talk length: every surviving slide gets speaker notes of about this many seconds (code counts the words) */
  notesSeconds: z.number().int().min(10).max(600).optional(),
}))
export type TransformPlan = z.output<typeof transformPlanSchema>

/** how many slides a plan WRITES (the price before "Go ahead": one AI edit, then each further written slide): rewritten, re-laid-out, added, and notes written on kept slides */
export function transformWrites(plan: TransformPlan): number {
  const written = plan.actions.filter((a) => a.action !== 'keep' && a.action !== 'delete').length
  const kept = plan.notesSeconds ? plan.actions.filter((a) => a.action === 'keep').length : 0
  return written + kept + plan.add.length
}
