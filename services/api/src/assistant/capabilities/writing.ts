import { z } from 'zod'
import { slideTitle } from '@prompttoppt/theme'
import { slideContentSchema, type SlideContent } from '@prompttoppt/validation'
import { LAYOUT_MAX_POINTS, listLengths } from '../../ai/ai-assist.ts'
import { LAYOUT_SHAPES } from '../../ai/prompts.ts'
import { textOf } from '../../generation/quality.ts'
import { MAX_SLIDE_CHARS } from '../planner.ts'
import { insertionPoints } from '../resolve.ts'
import { numberOf } from '../state.ts'
import { VALUES } from '../understand.ts'
import type { Capability, RunCtx, Step } from './types.ts'

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

/** the slides a model may rewrite: not locked, not hand-edited, with semantic content; the rest are named in a note */
function writable(ctx: RunCtx, ids: string[]): { ok: string[]; notes: string[] } {
  const ok: string[] = [], notes: string[] = []
  for (const id of ids) {
    const s = slideOf(ctx, id)
    const n = numberFor(ctx, id)
    if (!s) continue
    if (s.locked) notes.push(`Slide ${n} is locked, so I left it alone.`)
    else if (s.manual || !s.content) notes.push(`Slide ${n} was edited by hand, so I left its words alone.`)
    else ok.push(id)
  }
  return { ok, notes }
}

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
const slideInput = (ctx: RunCtx, id: string) => {
  const s = slideOf(ctx, id)!
  const maxPoints = LAYOUT_MAX_POINTS[s.layoutId]
  return { slideId: id, n: numberFor(ctx, id), layout: s.layoutId, content: s.content, ...(maxPoints ? { limits: { maxPointsPerList: maxPoints } } : {}) }
}

/**
 * Asks for the slides of `ids`, keeps every slide that fits the rules, and asks ONCE more for only the ones that do not, naming each reason.
 * `accept` adds a capability's own rule for a slide (for example "must keep its layout"). Returns what fit and why the rest did not.
 */
async function writeValid(
  ctx: RunCtx, ids: string[], earlier: string[] | undefined,
  ask: (ids: string[], problems: string[]) => Promise<z.infer<typeof slidesOut>>,
  accept: (id: string, c: SlideContent) => string | null,
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
      const parsed = parseContent(byId.get(id))
      if (!parsed.ok) { failed.set(id, parsed.why); continue }
      const refused = accept(id, parsed.content)
      if (refused) failed.set(id, refused); else good.set(id, parsed.content)
    }
    todo = [...failed.keys()]
    problems = [...(earlier ?? []), ...todo.map((id) => `Slide ${numberFor(ctx, id)} was rejected: ${failed.get(id)}. Return that slide again so it follows the rules.`)]
  }
  return { good, failed }
}
const couldNotFit = (ctx: RunCtx, failed: Map<string, string>) => [...failed.keys()].map((id) => `Slide ${numberFor(ctx, id)}: I couldn't fit that into the slide, so I left it as it was.`)

const TEXT_RULES = `Return {"slides":[{"slideId":"<id>","content":{...}}]}: one entry for every slide in input.slides, with that slide's new content.
- Do what input.request asks, visibly: never return a slide unchanged.
- Keep each slide's layout and JSON shape: the same fields, and the same number of items in lists of cards, steps, phases, rows and metrics. Plain point lists (bullets, context, approach, results, and the bullets of left/right/quadrants) may grow or shrink.
- Respect input.slides[].limits: no point list may have more items than limits.maxPointsPerList. When input.addPoints is N, every point list the request is about ends with exactly N more points than it has now (count them first); if the limit stops you, add what fits.
- Adding content without a source: write useful points about the slide's own topic from general knowledge, in the slide's voice, with qualitative wording instead of figures.
- Keep "sources" as they were, unless you use a <source> block: then cite it as {"sourceId":"<id>","locator":"<page or section>"}.
- input.problems, when present, lists what was wrong with your previous answer: fix exactly that.`

export const text: Capability<z.infer<typeof VALUES.text>> = {
  family: 'text', values: VALUES.text, scope: 'slides', cost: 'writing',
  async run(ctx, ids, v, problems) {
    const { ok, notes } = writable(ctx, ids)
    const ops: Step['ops'] = []
    for (const group of batches(ctx, ok)) {
      const { good, failed } = await writeValid(ctx, group, problems,
        (sub, why) => ctx.write({
          card: 'text', rules: TEXT_RULES, route: 'quality', schema: slidesOut,
          input: { request: v.request, ...(v.addPoints ? { addPoints: v.addPoints } : {}), slides: sub.map((id) => slideInput(ctx, id)), ...(why.length ? { problems: why } : {}) },
          material: v.useSources || ctx.material.length ? ctx.material : undefined,
        }),
        (id, c) => (c.layout === slideOf(ctx, id)!.layoutId ? null : `it must keep the ${slideOf(ctx, id)!.layoutId} layout (you returned ${c.layout})`),
      )
      for (const slideId of group) { const c = good.get(slideId); if (c) ops.push({ op: 'edit_slide', slideId, content: c }) } // in the order asked, whether a slide needed a second try or not
      notes.push(...couldNotFit(ctx, failed))
    }
    return { ops, notes, written: ops.length }
  },
  check(ctx, ids, v, step) {
    const problems: string[] = []
    for (const id of writable(ctx, ids).ok) {
      const before = slideOf(ctx, id)!.content as SlideContent
      const op = step.ops.find((o) => o.op === 'edit_slide' && o.slideId === id) as { content: SlideContent } | undefined
      const n = numberFor(ctx, id)
      if (!op) continue // a slide that could not be written is already named in the notes
      if (JSON.stringify(textOf(before)) === JSON.stringify(textOf(op.content))) { problems.push(`Slide ${n} came back with the same words.`); continue }
      if (v.addPoints) {
        const was = listLengths(before), now = listLengths(op.content)
        const max = LAYOUT_MAX_POINTS[before.layout] ?? 99
        if (was.length && was.length === now.length && now.some((len, i) => len < Math.min(max, was[i]! + v.addPoints!))) problems.push(`Slide ${n} has ${now.join(' and ')} points; it needs ${was.map((x) => Math.min(max, x + v.addPoints!)).join(' and ')}.`)
      }
    }
    return problems
  },
}

const LAYOUT_RULES = `Return {"slides":[{"slideId":"<id>","content":{...}}]}: every slide in input.slides re-fitted into a DIFFERENT layout from its current one (input.slides[].layout).
- If input.layout is set, use that layout for every slide.
- Otherwise choose for each slide the layout that suits its content: a sequence or steps → process, timeline or roadmap; two sides or options → comparison; key figures → metrics or big-number; several themes → agenda or matrix; a story or example → case-study or quote; how parts fit together → architecture. Neighbouring slides get different layouts; prefer layouts the deck uses little (input.look.layoutsInUse). Use split-image-text only for a slide that already has a picture.
- Keep the slide's own words and every fact, trimmed to the field sizes; never invent figures, names or claims.
- input.problems, when present, lists what was wrong with your previous answer: fix exactly that.
Layout JSON shapes:
${LAYOUT_SHAPES}`

export const layout: Capability<z.infer<typeof VALUES.layout>> = {
  family: 'layout', values: VALUES.layout, scope: 'slides', cost: 'writing',
  async run(ctx, ids, v, problems) {
    const { ok, notes } = writable(ctx, ids)
    const ops: Step['ops'] = []
    for (const group of batches(ctx, ok)) {
      const { good, failed } = await writeValid(ctx, group, problems,
        (sub, why) => ctx.write({
          card: 'layout', rules: LAYOUT_RULES, route: 'quality', schema: slidesOut,
          input: { ...(v.layout ? { layout: v.layout } : {}), slides: sub.map((id) => slideInput(ctx, id)), ...(why.length ? { problems: why } : {}) },
        }),
        (id, c) => {
          if (c.layout === slideOf(ctx, id)!.layoutId) return `it kept the ${c.layout} layout; it needs a different one`
          return v.layout && c.layout !== v.layout ? `it must use the ${v.layout} layout` : null
        },
      )
      for (const slideId of group) { const c = good.get(slideId); if (c) ops.push({ op: 'restructure_slide', slideId, content: c }) }
      notes.push(...couldNotFit(ctx, failed))
    }
    return { ops, notes, written: ops.length }
  },
  check(ctx, ids, v, step) {
    const chosen = step.ops.filter((o) => o.op === 'restructure_slide').map((o) => (o as { content: SlideContent }).content.layout)
    // several slides asked for "different layouts" must not all come back the same
    return !v.layout && chosen.length >= 3 && new Set(chosen).size === 1 && writable(ctx, ids).ok.length >= 3 ? [`All ${chosen.length} slides got the same layout (${chosen[0]}); give neighbouring slides different layouts.`] : []
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
    let afterId: string | undefined
    if (v.where === 'after') {
      const r = v.after ? ctx.resolveAnchor([v.after]) : { ok: false as const, refuse: 'Tell me after which slide the new slides should go.' }
      if (!r.ok) return { ops: [], notes: ['refuse' in r ? r.refuse : r.ask.text] }
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
    return { ops, added, written: ops.length, ...(missing > 0 ? { notes: [`I could only make ${made.length} of the ${v.count} slides you asked for.`] } : {}) }
  },
}
