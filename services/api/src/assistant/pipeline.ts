import { randomUUID } from 'node:crypto'
import type { ZodType } from 'zod'
import type { Entitlements, Presentation, SlideContent } from '@prompttoppt/validation'
import { compileAssist, type AssistOperation, type CompiledAssist, type ConversationTurn, type RecentChange } from '../ai/ai-assist.ts'
import { CAPABILITIES } from './capabilities/index.ts'
import { emptySlideOps, type Capability, type RunCtx, type SlideOps } from './capabilities/types.ts'
import { writePrompt, type WriteRequest } from './planner.ts'
import { resolveTargets, type Question } from './resolve.ts'
import { buildState, type DeckState } from './state.ts'
import { understandPrompt, type Family, type Intent, type Task } from './understand.ts'

/**
 * The assistant, stage by stage: STATE (facts) → UNDERSTAND (cheapest model) → RESOLVE (code) → DO (capabilities; a writing call only where
 * words must be written) → CHECK (each capability's own check, one targeted retry) → VALIDATE (compileAssist: locks, plan, content sanitiser).
 * The route only does auth, credits and the response; the model calls come in through `deps`, so every stage is testable without a model.
 */
export interface AssistantInput {
  doc: Presentation
  ent: Pick<Entitlements, 'features'>
  instruction: string
  conversation?: ConversationTurn[] | undefined
  activeSlideId?: string | undefined
  onlySlideId?: string | undefined
  recent?: RecentChange[] | undefined
  /** read pages and attached sources: facts a writing task may use */
  material?: { id: string; title: string; text: string }[] | undefined
  hasSources?: boolean | undefined
}

export interface AssistantDeps {
  understand: (p: { system: string; prompt: string }) => Promise<Intent>
  write: <T>(p: { system: string; prompt: string }, schema: ZodType<T>, route: 'quality' | 'fast', card: string) => Promise<T>
  /** called once, after planning and BEFORE any writing call, with the price units of the whole message; throws when the person cannot pay */
  authorize?: ((units: number) => Promise<void>) | undefined
  newId?: (() => string) | undefined
}

export type AssistantOutcome =
  | { kind: 'chat' }
  | { kind: 'off_topic' }
  | { kind: 'answer'; text: string }
  | { kind: 'ask'; question: Question }
  /** `compiled.applied` lists the validated changes; `applied` the slide-management lines (delete, move, duplicate, lock, gradients, picture removal) */
  | { kind: 'done'; compiled: CompiledAssist; slideOps: SlideOps; applied: string[]; notes: string[]; units: number; families: Family[]; written: number }

/** a task ready to run: `index` is its place in the message ("added_by_task" references use it) */
interface Planned { index: number; task: Task; cap: Capability<any>; values: any; estimate: number }

/**
 * Price units of a message (the flat policy: the same as one AI edit, or two when more than one slide is written).
 * One place to change when the owner picks "pay for the work done" (docs/AI_ASSISTANT_V2_ARCHITECTURE.md, section 5).
 */
export function priceUnits(planned: { cap: Capability<any>; estimate: number }[]): number {
  if (planned.every((p) => p.cap.cost === 'free')) return 0
  const written = planned.filter((p) => p.cap.cost === 'writing').reduce((a, p) => a + p.estimate, 0)
  return written > 1 ? 2 : 1
}

export async function runAssistant(input: AssistantInput, deps: AssistantDeps): Promise<AssistantOutcome> {
  const state = buildState(input.doc, { activeSlideId: input.activeSlideId, onlySlideId: input.onlySlideId, recent: input.recent, hasSources: input.hasSources })
  const intent = await deps.understand(understandPrompt(state, input.instruction, input.conversation ?? []))
  if (intent.kind === 'chat') return { kind: 'chat' }
  if (intent.kind === 'off_topic') return { kind: 'off_topic' }
  if (intent.kind === 'question') return intent.answer ? { kind: 'answer', text: intent.answer } : { kind: 'chat' }
  if (intent.clarity === 'ask' && intent.question) return { kind: 'ask', question: { text: intent.question, options: [] } }

  // PLAN: every task's values checked and its slides resolved before anything runs or is charged; a question stops here for free
  const notes: string[] = [...intent.unsupported]
  const planned: Planned[] = []
  for (const [index, task] of intent.tasks.entries()) {
    const cap = CAPABILITIES[task.family]
    const parsed = cap.values.safeParse(task.values)
    if (!parsed.success) { notes.push(`I didn't understand the details of the ${task.family.replace(/_/g, ' ')} change; tell me a bit more.`); continue }
    if (cap.deckWide && state.onlySlideId) { notes.push('Only the selected slide can be changed here — switch to "Whole deck" for theme, colour and animation changes.'); continue }
    const estimate = estimateSlides(state, task, cap, parsed.data, input.instruction, planned)
    if (typeof estimate !== 'number') { if ('ask' in estimate) return { kind: 'ask', question: estimate.ask }; notes.push(estimate.refuse); continue }
    planned.push({ index, task, cap, values: parsed.data, estimate })
  }
  if (planned.length === 0) return done(input, state, [], emptySlideOps(), [], notes, 0, [], 0)

  const units = priceUnits(planned)
  await deps.authorize?.(units)

  // EXECUTE: in order; each task sees the slides earlier tasks added
  const newId = deps.newId ?? (() => randomUUID().replace(/-/g, '').slice(0, 12))
  const virtual: Presentation = structuredClone(input.doc)
  const addedByTask = new Map<number, string[]>()
  const ops: AssistOperation[] = []
  const slideOps = emptySlideOps()
  const applied: string[] = []
  let written = 0
  const ctxFor = (): RunCtx => ({
    state, virtual, ent: input.ent, instruction: input.instruction, material: input.material ?? [], newId,
    resolveAnchor: (refs) => resolveTargets(state, refs, { instruction: input.instruction, addedByTask, anchor: true }),
    write: <T,>(req: WriteRequest<T>) => deps.write(writePrompt(req, state.look, input.doc.language), req.schema, req.route, req.card),
  })
  for (const p of planned) {
    const ctx = ctxFor()
    const r = targetsOf(state, p.task, p.cap, input.instruction, addedByTask)
    if (!r.ok) { notes.push('refuse' in r ? r.refuse : r.ask.text); continue }
    notes.push(...r.notes)
    let step = await p.cap.run(ctx, r.ids, p.values)
    // CHECK: the capability says what the result does not do; one retry names exactly that, then the person is told what is still missing
    const problems = p.cap.check?.(ctx, r.ids, p.values, step) ?? []
    if (problems.length && p.cap.cost === 'writing') {
      const again = await p.cap.run(ctx, r.ids, p.values, problems)
      const still = p.cap.check?.(ctx, r.ids, p.values, again) ?? []
      const keepRetry = still.length < problems.length || (still.length === problems.length && again.ops.length >= step.ops.length)
      if (keepRetry) step = again
      notes.push(...(keepRetry ? still : problems).map((x) => `Not done: ${x}`))
    }
    ops.push(...step.ops)
    for (const k of Object.keys(slideOps) as (keyof SlideOps)[]) (slideOps[k] as unknown[]).push(...((step.slideOps?.[k] as unknown[] | undefined) ?? []))
    applied.push(...(step.applied ?? []))
    notes.push(...(step.notes ?? []))
    written += step.written ?? 0
    if (step.added?.length) { addedByTask.set(p.index, step.added); addToVirtual(virtual, step.ops, slideOps.duplicates) }
  }
  return done(input, state, ops, slideOps, applied, notes, units, planned.map((p) => p.task.family), written, virtual)
}

function targetsOf(state: DeckState, task: Task, cap: Capability<any>, instruction: string, addedByTask: Map<number, string[]>) {
  if (cap.scope === 'deck') return { ok: true as const, ids: [], notes: [] }
  if (cap.scope === 'none') return task.targets.length ? resolveTargets(state, task.targets, { instruction, addedByTask, defaultToCurrent: false }) : { ok: true as const, ids: [], notes: [] }
  return resolveTargets(state, task.targets, { instruction, addedByTask })
}

/** how many slides a task will write (for the price), or the question / refusal its targets lead to */
function estimateSlides(state: DeckState, task: Task, cap: Capability<any>, values: any, instruction: string, planned: Planned[]): number | { ask: Question } | { refuse: string } {
  if (task.family === 'add_slide') return values.count ?? 1
  // slides an earlier task of this message adds are counted from that task's own estimate
  const fromEarlier = task.targets.reduce((a, t) => a + (t.by === 'added_by_task' ? planned.find((p) => p.index === t.task)?.estimate ?? 0 : 0), 0)
  const rest = task.targets.filter((t) => t.by !== 'added_by_task')
  if (fromEarlier && !rest.length) return fromEarlier
  const r = targetsOf(state, { ...task, targets: rest }, cap, instruction, new Map())
  if (!r.ok) return 'ask' in r ? { ask: r.ask } : { refuse: r.refuse }
  return r.ids.length + fromEarlier
}

/** placeholders for slides this message adds, so later tasks (and validation) can target them */
function addToVirtual(virtual: Presentation, ops: AssistOperation[], duplicates: SlideOps['duplicates']) {
  for (const o of ops) {
    if (o.op !== 'add_slide' || !o.id || virtual.slides.some((s) => s.id === o.id)) continue
    const anchor = o.afterSlideId ? virtual.slides.findIndex((s) => s.id === o.afterSlideId) : -1
    const at = o.atStart ? 0 : anchor >= 0 ? anchor + 1 : virtual.slides.length
    virtual.slides.splice(at, 0, { id: o.id, layoutId: o.content.layout, locked: false, elements: [], content: o.content as SlideContent, validation: { status: 'pending', issues: [] } } as unknown as Presentation['slides'][number])
  }
  for (const d of duplicates) {
    if (virtual.slides.some((s) => s.id === d.newId)) continue
    const i = virtual.slides.findIndex((s) => s.id === d.slideId)
    if (i >= 0) virtual.slides.splice(i + 1, 0, { ...structuredClone(virtual.slides[i]!), id: d.newId })
  }
}

function done(input: AssistantInput, state: DeckState, ops: AssistOperation[], slideOps: SlideOps, applied: string[], notes: string[], units: number, families: Family[], written: number, virtual?: Presentation): AssistantOutcome {
  // VALIDATE: the same server checks as always (template ids and plan, palettes, locks, hand-edited slides, the content sanitiser, picture placements)
  const compiled = compileAssist(virtual ?? input.doc, { reply: '', operations: ops, unsupported: [], onTopic: true }, input.ent, state.onlySlideId ? 'slide' : 'deck', state.onlySlideId ?? undefined, (input.material ?? []).map((m) => m.text), state.recent, undefined)
  return { kind: 'done', compiled, slideOps, applied, notes: [...new Set([...notes, ...compiled.notes])], units, families, written }
}
