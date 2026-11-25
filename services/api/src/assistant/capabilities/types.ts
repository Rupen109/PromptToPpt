import type { ZodType } from 'zod'
import type { ElementChange, Entitlements, Restructure, ExpectationKind, Presentation, SlideBrand, Theme, TransitionSpec } from '@prompttoppt/validation'
import type { AssistOperation } from '../../ai/ai-assist.ts'
import type { Family, Ref } from '../understand.ts'
import type { DeckState } from '../state.ts'
import type { Question, Resolved } from '../resolve.ts'
import type { WriteRequest } from '../planner.ts'
import type { SiteBrandResult } from '../site-brand.ts'
import type { LogoBrand } from '../../media/logo-colours.ts'

/**
 * STAGE 4: one capability per task family. A capability is the ONLY place that knows how its kind of task is done: what values it needs,
 * which slides it may touch, whether it needs a writing call, what "done" means (its check) and what it costs. Adding an ability is one
 * entry here plus one editor command; no shared prompt changes.
 */

/** Changes the editor applies that have no AssistOperation of their own (slide management and looks done purely by code). */
export interface SlideOps {
  removals: string[]
  moves: { slideId: string; afterSlideId: string | null }[]
  duplicates: { slideId: string; newId: string }[]
  locks: { slideId: string; locked: boolean }[]
  /** how slides arrive (the type and the options asked for) */
  transitions: { slideId: string; to: TransitionSpec }[]
  gradients: { slideId: string; from: string; to: string; /** from the middle out (absent = linear) */ kind?: 'radial' | undefined }[]
  /** a background picture softened (0 = sharp again) */
  blurs: { slideId: string; blur: number }[]
  /** a pattern over a slide's background colour (null = none) */
  patterns: { slideId: string; kind: 'dots' | 'grid' | 'lines' | 'diagonal' | null }[]
  /** remove the pictures of a slide: its background picture and the photos placed on it */
  clearPictures: string[]
  /** pictures whose background is to be cut out (the server does it after the assistant has answered, and says which worked); `line` is the sentence reported when it did */
  cutouts: { slideId: string; elementId: string; url: string; line: string }[]
  /** objects changed in size, place, text or existence (planned into absolute values by packages/theme/src/assist/element-ops.ts) */
  elementChanges: ElementChange[]
  /** the person's own uploaded pictures put where a picture is (no cut-out: nothing to compute) */
  swaps: { slideId: string; elementId: string; url: string; alt: string; /** where the replacing picture came from: a free stock photo (absent = the person's own upload) */ source?: 'photo' | undefined }[]
  /** the deck's theme with the person's saved brand applied (at most one) */
  brandThemes: Theme[]
  /** a brand put on SOME slides only, or taken off them (brand null) */
  slideBrands: { slideIds: string[]; brand: SlideBrand | null }[]
  /** objects the editor is to SELECT ("select all pictures on slide 3"): nothing in the deck changes, so it is free; `say` is the reply */
  select: { slideId: string; elementIds: string[]; say: string }[]
  /** one of the person's OWN uploads put on a slide that has no picture yet (placed like a found photo, checked the same way) */
  uploads: { slideId: string; placement: 'background' | 'beside' | 'floating'; url: string; alt: string }[]
  /** one slide's background, exactly as it is, put on other slides (the editor's copyBackground: "use this background on the whole section") */
  backgroundCopies: { fromSlideId: string; slideIds: string[] }[]
}
export const emptySlideOps = (): SlideOps => ({ slideBrands: [], removals: [], moves: [], duplicates: [], locks: [], transitions: [], gradients: [], blurs: [], patterns: [], clearPictures: [], cutouts: [], elementChanges: [], swaps: [], brandThemes: [], select: [], uploads: [], backgroundCopies: [] })

/** present / export / share, prepared by the assistant and done only when the person presses the button the chat shows */
export type UiAction = { kind: 'present'; fromSlide: number } | { kind: 'export'; format: 'pptx' | 'pdf' | 'png' | 'jpg' | 'html'; /** only these slides (ids), and their numbers when the answer was made (for the button) */ slideIds?: string[]; slides?: number[] } | { kind: 'share'; email?: string | undefined; /** invite them to view and comment only */ role?: 'viewer' | undefined }

export interface Step {
  /** validated afterwards by compileAssist (template/plan gates, locks, the content sanitiser, picture placements…) */
  ops: AssistOperation[]
  slideOps?: Partial<SlideOps> | undefined
  /** what to tell the person for work done outside compileAssist (slide management) */
  applied?: string[] | undefined
  /** a workflow action for the person to confirm with one button (nothing in the deck changes) */
  ui?: UiAction | undefined
  /** done OUTSIDE the deck after the person confirmed (a brand kit saved, a comment added or resolved): what was done */
  outside?: string | undefined
  /** an answer built by code (a comment summary, what changed since the last version): shown as the reply, nothing changed */
  answer?: string | undefined
  /** what the person should know about the work done (info) */
  notes?: string[] | undefined
  /** a part of the request that was NOT done, with the reason (the reply then reads "Partly done" or "I couldn't do that", never just "Done") */
  refused?: string[] | undefined
  /** a part of the request that needed nothing: it already was like that (the reply then reads "Nothing needed changing", never "I couldn't") */
  already?: string[] | undefined
  /** ids of slides this step adds, so a later task of the same message can target them */
  added?: string[] | undefined
  /** instead of changing anything: show the person this plan and ask them to confirm (the options carry what to apply when they do) */
  ask?: Question | undefined
  /** slides whose words a model wrote (pricing) */
  written?: number | undefined
}

export interface RunCtx {
  /** say what this step is doing now, for the person waiting ("Rewriting 12 slides"); optional */
  progress?: ((text: string, done?: number, total?: number) => void) | undefined
  /** the owner of the presentation (an invited editor cannot export or share) */
  isOwner?: boolean | undefined
  /** the deck's comment threads and the Comments panel's own actions (as the person) */
  comments?: { list(): Promise<import('./comments.ts').ThreadInfo[]>; add(slideId: string, pin: { x?: number; y?: number; /** the object the comment is on (its pin follows it) */ elementId?: string }, body: string): Promise<{ ok: true } | { ok: false; why: string }>; resolve(ids: string[]): Promise<number> } | undefined
  /** the deck as it was in its previous saved version, and when that was ("2 hours ago") */
  previousVersion?: (() => Promise<{ doc: import('@prompttoppt/validation').Presentation; when: string } | null>) | undefined
  /** all the person's saved brand kits (Gold, Premium), and the kit actions (the same code and plan rules as the Brand tab) */
  brandKits?: import('./brand-kit.ts').KitInfo[] | undefined
  /** the person's themes made from a brand kit (brand/themes.ts): picked by name like a template */
  brandThemeList?: { id: string; name: string; kitName: string; designName: string; mode: 'light' | 'dark'; theme: Theme }[] | undefined
  kits?: { create(i: Record<string, string>): Promise<{ ok: true } | { ok: false; why: string }>; update(id: string, p: Record<string, unknown>): Promise<{ ok: true } | { ok: false; why: string }>; remove(id: string): Promise<{ ok: true } | { ok: false; why: string }>; createTheme(i: { kitId: string; designId: string; mode: 'light' | 'dark'; name?: string | undefined }): Promise<{ ok: true } | { ok: false; why: string }> } | undefined
  state: DeckState
  /** the deck plus slides added by earlier tasks of the same message (validation and targets see them) */
  virtual: Presentation
  ent: Pick<Entitlements, 'features'>
  instruction: string
  /** stage 4b: one focused writing call (the planner adds the ledger, budget and model) */
  write: <T>(req: WriteRequest<T>) => Promise<T>
  /** resolves a POSITION given as a value ("after slide 3"): exact, no default slide, no "This slide" limit */
  resolveAnchor: (refs: Ref[]) => Resolved
  /** what the person has selected in the editor (the objects "this" and "it" mean) */
  selection: { slideIds: string[]; elementIds: string[] }
  /** the person's own uploaded pictures, newest first */
  uploads: { id: string; url: string; name: string }[]
  /** the person's saved (default) brand kit, if they have one */
  brand: { name: string | null; primary: string | null; accent: string | null; headingFont: string | null; bodyFont: string | null; logo: { url: string; aspect: number } | null } | null
  /** page texts and deck sources a text task may use as facts */
  material: { id: string; title: string; text: string }[]
  newId: () => string
  /** a plan the person has confirmed (set by the pipeline from the request, never from a model's answer) */
  confirm?: Restructure | undefined
  /** reads a company website's brand (colours, fonts, logo) for "match the brand of …"; absent when the deployment cannot */
  siteBrand?: ((url: string) => Promise<SiteBrandResult>) | undefined
  /** one of the deck's pictures as stored (only the person's own and our stored pictures, never a URL from outside): its bytes and its own shape (width ÷ height) */
  picture?: ((url: string) => Promise<{ aspect: number; bytes: Uint8Array; mime: string } | null>) | undefined
  /** the vision step: where the named subject is in a picture (fractions of the whole picture), or null when it is not there */
  findSubject?: ((pic: { bytes: Uint8Array; mime: string }, subject: string) => Promise<{ x: number; y: number; w: number; h: number } | null>) | undefined
  /** reads the shape and brand colours of one of the person's uploaded logo pictures for "use my logo" */
  logoBrand?: ((url: string) => Promise<LogoBrand>) | undefined
}

/** What a person (and the capabilities answer) can know about a capability. Declared once per family in meta.ts; everything the assistant says about what it can do is generated from this. */
export type SlideKind = 'normal' | 'morph' | 'morph-template' | 'own-template'
export interface CapabilityPart {
  id: string
  label: string
  examples: string[]
  /** a feature flag that must be on for this part (e.g. background removal is development-only until a provider is approved) */
  flag?: string
  /** a plan feature (boolean) the person's plan must have for this part */
  feature?: 'premiumTemplates' | 'brandKit' | 'morph' | 'knowledgeBase' | 'advancedEditor'
  /** never offered as a ready-made chip (it needs something the person has to name, like a website) */
  noChip?: boolean
  /** a note shown with the part (cost, limits) */
  note?: string
}
export interface CapabilityMeta {
  /** short, lower-case, "what I can do": used in sentences like "I can: <label>, <label>" */
  label: string
  description: string
  examples: string[]
  scopes: ('slide' | 'slides' | 'deck')[]
  /** the editor implementation, a verifier and scenario tests exist (the scenario coverage is enforced by a test); false hides the capability everywhere */
  ready: boolean
  /** which expectation kinds verify this capability's result (every ready capability names at least one) */
  verifiedBy: ExpectationKind[]
  /** never changes the deck (present / export / share: one button the PERSON presses): nothing on the deck to verify, the click is the confirmation */
  changesNothing?: boolean
  /** only the owner of the deck can use it */
  ownerOnly?: boolean
  /** a plan feature the person's plan must have (the editor's own gate for the same thing) */
  needsFeature?: 'advancedEditor' | 'brandKit'
  /** needs something attached (a document or a link) */
  needsSources?: boolean
  /** the sub-abilities with their own requirements (flags, plan features, costs) */
  parts?: CapabilityPart[]
  /** what it does on animated-template slides; `refuse` stops it for those slides with `why` */
  templates?: Partial<Record<Exclude<SlideKind, 'normal'>, { rule: 'refuse'; why: string }>>
}

export interface Capability<V = Record<string, unknown>> {
  family: Family
  values: ZodType<V>
  /** 'slides' = acts on target slides (default: the current one); 'deck' = the whole deck; 'none' = no slides (undo, rewrite) */
  scope: 'slides' | 'deck' | 'none'
  /** 'free' (undo), 'action' (done by code), 'writing' (a model writes slide content) */
  cost: 'free' | 'action' | 'writing'
  /** deck-wide families cannot run while the panel is limited to one slide */
  deckWide?: boolean
  run: (ctx: RunCtx, ids: string[], v: V, problems?: string[]) => Promise<Step>
  /**
   * STAGE 5: what the person asked for that the result does not do. One retry is made with these problems named; what is STILL not met after it is withheld, never applied
   * and claimed: a problem with `slideId` withholds that slide's change, one without withholds the whole step. `why` is said to the person.
   */
  check?: (ctx: RunCtx, ids: string[], v: V, step: Step) => Unmet[]
  /** what will be blocked and how much is doable, worked out WITHOUT running (see `Preflight`); absent = nothing this capability does is ever blocked */
  preflight?: (ctx: RunCtx, ids: string[], v: V) => Preflight
}

/** a part of a request the result does not meet (see `Capability.check`) */
export interface Unmet { slideId?: string; why: string }

/**
 * BEFORE anything runs or is charged (docs/AI_EDIT_V3_ARCHITECTURE.md §7): which parts of the request will NOT be done for a reason the person controls (a locked slide or object,
 * a hand-edited slide, an animated-template slide, a limit), and how many parts can be done. When some can and some cannot, the person is asked first ("do the rest?").
 */
export interface Preflight { blocked: { slideId: string; elementId?: string; why: string }[]; doable: number; /** what `doable` counts (default slides) */ unit?: 'slides' | 'objects' }
