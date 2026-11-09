import { MORPH_SCENES, type MorphPlan, type SlideContent } from '@prompttoppt/validation'
import { numberTokens } from './quality.ts'

/**
 * A Morph deck's story. The model writes the concepts and the scenes (generation/prompts: morphPlanPrompt); THIS file decides what is allowed to ship, so the order of the scenes,
 * the spotlights and the figures never depend on the model behaving. Pure functions.
 */
type Scene = (typeof MORPH_SCENES)[number]
type PlanScene = MorphPlan['scenes'][number]

export interface MorphRules {
  /** the user supplied figures: a big-stat scene may show one */
  allowNumeric: boolean
  /** the user supplied a real quotation: a quote scene may use it (a quote is never invented) */
  allowQuote: boolean
  /** the number tokens the user supplied (quality.allowedNumbers) */
  allowedNumbers: ReadonlySet<string>
}

/** Scenes that show the concepts side by side before any one of them takes the stage. */
const OVERVIEW = new Set<Scene>(['hero-left', 'cards-row', 'cards-column', 'cards-grid'])
/** The story told in the middle of a deck: the concepts, each in turn, then how it fits together. */
const MIDDLE: Scene[] = ['hero-left', 'cards-row', 'spotlight', 'spotlight', 'cards-column', 'timeline', 'spotlight', 'spotlight', 'cards-grid', 'compare', 'focus-hero']
/** What a scene that would repeat three times in a row is changed to, in order of preference. */
const VARIETY: Scene[] = ['cards-grid', 'cards-column', 'timeline', 'cards-row', 'compare', 'hero-left']

/** The built-in order of scenes for `n` slides: a cover, the middle of the story, a closing. Used to fill a plan that is short, and as the whole plan when the model's is unusable. */
export function fallbackScenes(n: number): Scene[] {
  if (n <= 1) return ['cover']
  if (n === 2) return ['cover', 'closing']
  const m = n - 2
  const middle = m === 1 ? (['cards-row'] as Scene[]) : m === 2 ? (['cards-row', 'spotlight'] as Scene[]) : Array.from({ length: m }, (_, i) => MIDDLE[i % MIDDLE.length]!)
  return ['cover', ...middle, 'closing']
}

/** Removes figures the user never gave (a bare small number such as "3 ideas" is structure, not a claim). */
export function scrubNumbers(text: string, allowed: ReadonlySet<string>): string {
  const bad = numberTokens(text).filter((t) => !allowed.has(t) && !(/^\d{1,2}$/.test(t) && Number(t) <= 12))
  if (bad.length === 0) return text
  let out = text
  for (const raw of text.match(/\d[\d,.]*\s?(?:%|[kKmMbB]\b|x\b)?/g) ?? []) if (bad.includes(raw.replace(/[,\s]/g, '').toLowerCase())) out = out.replace(raw, '')
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim()
}

const clean = (sc: PlanScene, r: MorphRules): PlanScene => {
  const t = (s: string) => scrubNumbers(s, r.allowedNumbers) || s
  const { stat, kicker, subtitle, ...rest } = sc
  return {
    ...rest, title: t(rest.title),
    ...(kicker ? { kicker: t(kicker) } : {}), ...(subtitle ? { subtitle: t(subtitle) } : {}),
    ...(stat && r.allowNumeric ? { stat } : {}),
  }
}

/**
 * Makes a plan fit the rules, whatever the model returned:
 *  · exactly `n` scenes: extra ones are dropped, missing ones are filled from the built-in story (before the closing)
 *  · a cover first and a closing last
 *  · a quote only when the user gave a real quote; a big stat only when the user gave a figure
 *  · a spotlight only after the concepts have been shown side by side, and each spotlight on a different concept than the one before
 *  · never the same scene three times in a row
 *  · figures the user never gave are removed from the words
 */
export function sanitizeMorphPlan(raw: MorphPlan, n: number, r: MorphRules): MorphPlan {
  const concepts = raw.concepts.slice(0, 4)
  const fb = fallbackScenes(n)
  const scenes: PlanScene[] = raw.scenes.slice(0, n).map((s) => clean(s, r))
  // missing scenes: words taken from the concepts, in turn, placed before the closing
  for (let k = 0; scenes.length < n; k++) {
    const c = concepts[k % concepts.length]!
    scenes.splice(Math.max(1, scenes.length - 1), 0, { scene: fb[Math.min(scenes.length, fb.length - 1)]!, title: c.heading, subtitle: c.text, notes: '' })
  }
  if (scenes.length === 0) return { ...raw, concepts, scenes: [] }
  scenes[0] = { ...scenes[0]!, scene: 'cover' }
  if (n >= 2) scenes[n - 1] = { ...scenes[n - 1]!, scene: 'closing' }
  for (let i = 1; i < n - 1; i++) if (scenes[i]!.scene === 'cover' || scenes[i]!.scene === 'closing') scenes[i] = { ...scenes[i]!, scene: fb[i] === 'cover' || fb[i] === 'closing' ? 'cards-row' : fb[i]! }

  let shown = false // the concepts have been shown side by side
  let lastFocus = -1
  let turn = 0
  for (let i = 0; i < n; i++) {
    let s = scenes[i]!
    if (s.scene === 'quote' && !r.allowQuote) s = { ...s, scene: 'focus-hero' }
    if (s.scene === 'big-stat' && !(r.allowNumeric && s.stat)) s = { ...s, scene: 'cards-grid' }
    if (s.scene === 'spotlight' && !shown) s = { ...s, scene: 'cards-row' }
    if (i >= 2 && scenes[i - 1]!.scene === s.scene && scenes[i - 2]!.scene === s.scene) {
      const avoid = new Set<Scene>([s.scene, i + 1 < n ? scenes[i + 1]!.scene : s.scene, 'cover', 'closing'])
      s = { ...s, scene: VARIETY.find((v) => !avoid.has(v) && !(v === 'spotlight' && !shown)) ?? 'cards-grid' }
    }
    if (OVERVIEW.has(s.scene)) shown = true
    if (s.scene === 'spotlight') {
      // the model's choice when it is a real concept and not the one just shown; otherwise the next concept in turn
      const wanted = s.focus !== undefined && s.focus < concepts.length && s.focus !== lastFocus ? s.focus : -1
      const focus = wanted >= 0 ? wanted : (() => { let f = turn % concepts.length; if (f === lastFocus && concepts.length > 1) f = (f + 1) % concepts.length; return f })()
      turn = focus + 1
      lastFocus = focus
      s = { ...s, focus }
    } else if (s.focus !== undefined) { const { focus: _f, ...rest } = s; s = rest as PlanScene }
    if (s.scene !== 'big-stat' && s.stat) { const { stat: _s, ...rest } = s; s = rest as PlanScene }
    scenes[i] = s
  }
  return { ...raw, concepts, scenes }
}

export interface HeroPicture { url: string; alt: string; attribution?: { source: string; license: string; url?: string } }

/** The slides' content: the same concepts (cards) on every slide, and the deck's one picture. */
export function morphContents(plan: MorphPlan, hero?: HeroPicture | null): SlideContent[] {
  return plan.scenes.map((s) => ({
    layout: 'morph', scene: s.scene, title: s.title,
    ...(s.kicker ? { kicker: s.kicker } : {}), ...(s.subtitle ? { subtitle: s.subtitle } : {}),
    items: plan.concepts.map((c) => ({ heading: c.heading, text: c.text })),
    ...(s.focus !== undefined ? { focus: s.focus } : {}), ...(s.stat ? { stat: s.stat } : {}),
    ...(plan.imageIntent ? { imagePrompt: plan.imageIntent } : {}),
    ...(hero ? { imageUrl: hero.url, imageAlt: hero.alt.slice(0, 200), ...(hero.attribution ? { imageAttribution: hero.attribution } : {}) } : {}),
    speakerNotes: s.notes.slice(0, 1500), sources: [],
  }) as SlideContent)
}
