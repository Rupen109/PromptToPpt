import { z } from 'zod'
import { slideTitle } from '@prompttoppt/theme'
import { LAYOUT_IDS, LONGER_BY, SHORTER_BY, contentWords, pointLists, slideContentSchema, textGoalFit, textGoalProblem, wantedCounts, type SlideContent, type TextGoal } from '@prompttoppt/validation'
import { LAYOUT_MAX_POINTS } from '../../ai/ai-assist.ts'
import { LAYOUT_SHAPES } from '../../ai/prompts.ts'
import { figuresNotInSources, figuresOf } from '../../generation/policy.ts'
import { textOf } from '../../generation/quality.ts'
import { MAX_SLIDE_CHARS } from '../planner.ts'
import { insertionPoints } from '../resolve.ts'
import { numberOf } from '../state.ts'
import { VALUES } from '../understand.ts'
import { addSlideNote } from './template-notes.ts'
import type { Capability, Preflight, RunCtx, Step, Unmet } from './types.ts'

/**
 * The three families that need a model to WRITE: the words of slides (text), the same words in other layouts (layout) and new slides
 * (add_slide). Each makes a focused call with its own card and only the slides it is about, then checks the result itself.
 *
 * The writer's answer is accepted SLIDE BY SLIDE: the gateway only checks its overall shape, then every slide is checked against the slide
 * rules here. The slides that fit are kept; only the ones that do not are asked for again, with the exact reason for each. One slide that
 * breaks a rule (a missing field, one bullet too many) never throws away the others, and is never reported as "the AI is busy".
 */

/** models cite sources in whatever shape comes to mind and write null for unused fields: keep real citations, drop the rest */
const cleanContent = (raw: unknown): unknown => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const c = Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, v]) => v !== null))
  if (Array.isArray(c['sources'])) c['sources'] = (c['sources'] as unknown[]).filter((s) => s && typeof (s as { sourceId?: unknown }).sourceId === 'string')
  if (!Array.isArray(c['sources'])) c['sources'] = []
  return c
}
const content = z.preprocess(cleanContent, slideContentSchema)
const issuesOf = (e: z.ZodError) => e.issues.slice(0, 4).map((i) => `${i.path.join('.') || 'content'}: ${i.message}`).join('; ')
const parseContent = (raw: unknown): { ok: true; content: SlideContent } | { ok: false; why: string } => {
  const r = content.safeParse(raw)
  return r.success ? { ok: true, content: r.data as SlideContent } : { ok: false, why: issuesOf(r.error) }
}

/** the answer's overall shape only; each slide's content is checked on its own (see above) */
const slidesOut = z.object({ slides: z.array(z.object({ slideId: z.string().max(64), content: z.unknown() })).max(12).default([]) })
const newSlidesOut = z.object({ slides: z.array(z.object({ content: z.unknown() })).max(5).default([]) })

const slideOf = (ctx: RunCtx, id: string) => ctx.virtual.slides.find((s) => s.id === id)
const numberFor = (ctx: RunCtx, id: string) => numberOf(ctx.state, id) || ctx.virtual.slides.findIndex((x) => x.id === id) + 1

/** the slides a model may rewrite: not locked, not hand-edited, with semantic content; the rest are blocked, with the reason (the preflight asks about them first; the notes name them) */
function writable(ctx: RunCtx, ids: string[]): { ok: string[]; notes: string[]; blocked: Preflight['blocked'] } {
  const ok: string[] = [], notes: string[] = [], blocked: Preflight['blocked'] = []
  for (const id of ids) {
    const s = slideOf(ctx, id)
    const n = numberFor(ctx, id)
    if (!s) continue
    if (s.locked) { notes.push(`Slide ${n} is locked, so I left it alone.`); blocked.push({ slideId: id, why: 'it is locked' }) }
    else if (s.manual || !s.content) { notes.push(`Slide ${n} was edited by hand, so I left its words alone.`); blocked.push({ slideId: id, why: 'edited by hand' }) }
    else ok.push(id)
  }
  return { ok, notes, blocked }
}
/** PREFLIGHT of the writing families: which slides will not be written, before any writing call */
const writingPreflight = (ctx: RunCtx, ids: string[]): Preflight => { const w = writable(ctx, ids); return { blocked: w.blocked, doable: w.ok.length } }

/** slides in groups that fit one call's budget (a 30-slide translation becomes a few calls, never one huge prompt) */
function batches(ctx: RunCtx, ids: string[]): string[][] {
  const out: string[][] = [[]]
  let size = 0
  for (const id of ids) {
    const len = JSON.stringify(slideOf(ctx, id)?.content ?? {}).length
    if ((size + len > MAX_SLIDE_CHARS || out.at(-1)!.length >= 8) && out.at(-1)!.length) { out.push([]); size = 0 }
    out.at(-1)!.push(id); size += len
  }
  return out.filter((b) => b.length)
}

/** each slide's exact limits, as numbers the writer can count against */
const slideInput = (ctx: RunCtx, id: string, goal?: TextGoal) => {
  const s = slideOf(ctx, id)!
  const maxPoints = LAYOUT_MAX_POINTS[s.layoutId]
  return { slideId: id, n: numberFor(ctx, id), layout: s.layoutId, content: s.content, ...(maxPoints ? { limits: { maxPointsPerList: maxPoints } } : {}), ...(goal && s.content ? { goal: goalInput(s.content as SlideContent, goal) } : {}) }
}
/** the goal of one slide as numbers the writer can count against */
function goalInput(c: SlideContent, g: TextGoal) {
  const counts = wantedCounts(c, g)
  const words = contentWords(c)
  return {
    ...(counts ? { points: Object.fromEntries(counts.map((x) => [x.path, x.want])) } : {}),
    ...(g.length === 'longer' ? { words: { atLeast: Math.ceil(words * LONGER_BY) }, ...(roomy(c).length ? { mayAddPoints: Object.fromEntries(pointLists(c).filter((l) => l.count < l.max).map((l) => [l.path, l.max])) } : {}) } : g.length === 'shorter' ? { words: { atMost: Math.floor(words * SHORTER_BY) } } : {}),
  }
}
/** point lists that still have room for another item */
const roomy = (c: SlideContent) => pointLists(c).filter((l) => l.count < l.max).map((l) => l.path)
/** the lists an edit may change the length of: the ones a point goal names, or (for "more content") every list with room; nothing else (keepShape keeps the rest) */
export const allowedLists = (c: SlideContent, g: TextGoal): string[] => wantedCounts(c, g)?.map((x) => x.path) ?? (g.length === 'longer' ? roomy(c) : [])
/** the countable part of a text request: what code checks before calling it done */
export const textGoal = (v: { addPoints?: number | undefined; totalPoints?: number | undefined; length?: 'longer' | 'shorter' | undefined }): TextGoal => ({ ...(v.addPoints ? { addPoints: v.addPoints } : {}), ...(v.totalPoints ? { totalPoints: v.totalPoints } : {}), ...(v.length ? { length: v.length } : {}) })
const sameWords = (a: SlideContent, b: SlideContent) => JSON.stringify(textOf(a)) === JSON.stringify(textOf(b))
/** the same data whatever order its keys are in (a parsed slide comes back in the schema's key order) */
const canonical = (v: unknown): string => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v))
const withoutNotes = (c: SlideContent) => canonical({ ...c, speakerNotes: '', sources: [] })
/** a normal speaking pace (words a minute): how a timed script ("30 seconds") becomes words. An estimate, and said as one */
const SPEAK_WPM = 140
export const notesWordRange = (seconds: number) => { const about = Math.round((seconds * SPEAK_WPM) / 60); return { about, atLeast: Math.max(5, Math.floor(about * 0.8)), atMost: Math.ceil(about * 1.2) } }
const notesWords = (t: string) => t.trim().split(/\s+/).filter(Boolean).length
/** a timed script: the notes must be about as long as the time asked (code counts, never the model) */
const timedProblem = (c: SlideContent, seconds: number | undefined): string | null => {
  if (!seconds) return null
  const r = notesWordRange(seconds), n = notesWords(c.speakerNotes ?? '')
  return n < r.atLeast || n > r.atMost ? `the speaker notes must be ${r.atLeast}-${r.atMost} words (about ${seconds} seconds spoken); they have ${n}` : null
}
/** what a notes-only request must do: new notes, the slide itself untouched */
const notesProblem = (a: SlideContent, b: SlideContent): string | null => (withoutNotes(a) !== withoutNotes(b) ? 'only the speaker notes may change: keep every other field exactly as it is' : (a.speakerNotes ?? '').trim() === (b.speakerNotes ?? '').trim() ? 'the speaker notes did not change' : null)

/**
 * Asks for the slides of `ids`, keeps every slide that fits the rules, and asks ONCE more for only the ones that do not, naming each reason.
 * `accept` adds a capability's own rule for a slide (for example "must keep its layout"). Returns what fit and why the rest did not.
 */
async function writeValid(
  ctx: RunCtx, ids: string[], earlier: string[] | undefined,
  ask: (ids: string[], problems: string[]) => Promise<z.infer<typeof slidesOut>>,
  accept: (id: string, c: SlideContent) => string | null,
  /** the answer's content for a slide, set right before it is checked (a field the capability decides itself, not the model) */
  prepare?: (id: string, raw: unknown) => unknown,
): Promise<{ good: Map<string, SlideContent>; failed: Map<string, string> }> {
  const good = new Map<string, SlideContent>()
  let failed = new Map<string, string>()
  let todo = ids
  let problems = earlier ?? []
  for (let attempt = 0; attempt < 2 && todo.length; attempt++) {
    const out = await ask(todo, problems)
    const byId = new Map(out.slides.map((s) => [s.slideId, s.content]))
    failed = new Map()
    for (const id of todo) {
      if (!byId.has(id)) { failed.set(id, 'it was not returned'); continue }
      const parsed = parseContent(prepare ? prepare(id, byId.get(id)) : byId.get(id))
      if (!parsed.ok) { failed.set(id, parsed.why); continue }
      const refused = accept(id, parsed.content)
      if (refused) failed.set(id, refused); else good.set(id, parsed.content)
    }
    todo = [...failed.keys()]
    problems = [...(earlier ?? []), ...todo.map((id) => `Slide ${numberFor(ctx, id)} was rejected: ${failed.get(id)}. Return that slide again so it follows the rules.`)]
  }
  return { good, failed }
}
const couldNotFit = (ctx: RunCtx, failed: Map<string, string>) => [...failed.entries()].map(([id, why]) => `Slide ${numberFor(ctx, id)}: I couldn't do that (${why.replace(/[.\s]+$/, '').slice(0, 160)}), so I left it as it was.`)

const TEXT_RULES = `Return {"slides":[{"slideId":"<id>","content":{...}}]}: one entry for every slide in input.slides, with that slide's new content.
- Do what input.request asks, visibly: never return a slide unchanged.
- Keep each slide's layout and JSON shape: the same fields. Lists keep their number of items, EXCEPT when input.slides[].goal.points is given: then each list named there ends with EXACTLY that many items (add or remove items, each item complete in the same shape as the others). Count before you answer.
- input.slides[].goal.words, when given, is how many visible words the slide must have (atLeast or atMost): more words means more real detail, never padding or repetition. goal.mayAddPoints names lists that may also take NEW items (up to the number given per list), when more detail fits better as new points.
- Respect input.slides[].limits: no point list may have more items than limits.maxPointsPerList.
- Adding content without a source: write useful points about the slide's own topic from general knowledge, in the slide's voice, with qualitative wording instead of figures.
- Keep "sources" as they were, unless you use a <source> block: then cite it as {"sourceId":"<id>","locator":"<page or section>"}.
- input.problems, when present, lists what was wrong with your previous answer: fix exactly that.`

export const text: Capability<z.infer<typeof VALUES.text>> = {
  family: 'text', values: VALUES.text, scope: 'slides', cost: 'writing',
  preflight: writingPreflight,
  async run(ctx, ids, v, problems) {
    const { ok, notes } = writable(ctx, ids)
    const goal = textGoal(v)
    // BEFORE writing: a slide that cannot hold what is asked ("8 points" on a layout that holds 6) is asked about, never filled "as far as it goes" and called done
    const misfit = ok.map((id) => ({ id, fit: textGoalFit(slideOf(ctx, id)!.content as SlideContent, goal) })).filter((x) => !x.fit.ok) as { id: string; fit: { ok: false; why: string; fits: number } }[]
    if (misfit.length) {
      const first = misfit[0]!, n = numberFor(ctx, first.id)
      const list = misfit.map((x) => `slide ${numberFor(ctx, x.id)}: ${x.fit.why}`).join('; ')
      return { ops: [], ask: { text: `I can't do that exactly: ${list}. Nothing was changed. Shall I make ${misfit.length === 1 ? `slide ${n}` : 'them'} ${first.fit.fits} points instead?`, options: [{ label: `Yes, ${first.fit.fits} points`, reply: `make ${misfit.length === 1 ? `slide ${n}` : misfit.map((x) => `slide ${numberFor(ctx, x.id)}`).join(' and ')} ${first.fit.fits} points in total` }, { label: 'No, leave it', reply: 'No, leave it as it is' }] } }
    }
    // rewriting the words of MORE THAN HALF the deck (four slides or more) is shown first, with what it costs, and confirmed; the confirmed request and slides come from the request, never from the model
    const total = ctx.virtual.slides.length
    if (ctx.confirm?.kind !== 'text_bulk' && ok.length >= 4 && ok.length * 2 > total) {
      const notesOnly = !!v.notesOnly
      return { ops: [], ask: { text: `This ${notesOnly ? 'writes the speaker notes of' : 'rewrites the words of'} ${ok.length} of the ${total} slides ("${v.request.slice(0, 160)}${v.request.length > 160 ? '…' : ''}"). It counts as two edits instead of one, and Ctrl+Z puts ${notesOnly ? 'the old notes' : 'the old words'} back right after. Go ahead?`, options: [{ label: notesOnly ? 'Yes, write the notes' : 'Yes, rewrite them', reply: notesOnly ? 'Yes, write those notes' : 'Yes, rewrite those slides', confirm: { kind: 'text_bulk', request: v.request, ...goal, ...(v.notesSeconds ? { notesSeconds: v.notesSeconds } : {}), ...(v.notesOnly ? { notesOnly: true } : {}), slideIds: ok } }, { label: 'No, leave them', reply: 'No, leave my slides as they are' }] } }
    }
    const ops: Step['ops'] = []
    for (const group of batches(ctx, ok)) {
      const { good, failed } = await writeValid(ctx, group, problems,
        (sub, why) => ctx.write({
          card: 'text', rules: TEXT_RULES, route: 'quality', schema: slidesOut,
          input: { request: v.request, slides: sub.map((id) => slideInput(ctx, id, goal)), ...(v.notesSeconds ? { speakerNotesWords: notesWordRange(v.notesSeconds) } : {}), ...(why.length ? { problems: why } : {}) },
          material: v.useSources || ctx.material.length ? ctx.material : undefined,
        }),
        // a slide is accepted only when it does what was asked: its layout kept, its words really changed, and the countable goal met (points, length)
        (id, c) => {
          const before = slideOf(ctx, id)!.content as SlideContent
          if (c.layout !== slideOf(ctx, id)!.layoutId) return `it must keep the ${slideOf(ctx, id)!.layoutId} layout (you returned ${c.layout})`
          if (v.notesOnly) return notesProblem(before, c) ?? timedProblem(c, v.notesSeconds)
          if (sameWords(before, c)) return 'it came back with the same words'
          return textGoalProblem(before, c, goal)
        },
        // this writer never changes a layout: a layout name that is not a layout at all is the slide's own (a model that wrote it wrong failed a good rewrite); a real but different layout is still refused above
        (id, raw) => {
          // speaker notes only: the writer supplies the notes, code puts them on the slide exactly as it is (nothing else can change)
          if (v.notesOnly) return { ...(slideOf(ctx, id)!.content as object), speakerNotes: String((raw as { speakerNotes?: unknown } | null)?.speakerNotes ?? '').slice(0, 1500) }
          return raw && typeof raw === 'object' && !Array.isArray(raw) && !(LAYOUT_IDS as readonly string[]).includes(String((raw as { layout?: unknown }).layout)) ? { ...(raw as object), layout: slideOf(ctx, id)!.layoutId } : raw
        },
      )
      for (const slideId of group) { const c = good.get(slideId); const lists = allowedLists(slideOf(ctx, slideId)!.content as SlideContent, goal); if (c) ops.push({ op: 'edit_slide', slideId, content: c, ...(lists?.length ? { lists } : {}) }) } // in the order asked; the lists the goal is about may change length
      notes.push(...couldNotFit(ctx, failed))
    }
    // a timed script: its length is an ESTIMATE at a normal pace, said as one
    const timed = v.notesSeconds ? ops.flatMap((o) => (o.op === 'edit_slide' ? [`Slide ${numberFor(ctx, o.slideId)}: about ${v.notesSeconds! >= 90 ? `${Math.round(v.notesSeconds! / 60 * 10) / 10} minutes` : `${v.notesSeconds} seconds`} spoken at a normal pace (${notesWords((o.content as SlideContent).speakerNotes ?? '')} words; your own pace may differ).`] : [])) : []
    return { ops, refused: notes, written: ops.length, ...(timed.length ? { notes: timed } : {}) } // (every refused note here is a part not done: a locked or hand-edited slide, a slide the goal could not be met on)
  },
  // every slide in the result already met its goal (writeValid accepts nothing else); the check is the safety net that nothing slipped through
  check(ctx, ids, v, step) {
    const goal = textGoal(v)
    const out: Unmet[] = []
    for (const o of step.ops) {
      if (o.op !== 'edit_slide') continue
      const before = slideOf(ctx, o.slideId)?.content as SlideContent | undefined
      if (!before) continue
      const why = v.notesOnly ? notesProblem(before, o.content as SlideContent) ?? timedProblem(o.content as SlideContent, v.notesSeconds) : sameWords(before, o.content as SlideContent) ? 'it came back with the same words' : textGoalProblem(before, o.content as SlideContent, goal)
      if (why) out.push({ slideId: o.slideId, why })
    }
    return out
  },
}

/** layouts that show a picture */
const PICTURE_LAYOUTS = new Set(['split-image-text'])
const hasPicture = (s: { content?: unknown; background?: { type: string } | undefined; elements?: { type: string; decorative?: boolean | undefined }[] }) => !!(s.content as { imageUrl?: string } | undefined)?.imageUrl || s.background?.type === 'image' || (s.elements ?? []).some((e) => e.type === 'image' && !e.decorative)

const LAYOUT_RULES = `Return {"slides":[{"slideId":"<id>","content":{...}}]}: every slide in input.slides re-fitted into a DIFFERENT layout from its current one (input.slides[].layout).
- If input.layout is set, use that layout for every slide.
- Otherwise choose for each slide the layout that suits its content: a sequence or steps → process, timeline or roadmap; two sides or options → comparison; key figures → metrics or big-number; several themes → agenda or matrix; a story or example → case-study or quote; how parts fit together → architecture. Neighbouring slides get different layouts; prefer layouts the deck uses little (input.look.layoutsInUse). Use split-image-text only for a slide that already has a picture.
- Keep the slide's own words and every fact, trimmed to the field sizes; never invent figures, names or claims.
- input.problems, when present, lists what was wrong with your previous answer: fix exactly that.
Layout JSON shapes:
${LAYOUT_SHAPES}`

export const layout: Capability<z.infer<typeof VALUES.layout>> = {
  family: 'layout', values: VALUES.layout, scope: 'slides', cost: 'writing',
  preflight: writingPreflight,
  async run(ctx, ids0, v0, problems) {
    // "look like slide N": the layout of that slide is the layout asked for (a slide built by hand or part of a template animation has no layout to copy)
    let ids = ids0, v = v0
    const pre: string[] = []
    if (v0.like !== undefined) {
      const src = ctx.virtual.slides[v0.like - 1]
      if (!src) return { ops: [], refused: [`There is no slide ${v0.like} to copy the layout from.`] }
      if (src.layoutId.startsWith('morph') || src.manual) return { ops: [], refused: [`Slide ${v0.like} was ${src.manual ? 'built by hand' : 'made from an animated template'}, so it has no layout I can copy.`] }
      ids = ids0.filter((id) => id !== src.id)
      if (ids.length < ids0.length) pre.push(`Slide ${v0.like} is the one being copied, so I left it as it is.`)
      v = { ...v0, layout: src.layoutId as never }
    }
    const { ok, notes: n0 } = writable(ctx, ids)
    const notes = [...pre, ...n0]
    const ops: Step['ops'] = []
    for (const group of batches(ctx, ok)) {
      const { good, failed } = await writeValid(ctx, group, problems,
        (sub, why) => ctx.write({
          card: 'layout', rules: LAYOUT_RULES, route: 'quality', schema: slidesOut,
          input: { ...(v.layout ? { layout: v.layout } : {}), slides: sub.map((id) => slideInput(ctx, id)), ...(why.length ? { problems: why } : {}) },
        }),
        (id, c) => {
          if (c.layout === slideOf(ctx, id)!.layoutId) return `it kept the ${c.layout} layout; it needs a different one`
          if (v.layout && c.layout !== v.layout) return `it must use the ${v.layout} layout`
          // a picture layout for a slide with no picture would show an empty picture box: refused unless the person asked for that layout by name
          if (PICTURE_LAYOUTS.has(c.layout) && !v.layout && !hasPicture(slideOf(ctx, id)!)) return `the ${c.layout} layout needs a picture and this slide has none: choose a layout without a picture`
          return null
        },
      )
      for (const slideId of group) { const c = good.get(slideId); if (c) ops.push({ op: 'restructure_slide', slideId, content: c }) }
      notes.push(...couldNotFit(ctx, failed))
    }
    return { ops, refused: notes, written: ops.length } // (every note here is a part not done: a locked or hand-edited slide, a slide the goal could not be met on)
  },
  check(ctx, ids, v, step) {
    const chosen = step.ops.filter((o) => o.op === 'restructure_slide').map((o) => (o as { content: SlideContent }).content.layout)
    // several slides asked for "different layouts" must not all come back the same (the whole step is about that, so it is withheld as a whole when it does)
    return !v.layout && chosen.length >= 3 && new Set(chosen).size === 1 && writable(ctx, ids).ok.length >= 3 ? [{ why: `all ${chosen.length} slides came back with the same layout (${chosen[0]}); neighbouring slides need different layouts` }] : []
  },
}

const ADD_RULES = `Return {"slides":[{"content":{...}}]} with exactly input.count new slides, in order.
- Each new slide continues the deck's story at its place (input.places[i] gives the titles of the slides before and after it) in the same voice and density as the deck.
- About: input.about. If input.layout is set, use it; a closing or thank-you slide uses "thank-you"; otherwise choose the layout that suits the content and differs from the neighbours.
- Use only facts already in the deck (input.deck) or in <source> blocks.
- input.problems, when present, lists what was wrong with your previous answer: fix exactly that.
Layout JSON shapes:
${LAYOUT_SHAPES}`

export const addSlide: Capability<z.infer<typeof VALUES.add_slide>> = {
  family: 'add_slide', values: VALUES.add_slide, scope: 'none', cost: 'writing',
  async run(ctx, _ids, v, problems) {
    // four or more new slides are written at once: shown first with what it costs, and confirmed (the confirmed numbers come from the request, never from the model)
    if (ctx.confirm?.kind !== 'add_bulk' && v.count >= 4 && v.where !== 'after') {
      const now = ctx.virtual.slides.length
      return { ops: [], ask: { text: `This writes ${v.count} new slides${v.about ? ` about "${v.about.slice(0, 120)}"` : ''}, taking the deck from ${now} to ${now + v.count} slides. It counts as two edits instead of one, and Ctrl+Z takes the new slides away right after. Go ahead?`, options: [{ label: `Yes, add ${v.count} slides`, reply: 'Yes, add those slides', confirm: { kind: 'add_bulk', count: v.count, where: v.where as 'end' | 'start' | 'spread', ...(v.about ? { about: v.about } : {}), ...(v.layout ? { layout: v.layout } : {}) } }, { label: 'No, leave the deck', reply: 'No, leave my deck as it is' }] } }
    }
    let afterId: string | undefined
    if (v.where === 'after') {
      const r = v.after ? ctx.resolveAnchor([v.after]) : { ok: false as const, refuse: 'Tell me after which slide the new slides should go.' }
      if (!r.ok) return { ops: [], refused: ['refuse' in r ? r.refuse : r.ask.text] }
      afterId = r.ids.at(-1)
    }
    const points = insertionPoints(ctx.state, v.count, v.where, afterId)
    const titleAt = (id: string | null) => (id ? slideTitle(ctx.virtual.slides.find((s) => s.id === id)?.content) : '')
    const nextOf = (id: string | null) => { const i = id ? ctx.virtual.slides.findIndex((s) => s.id === id) : -1; return slideTitle(ctx.virtual.slides[i + 1]?.content) }
    const ask = (count: number, why: string[]) => ctx.write({
      card: 'add_slide', rules: ADD_RULES, route: 'quality', schema: newSlidesOut, material: ctx.material.length ? ctx.material : undefined,
      input: {
        count, about: v.about ?? ctx.instruction, ...(v.layout ? { layout: v.layout } : {}),
        places: points.slice(0, count).map((p) => ({ before: v.where === 'start' ? '' : titleAt(p), after: v.where === 'start' ? titleAt(ctx.virtual.slides[0]?.id ?? null) : nextOf(p) })),
        deck: { title: ctx.virtual.title, slides: ctx.state.slides.map((r) => `${r.n}. ${r.title || r.layout}`) },
        ...(why.length ? { problems: why } : {}),
      },
    })
    // every new slide is checked on its own; the ones that do not fit are asked for again (only those), the rest are kept
    const made: SlideContent[] = []
    let missing = v.count
    let why = problems ?? []
    for (let attempt = 0; attempt < 2 && missing > 0; attempt++) {
      const out = await ask(missing, why)
      const reasons: string[] = []
      for (const [i, s] of out.slides.slice(0, missing).entries()) {
        const parsed = parseContent(s.content)
        if (parsed.ok) made.push(parsed.content); else reasons.push(`New slide ${i + 1} was rejected: ${parsed.why}.`)
      }
      if (out.slides.length < missing) reasons.push(`You returned ${out.slides.length} slide${out.slides.length === 1 ? '' : 's'}; ${missing} are needed.`)
      missing = v.count - made.length
      why = [...(problems ?? []), ...reasons]
    }
    // new slides get their ids here, so a later task of the same message ("…and make them blue") can target them; slides added at the same place keep their order
    const ops: Step['ops'] = []
    const added: string[] = []
    let prevAnchor: string | null | undefined, prevId: string | undefined
    made.forEach((c, i) => {
      const id = ctx.newId()
      const anchor = points[i] ?? null
      const after = prevId !== undefined && anchor === prevAnchor ? prevId : anchor
      ops.push({ op: 'add_slide', id, afterSlideId: after, content: c, ...(v.where === 'start' && after === null ? { atStart: true } : {}) })
      added.push(id); prevAnchor = anchor; prevId = id
    })
    const tplNote = ops.length ? addSlideNote(ctx.virtual) : null
    const refused = missing > 0 ? [`I could only make ${made.length} of the ${v.count} slides you asked for.`] : []
    return { ops, added, written: ops.length, refused, ...(tplNote ? { notes: [tplNote] } : {}) }
  },
}


const PARTS_LAYOUTS = 'title-body'
const MERGE_RULES = `Return {"content":{...}}: ONE slide that combines input.slides into a single slide.
- Use ONLY the words and facts of input.slides: never add a figure, name, claim or example that is not in them.
- Keep the key point of every slide, shorten the wording so it fits; do not drop a figure unless there is no room.
- Layout: "title-body" or input.keepLayout (the first slide's own layout). Use the JSON shape of the layout you choose.
- input.problems, when present, lists what was wrong with your previous answer: fix exactly that.
Layout JSON shapes:
${LAYOUT_SHAPES}`
const SPLIT_RULES = `Return {"slides":[{"content":{...}}, ...]}: input.parts slides made from the ONE slide in input.slide, in reading order.
- Use ONLY the words and facts of that slide: never add a figure, name, claim or example that is not in it. Every part has its own clear title.
- Share the points between the parts so each part is about one idea; keep every figure on one of the parts.
- Layout of each part: "title-body" or input.keepLayout (the slide's own layout). Use the JSON shape of the layout you choose.
- input.problems, when present, lists what was wrong with your previous answer: fix exactly that.
Layout JSON shapes:
${LAYOUT_SHAPES}`
const mergeOut = z.object({ content: z.unknown() })
const splitOut = z.object({ slides: z.array(z.object({ content: z.unknown() })).max(3).default([]) })
/** how many words a slide says (titles included): a merge or split may re-shape the words but must not ADD to them */
const wordCount = (cs: SlideContent[]) => cs.map((c) => textOf(c).join(' ')).join(' ').split(/\s+/).filter(Boolean).length
const pointsOf = (c: SlideContent) => pointLists(c).reduce((a, l) => a + l.count, 0)
const wordsIn = (cs: SlideContent[]) => cs.map((c) => textOf(c).join(' ')).join(' ')
const listOf = (ns: number[]) => (ns.length === 1 ? `slide ${ns[0]}` : `slides ${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`)
/** "what was kept, what was not", from the real content (never from the writer's word): the figures of the originals that are not on the result, and the number of points before and after */
function keptReport(before: SlideContent[], after: SlideContent[]): string[] {
  const had = figuresOf(wordsIn(before)), has = new Set(figuresOf(wordsIn(after)))
  const lost = had.filter((f) => !has.has(f))
  const p0 = before.reduce((a, c) => a + pointsOf(c), 0), p1 = after.reduce((a, c) => a + pointsOf(c), 0)
  return [
    ...(had.length ? [lost.length ? `These figures from the original ${before.length === 1 ? 'slide' : 'slides'} are not in the result: ${lost.slice(0, 8).join(', ')}.` : `Every figure of the original ${before.length === 1 ? 'slide' : 'slides'} is in the result.`] : []),
    ...(p0 || p1 ? [`The result has ${p1} point${p1 === 1 ? '' : 's'} (the original ${before.length === 1 ? 'slide had' : 'slides had'} ${p0}).`] : []),
  ]
}

/**
 * Merging several slides into one, or splitting one slide into two or three. The writer uses ONLY the words and facts of the slides it is given; code then checks the layout, traces every figure to the
 * deck (the same rule as everything else the assistant writes), and says from the real content what was kept and which figures of the originals are not on the result. A merge keeps the first slide's
 * place and deletes the others; a split keeps the first part in the slide's place and adds the others right after it. Nothing happens to locked or hand-edited slides: the whole request is refused with the reason.
 */
export const combine: Capability<z.infer<typeof VALUES.combine>> = {
  family: 'combine', values: VALUES.combine, scope: 'slides', cost: 'writing',
  async run(ctx, ids, v, problems) {
    const { ok, notes } = writable(ctx, ids)
    if (ok.length < ids.length) return { ops: [], refused: [...notes, 'So I did not merge or split anything: every slide involved has to be open for changes.'] }
    const keep = (id: string) => slideOf(ctx, id)!.layoutId
    // a figure that is nowhere in the person's message, the deck or the sources is refused HERE, before anything is returned: the other slides of a merge must never be deleted for a result that is then refused
    const corpus = [ctx.instruction, ...ctx.material.map((m) => m.text), JSON.stringify(ctx.state.doc.slides.map((s) => s.content ?? ''))].join('\n')
    const invented = (cs: SlideContent[]) => [...new Set(cs.flatMap((c) => figuresNotInSources(c, corpus)))]
    const parse = (raw: unknown, first: string) => { const r = parseContent(raw); return r.ok && r.content.layout !== PARTS_LAYOUTS && r.content.layout !== keep(first) ? { ok: false as const, why: `the layout must be ${PARTS_LAYOUTS} or ${keep(first)} (you returned ${r.content.layout})` } : r }
    const op = (slideId: string, c: SlideContent): Step['ops'][number] => (c.layout === keep(slideId) ? { op: 'edit_slide', slideId, content: c } : { op: 'restructure_slide', slideId, content: c })
    if (v.action === 'merge') {
      if (ids.length < 2) return { ops: [], refused: ['Tell me which slides to merge: at least two, for example "merge slides 3 and 4".'] }
      if (ids.length > 4) return { ops: [], refused: ['I can merge up to 4 slides into one at a time.'] }
      let why = problems ?? [], made: SlideContent | null = null, bad = ''
      for (let attempt = 0; attempt < 2 && !made; attempt++) {
        const out = await ctx.write({ card: 'combine_merge', rules: MERGE_RULES, route: 'quality', schema: mergeOut, input: { keepLayout: keep(ids[0]!), slides: ids.map((id) => slideInput(ctx, id)), ...(why.length ? { problems: why } : {}) } })
        const r = parse(out.content, ids[0]!)
        const had = wordCount(ids.map((id) => slideOf(ctx, id)!.content as SlideContent))
        if (r.ok && wordCount([r.content]) > had + 4) { bad = `it has ${wordCount([r.content])} words but the slides only have ${had}: use only their own words, add none`; why = [...(problems ?? []), `Your answer was rejected: ${bad}.`]; continue }
        if (r.ok) made = r.content; else { bad = r.why; why = [...(problems ?? []), `Your answer was rejected: ${bad}. Return the merged slide again so it follows the rules.`] }
      }
      if (!made) return { ops: [], refused: [`I could not fit those slides into one (${bad}), so nothing was changed.`] }
      const bogus = invented([made])
      if (bogus.length) return { ops: [], refused: [`I did not merge them: the merged slide had figures (${bogus.slice(0, 5).join(', ')}) that are not in your slides, your message or your sources, and I never make up numbers. Nothing was changed.`] }
      const nums = ids.map((id) => numberFor(ctx, id))
      return { ops: [op(ids[0]!, made)], slideOps: { removals: ids.slice(1) }, applied: [`Merged ${listOf(nums)} into slide ${nums[0]} and deleted ${listOf(nums.slice(1))}`], notes: keptReport(ids.map((id) => slideOf(ctx, id)!.content as SlideContent), [made]), written: 1 }
    }
    // split
    if (ids.length !== 1) return { ops: [], refused: ['Tell me which ONE slide to split, for example "split slide 5 into two".'] }
    const id = ids[0]!, parts = v.parts ?? 2
    let why = problems ?? [], made: SlideContent[] | null = null, bad = ''
    for (let attempt = 0; attempt < 2 && !made; attempt++) {
      const out = await ctx.write({ card: 'combine_split', rules: SPLIT_RULES, route: 'quality', schema: splitOut, input: { keepLayout: keep(id), parts, slide: slideInput(ctx, id), ...(why.length ? { problems: why } : {}) } })
      const rs = out.slides.map((s, i) => (i === 0 ? parse(s.content, id) : parse(s.content, id)))
      if (rs.length !== parts) { bad = `${parts} slides are needed, you returned ${rs.length}`; why = [...(problems ?? []), `Your answer was rejected: ${bad}.`]; continue }
      const failed = rs.find((r) => !r.ok)
      if (failed && !failed.ok) { bad = failed.why; why = [...(problems ?? []), `Your answer was rejected: ${bad}. Return the parts again so they follow the rules.`]; continue }
      const cs = rs.map((r) => (r as { ok: true; content: SlideContent }).content)
      const had = wordCount([slideOf(ctx, id)!.content as SlideContent]), now = wordCount(cs)
      if (now > had + 4 * (parts - 1) + 2) { bad = `the parts have ${now} words but the slide only has ${had}: share its own words, add none (a title for each part is fine)`; why = [...(problems ?? []), `Your answer was rejected: ${bad}.`]; continue }
      made = cs
    }
    if (!made) return { ops: [], refused: [`I could not split that slide cleanly (${bad}), so nothing was changed.`] }
    const bogus = invented(made)
    if (bogus.length) return { ops: [], refused: [`I did not split it: the new slides had figures (${bogus.slice(0, 5).join(', ')}) that are not in your slide, your message or your sources, and I never make up numbers. Nothing was changed.`] }
    const n = numberFor(ctx, id)
    const added: string[] = []
    const ops: Step['ops'] = [op(id, made[0]!)]
    let prev = id
    for (const c of made.slice(1)) { const nid = ctx.newId(); ops.push({ op: 'add_slide', afterSlideId: prev, content: c, id: nid }); added.push(nid); prev = nid }
    return { ops, added, applied: [`Split slide ${n} into ${parts} slides (${n} to ${n + parts - 1})`], notes: keptReport([slideOf(ctx, id)!.content as SlideContent], made), written: parts }
  },
}
