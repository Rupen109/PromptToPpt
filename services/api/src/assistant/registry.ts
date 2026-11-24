import { NOT_REVIEWED, REVIEW_CHECKS } from '@prompttoppt/theme'
import type { Entitlements } from '@prompttoppt/validation'
import { META } from './capabilities/meta.ts'
import { NEVER, NOT_YET } from './not-supported.ts'
import { describeReadable } from '../sources/readable.ts'
import type { CapabilityMeta, CapabilityPart, SlideKind } from './capabilities/types.ts'
import { SCENARIO_FAMILIES } from './scenarios.ts'
import { FAMILIES, type Family } from './understand.ts'

/**
 * What the assistant knows about ITSELF, generated from the capability metadata (capabilities/meta.ts), the person's plan, the feature flags, the deck and the current slide. Everything the
 * assistant says about what it can do comes from here, never from the model: a capability that is not ready, not covered by scenario tests, switched off, or not in the plan is never offered.
 */
export interface CapCtx {
  features: Pick<Entitlements['features'], 'premiumTemplates'> & Partial<Entitlements['features']>
  /** the feature flags that matter here (background_removal, image_generation) */
  flags: Record<string, boolean>
  isOwner: boolean
  hasSources: boolean
  planName?: string | undefined
  /** the slide on screen, if any */
  slide?: { n: number; layout: string; locked: boolean; fromFile?: boolean } | null | undefined
}

export type Why = 'not_ready' | 'flag' | 'plan' | 'owner' | 'sources' | 'template' | 'locked'
export type Availability = { available: true } | { available: false; why: Why; text: string }
export interface PartView { id: string; label: string; examples: string[]; availability: Availability; note?: string | undefined; noChip?: boolean | undefined }
export interface CapabilityView { family: Family; label: string; description: string; examples: string[]; scopes: CapabilityMeta['scopes']; availability: Availability; parts: PartView[] }

/** A capability is offered only if it is declared ready AND at least one scenario test covers it (scenarios.ts is the data the scenario suite runs): removing the tests removes the capability. */
export const isReady = (family: Family): boolean => META[family].ready && SCENARIO_FAMILIES.has(family)

export const slideKindOf = (layout: string | undefined, fromFile = false): SlideKind => (layout === 'morph-template' ? 'morph-template' : layout === 'morph' ? 'morph' : fromFile ? 'own-template' : 'normal')

const no = (why: Why, text: string): Availability => ({ available: false, why, text })

function partAvailability(p: CapabilityPart, ctx: CapCtx): Availability {
  if (p.flag && ctx.flags[p.flag] === false) return no('flag', `${p.label}: not available right now${p.note ? ` (${p.note})` : ''}`)
  if (p.feature && !(ctx.features as Record<string, unknown>)[p.feature]) return no('plan', `${p.label}: needs a higher plan${ctx.planName ? ` than ${ctx.planName}` : ''}`)
  return { available: true }
}

export function capabilityAvailability(family: Family, ctx: CapCtx): Availability {
  const m = META[family]
  if (!isReady(family)) return no('not_ready', 'not available yet')
  if (m.ownerOnly && !ctx.isOwner) return no('owner', 'only the owner of the presentation can do this')
  if (m.needsFeature && !(ctx.features as Record<string, unknown>)[m.needsFeature]) return no('plan', `needs a plan with ${m.needsFeature === 'advancedEditor' ? 'the advanced editor' : 'brand kits'}`)
  if (m.needsSources && !ctx.hasSources) return no('sources', 'attach a document or a link first')
  if (m.parts?.length && m.parts.every((p) => !partAvailability(p, ctx).available)) return no('plan', 'not available on your plan or right now')
  const s = ctx.slide
  if (s) {
    const t = m.templates?.[slideKindOf(s.layout, s.fromFile) as Exclude<SlideKind, 'normal'>]
    if (t) return no('template', `not on this slide: ${t.why}`)
  }
  return { available: true }
}

export function capabilityViews(ctx: CapCtx): CapabilityView[] {
  return FAMILIES.map((family): CapabilityView => {
    const m = META[family]
    return { family, label: m.label, description: m.description, examples: m.examples, scopes: m.scopes, availability: capabilityAvailability(family, ctx), parts: (m.parts ?? []).map((p) => ({ id: p.id, label: p.label, examples: p.examples, availability: partAvailability(p, ctx), note: p.note, noChip: p.noChip })) }
  })
}

/** What the person might expect but the assistant cannot do yet (so "not supported" is a fact in code, with the way to get it done). */

const bullets = (rows: string[]) => rows.map((r) => `• ${r}`).join('\n')

/** The answer to "what can you do?" (topic all), "what can you edit on this slide?" (slide) and "what is in my plan?" (plan). */
export function describeCapabilities(ctx: CapCtx, topic: 'all' | 'slide' | 'plan' = 'all'): string {
  const views = capabilityViews(ctx)
  const ok = views.filter((v) => v.availability.available)
  const partsOff = ok.flatMap((v) => v.parts.filter((p) => !p.availability.available).map((p) => (p.availability as { text: string }).text))
  const off = views.filter((v) => !v.availability.available && v.availability.why !== 'not_ready')
  const line = (v: CapabilityView) => {
    const on = v.parts.filter((p) => p.availability.available).map((p) => p.label)
    return `${v.label}${on.length ? ` — ${on.join(', ')}` : ''}${v.examples[0] ? ` (for example: "${v.examples[0]}")` : ''}`
  }
  if (topic === 'slide') {
    const s = ctx.slide
    if (!s) return 'Open or select a slide and ask again; I can tell you what I can do on it.'
    if (s.locked) return `Slide ${s.n} is locked, so I will not change it. Unlock it (or ask me to) and I can: ${ok.filter((v) => v.scopes.some((x) => x === 'slide' || x === 'slides')).map((v) => v.label).join('; ')}.`
    const here = ok.filter((v) => v.scopes.some((x) => x === 'slide' || x === 'slides'))
    const blocked = views.filter((v) => v.availability.available === false && v.availability.why === 'template' && v.scopes.some((x) => x === 'slide' || x === 'slides')).map((v) => `${v.label}: ${(v.availability as { text: string }).text}`)
    return [`On slide ${s.n} I can:`, bullets(here.map(line)), ...(blocked.length ? ['', 'Not on this slide:', bullets(blocked)] : []), ...(partsOff.length ? ['', 'Not available right now:', bullets(partsOff)] : [])].join('\n')
  }
  if (topic === 'plan') {
    const planned = [...off.map((v) => `${v.label}: ${(v.availability as { text: string }).text}`), ...partsOff]
    return [`${ctx.planName ? `On your ${ctx.planName} plan` : 'With your plan'} I can:`, bullets(ok.map((v) => v.label)), ...(planned.length ? ['', 'Not available to you right now:', bullets(planned)] : ['', 'Everything I can do is available to you.'])].join('\n')
  }
  return [
    'Here is what I can do:', bullets(ok.map(line)),
    ...(off.length || partsOff.length ? ['', 'Not available to you right now:', bullets([...off.map((v) => `${v.label}: ${(v.availability as { text: string }).text}`), ...partsOff])] : []),
    '', `I can also review your deck and report: ${REVIEW_CHECKS.map((c) => c.label).join('; ')}. It is advice only (nothing is changed), and I do not judge ${NOT_REVIEWED}.`,
    '', 'Not available yet:', bullets(NOT_YET.map((n) => `${n.label} (${n.instead})`)),
    '', 'Not supported in SlidesDone:', bullets(NEVER.map((n) => `${n.label} (${n.instead})`)),
    '', 'Attach these to your deck as sources and I use what they really say (anything I cannot read, I tell you):', bullets(describeReadable()),
  ].join('\n')
}

/** The short greeting when someone says hello or asks for something that is not an edit: the list is generated, never typed by hand. */
export function capabilitiesGreeting(): string {
  const ready = FAMILIES.filter(isReady).filter((f) => !META[f].ownerOnly && !META[f].needsSources && f !== 'undo')
  return `Hey! Tell me what to update — I can ${ready.map((f) => META[f].label.replace(/ \(.*\)$/, '')).join(', ')}.\nFor example: "make slide 3 shorter". Ask "what can you do?" for the full list.`
}


/** The chip groups of the assistant panel. EXHAUSTIVE over the families: a new capability must say where it is offered, or it does not compile. `null` = never a chip (answers, not actions). */
export type ChipGroup = 'Edit' | 'Design' | 'Create' | 'Animations'
const CHIP_GROUP: Record<Family, ChipGroup | null> = {
  text: 'Edit', layout: 'Design', add_slide: 'Create', remove_slide: 'Edit', move_slide: 'Edit', duplicate_slide: 'Edit', lock_slide: null,
  background: 'Design', readability: 'Edit', picture: 'Create', refresh_pictures: 'Create',
  palette: 'Design', template: 'Design', fonts: 'Design', motion: 'Animations', transition: 'Animations', restructure: 'Edit', combine: null, repair: 'Edit', footer: 'Design',
  undo: null, rewrite_deck: null, enrich: 'Create', element: 'Edit', brand: 'Design', workflow: null, brand_kit: null, comment: null, history: null,
}
export interface Chip { group: ChipGroup; family: Family | 'review'; text: string }

/**
 * The quick actions offered right now: one chip per AVAILABLE capability (or available part), its text taken from the capability's own declared example, so a chip can never ask for something
 * the assistant cannot do on this plan, in this deck, on this slide. At most `perGroup` per group, in declaration order.
 */
export function quickActions(ctx: CapCtx, perGroup = 4): Chip[] {
  // the review is free and always available (it only reports), so it is offered first and counts toward its group
  const out: Chip[] = [{ group: 'Edit', family: 'review', text: 'Review my deck' }]
  const count: Partial<Record<ChipGroup, number>> = { Edit: 1 }
  for (const v of capabilityViews(ctx)) {
    const group = CHIP_GROUP[v.family]
    if (!group || !v.availability.available) continue
    const examples = v.parts.length ? v.parts.filter((p) => p.availability.available && !p.noChip).flatMap((p) => p.examples.slice(0, 1)) : v.examples.slice(0, 1)
    for (const text of examples) {
      if ((count[group] ?? 0) >= perGroup) break
      if (out.some((c) => c.text === text)) continue
      out.push({ group, family: v.family, text: text.charAt(0).toUpperCase() + text.slice(1) })
      count[group] = (count[group] ?? 0) + 1
    }
  }
  return out
}
