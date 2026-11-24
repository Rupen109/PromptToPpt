import type { z } from 'zod'
import { commentPinOf, diffDocs, type SlideElement } from '@prompttoppt/validation'
import { describeElement } from '@prompttoppt/theme'
import { resolveElements } from '../resolve.ts'
import { VALUES } from '../understand.ts'
import { numberOf } from '../state.ts'
import type { Capability, RunCtx, Step } from './types.ts'

/** a comment thread as the assistant sees it */
export type ThreadInfo = { id: string; slideId: string; status: 'open' | 'resolved'; comments: { authorName: string; body: string }[] }
const slideNo = (ctx: RunCtx, id: string) => numberOf(ctx.state, id) || ctx.virtual.slides.findIndex((s) => s.id === id) + 1
const short = (t: string, n = 90) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)

/**
 * Comments from the chat (owner decision 2026-11-21: written in the person's name, with an AI label). Adding: the words are the PERSON's own (said in the message), pinned to the selected
 * object if there is one. Summaries and the open list: built by code from the real threads, never the model's words. Draft replies: suggestions shown in the chat, never posted. Resolving:
 * always asked first. Every write goes through the Comments panel's own code (limits, mentions, live updates).
 */
export const commentCap: Capability<z.infer<typeof VALUES.comment>> = {
  family: 'comment', values: VALUES.comment, scope: 'none', cost: 'free', // (no slide named: the whole deck for summaries, the current slide for a new comment)
  async run(ctx, ids, v): Promise<Step> {
    if (!ctx.comments) return { ops: [], refused: ['I cannot work with comments right now.'] }
    if (v.action === 'add') {
      const text = (v.text ?? '').trim()
      if (text.length < 2 || !ctx.instruction.toLowerCase().includes(text.toLowerCase())) return { ops: [], refused: ['I did not add a comment: its words must be yours, written in your message (for example: add a comment "check these numbers").'] }
      const sid = ids[0] ?? ctx.state.focus.current
      const slide = ctx.virtual.slides.find((s) => s.id === sid)
      if (!slide) return { ops: [], refused: ['Say which slide the comment is for.'] }
      // ON an object: the one named ("comment on the chart"), found the same way as every object request, else the selected one; else a comment on the slide.
      // The thread names the object, so its pin follows it (comment-pin.ts); the object must be saved already (the comment is checked against the saved deck).
      let el: SlideElement | undefined
      if (v.on) {
        const found = resolveElements(ctx.state, [slide.id], [v.on], ['comment'])
        if (!found.ok) return 'ask' in found ? { ops: [], ask: found.ask } : { ops: [], refused: [found.refuse] }
        if (found.items.length !== 1) return { ops: [], ask: { text: `${found.items.length} objects match on slide ${slideNo(ctx, slide.id)}. Select the one you mean, then ask again.`, options: [] } }
        el = found.items[0]!.element
      } else el = slide.elements.find((e) => ctx.selection.elementIds.includes(e.id))
      const pin = el ? { ...commentPinOf(el, ctx.virtual.aspectRatio), elementId: el.id } : {}
      const r = await ctx.comments.add(slide.id, pin, `${text} (added with AI)`)
      if (!r.ok) return { ops: [], refused: [r.why] }
      return { ops: [], outside: `Added your comment on ${el ? `${describeElement(el)} on ` : ''}slide ${slideNo(ctx, slide.id)}` }
    }
    const all = await ctx.comments.list()
    const inScope = ids.length && ids.length < ctx.virtual.slides.length ? all.filter((t) => ids.includes(t.slideId)) : all
    const open = inScope.filter((t) => t.status === 'open')
    const where = ids.length === 1 ? `slide ${slideNo(ctx, ids[0]!)}` : 'this presentation'
    if (v.action === 'summarise' || v.action === 'unresolved') {
      const list = v.action === 'unresolved' ? open : inScope
      if (!list.length) return { ops: [], answer: v.action === 'unresolved' ? `There are no open comments on ${where}.` : `There are no comments on ${where}.` }
      const lines = list.slice(0, 15).map((t) => `• Slide ${slideNo(ctx, t.slideId)}${t.status === 'resolved' ? ' (resolved)' : ''}: ${t.comments[0]?.authorName ?? 'someone'}: "${short(t.comments[0]?.body ?? '')}"${t.comments.length > 1 ? ` (+${t.comments.length - 1} ${t.comments.length === 2 ? 'reply' : 'replies'})` : ''}`)
      const head = v.action === 'unresolved' ? `${open.length} open comment${open.length === 1 ? '' : 's'} on ${where}:` : `${list.length} comment thread${list.length === 1 ? '' : 's'} on ${where}, ${open.length} open:`
      return { ops: [], answer: [head, ...lines, ...(list.length > 15 ? [`…and ${list.length - 15} more in the Comments panel.`] : [])].join('\n') }
    }
    if (v.action === 'draft_replies') {
      if (!open.length) return { ops: [], answer: `There are no open comments on ${where} to reply to.` }
      const take = open.slice(0, 5)
      const out = await ctx.write({ card: 'comment_replies', route: 'fast', rules: 'Draft ONE short, polite reply per comment thread, in the language of the thread. Reply to what was asked; never promise changes you cannot see were made; no new facts or figures. Return {"replies":[{"threadId":"...","text":"..."}]}.', schema: REPLIES, input: { threads: take.map((t) => ({ threadId: t.id, slide: slideNo(ctx, t.slideId), comments: t.comments.map((c) => ({ by: c.authorName, text: short(c.body, 400) })) })) } } as never) as z.infer<typeof REPLIES>
      const lines = take.map((t) => { const r = out.replies.find((x) => x.threadId === t.id); return r ? `• Slide ${slideNo(ctx, t.slideId)}, to ${t.comments[0]?.authorName ?? 'them'} ("${short(t.comments[0]?.body ?? '', 50)}"): ${short(r.text, 300)}` : null }).filter(Boolean)
      return { ops: [], answer: [`Suggested replies (NOT posted: copy the ones you like into the Comments panel):`, ...lines].join('\n'), written: 0 }
    }
    // resolve: always shown and confirmed first
    if (!open.length) return { ops: [], already: [`There are no open comments on ${where}.`] }
    if (ctx.confirm?.kind !== 'proceed') return { ops: [], ask: { text: `This marks ${open.length} open comment${open.length === 1 ? '' : 's'} on ${where} as resolved (they stay in the Comments panel and can be reopened). Go ahead?`, options: [{ label: 'Yes, resolve them', reply: 'Yes, resolve them', confirm: { kind: 'proceed', tasks: [{ family: 'comment', targets: ids.map((id) => ({ by: 'number', n: slideNo(ctx, id) })), values: v as Record<string, unknown> }] } }, { label: 'No, keep them open', reply: 'No, keep them open' }] } }
    const n = await ctx.comments.resolve(open.map((t) => t.id))
    return { ops: [], outside: `Resolved ${n} comment${n === 1 ? '' : 's'} on ${where}` }
  },
}

import { z as zod } from 'zod'
const REPLIES = zod.object({ replies: zod.array(zod.object({ threadId: zod.string().max(64), text: zod.string().min(1).max(600) })).max(5) })

/**
 * "What changed since the last version?": a summary computed by CODE from the saved versions (the deck now against the version before), never the model's words; nothing is changed.
 */
export const historyCap: Capability<z.infer<typeof VALUES.history>> = {
  family: 'history', values: VALUES.history, scope: 'deck', cost: 'free',
  async run(ctx): Promise<Step> {
    const prev = ctx.previousVersion ? await ctx.previousVersion() : null
    if (!prev) return { ops: [], answer: 'There is no earlier saved version of this presentation to compare with yet.' }
    const cur = ctx.state.doc
    const d = diffDocs(prev.doc, cur)
    const n = (id: string) => cur.slides.findIndex((s) => s.id === id) + 1
    const added = d.slides.filter((x) => x.add).map((x) => n(x.id)).filter((x) => x > 0)
    const removed = d.slides.filter((x) => x.remove).length
    const changed = d.slides.filter((x) => !x.add && !x.remove && (x.fields || x.elements || x.order)).map((x) => n(x.id)).filter((x) => x > 0)
    const parts = [
      added.length ? `added slide${added.length === 1 ? '' : 's'} ${added.join(', ')}` : '',
      removed ? `removed ${removed} slide${removed === 1 ? '' : 's'}` : '',
      changed.length ? `changed slide${changed.length === 1 ? '' : 's'} ${changed.slice(0, 15).join(', ')}` : '',
      d.order ? 'changed the order of the slides' : '',
      d.fields['theme'] ? 'changed the design (colours, fonts or style)' : '',
      d.fields['title'] ? `renamed the presentation to "${cur.title}"` : '',
    ].filter(Boolean)
    return { ops: [], answer: parts.length ? `Since the version saved ${prev.when}: ${parts.join('; ')}. Open History to see or restore it.` : `Nothing has changed since the version saved ${prev.when}.` }
  },
}
