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
 * (add_slide). Each makes one focused call with its own card and only the slides it is about, then checks the result itself.
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
const slidesOut = z.object({ slides: z.array(z.object({ slideId: z.string().max(64), content })).max(12).default([]) })
const newSlidesOut = z.object({ slides: z.array(z.object({ content })).max(5).default([]) })

const slideOf = (ctx: RunCtx, id: string) => ctx.virtual.slides.find((s) => s.id === id)

/** the slides a model may rewrite: not locked, not hand-edited, with semantic content; the rest are named in a note */
function writable(ctx: RunCtx, ids: string[]): { ok: string[]; notes: string[] } {
  const ok: string[] = [], notes: string[] = []
  for (const id of ids) {
    const s = slideOf(ctx, id)
    const n = numberOf(ctx.state, id) || ctx.virtual.slides.findIndex((x) => x.id === id) + 1
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

const slideInput = (ctx: RunCtx, id: string) => { const s = slideOf(ctx, id)!; return { slideId: id, n: numberOf(ctx.state, id), layout: s.layoutId, content: s.content } }

const TEXT_RULES = `Return {"slides":[{"slideId":"<id>","content":{...}}]}: one entry for every slide in input.slides, with that slide's new content.
- Do what input.request asks, visibly: never return a slide unchanged.
- Keep each slide's layout and JSON shape: the same fields, and the same number of items in lists of cards, steps, phases, rows and metrics. Plain point lists (bullets, context, approach, results, and the bullets of left/right/quadrants) may grow or shrink.
- When input.addPoints is N, every point list the request is about ends with exactly N more points than it has now (count them first). Maximum points: title-body 6, split-image-text 5, comparison 6 per side, case-study 4, big-number 3, matrix 3 per quadrant, roadmap 3 per phase, architecture 5 per layer; if a maximum stops you, add what fits.
- Adding content without a source: write useful points about the slide's own topic from general knowledge, in the slide's voice, with qualitative wording instead of figures.
- Keep "sources" as they were, unless you use a <source> block: then cite it as {"sourceId":"<id>","locator":"<page or section>"}.
- input.problems, when present, lists what was wrong with your previous answer: fix exactly that.`

export const text: Capability<z.infer<typeof VALUES.text>> = {
  family: 'text', values: VALUES.text, scope: 'slides', cost: 'writing',
  async run(ctx, ids, v, problems) {
    const { ok, notes } = writable(ctx, ids)
    const ops: Step['ops'] = []
    for (const group of batches(ctx, ok)) {
      const out = await ctx.write({
        card: 'text', rules: TEXT_RULES, route: 'quality', schema: slidesOut,
        input: { request: v.request, ...(v.addPoints ? { addPoints: v.addPoints } : {}), slides: group.map((id) => slideInput(ctx, id)), ...(problems?.length ? { problems } : {}) },
        material: v.useSources || ctx.material.length ? ctx.material : undefined,
      })
      for (const s of out.slides) if (group.includes(s.slideId)) ops.push({ op: 'edit_slide', slideId: s.slideId, content: s.content as SlideContent })
    }
    return { ops, notes, written: ops.length }
  },
  check(ctx, ids, v, step) {
    const problems: string[] = []
    for (const id of writable(ctx, ids).ok) {
      const before = slideOf(ctx, id)!.content as SlideContent
      const op = step.ops.find((o) => o.op === 'edit_slide' && o.slideId === id) as { content: SlideContent } | undefined
      const n = numberOf(ctx.state, id)
      if (!op) { problems.push(`Slide ${n} was not returned.`); continue }
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
      const out = await ctx.write({
        card: 'layout', rules: LAYOUT_RULES, route: 'quality', schema: slidesOut,
        input: { ...(v.layout ? { layout: v.layout } : {}), slides: group.map((id) => slideInput(ctx, id)), ...(problems?.length ? { problems } : {}) },
      })
      for (const s of out.slides) if (group.includes(s.slideId)) ops.push({ op: 'restructure_slide', slideId: s.slideId, content: s.content as SlideContent })
    }
    return { ops, notes, written: ops.length }
  },
  check(ctx, ids, v, step) {
    const ok = writable(ctx, ids).ok
    const problems: string[] = []
    const chosen: string[] = []
    for (const id of ok) {
      const op = step.ops.find((o) => o.op === 'restructure_slide' && o.slideId === id) as { content: SlideContent } | undefined
      const n = numberOf(ctx.state, id)
      if (!op) { problems.push(`Slide ${n} was not returned.`); continue }
      chosen.push(op.content.layout)
      if (op.content.layout === slideOf(ctx, id)!.layoutId) problems.push(`Slide ${n} kept its layout (${op.content.layout}); it needs a different one.`)
      else if (v.layout && op.content.layout !== v.layout) problems.push(`Slide ${n} must use the ${v.layout} layout.`)
    }
    if (!v.layout && ok.length >= 3 && new Set(chosen).size === 1) problems.push(`All ${ok.length} slides got the same layout (${chosen[0]}); give neighbouring slides different layouts.`)
    return problems
  },
}

const ADD_RULES = `Return {"slides":[{"content":{...}}]} with exactly input.count new slides, in order.
- Each new slide continues the deck's story at its place (input.places[i] gives the titles of the slides before and after it) in the same voice and density as the deck.
- About: input.about. If input.layout is set, use it; a closing or thank-you slide uses "thank-you"; otherwise choose the layout that suits the content and differs from the neighbours.
- Use only facts already in the deck (input.deck) or in <source> blocks.
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
    const out = await ctx.write({
      card: 'add_slide', rules: ADD_RULES, route: 'quality', schema: newSlidesOut, material: ctx.material.length ? ctx.material : undefined,
      input: {
        count: v.count, about: v.about ?? ctx.instruction, ...(v.layout ? { layout: v.layout } : {}),
        places: points.map((p) => ({ before: v.where === 'start' ? '' : titleAt(p), after: v.where === 'start' ? titleAt(ctx.virtual.slides[0]?.id ?? null) : nextOf(p) })),
        deck: { title: ctx.virtual.title, slides: ctx.state.slides.map((r) => `${r.n}. ${r.title || r.layout}`) },
        ...(problems?.length ? { problems } : {}),
      },
    })
    // new slides get their ids here, so a later task of the same message ("…and make them blue") can target them; slides added at the same place keep their order
    const ops: Step['ops'] = []
    const added: string[] = []
    let prevAnchor: string | null | undefined, prevId: string | undefined
    out.slides.slice(0, v.count).forEach((s, i) => {
      const id = ctx.newId()
      const anchor = points[i] ?? null
      const after = prevId !== undefined && anchor === prevAnchor ? prevId : anchor
      ops.push({ op: 'add_slide', id, afterSlideId: after, content: s.content as SlideContent, ...(v.where === 'start' && after === null ? { atStart: true } : {}) })
      added.push(id); prevAnchor = anchor; prevId = id
    })
    return { ops, added, written: ops.length }
  },
  check(_ctx, _ids, v, step) {
    const n = step.ops.filter((o) => o.op === 'add_slide').length
    return n === v.count ? [] : [`You returned ${n} slide${n === 1 ? '' : 's'}; exactly ${v.count} are needed.`]
  },
}
