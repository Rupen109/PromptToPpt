import type { z } from 'zod'
import { checkOrder, checkReduce, checkSections, duplicateSlideIds, emptySlideIds, planRestructure } from '@prompttoppt/theme'
import type { Restructure } from '@prompttoppt/validation'
import { numberOf } from '../state.ts'
import { VALUES } from '../understand.ts'
import type { Question } from '../resolve.ts'
import type { Capability, RunCtx, Step } from './types.ts'
import { z as zod } from 'zod'

/**
 * Tidying the deck as a whole: delete empty or duplicate slides, bring it down to N slides, put the slides in a better order. These are judgements about the whole deck, so NOTHING happens on the first
 * message: the assistant shows exactly what it would do and the person confirms. The confirmation comes back as a payload that is checked against the deck again (`planRestructure`) and runs through the same
 * verified deletions and moves as any other change. The model only ever proposes slide NUMBERS (empty and duplicate slides are found by code, with no model at all), and every proposal is checked by code first.
 */
const label = (ctx: RunCtx, id: string) => { const r = ctx.state.slides.find((s) => s.id === id); return `Slide ${r?.n ?? numberOf(ctx.state, id)}${r?.title ? ` — ${r.title.slice(0, 48)}` : ''}` }
const listOf = (ns: number[]) => (ns.length === 1 ? `slide ${ns[0]}` : `slides ${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`)
const NO: Question['options'][number] = { label: 'No, leave the deck as it is', reply: 'No, leave the deck as it is' }

const textOf = (s: RunCtx['virtual']['slides'][number]) => s.elements.filter((e) => e.type === 'text' && !e.hidden && !e.decorative).map((e) => (e.type === 'text' ? e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' ') : '')).join(' ').replace(/\s+/g, ' ').trim()
const digest = (ctx: RunCtx) => ctx.virtual.slides.map((s, i) => ({ n: i + 1, title: ctx.state.slides[i]?.title ?? '', layout: s.layoutId, locked: !!s.locked, text: textOf(s).slice(0, 200) }))

export const removeProposal = (ctx: RunCtx, ids: string[], intro: string): Step => {
  const confirm: Restructure = { kind: 'remove', slideIds: ids }
  return { ops: [], ask: { text: `${intro}\n${ids.map((id) => `• ${label(ctx, id)}`).join('\n')}\nEverything else stays exactly as it is and nothing is rewritten. Delete ${ids.length === 1 ? 'this slide' : 'these slides'}?`, options: [{ label: ids.length === 1 ? 'Yes, delete it' : 'Yes, delete them', reply: ids.length === 1 ? 'Yes, delete that slide' : 'Yes, delete those slides', confirm }, NO] } }
}

/** One model call that chooses numbers, then code checks them; a wrong answer gets ONE more try with the exact reason, then the person is told. */
async function propose<T>(ctx: RunCtx, card: string, rules: string, input: Record<string, unknown>, schema: zod.ZodType<T>, check: (v: T) => { ok: true } | { ok: false; why: string }): Promise<{ ok: true; value: T } | { ok: false; why: string }> {
  let why = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    let v: T
    try { v = await ctx.write({ card, rules, input: attempt ? { ...input, yourLastAnswerWasWrongBecause: why } : input, schema, route: 'fast' }) } catch { return { ok: false, why: 'the model could not produce a plan' } }
    const c = check(v)
    if (c.ok) return { ok: true, value: v }
    why = c.why
  }
  return { ok: false, why }
}

async function propose_(ctx: RunCtx, v: z.infer<typeof VALUES.restructure>): Promise<Step> {
  const n = ctx.virtual.slides.length
  if (v.action === 'empty' || v.action === 'duplicates') {
    const ids = v.action === 'empty' ? emptySlideIds(ctx.virtual) : duplicateSlideIds(ctx.virtual)
    if (!ids.length) return { ops: [], already: [v.action === 'empty' ? 'No slide is empty (locked slides are never proposed), so there is nothing to delete.' : 'No slide repeats another one word for word, so there is nothing to delete.'] }
    return removeProposal(ctx, ids, v.action === 'empty' ? `These ${ids.length === 1 ? 'slide has' : 'slides have'} nothing on ${ids.length === 1 ? 'it' : 'them'}:` : `These ${ids.length === 1 ? 'slide says' : 'slides say'} exactly the same as an earlier slide (the first of each stays):`)
  }
  if (v.action === 'reduce') {
    const target = v.target
    if (!target || target >= n) return { ops: [], refused: [target && target >= n ? `The deck has ${n} slide${n === 1 ? '' : 's'} already, so it cannot be brought up to ${target} by deleting.` : 'Tell me how many slides you want, for example "reduce it to 10 slides".'] }
    const need = n - target
    const lockedCount = ctx.virtual.slides.filter((s) => s.locked).length
    if (n - lockedCount < need) return { ops: [], refused: [`${lockedCount} locked slides cannot be deleted, so the deck cannot get down to ${target}. Unlock some and ask again.`] }
    const got = await propose(ctx, 'restructure_reduce', `Choose ${need} slides to DELETE so the deck ends with exactly ${target} slides. Delete the ones that matter least to the deck's story: repeats, filler, weak or off-topic slides. NEVER delete slide 1 and never a slide marked locked. Do not rewrite anything. Answer {"remove":[slide numbers]}: exactly ${need} different numbers.`, { request: ctx.instruction, slides: digest(ctx), target, deleteCount: need }, zod.object({ remove: zod.array(zod.number()).max(60) }), (x) => { const c = checkReduce(ctx.virtual, x.remove, target); return c.ok ? { ok: true } : c })
    if (!got.ok) return { ops: [], refused: [`I could not make a sensible plan to get down to ${target} slides (${got.why}), so nothing was changed.`] }
    const ids = checkReduce(ctx.virtual, got.value.remove, target) as { ok: true; slideIds: string[] }
    return removeProposal(ctx, ids.slideIds, `To bring the deck from ${n} to ${target} slides I would delete ${need === 1 ? 'this slide' : `these ${need} slides`}. It is my judgement of what matters least, so please look:`)
  }
  if (v.action === 'sections') {
    if (n < 4) return { ops: [], refused: ['The deck is too short for sections: it needs at least 4 slides.'] }
    const got = await propose(ctx, 'restructure_sections', `Group the slides into 2 to 6 SECTIONS that follow the deck's story. For each section give a short title (at most 5 words) and the number of the slide it STARTS at. Slide 1 is the title slide, so the first section starts at slide 2 or later; the starting slides get later and later; no two sections start at the same slide. Do not rewrite anything. Answer {"sections":[{"title":"...","startsAtSlide":N}, ...]}.`, { request: ctx.instruction, slides: digest(ctx) }, zod.object({ sections: zod.array(zod.object({ title: zod.string().max(80), startsAtSlide: zod.number() })).max(8) }), (x) => { const c = checkSections(ctx.virtual, x.sections); return c.ok ? { ok: true } : c })
    if (!got.ok) return { ops: [], refused: [`I could not find sections that I am sure about (${got.why}), so nothing was changed.`] }
    const items = (checkSections(ctx.virtual, got.value.sections) as { ok: true; items: { title: string; beforeSlideId: string }[] }).items
    const confirm: Restructure = { kind: 'sections', items }
    return { ops: [], ask: { text: `I would add ${items.length} section divider slides, each right before the slide shown:\n${items.map((x) => `• before ${label(ctx, x.beforeSlideId).toLowerCase().replace(/^slide/, 'slide')} — new section "${x.title}"`).join('\n')}\nYour slides stay exactly as they are; only the divider slides are new. It is my judgement of how the story splits, so please look. Add these dividers?`, options: [{ label: 'Yes, add the dividers', reply: 'Yes, add the section dividers', confirm }, NO] } }
  }
  // reorder
  if (n < 3) return { ops: [], refused: ['The deck is too short to need a new order.'] }
  const got = await propose(ctx, 'restructure_reorder', `Put the slides in the best order for presenting this deck${v.brief ? ` (the person wants: ${v.brief.slice(0, 200)})` : ''}. Keep slide 1 first unless it clearly is not an opening, keep slides marked locked at their own number, do not rewrite anything. Answer {"order":[slide numbers]}: every slide number from 1 to ${n} exactly once, in the new order.`, { request: ctx.instruction, slides: digest(ctx) }, zod.object({ order: zod.array(zod.number()).max(60) }), (x) => { const c = checkOrder(ctx.virtual, x.order); return c.ok ? { ok: true } : c })
  if (!got.ok) return { ops: [], refused: [`I could not find a better order that I am sure about (${got.why}), so nothing was changed.`] }
  const order = (checkOrder(ctx.virtual, got.value.order) as { ok: true; order: string[] }).order
  const moved = order.map((id, i) => ({ id, from: ctx.virtual.slides.findIndex((s) => s.id === id) + 1, to: i + 1 })).filter((x) => x.from !== x.to)
  const confirm: Restructure = { kind: 'reorder', order }
  return { ops: [], ask: { text: `Here is the order I suggest (only the slides that move are listed):\n${moved.map((m) => `• ${label(ctx, m.id)} → position ${m.to}`).join('\n')}\nThe slides themselves stay exactly as they are. It is my judgement of the best flow, so please look. Apply this order?`, options: [{ label: 'Yes, use this order', reply: 'Yes, use this order', confirm }, NO] } }
}

export const restructure: Capability<z.infer<typeof VALUES.restructure>> = {
  family: 'restructure', values: VALUES.restructure, scope: 'none', cost: 'action', deckWide: true,
  async run(ctx, _ids, v): Promise<Step> {
    // the person has confirmed a plan: it is checked against the deck as it is NOW (the model is not involved, and a model cannot produce a confirmation: it comes only from the request)
    if (ctx.confirm) {
      const plan = planRestructure(ctx.virtual, ctx.confirm)
      if (!plan.ok) return { ops: [], refused: [plan.why] }
      if (plan.removals.length) return { ops: [], notes: plan.notes, slideOps: { removals: plan.removals }, applied: [`Deleted ${listOf(plan.removals.map((id) => numberOf(ctx.state, id)).sort((a, b) => a - b))}`] }
      if (plan.additions.length) {
        const added: string[] = []
        const ops: Step['ops'] = plan.additions.map((a) => { const id = ctx.newId(); added.push(id); return { op: 'add_slide' as const, afterSlideId: a.afterSlideId, content: { layout: 'section-divider', title: a.title, speakerNotes: '', sources: [] } as never, id } })
        return { ops, added, notes: plan.notes, applied: [`Added ${plan.additions.length} section divider${plan.additions.length === 1 ? '' : 's'}`] }
      }
      if (plan.moves.length) return { ops: [], notes: plan.notes, slideOps: { moves: plan.moves }, applied: ['Put the slides in the new order'] }
      return { ops: [], notes: plan.notes }
    }
    return propose_(ctx, v)
  },
}
