import type { z } from 'zod'
import { reviewFindings, slideTitle } from '@prompttoppt/theme'
import { LAYOUT_IDS, textGoalProblem, type SlideContent } from '@prompttoppt/validation'
import { LAYOUT_SHAPES } from '../../ai/prompts.ts'
import { figuresOf } from '../../generation/policy.ts'
import { textOf } from '../../generation/quality.ts'
import { numberOf } from '../state.ts'
import { slideKindOf } from '../registry.ts'
import { transformPlanSchema, transformWrites, type TransformPlan } from '../transform-plan.ts'
import { VALUES } from '../understand.ts'
import type { Question } from '../resolve.ts'
import type { Capability, RunCtx, Step } from './types.ts'
import { inParallel, newSlidesOut, notesProblem, notesWordRange, parseContent, sameWords, slideInput, slidesOut, textGoal, timedProblem, writeValid, writable } from './writing.ts'

/**
 * The DECK LANE: one goal applied with judgement across the whole deck ("make it more professional", "an investor pitch", "fit 15 minutes", "add 5 slides that fit",
 * "a stronger ending"). It runs in two visits:
 *  1. PLAN (this message, free in the end): code builds the deck map (every slide's words, layout, figures, what the review found, what may not be touched); ONE quality-model
 *     call plans one action per slide (keep / rewrite / shorten / expand / layout / delete), the slides to add and where, the new order and sections; code checks the plan
 *     (locked slides kept, deletes within reason, every id real, counts within the plan's limits) with one re-ask naming the problems; the person sees the plan with its price.
 *  2. APPLY (after "Go ahead"): the plan is checked again against the deck as it is now; structure first (deletes, the new order, section dividers), then the words in waves
 *     of parallel writing calls that all share the same brief and see their neighbours' titles, then notes when a talk length was asked. Every written slide is accepted only
 *     if it keeps EVERY figure the slide had (code compares), invents nothing, keeps its layout (or changes it when that was the action) and really changed; one retry names
 *     exactly what was wrong; what still fails is left as it was and said. Slides marked keep are never written and never charged.
 */
type Values = z.infer<typeof VALUES.transform>
const WAVE = 4
const BATCH = 4
const MAX_DECK = 60

const figures = (c: SlideContent | undefined | null) => (c ? figuresOf(textOf(c).join(' ')) : [])
const slideOf = (ctx: RunCtx, id: string) => ctx.virtual.slides.find((s) => s.id === id)
const n = (ctx: RunCtx, id: string) => numberOf(ctx.state, id) || ctx.virtual.slides.findIndex((s) => s.id === id) + 1
const listNs = (ns: number[]) => (ns.length === 1 ? `slide ${ns[0]}` : `slides ${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`)

/** what may not be touched, and why: a locked slide is kept as it is; a hand-edited or template slide keeps its words (it may be deleted or moved) */
function untouchable(ctx: RunCtx, id: string): { words: boolean; all: boolean; why: string } {
  const s = slideOf(ctx, id)!
  const row = ctx.state.slides.find((r) => r.id === id)
  if (s.locked) return { words: true, all: true, why: 'locked' }
  if (s.manual || !s.content) return { words: true, all: false, why: 'edited by hand' }
  if (slideKindOf(row?.layout, row?.fromFile) !== 'normal') return { words: true, all: false, why: 'part of a template' }
  return { words: false, all: false, why: '' }
}

/** STAGE A: the deck as the planner sees it (code only) */
function deckMap(ctx: RunCtx) {
  const found = reviewFindings(ctx.virtual)
  const issues = (num: number) => found.filter((f) => f.slides.some((s) => s.n === num)).map((f) => f.id)
  return ctx.virtual.slides.map((s, i) => {
    const u = untouchable(ctx, s.id)
    const text = s.content ? textOf(s.content as SlideContent).join(' · ') : ''
    return { id: s.id, n: i + 1, title: slideTitle(s.content) || '(no title)', layout: s.layoutId, words: text.split(/\s+/).filter(Boolean).length, text: text.slice(0, 260), figures: figures(s.content as SlideContent), ...(u.words ? { keepWords: u.why } : {}), ...(u.all ? { locked: true } : {}), ...(issues(i + 1).length ? { issues: issues(i + 1) } : {}) }
  })
}

const PLAN_RULES = `You are the editor of a slide deck. Plan how to change the WHOLE deck toward input.goal, with judgement, as a good presentation coach would. Return {"goal":"<input.goal>","brief":"<the brief every writer follows: audience, tone, what to lead with, what to cut, in 2-4 sentences>","actions":[{"slideId":"<id>","action":"keep"|"rewrite"|"shorten"|"expand"|"layout"|"delete","note":"<one line of direction for this slide>","layout":"<for action layout, if you choose it>","reason":"<for delete>"}],"add":[{"afterSlideId":"<id of the slide it follows, or null for the end>","atStart":true (before everything),"title":"<title>","about":"<what it says, from the deck's own material>","layout":"<optional>"}],"order":["<ids of the surviving slides in the new order>"] (only when the order should change),"sections":[{"title":"<section>","beforeSlideId":"<id>"}] (only when sections help),"notesSeconds":N (only for a talk length: seconds of speaking per slide)}
- EXACTLY one action per slide of input.deck.slides, every slide, in the deck's order. A slide that already does its job is "keep": do not change slides for the sake of it.
- Slides marked locked are always "keep". Slides marked keepWords may only be "keep" or "delete" (their words are the person's own).
- "delete" needs a reason and is rare: a repeat, filler, or what a shorter talk cannot afford. Never delete more than input.limits.maxDelete slides. A deleted slide's figures go with it: say so in the reason.
- "layout" changes how a slide shows its words (bullets into process steps, a timeline, a comparison, key figures): only when the words read better that way. Layouts: ${LAYOUT_IDS.join(', ')}.
- "add" new slides only where the deck is missing something the goal needs (input.limits.addSlides when given = exactly that many). Say what each one is about from the DECK's own material; a slide the deck has no material for (a pitch's "funding ask" with no figures) says so in "about" so the writer leaves blanks like "[your monthly revenue]" instead of inventing.
- Structure "pitch": problem, solution, market, product, business model, competition, traction, go-to-market, financials, the ask. "story": an opening that hooks, a build, a memorable close. "sales": their problem, our solution, proof, pricing last. "training": objectives, steps, practice, recap. Map the existing slides onto it ("order"), add what is missing, keep what fits.
- A talk length (input.minutes): about 1 to 1.5 slides per minute in all; shorten dense slides; set notesSeconds so the notes of every slide add up to the time.
- Never invent figures, names, results or claims: the brief and every note say this too. The deck's theme, fonts and colours are not yours to change.
- input.problems, when present, lists what was wrong with your previous plan: fix exactly that.`

/** code's checks on a plan (before the person sees it, and again when they confirm it): never a plan that touches what it may not */
function checkPlan(ctx: RunCtx, raw: unknown, v: Pick<Values, 'addSlides' | 'minutes'>, o: { /** the plan was confirmed as it is: notes it carries were asked for */ confirmed?: boolean } = {}): { ok: true; plan: TransformPlan } | { ok: false; why: string } {
  const parsed = transformPlanSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, why: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  const plan = parsed.data
  if (!v.minutes && !o.confirmed) delete plan.notesSeconds // notes on every slide are part of a talk-length goal only: never added (and priced) on the planner's own initiative
  const ids = ctx.virtual.slides.map((s) => s.id)
  const seen = new Set<string>()
  for (const a of plan.actions) {
    if (!ids.includes(a.slideId)) return { ok: false, why: `there is no slide with id ${a.slideId}` }
    if (seen.has(a.slideId)) return { ok: false, why: `slide ${n(ctx, a.slideId)} has two actions` }
    seen.add(a.slideId)
    const u = untouchable(ctx, a.slideId)
    if (u.all && a.action !== 'keep') return { ok: false, why: `slide ${n(ctx, a.slideId)} is ${u.why}: it must be "keep"` }
    if (u.words && a.action !== 'keep' && a.action !== 'delete') return { ok: false, why: `slide ${n(ctx, a.slideId)} was ${u.why}: it may only be "keep" or "delete"` }
    if (a.action === 'delete' && !a.reason) return { ok: false, why: `slide ${n(ctx, a.slideId)}: a delete needs a reason` }
    if (a.action === 'layout' && a.layout && !(LAYOUT_IDS as readonly string[]).includes(a.layout)) return { ok: false, why: `${a.layout} is not a layout` }
    if (a.action === 'layout' && a.layout && a.layout === slideOf(ctx, a.slideId)!.layoutId) return { ok: false, why: `slide ${n(ctx, a.slideId)} already has the ${a.layout} layout` }
  }
  // a slide the plan does not mention is kept
  const actions = [...plan.actions, ...ids.filter((id) => !seen.has(id)).map((slideId) => ({ slideId, action: 'keep' as const }))].sort((a, b) => ids.indexOf(a.slideId) - ids.indexOf(b.slideId))
  const deleted = new Set(actions.filter((a) => a.action === 'delete').map((a) => a.slideId))
  const survivors = ids.filter((id) => !deleted.has(id))
  const maxDelete = Math.max(0, Math.min(ids.length - 3, Math.ceil(ids.length * (v.minutes ? 0.6 : 0.4))))
  if (deleted.size > maxDelete) return { ok: false, why: `it deletes ${deleted.size} slides; at most ${maxDelete} may go` }
  if (v.addSlides !== undefined && plan.add.length !== v.addSlides) return { ok: false, why: `"add" must have exactly ${v.addSlides} new slides (it has ${plan.add.length})` }
  for (const a of plan.add) if (a.afterSlideId !== null && !survivors.includes(a.afterSlideId)) return { ok: false, why: `a new slide follows ${ids.includes(a.afterSlideId) ? 'a slide the plan deletes' : 'a slide id that does not exist'} (${a.afterSlideId})` }
  for (const s of plan.sections ?? []) if (!survivors.includes(s.beforeSlideId)) return { ok: false, why: `a section is placed before a slide that will not be there (${s.beforeSlideId})` }
  if (plan.order) {
    const want = new Set(survivors)
    if (plan.order.length !== survivors.length || new Set(plan.order).size !== plan.order.length || plan.order.some((id) => !want.has(id))) return { ok: false, why: `"order" must list each of the ${survivors.length} surviving slides exactly once` }
    if (plan.order.every((id, i) => id === survivors[i])) delete plan.order
  }
  const total = survivors.length + plan.add.length + (plan.sections?.length ?? 0)
  if (total > MAX_DECK) return { ok: false, why: `the deck would have ${total} slides; at most ${MAX_DECK}` }
  if (v.minutes && (total > Math.ceil(v.minutes * 1.6) + 1 || total < Math.max(3, Math.floor(v.minutes * 0.6)))) return { ok: false, why: `${total} slides do not fit a ${v.minutes}-minute talk (about ${v.minutes} to ${Math.ceil(v.minutes * 1.5)} slides do)` }
  if (actions.every((a) => a.action === 'keep') && !plan.add.length && !plan.order && !plan.sections?.length && !plan.notesSeconds) return { ok: false, why: 'the plan changes nothing' }
  return { ok: true, plan: { ...plan, actions } }
}

/** the plan in plain words, grouped, with what it costs: what the person confirms */
function preview(ctx: RunCtx, plan: TransformPlan): string {
  const by = (k: TransformPlan['actions'][number]['action']) => plan.actions.filter((a) => a.action === k)
  const ns = (as: TransformPlan['actions']) => as.map((a) => n(ctx, a.slideId)).sort((a, b) => a - b)
  const lines: string[] = []
  const keep = by('keep'); if (keep.length) lines.push(`• Keep ${keep.length === plan.actions.length ? 'every slide as it is' : `${listNs(ns(keep))} as ${keep.length === 1 ? 'it is' : 'they are'}`}`)
  const named = (as: TransformPlan['actions'], verb: string) => as.length ? [`• ${verb} ${listNs(ns(as))}${as.length <= 4 && as.some((a) => a.note) ? `: ${as.filter((a) => a.note).map((a) => `${n(ctx, a.slideId)} — ${a.note!.replace(/[.\s]+$/, '')}`).join('; ')}` : ''}`] : []
  lines.push(...named(by('rewrite'), 'Rewrite'), ...named(by('shorten'), 'Shorten'), ...named(by('expand'), 'Expand'))
  const lay = by('layout'); if (lay.length) lines.push(`• New layout for ${listNs(ns(lay))}${lay.some((a) => a.layout) ? ` (${lay.filter((a) => a.layout).map((a) => `${n(ctx, a.slideId)}: ${a.layout}`).join(', ')})` : ''}`)
  for (const a of by('delete')) { const f = figures(slideOf(ctx, a.slideId)?.content as SlideContent); lines.push(`• Delete slide ${n(ctx, a.slideId)} (${a.reason!.replace(/[.\s]+$/, '')})${f.length ? ` — its figures ${f.slice(0, 5).join(', ')} go with it` : ''}`) }
  for (const a of plan.add) lines.push(`• Add "${a.title}" ${a.atStart ? 'at the start' : a.afterSlideId ? `after slide ${n(ctx, a.afterSlideId)}` : 'at the end'}${/\[|blank|placeholder|no figures|fill in/i.test(a.about) ? ' (with blanks for figures you fill in)' : ''}`)
  if (plan.sections?.length) lines.push(`• Add ${plan.sections.length} section divider${plan.sections.length === 1 ? '' : 's'}: ${plan.sections.map((s) => `"${s.title}" before slide ${n(ctx, s.beforeSlideId)}`).join(', ')}`)
  if (plan.order) lines.push(`• New order: ${plan.order.map((id) => n(ctx, id)).join(' → ')}`)
  if (plan.notesSeconds) lines.push(`• Speaker notes of about ${plan.notesSeconds} seconds on every slide`)
  const writes = transformWrites(plan)
  const cost = ctx.price ? ` It uses ${ctx.price.edit + Math.max(0, writes - 1) * ctx.price.slide} credits (${writes} slide${writes === 1 ? '' : 's'} written).` : ''
  return `Here is my plan for "${plan.goal.slice(0, 120)}":\n${lines.join('\n')}\nEvery figure in your deck stays (a figure can only go with a slide I delete, as listed), nothing is invented, and your theme and fonts stay. Nothing has changed yet.${cost} Go ahead?`
}

const TEXT_RULES = `Return {"slides":[{"slideId":"<id>","content":{...}}]}: one entry for every slide in input.slides, rewritten toward input.goal as input.brief says, with input.slides[].note as the direction for that slide.
- Do it visibly: never return a slide unchanged. Keep each slide's layout and JSON shape: the same fields. Lists keep their number of items unless input.slides[].goal says otherwise.
- KEEP EVERY FIGURE in input.slides[].mustKeepFigures, exactly as written (numbers, percentages, years, amounts). Never add a figure, name, result or claim that is not in the slide, the deck or a <source> block; where a slide needs one the deck does not have, write a blank in square brackets such as "[your monthly revenue]".
- input.slides[].neighbours gives the titles of the slides before and after: make this slide follow from the one before and lead into the next (the deck must read as one story).
- input.slides[].goal.words, when given, is how many visible words the slide must have (atLeast or atMost). input.slides[].limits.maxPointsPerList is a hard cap.
- input.speakerNotesWords, when given: write "speakerNotes" of about that many words, as natural speech (what the presenter says, not the slide read aloud).
- input.problems, when present, lists what was wrong with your previous answer: fix exactly that.`
const LAYOUT_RULES = `Return {"slides":[{"slideId":"<id>","content":{...}}]}: every slide in input.slides re-fitted into a DIFFERENT layout from its current one (input.slides[].layout), toward input.goal as input.brief and input.slides[].note say.
- Use input.slides[].layout_to when given; otherwise choose the layout that suits the words: steps → process, timeline or roadmap; two sides → comparison; key figures → metrics or big-number; a statement → quote or big-number.
- Keep the slide's own words and EVERY figure in input.slides[].mustKeepFigures; never invent figures, names or claims.
- input.problems, when present, lists what was wrong with your previous answer: fix exactly that.
Layout JSON shapes:
${LAYOUT_SHAPES}`
const NOTES_RULES = `Return {"slides":[{"slideId":"<id>","speakerNotes":"<the notes>"}]}: speaker notes for every slide in input.slides, about input.speakerNotesWords.about words each, as natural speech toward input.goal (input.brief). Say nothing the slide or the deck does not support; no new figures. input.problems, when present, lists what was wrong with your previous answer: fix exactly that.`
const ADD_RULES = `Return {"slides":[{"content":{...}}]} with exactly input.count new slides, in order, each as input.adds[i] describes (title, about, where it sits: input.adds[i].between gives the titles before and after it), toward input.goal as input.brief says.
- Use ONLY the deck's own material (input.deck) and <source> blocks. Where a slide needs a figure, name or result the deck does not have, write a blank in square brackets such as "[your monthly revenue]" or "[customer name]": NEVER invent one.
- Use input.adds[i].layout when given; a closing slide uses "thank-you"; otherwise choose the layout that suits the content.
- input.problems, when present, lists what was wrong with your previous answer: fix exactly that.
Layout JSON shapes:
${LAYOUT_SHAPES}`

/** the fewest moves that turn `current` into `final` (the editor moves one slide at a time, after another) */
export function minimalMoves(current: string[], final: string[]): { slideId: string; afterSlideId: string | null }[] {
  const sim = [...current], moves: { slideId: string; afterSlideId: string | null }[] = []
  for (let i = 0; i < final.length; i++) {
    const id = final[i]!, prev = i ? final[i - 1]! : null
    const at = sim.indexOf(id)
    if (at < 0) continue
    if ((at > 0 ? sim[at - 1]! : null) === prev) continue
    moves.push({ slideId: id, afterSlideId: prev })
    sim.splice(at, 1); sim.splice(prev ? sim.indexOf(prev) + 1 : 0, 0, id)
  }
  return moves
}
/** new slides put into a sequence after their anchors (several after the same anchor keep their order; atStart = before everything; null = at the end) */
const withAdds = (seq: string[], adds: { id: string; afterSlideId: string | null; atStart?: boolean | undefined }[]): string[] => {
  const out = [...seq]
  let lastAnchor: string | null | undefined, lastId: string | undefined
  for (const a of adds) {
    const anchor = a.atStart ? '^start' : a.afterSlideId
    const after = lastId !== undefined && anchor === lastAnchor ? lastId : anchor
    const at = after === '^start' ? 0 : after === null ? out.length : out.indexOf(after) + 1
    out.splice(at, 0, a.id); lastAnchor = anchor; lastId = a.id
  }
  return out
}

async function apply(ctx: RunCtx, raw: TransformPlan): Promise<Step> {
  const checked = checkPlan(ctx, raw, {}, { confirmed: true })
  if (!checked.ok) return { ops: [], refused: [`The deck has changed since I suggested this plan (${checked.why}), so nothing was changed. Ask again and I will plan it afresh.`] }
  const plan = checked.plan
  const ids = ctx.virtual.slides.map((s) => s.id)
  const deleted = plan.actions.filter((a) => a.action === 'delete').map((a) => a.slideId)
  const survivors = ids.filter((id) => !deleted.includes(id))
  const finalExisting = plan.order ?? survivors
  const titleOf = (id: string) => slideTitle(slideOf(ctx, id)?.content) || ''
  const neighboursOf = (id: string) => { const i = finalExisting.indexOf(id); return { before: i > 0 ? titleOf(finalExisting[i - 1]!) : '', after: i >= 0 && i < finalExisting.length - 1 ? titleOf(finalExisting[i + 1]!) : '' } }
  const notes: string[] = [], refused: string[] = [], info: string[] = []
  const ops: Step['ops'] = []
  let written = 0
  const notesWords = plan.notesSeconds ? notesWordRange(plan.notesSeconds) : undefined
  const common = { goal: plan.goal, brief: plan.brief, ...(notesWords ? { speakerNotesWords: notesWords } : {}) }
  const keepFigures = (id: string, c: SlideContent): string | null => { const lost = figures(slideOf(ctx, id)!.content as SlideContent).filter((f) => !figures(c).includes(f)); return lost.length ? `it dropped the figure${lost.length === 1 ? '' : 's'} ${lost.slice(0, 6).join(', ')}: keep every figure exactly` : null }
  const noteOf = (id: string) => plan.actions.find((a) => a.slideId === id)?.note ?? ''
  const batched = (list: string[]) => Array.from({ length: Math.ceil(list.length / BATCH) }, (_, i) => list.slice(i * BATCH, (i + 1) * BATCH))

  // the words: rewrite / shorten / expand, and new layouts, written in waves of parallel calls that all share the brief
  const textIds = (k: 'rewrite' | 'shorten' | 'expand') => plan.actions.filter((a) => a.action === k).map((a) => a.slideId)
  const goalOf = { rewrite: textGoal({}), shorten: textGoal({ length: 'shorter' }), expand: textGoal({ length: 'longer' }) }
  type Job = { kind: 'rewrite' | 'shorten' | 'expand' | 'layout' | 'notes'; ids: string[] }
  const jobs: Job[] = [
    ...(['rewrite', 'shorten', 'expand'] as const).flatMap((k) => batched(writable(ctx, textIds(k)).ok).map((b): Job => ({ kind: k, ids: b }))),
    ...batched(writable(ctx, plan.actions.filter((a) => a.action === 'layout').map((a) => a.slideId)).ok).map((b): Job => ({ kind: 'layout', ids: b })),
    ...(notesWords ? batched(writable(ctx, plan.actions.filter((a) => a.action === 'keep').map((a) => a.slideId)).ok).map((b): Job => ({ kind: 'notes', ids: b })) : []),
  ]
  let finished = 0
  const say = () => ctx.progress?.(`Writing ${jobs.reduce((a, j) => a + j.ids.length, 0)} slides toward "${plan.goal.slice(0, 40)}"`, finished, jobs.length)
  if (jobs.length) say()
  // a writing call that fails outright (the AI busy, a timeout) loses only its own slides: they are reported as not done, and every other slide still lands
  const results = await inParallel(jobs, WAVE, async (job): Promise<{ good: Map<string, SlideContent>; failed: Map<string, string> }> => {
    try { return await writeJob(job) } catch (e) { finished++; say(); return { good: new Map(), failed: new Map(job.ids.map((id) => [id, e instanceof Error && /busy|unavailable|quota|timed out|rate/i.test(e.message) ? 'the AI service was busy; ask again for this slide' : 'the writing failed; ask again for this slide'])) } }
  })
  async function writeJob(job: Job) {
    const r = job.kind === 'notes'
      ? await writeValid(ctx, job.ids, undefined,
          (sub, why) => ctx.write({ card: 'transform_notes', rules: NOTES_RULES, route: 'quality', schema: slidesOut, input: { ...common, slides: sub.map((id) => ({ slideId: id, n: n(ctx, id), content: slideOf(ctx, id)!.content })), ...(why.length ? { problems: why } : {}) } }),
          (id, c) => notesProblem(slideOf(ctx, id)!.content as SlideContent, c) ?? timedProblem(c, plan.notesSeconds),
          (id, rawOut) => ({ ...(slideOf(ctx, id)!.content as object), speakerNotes: String((rawOut as { speakerNotes?: unknown } | null)?.speakerNotes ?? '').slice(0, 1500) }))
      : job.kind === 'layout'
      ? await writeValid(ctx, job.ids, undefined,
          (sub, why) => ctx.write({ card: 'transform_layout', rules: LAYOUT_RULES, route: 'quality', schema: slidesOut, input: { ...common, slides: sub.map((id) => ({ ...slideInput(ctx, id), note: noteOf(id), ...(plan.actions.find((a) => a.slideId === id)?.layout ? { layout_to: plan.actions.find((a) => a.slideId === id)!.layout } : {}), mustKeepFigures: figures(slideOf(ctx, id)!.content as SlideContent), neighbours: neighboursOf(id) })), ...(why.length ? { problems: why } : {}) } }),
          (id, c) => { const want = plan.actions.find((a) => a.slideId === id)?.layout; if (c.layout === slideOf(ctx, id)!.layoutId) return `it kept the ${c.layout} layout; it needs a different one`; if (want && c.layout !== want) return `it must use the ${want} layout`; return keepFigures(id, c) })
      : await writeValid(ctx, job.ids, undefined,
          (sub, why) => ctx.write({ card: 'transform_text', rules: TEXT_RULES, route: 'quality', schema: slidesOut, material: ctx.material.length ? ctx.material : undefined, input: { ...common, slides: sub.map((id) => ({ ...slideInput(ctx, id, goalOf[job.kind as 'rewrite']), note: noteOf(id), mustKeepFigures: figures(slideOf(ctx, id)!.content as SlideContent), neighbours: neighboursOf(id) })), ...(why.length ? { problems: why } : {}) } }),
          (id, c) => { const before = slideOf(ctx, id)!.content as SlideContent; if (c.layout !== slideOf(ctx, id)!.layoutId) return `it must keep the ${slideOf(ctx, id)!.layoutId} layout (you returned ${c.layout})`; if (sameWords(before, c)) return 'it came back with the same words'; return keepFigures(id, c) ?? textGoalProblem(before, c, goalOf[job.kind as 'rewrite']) ?? (plan.notesSeconds ? timedProblem(c, plan.notesSeconds) : null) },
          (id, rawOut) => (rawOut && typeof rawOut === 'object' && !Array.isArray(rawOut) && !(LAYOUT_IDS as readonly string[]).includes(String((rawOut as { layout?: unknown }).layout)) ? { ...(rawOut as object), layout: slideOf(ctx, id)!.layoutId } : rawOut))
    finished++; say()
    return r
  }
  for (const [i, job] of jobs.entries()) {
    const { good, failed } = results[i]!
    for (const id of job.ids) { const c = good.get(id); if (!c) continue; ops.push(job.kind === 'layout' ? { op: 'restructure_slide', slideId: id, content: c } : { op: 'edit_slide', slideId: id, content: c }); written++ }
    for (const [id, why] of failed) refused.push(`Slide ${n(ctx, id)}: I couldn't do that (${why.replace(/[.\s]+$/, '').slice(0, 160)}), so I left it as it was.`)
  }
  // slides the plan would write but may not be written (changed since the plan): said, never worked around
  for (const a of plan.actions) if (a.action !== 'keep' && a.action !== 'delete' && !writable(ctx, [a.slideId]).ok.length) refused.push(`Slide ${n(ctx, a.slideId)} is ${untouchable(ctx, a.slideId).why}, so I left it alone.`)

  // new slides (and section dividers), written from the deck's own material with blanks where it has none
  const adds: { id: string; afterSlideId: string | null; atStart?: boolean | undefined; content: SlideContent }[] = []
  if (plan.add.length) {
    ctx.progress?.(`Writing ${plan.add.length} new slide${plan.add.length === 1 ? '' : 's'}`)
    const between = (a: TransformPlan['add'][number]) => ({ before: a.atStart ? '' : a.afterSlideId ? titleOf(a.afterSlideId) : titleOf(finalExisting.at(-1) ?? ''), after: a.atStart ? titleOf(finalExisting[0] ?? '') : a.afterSlideId ? neighboursOf(a.afterSlideId).after : '' })
    const chunks = Array.from({ length: Math.ceil(plan.add.length / 5) }, (_, i) => plan.add.slice(i * 5, (i + 1) * 5))
    const made = await inParallel(chunks, WAVE, async (chunk) => {
      const out: (SlideContent | null)[] = chunk.map(() => null)
      let why: string[] = []
      for (let attempt = 0; attempt < 2 && out.some((x) => !x); attempt++) {
        const want = chunk.map((a, i) => ({ a, i })).filter(({ i }) => !out[i])
        const res = await ctx.write({ card: 'transform_add', rules: ADD_RULES, route: 'quality', schema: newSlidesOut, material: ctx.material.length ? ctx.material : undefined, input: { ...common, count: want.length, adds: want.map(({ a }) => ({ title: a.title, about: a.about, ...(a.layout ? { layout: a.layout } : {}), between: between(a) })), deck: { title: ctx.virtual.title, slides: ctx.state.slides.map((r) => `${r.n}. ${r.title || r.layout}`) }, ...(why.length ? { problems: why } : {}) } })
        why = []
        want.forEach(({ i }, k) => { const s = res.slides[k]; if (!s) { why.push(`New slide ${k + 1} was not returned.`); return } const p = parseContent(s.content); if (p.ok) out[i] = p.content; else why.push(`New slide ${k + 1} was rejected: ${p.why}.`) })
      }
      return out
    })
    plan.add.forEach((a, i) => { const c = made[Math.floor(i / 5)]![i % 5]; if (c) adds.push({ id: ctx.newId(), afterSlideId: a.afterSlideId, atStart: a.atStart, content: c }); else refused.push(`I couldn't write the new slide "${a.title}", so it was not added.`) })
  }
  for (const s of plan.sections ?? []) {
    const i = finalExisting.indexOf(s.beforeSlideId)
    adds.push({ id: ctx.newId(), afterSlideId: i > 0 ? finalExisting[i - 1]! : null, atStart: i === 0, content: { layout: 'section-divider', title: s.title, speakerNotes: '', sources: [] } as unknown as SlideContent })
  }
  // the ops that add slides anchor each on the slide before it in the FINAL order; consecutive new slides after one anchor chain on each other (as addSlide does)
  let lastAnchor: string | null | undefined, lastId: string | undefined
  for (const a of adds) {
    const anchor = a.atStart ? null : a.afterSlideId
    const chain = lastId !== undefined && (a.atStart ? null : a.afterSlideId) === lastAnchor && (a.atStart ? lastAnchor === null : true)
    const after = chain ? lastId! : anchor
    ops.push({ op: 'add_slide', id: a.id, afterSlideId: after, content: a.content, ...(a.atStart && !chain ? { atStart: true } : {}) })
    lastAnchor = anchor; lastId = a.id
  }
  written += adds.length
  // structure: the fewest moves from the sequence the editor will have after additions to the plan's order, then the deletes
  const moves = plan.order ? minimalMoves(withAdds(survivors, adds), withAdds(finalExisting, adds)) : []
  const applied: string[] = []
  if (deleted.length) { applied.push(`Deleted ${listNs(deleted.map((id) => n(ctx, id)).sort((a, b) => a - b))}`); for (const id of deleted) { const f = figures(slideOf(ctx, id)?.content as SlideContent); if (f.length) info.push(`Slide ${n(ctx, id)} went with its figures ${f.slice(0, 5).join(', ')} (${plan.actions.find((a) => a.slideId === id)?.reason ?? ''}).`) } }
  if (moves.length) applied.push('Put the slides in the new order')
  if (adds.some((a) => a.content.layout === 'section-divider')) info.push(`Added ${plan.sections!.length} section divider${plan.sections!.length === 1 ? '' : 's'}.`)
  const kept = plan.actions.filter((a) => a.action === 'keep').length
  if (kept && !notesWords) info.push(`${kept === 1 ? 'One slide' : `${kept} slides`} already did ${kept === 1 ? 'its' : 'their'} job, so I left ${kept === 1 ? 'it' : 'them'} exactly as ${kept === 1 ? 'it was' : 'they were'} (and did not charge for ${kept === 1 ? 'it' : 'them'}).`)
  return { ops, slideOps: { removals: deleted.filter((id) => !slideOf(ctx, id)?.locked), moves }, applied, notes: [...notes, ...info], refused, written, added: adds.map((a) => a.id) }
}

export const transform: Capability<Values> = {
  family: 'transform', values: VALUES.transform, scope: 'none', cost: 'writing', deckWide: true,
  async run(ctx, _ids, v): Promise<Step> {
    if (ctx.confirm?.kind === 'transform') return apply(ctx, ctx.confirm.plan as TransformPlan)
    const deck = ctx.virtual
    if (deck.slides.length < 2) return { ops: [], refused: ['The deck needs at least two slides before I can plan a change to the whole of it.'] }
    ctx.progress?.('Reading the whole deck and planning the change')
    const map = deckMap(ctx)
    const limits = { maxDelete: Math.max(0, Math.min(deck.slides.length - 3, Math.ceil(deck.slides.length * (v.minutes ? 0.6 : 0.4)))), ...(v.addSlides ? { addSlides: v.addSlides } : {}), maxSlides: MAX_DECK }
    const input = { goal: v.goal, ...(v.audience ? { audience: v.audience } : {}), ...(v.tone ? { tone: v.tone } : {}), ...(v.structure ? { structure: v.structure } : {}), ...(v.minutes ? { minutes: v.minutes } : {}), ...(v.ending ? { ending: 'a conclusion slide with 3 to 5 recommendations drawn only from the deck' } : {}), ...(v.design ? { design: 'layouts and visual variety are part of the goal' } : {}), limits, deck: { title: deck.title, slides: map } }
    let why = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      let raw: unknown
      try { raw = await ctx.write({ card: 'transform_plan', rules: PLAN_RULES, route: 'quality', schema: transformPlanSchema, material: ctx.material.length ? ctx.material : undefined, input: attempt ? { ...input, problems: [why] } : input }) } catch { return { ops: [], refused: ['I could not make a plan for the whole deck just now, so nothing was changed. Please try again.'] } }
      const c = checkPlan(ctx, { ...(raw as object), goal: v.goal }, v)
      if (c.ok) {
        const confirm = { kind: 'transform' as const, plan: c.plan }
        const q: Question = { text: preview(ctx, c.plan), options: [{ label: 'Yes, go ahead', reply: 'Yes, go ahead with that plan', confirm: confirm as never }, { label: 'No, leave it', reply: 'No, leave the deck as it is' }] }
        return { ops: [], ask: q }
      }
      why = c.why
    }
    return { ops: [], refused: [`I could not make a plan I am sure of (${why}), so nothing was changed. Tell me more precisely what you want, or ask for one part at a time.`] }
  },
}
