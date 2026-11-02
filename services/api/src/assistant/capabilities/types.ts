import type { ZodType } from 'zod'
import type { Entitlements, Presentation } from '@prompttoppt/validation'
import type { AssistOperation } from '../../ai/ai-assist.ts'
import type { Family, Ref } from '../understand.ts'
import type { DeckState } from '../state.ts'
import type { Resolved } from '../resolve.ts'
import type { WriteRequest } from '../planner.ts'

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
  gradients: { slideId: string; from: string; to: string }[]
  /** remove the pictures of a slide: its background picture and the photos placed on it */
  clearPictures: string[]
}
export const emptySlideOps = (): SlideOps => ({ removals: [], moves: [], duplicates: [], locks: [], gradients: [], clearPictures: [] })

export interface Step {
  /** validated afterwards by compileAssist (template/plan gates, locks, the content sanitiser, picture placements…) */
  ops: AssistOperation[]
  slideOps?: Partial<SlideOps> | undefined
  /** what to tell the person for work done outside compileAssist (slide management) */
  applied?: string[] | undefined
  notes?: string[] | undefined
  /** ids of slides this step adds, so a later task of the same message can target them */
  added?: string[] | undefined
  /** slides whose words a model wrote (pricing) */
  written?: number | undefined
}

export interface RunCtx {
  state: DeckState
  /** the deck plus slides added by earlier tasks of the same message (validation and targets see them) */
  virtual: Presentation
  ent: Pick<Entitlements, 'features'>
  instruction: string
  /** stage 4b: one focused writing call (the planner adds the ledger, budget and model) */
  write: <T>(req: WriteRequest<T>) => Promise<T>
  /** resolves a POSITION given as a value ("after slide 3"): exact, no default slide, no "This slide" limit */
  resolveAnchor: (refs: Ref[]) => Resolved
  /** page texts and deck sources a text task may use as facts */
  material: { id: string; title: string; text: string }[]
  newId: () => string
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
  /** STAGE 5: what the person asked for that the result does not do; one retry is made with these problems named */
  check?: (ctx: RunCtx, ids: string[], v: V, step: Step) => string[]
}
