import { randomUUID } from 'node:crypto'
import type { ZodType } from 'zod'
import type { Entitlements, Presentation, Restructure, SlideContent } from '@prompttoppt/validation'
import { compileAssist, type AssistOperation, type CompiledAssist, type ConversationTurn, type RecentChange } from '../ai/ai-assist.ts'
import { CAPABILITIES } from './capabilities/index.ts'
import { META } from './capabilities/meta.ts'
import { brandReview } from './brand-review.ts'
import type { UiAction } from './capabilities/types.ts'
import { refusalNote } from './not-supported.ts'
import { STORY_RULES, composeStory, storyAdviceSchema, storyOutline } from './story-advice.ts'
import { reviewDeck, reviewFindings } from '@prompttoppt/theme'
import { repairRewriteCount } from './capabilities/repair.ts'
import { capabilityViews, describeCapabilities, isReady, slideKindOf, type CapCtx } from './registry.ts'
import type { SlideKind } from './capabilities/types.ts'
import { emptySlideOps, type Capability, type Preflight, type RunCtx, type SlideOps, type Step, type Unmet } from './capabilities/types.ts'
import { blockedText } from './capabilities/preflight.ts'
import { writePrompt, type WriteRequest } from './planner.ts'
import { needsObjects, resolveElements, resolveTargets, type Question } from './resolve.ts'
import { buildState, type DeckState } from './state.ts'
import { intentSchema, objectsPrompt, understandPrompt, type ElementOpsAnswer, type Family, type Intent, type Task } from './understand.ts'

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
  /** who is asking, what their plan has and which flags are on: what the assistant may do is decided from these (registry.ts), not guessed */
  isOwner?: boolean | undefined
  /** what the person has selected in the editor right now */
  selection?: { slideIds?: string[] | undefined; elementIds?: string[] | undefined } | undefined
  /** the person's own uploaded pictures (newest first) and saved brand kit, loaded by the route */
  uploads?: { id: string; url: string; name: string }[] | undefined
  brand?: RunCtx['brand'] | undefined
  siteBrand?: RunCtx['siteBrand']
  picture?: RunCtx['picture']
  brandKits?: RunCtx['brandKits']
  brandThemeList?: RunCtx['brandThemeList']
  comments?: RunCtx['comments']
  previousVersion?: RunCtx['previousVersion']
  kits?: RunCtx['kits']
  findSubject?: RunCtx['findSubject']
  logoBrand?: RunCtx['logoBrand']
  /** a deck-level plan the person confirmed (see capabilities/restructure.ts) */
  confirm?: Restructure | undefined
  flags?: Record<string, boolean> | undefined
  planName?: string | undefined
}

export interface AssistantDeps {
  understand: (p: { system: string; prompt: string }) => Promise<Intent>
  /** the second step for object tasks: which objects and what to do to them (see understand.ts objectsPrompt); absent = the first step's operations are used as they are */
  understandOps?: ((p: { system: string; prompt: string }) => Promise<ElementOpsAnswer>) | undefined
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
  | { kind: 'done'; /** a workflow action prepared for the person to confirm */ ui?: UiAction; /** done outside the deck (confirmed): what was done */ outside?: string[]; /** answers built by code (summaries) */ answers?: string[]; compiled: CompiledAssist; slideOps: SlideOps; applied: string[]; notes: string[]; /** the notes that are a part NOT done */ refused: string[]; /** the notes that say a part was already so */ already: string[]; units: number; families: Family[]; written: number; /** what is still to do after a big message (the person's own words, one per part): offered as the next step */ later?: string[]; /** a plan limit is why something was refused: the reason, so the panel can offer the upgrade */ upgrade?: string }

/** how many tasks one message does; a longer message is done step by step (the rest is named and offered as the next step) */
const MAX_STEP = 4

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

/** one task in a few plain words (for the plan preview): what, and where */
function describeTask(t: Task): string {
  const refs = t.targets as { by: string; n?: number; from?: number; to?: number }[]
  const where = !refs.length || refs.every((r) => r.by === 'current') ? 'this slide' : refs.every((r) => r.by === 'added_by_task') ? 'the new slide' : refs.map((r) => (r.by === 'number' ? `slide ${r.n}` : r.by === 'range' ? `slides ${r.from} to ${r.to}` : r.by === 'all' ? 'every slide' : r.by === 'last' ? 'the last slide' : 'the slides named')).join(', ')
  const v = t.values as { type?: string; ops?: { op: string; to?: string; effect?: string }[]; color?: string; request?: string }
  if (t.family === 'duplicate_slide') return `duplicate ${where}`
  if (t.family === 'transition') return v.type === 'morph' ? `use Morph on ${where}` : `${v.type ?? 'a'} transition on ${where}`
  if (t.family === 'element' && v.ops?.length) return `${v.ops.map((o) => (o.op === 'move' ? `move ${o.to ?? ''}`.trim() : o.op === 'animate' ? `animate (${(o.effect ?? '').replace(/-/g, ' ')})` : o.op.replace(/_/g, ' '))).join(', ')} on ${where}`
  if (t.family === 'background' && v.color) return `background ${v.color} on ${where}`
  if (t.family === 'text' && v.request) return `${v.request} (${where})`
  return `${META[t.family].label.split(' (')[0]} (${where})`
}

/** a message with this many separate changes is shown as a plan and confirmed first */
const PREVIEW_AT = 3

export async function runAssistant(input: AssistantInput, deps: AssistantDeps): Promise<AssistantOutcome> {
  const state = buildState(input.doc, { activeSlideId: input.activeSlideId, onlySlideId: input.onlySlideId, recent: input.recent, hasSources: input.hasSources, selection: input.selection })
  // a plan the person confirmed: the model is not asked anything. The same capability applies it after checking it against the deck as it is now (and `confirm` only ever comes from the request)
  const capCtx: CapCtx = { features: input.ent.features as CapCtx['features'], flags: input.flags ?? {}, isOwner: input.isOwner ?? true, hasSources: state.hasSources, planName: input.planName, slide: state.focus.current ? { n: state.slides.find((r) => r.id === state.focus.current)!.n, layout: state.slides.find((r) => r.id === state.focus.current)!.layout, fromFile: state.slides.find((r) => r.id === state.focus.current)!.fromFile, locked: state.slides.find((r) => r.id === state.focus.current)!.locked } : null }
  // "do the rest" (proceed): the person confirmed exactly the tasks they were asked about; they are checked again as new tasks, the model is not asked, and the blocked parts are skipped with their reasons
  const proceed = input.confirm?.kind === 'proceed'
  // the words checks hold a task against ("the name must be your own words", colour words): on a confirm that is what they said BEFORE "yes", in this conversation
  const said = proceed ? personsWords(input) : input.instruction
  let intent: Intent
  if (input.confirm) {
    const parsed = intentSchema.safeParse({ kind: 'edit', clarity: 'act', tasks: input.confirm.kind === 'proceed' ? input.confirm.tasks : [confirmedTask(input.confirm, state)] })
    // a confirmation that does not hold up any more (an edited or tampered payload) changes nothing and is said plainly, never an error
    if (!parsed.success) { const t = 'That confirmation does not match what I can do any more, so nothing was changed. Please ask again.'; return done(input, state, [], emptySlideOps(), [], [t], { refused: [t], already: [] }, 0, [], 0) }
    intent = parsed.data
  } else intent = await deps.understand(understandPrompt(state, input.instruction, input.conversation ?? []))
  // "I can't do that yet" must never be a mistake: when the model returned ONLY unsupported parts, it gets one second look at the list of what can really be done for this person now (made by code from the registry)
  if (!input.confirm && intent.kind === 'edit' && intent.tasks.length === 0 && intent.unsupported.length > 0) {
    const first = understandPrompt(state, input.instruction, input.conversation ?? [])
    const can = capabilityViews(capCtx).filter((v) => v.availability.available).map((v) => `- ${v.label}`).join('\n')
    const again = await deps.understand({ ...first, prompt: `${first.prompt}\n\n<second look>\nYou said these parts cannot be done: ${JSON.stringify(intent.unsupported)}.\nCheck each against this list of what CAN be done for this person right now. If one fits EXACTLY, answer with that task. Keep a part as unsupported only if nothing in the list does it.\n${can}\n</second look>` })
    if (again.kind !== 'edit' || again.tasks.length > 0) intent = again
  }


  // A big message is done STEP BY STEP: the first few tasks now, the rest named (in the person's own words) and offered as the next step. Nothing is dropped silently, and nothing is charged for what is not done.
  const later: string[] = input.confirm?.kind === 'proceed' ? [...(input.confirm.later ?? [])] : [] // (a confirmed plan keeps what was left for the next step)
  if (intent.tasks.length > MAX_STEP) { later.push(...intent.tasks.slice(MAX_STEP).map((t) => t.phrase?.trim() || META[t.family].label)); intent = { ...intent, tasks: intent.tasks.slice(0, MAX_STEP) } }

  // STEP 2 for objects: the first step only found that the message is about objects; which objects and what to do to them is decided now, with the full operation list
  const needOps = !input.confirm && intent.kind === 'edit' && deps.understandOps ? intent.tasks.map((t, i) => ({ t, i })).filter(({ t }) => t.family === 'element' && !(t.values as { ops?: unknown[] }).ops?.length) : []
  if (needOps.length && deps.understandOps) {
    const got = await deps.understandOps(objectsPrompt(state, input.instruction, needOps.map(({ t, i }) => ({ index: i, targets: t.targets })), input.conversation ?? []))
    const byIndex = new Map(got.tasks.map((r) => [r.index, r]))
    const asked = got.tasks.find((r) => r.ask && needOps.some((n) => n.i === r.index))
    if (asked?.ask) return { kind: 'ask', question: { text: asked.ask, options: [] } }
    const refused = got.tasks.filter((r) => r.unsupported && needOps.some((n) => n.i === r.index))
    intent = { ...intent, unsupported: [...intent.unsupported, ...refused.map((r) => (r.unsupported === 'other' ? r.said?.trim() || 'that' : r.unsupported!))], tasks: intent.tasks.filter((_, i) => !refused.some((r) => r.index === i)).map((t) => { const i = intent.tasks.indexOf(t); const r = byIndex.get(i); return r && !r.unsupported && needOps.some((n) => n.i === i) ? { ...t, values: { elements: r.elements.length ? r.elements : (t.values as { elements?: unknown[] }).elements ?? [], ops: r.ops } } : t }) }
  }
  if (intent.kind === 'help') return { kind: 'answer', text: describeCapabilities(capCtx, intent.help ?? 'all') } // generated from the registry, the plan and the flags: never the model's words
  if (intent.kind === 'edit' && intent.review && intent.tasks.length === 0) intent = { ...intent, kind: 'review' } // a review focus and nothing to change IS a review, whatever kind the model wrote
  if (intent.kind === 'review' && intent.review === 'story') {
    // advice: an opinion from the outline, labelled as one; the deck is not touched
    const outline = storyOutline(input.doc)
    if (outline.length < 3) return { kind: 'answer', text: 'The deck is too short to say much about its story yet. Add a few more slides and ask again.' }
    const advice = await deps.write(writePrompt({ card: 'story_advice', rules: STORY_RULES, input: { outline }, schema: storyAdviceSchema, route: 'fast' } as never, state.look, input.doc.language), storyAdviceSchema, 'fast', 'story_advice')
    return { kind: 'answer', text: composeStory(advice, outline.length) }
  }
  if (intent.kind === 'review' && intent.review === 'brand') return { kind: 'answer', text: brandReview(input.doc, input.brand ?? null, !!(input.ent.features as { brandKit?: boolean }).brandKit) } // (against the saved kit, computed by code: nothing changed)
  if (intent.kind === 'review') return { kind: 'answer', text: reviewDeck(input.doc, intent.review === 'story' || intent.review === 'brand' ? 'all' : intent.review ?? 'all') } // a report of facts computed from the deck by code: never the model's words, nothing changed
  if (intent.kind === 'chat') return { kind: 'chat' }
  if (intent.kind === 'off_topic') return { kind: 'off_topic' }
  if (intent.kind === 'question') return intent.answer ? { kind: 'answer', text: intent.answer } : { kind: 'chat' }
  if (intent.clarity === 'ask' && intent.question) return { kind: 'ask', question: { text: intent.question, options: [] } }

  // PLAN: every task's values checked and its slides resolved before anything runs or is charged; a question stops here for free
  // what no capability does is said by code, in one fixed shape, never worded by the model and never replaced by a nearby action
  const notes: string[] = []
  // every note has a KIND, decided where it is written: a part not done (refused), a part already so (already), or something to know (info)
  const kinds: Kinds = { refused: [], already: [] }
  const refuse = (t: string) => { notes.push(t); kinds.refused.push(t) }
  intent.unsupported.map(refusalNote).forEach(refuse)
  if (later.length) notes.push(`That is a lot for one message, so I am doing it step by step: the first ${MAX_STEP} parts are done here. Still to do: ${later.join('; ')}.`)
  const planned: Planned[] = []
  let upgrade: string | undefined // set when a plan limit (not a switch or a rule) is the reason something was refused: the panel then offers the upgrade
  // a message that asks for MORPH is all or nothing without the Morph plan: never a duplicated, rearranged slide without the Morph that was the point of it
  const wantsMorph = intent.tasks.some((t) => t.family === 'transition' && (t.values as { type?: string }).type === 'morph')
  if (wantsMorph && !(input.ent.features as { morph?: boolean }).morph && intent.tasks.length > 1) {
    const t = 'Morph is on the Gold and Premium plans, so I changed nothing (a Morph sequence without Morph would only leave a copied slide). Fade, slide, zoom, push and wipe are on every plan.'
    const out = done(input, state, [], emptySlideOps(), [], [t], { refused: [t], already: [] }, 0, [], 0)
    return out.kind === 'done' ? { ...out, upgrade: t } : out
  }
  for (const [index, task] of intent.tasks.entries()) {
    const cap = CAPABILITIES[task.family]
    const gate = admit(task, capCtx)
    if (gate) { refuse(gate.text); if (gate.upgrade && !upgrade) upgrade = gate.text; continue }
    const parsed = cap.values.safeParse(task.values)
    if (!parsed.success) { refuse(`I didn't understand the details of the ${task.family.replace(/_/g, ' ')} change; tell me a bit more.`); continue }
    if (cap.deckWide && state.onlySlideId) { refuse('Only the selected slide can be changed here — switch to "Whole deck" for theme, colour and animation changes.'); continue }
    const estimate = estimateSlides(state, task, cap, parsed.data, input.instruction, planned)
    if (typeof estimate !== 'number') { if ('ask' in estimate) return { kind: 'ask', question: estimate.ask }; refuse(estimate.refuse); continue }
    planned.push({ index, task, cap, values: parsed.data, estimate })
  }
  if (planned.length === 0) return { ...done(input, state, [], emptySlideOps(), [], notes, kinds, 0, [], 0), ...(upgrade ? { upgrade } : {}), ...(later.length ? { later } : {}) }

  const newId = deps.newId ?? (() => randomUUID().replace(/-/g, '').slice(0, 12))
  const virtual: Presentation = structuredClone(input.doc)
  const addedByTask = new Map<number, string[]>()
  const ctxFor = (): RunCtx => ({
    state, virtual, ent: input.ent, instruction: said, material: input.material ?? [], newId, selection: state.selection, uploads: input.uploads ?? [], brand: input.brand ?? null, isOwner: input.isOwner ?? true, brandKits: input.brandKits, brandThemeList: input.brandThemeList, kits: input.kits, comments: input.comments, previousVersion: input.previousVersion, siteBrand: input.siteBrand, logoBrand: input.logoBrand, picture: input.picture, findSubject: input.findSubject, confirm: input.confirm,
    resolveAnchor: (refs) => resolveTargets(state, refs, { instruction: input.instruction, addedByTask, anchor: true }),
    write: <T,>(req: WriteRequest<T>) => deps.write(writePrompt(req, state.look, input.doc.language), req.schema, req.route, req.card),
  })

  // PLAN PREVIEW: three or more separate changes in one message are listed first, in the person's own words, and confirmed; nothing runs or is charged before "Go ahead" (the confirm carries the very same tasks: no second reading)
  if (!input.confirm && planned.length >= PREVIEW_AT) {
    // the person's own words when every part has its own clear phrase; otherwise each task said by code (what, where), never fragments of the sentence
    const phrases = planned.map((p) => (p.task.phrase ?? '').trim().toLowerCase())
    const ownWords = phrases.every((x, i) => x.split(/\s+/).length >= 3 && phrases.every((y, j) => i === j || (!y.includes(x) && !x.includes(y))))
    const lines = planned.map((p, i) => `${i + 1}. ${ownWords ? p.task.phrase!.trim() : describeTask(p.task)}`)
    return { kind: 'ask', question: { text: `I'll make these ${planned.length} changes:\n${lines.join('\n')}${later.length ? `\nThen, in the next step: ${later.join('; ')}.` : ''}\nNothing has changed yet. Go ahead?`, options: [{ label: 'Yes, go ahead', reply: 'Yes, go ahead', confirm: { kind: 'proceed', tasks: planned.map((p) => ({ family: p.task.family, targets: p.task.targets, values: p.task.values, ...(p.task.phrase ? { phrase: p.task.phrase } : {}) })), ...(later.length ? { later } : {}) } }, { label: 'No, leave it', reply: 'No, leave it as it is' }] } }
  }

  // FEASIBILITY (before anything runs or is charged): when part of the request will not be done (a locked slide or object, a hand-edited or animated-template slide) and part can,
  // the person is asked first, with the reasons. "Yes" sends the very same tasks back (proceed); "No" changes nothing. Nothing doable at all: the run below says why, as before.
  if (!proceed) {
    let blocked: Preflight['blocked'] = [], doable = 0, objects = false
    for (const p of planned) {
      const r = targetsOf(state, p.task, p.cap, input.instruction, addedByTask)
      if (!r.ok) continue
      const t = templateSplit(state, p.task.family, r.ids)
      blocked = [...blocked, ...t.refused.map((id) => ({ slideId: id, why: templateWhy(state, p.task.family, id) }))]
      const pf = p.cap.preflight?.(ctxFor(), t.ids, p.values)
      if (pf) { blocked = [...blocked, ...pf.blocked]; doable += pf.doable; objects ||= pf.unit === 'objects' } else doable += t.ids.length || 1
    }
    if (blocked.length && doable > 0) {
      const unit = objects ? 'object' : 'slide'
      return { kind: 'ask', question: { text: `I can do that for ${doable} ${unit}${doable === 1 ? '' : 's'}, but not on ${blockedText({ state, virtual }, blocked)}. Nothing was changed yet. Shall I do the rest?`, options: [{ label: 'Yes, do the rest', reply: 'Yes, do the rest', confirm: { kind: 'proceed', tasks: planned.map((p) => ({ family: p.task.family, targets: p.task.targets, values: p.task.values, ...(p.task.phrase ? { phrase: p.task.phrase } : {}) })) } }, { label: 'No, leave it', reply: 'No, leave it as it is' }] } }
    }
  }

  const units = priceUnits(planned)
  await deps.authorize?.(units)

  // EXECUTE: in order; each task sees the slides earlier tasks added
  const ops: AssistOperation[] = []
  const slideOps = emptySlideOps()
  const applied: string[] = []
  let written = 0
  let ui: UiAction | undefined
  const outside: string[] = []
  const answers: string[] = []
  for (const p of planned) {
    const ctx = ctxFor()
    const r = targetsOf(state, p.task, p.cap, input.instruction, addedByTask)
    if (!r.ok) { refuse('refuse' in r ? r.refuse : r.ask.text); continue }
    notes.push(...r.notes)
    // animated-template slides: what a capability may not do there is refused by rule, per slide, with the reason (never worked around)
    const t = templateSplit(state, p.task.family, r.ids)
    for (const id of t.refused) refuse(`Slide ${state.slides.find((x) => x.id === id)!.n}: ${templateWhy(state, p.task.family, id)}.`)
    const ids = t.ids
    if (t.refused.length && ids.length === 0) continue
    let step = await p.cap.run(ctx, ids, p.values)
    if (step.ask) return { kind: 'ask', question: step.ask } // a plan to confirm: nothing is changed (and the route gives the credits back)
    // CHECK: the capability says what the result does not do; one retry names exactly that. What is STILL not met is withheld: never applied, never claimed, and said plainly
    const problems = p.cap.check?.(ctx, ids, p.values, step) ?? []
    if (problems.length) {
      let still = problems
      if (p.cap.cost === 'writing') {
        const again = await p.cap.run(ctx, ids, p.values, problems.map((x) => x.why))
        const after = p.cap.check?.(ctx, ids, p.values, again) ?? []
        if (after.length < problems.length || (after.length === problems.length && again.ops.length >= step.ops.length)) { step = again; still = after }
      }
      step = withhold(step, still)
      still.map((x) => x.slideId ? `Slide ${state.slides.find((r) => r.id === x.slideId)?.n ?? virtual.slides.findIndex((s) => s.id === x.slideId) + 1}: I couldn't do that (${x.why.replace(/[.\s]+$/, '')}), so I left it as it was.` : `I couldn't do that (${x.why.replace(/[.\s]+$/, '')}), so nothing was changed for it.`).forEach(refuse)
    }
    ops.push(...step.ops)
    for (const k of Object.keys(slideOps) as (keyof SlideOps)[]) (slideOps[k] as unknown[]).push(...((step.slideOps?.[k] as unknown[] | undefined) ?? []))
    applied.push(...(step.applied ?? []))
    for (const t of step.refused ?? []) refuse(t)
    for (const t of step.already ?? []) { notes.push(t); kinds.already.push(t) }
    notes.push(...(step.notes ?? []))
    if (step.ui) ui = step.ui
    if (step.outside) outside.push(step.outside)
    if (step.answer) answers.push(step.answer)
    written += step.written ?? 0
    if (step.added?.length) { addedByTask.set(p.index, step.added); addToVirtual(virtual, step.ops, slideOps.duplicates) }
  }
  return { ...done(input, state, ops, slideOps, applied, notes, kinds, units, planned.map((p) => p.task.family), written, virtual), ...(upgrade ? { upgrade } : {}), ...(later.length ? { later } : {}), ...(ui ? { ui } : {}), ...(outside.length ? { outside } : {}), ...(answers.length ? { answers } : {}) }
}

/** animated-template slides a family may not touch (its META rule), split from the rest; one rule for the feasibility check and the run */
function templateSplit(state: DeckState, family: Family, ids: string[]): { ids: string[]; refused: string[] } {
  const tpl = META[family].templates
  if (!tpl) return { ids, refused: [] }
  const refused = ids.filter((id) => { const r0 = state.slides.find((x) => x.id === id), k = slideKindOf(r0?.layout, r0?.fromFile); return k !== 'normal' && !!tpl[k] })
  return { ids: ids.filter((id) => !refused.includes(id)), refused }
}
const templateWhy = (state: DeckState, family: Family, id: string) => { const row = state.slides.find((x) => x.id === id)!; return META[family].templates![slideKindOf(row.layout, row.fromFile) as Exclude<SlideKind, 'normal'>]!.why }

/** A step without the changes that do not meet the request: a slide's own changes for a slide-level problem, everything for a problem about the whole step. */
function withhold(step: Step, unmet: Unmet[]): Step {
  if (!unmet.length) return step
  if (unmet.some((x) => !x.slideId)) return { ...step, ops: [], slideOps: undefined, applied: [], added: [], written: 0 }
  const bad = new Set(unmet.map((x) => x.slideId!))
  const ops = step.ops.filter((o) => !('slideId' in o && typeof o.slideId === 'string' && bad.has(o.slideId)))
  return { ...step, ops, written: Math.max(0, (step.written ?? 0) - (step.ops.length - ops.length)) }
}

/** The ADMIT stage: can this person do this here, now? Decided from the registry, the plan and the flags BEFORE anything runs or is charged. Returns the plain refusal, or null. */
function admit(task: Task, ctx: CapCtx): { text: string; upgrade?: true } | null {
  const m = META[task.family]
  if (!isReady(task.family)) return { text: "I can't do that yet." }
  if (m.ownerOnly && !ctx.isOwner) return { text: 'Only the owner of this presentation can do that.' }
  if (m.needsFeature && !(ctx.features as Record<string, unknown>)[m.needsFeature]) return { text: m.needsFeature === 'advancedEditor' ? "Changing objects from the chat is part of the advanced editor, which your plan does not include, so nothing was changed." : "Applying your brand needs a plan with brand kits, so nothing was changed.", upgrade: true }
  const v = task.values as { cutout?: boolean; source?: string }
  if (task.family === 'picture' && v.cutout && ctx.flags['background_removal'] === false) return { text: "Removing a picture's background is not available yet, so nothing was changed." }
  if (task.family === 'picture' && v.source === 'ai' && ctx.flags['image_generation'] === false) return { text: 'Generating pictures is switched off right now, so nothing was changed.' }
  return null
}

function targetsOf(state: DeckState, task: Task, cap: Capability<any>, instruction: string, addedByTask: Map<number, string[]>) {
  if (cap.scope === 'deck') return { ok: true as const, ids: [], notes: [] }
  if (cap.scope === 'none') return task.targets.length ? resolveTargets(state, task.targets, { instruction, addedByTask, defaultToCurrent: false }) : { ok: true as const, ids: [], notes: [] }
  return resolveTargets(state, task.targets, { instruction, addedByTask })
}

/** how many slides a task will write (for the price), or the question / refusal its targets lead to */
function estimateSlides(state: DeckState, task: Task, cap: Capability<any>, values: any, instruction: string, planned: Planned[]): number | { ask: Question } | { refuse: string } {
  if (task.family === 'add_slide') return values.count ?? 1
  // a merge WRITES one slide (however many it takes in); a split writes its parts
  if (task.family === 'repair') return repairRewriteCount(reviewFindings(state.doc), values.focus ?? 'all')
  if (task.family === 'combine') return values.action === 'split' ? values.parts ?? 2 : 1
  // slides an earlier task of this message adds are counted from that task's own estimate
  const fromEarlier = task.targets.reduce((a, t) => a + (t.by === 'added_by_task' ? planned.find((p) => p.index === t.task)?.estimate ?? 0 : 0), 0)
  const rest = task.targets.filter((t) => t.by !== 'added_by_task')
  if (fromEarlier && !rest.length) return fromEarlier
  const r = targetsOf(state, { ...task, targets: rest }, cap, instruction, new Map())
  if (!r.ok) return 'ask' in r ? { ask: r.ask } : { refuse: r.refuse }
  // an object task needs to know WHICH object: asked (once, free) before anything runs, never guessed
  if (task.family === 'element' && needsObjects(values.ops)) { const e = resolveElements(state, r.ids, values.elements, values.ops.map((o: { op: string }) => o.op)); if (!e.ok && 'ask' in e) return { ask: e.ask } }
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

type Kinds = { refused: string[]; already: string[] }
/** everything the person wrote in this conversation, this message last: what a check against "their own words" reads */
const personsWords = (input: AssistantInput) => [...(input.conversation ?? []).filter((t) => t.role === 'user').map((t) => t.text), input.instruction].join('\n')
function done(input: AssistantInput, state: DeckState, ops: AssistOperation[], slideOps: SlideOps, applied: string[], notes: string[], kinds: Kinds, units: number, families: Family[], written: number, virtual?: Presentation): AssistantOutcome {
  // VALIDATE: the same server checks as always (template ids and plan, palettes, locks, hand-edited slides, the content sanitiser, picture placements)
  const compiled = compileAssist(virtual ?? input.doc, { reply: '', operations: ops, unsupported: [], onTopic: true }, input.ent, state.onlySlideId ? 'slide' : 'deck', state.onlySlideId ?? undefined, (input.material ?? []).map((m) => m.text), state.recent, undefined, { doc: input.doc, words: personsWords(input) })
  // refused first (what the person must know), then already, then info; one text, one kind
  const all = [...new Set([...notes, ...compiled.notes])]
  const refused = new Set([...kinds.refused, ...compiled.refused]), already = new Set([...kinds.already, ...compiled.already].filter((t) => !refused.has(t)))
  const order = (t: string) => (refused.has(t) ? 0 : already.has(t) ? 1 : 2)
  return { kind: 'done', compiled, slideOps, applied, notes: all.map((t, i) => ({ t, i })).sort((a, b) => order(a.t) - order(b.t) || a.i - b.i).map((x) => x.t), refused: [...refused], already: [...already], units, families, written }
}

/** The capability that owns a confirmed plan (the person confirmed; the model is not asked). Each re-checks the plan against the deck before doing anything. */
function confirmedTask(c: Restructure, state: DeckState) {
  // the slides a confirmed bulk rewrite was about, by number as they are NOW (a slide that is gone is simply not there; the capability checks the rest)
  if (c.kind === 'text_bulk') return { family: 'text', targets: c.slideIds.flatMap((id) => { const row = state.slides.find((r) => r.id === id); return row ? [{ by: 'number', n: row.n }] : [] }), values: { request: c.request, ...(c.addPoints ? { addPoints: c.addPoints } : {}), ...(c.totalPoints ? { totalPoints: c.totalPoints } : {}), ...(c.length ? { length: c.length } : {}), ...(c.notesOnly ? { notesOnly: true } : {}), ...(c.notesSeconds ? { notesSeconds: c.notesSeconds } : {}) } }
  if (c.kind === 'refresh_pictures') return { family: 'refresh_pictures', targets: [], values: {} }
  if (c.kind === 'add_bulk') return { family: 'add_slide', targets: [], values: { count: c.count, where: c.where, ...(c.about ? { about: c.about } : {}), ...(c.layout ? { layout: c.layout } : {}) } }
  if (c.kind === 'clear_pictures') return { family: 'picture', targets: [{ by: 'all' }], values: { remove: true } }
  if (c.kind === 'clear_animations') return { family: 'motion', targets: [], values: { preset: 'none' } }
  if (c.kind === 'rewrite') return { family: 'rewrite_deck', targets: [], values: { brief: c.brief } }
  return { family: 'restructure', targets: [], values: { action: 'empty' } }
}
