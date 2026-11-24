import type { z } from 'zod'
import { lockedSlides } from './preflight.ts'
import { numberOf } from '../state.ts'
import { VALUES } from '../understand.ts'
import { removeProposal } from './restructure.ts'
import { sceneMoveNote } from './template-notes.ts'
import type { Capability, RunCtx, Step } from './types.ts'

/** Managing slides (delete, move, duplicate, lock) and the assistant's history (undo, rebuild, enrich): all done by code. */

/** deleting this many slides (or more) in one message is confirmed first */
export const DELETE_CONFIRM_AT = 3
const n = (ctx: RunCtx, id: string) => numberOf(ctx.state, id) || ctx.virtual.slides.findIndex((s) => s.id === id) + 1
const list = (ns: number[]) => (ns.length === 1 ? `slide ${ns[0]}` : `slides ${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`)

export const removeSlide: Capability<z.infer<typeof VALUES.remove_slide>> = {
  preflight: lockedSlides,
  family: 'remove_slide', values: VALUES.remove_slide, scope: 'slides', cost: 'action',
  async run(ctx, ids) {
    const notes: string[] = [], refused: string[] = []
    const ok = ids.filter((id) => { const s = ctx.virtual.slides.find((x) => x.id === id); if (s?.locked) refused.push(`Slide ${n(ctx, id)} is locked, so I kept it.`); return s && !s.locked })
    if (ok.length >= ctx.virtual.slides.length) return { ops: [], refused: ["I can't delete every slide — a presentation needs at least one."] }
    if (!ok.length) return { ops: [], refused }
    // deleting several slides at once is shown first and confirmed (one or two are done directly, as asked)
    if (ok.length >= DELETE_CONFIRM_AT) return { ...removeProposal(ctx, ok, `You asked me to delete ${ok.length} slides:`), refused }
    const sceneNote = sceneMoveNote(ctx.virtual, ok, 'delete')
    return { ops: [], refused, notes: [...notes, ...(sceneNote ? [sceneNote] : [])], slideOps: { removals: ok }, applied: [`Deleted ${list(ok.map((id) => n(ctx, id)))}`] }
  },
}

export const moveSlide: Capability<z.infer<typeof VALUES.move_slide>> = {
  family: 'move_slide', values: VALUES.move_slide, scope: 'slides', cost: 'action',
  async run(ctx, ids, v) {
    // exchanging the places of two slides: the first goes where the second was, the second where the first was (done as moves, in this order, so each one is checked on the saved deck)
    if (v.where === 'swap') {
      if (ids.length !== 2) return { ops: [], refused: [`Swapping needs exactly two slides, and ${ids.length === 0 ? 'none were' : `${ids.length} were`} named: say which two, for example "swap slides 3 and 5".`] }
      const order = ctx.virtual.slides.map((x) => x.id)
      const [a, b] = ids[0] && order.indexOf(ids[0]) < order.indexOf(ids[1]!) ? [ids[0]!, ids[1]!] : [ids[1]!, ids[0]!]
      const ia = order.indexOf(a), ib = order.indexOf(b)
      const moves = ib === ia + 1
        ? [{ slideId: b, afterSlideId: order[ia - 1] ?? null }]
        : [{ slideId: b, afterSlideId: order[ia - 1] ?? null }, { slideId: a, afterSlideId: order[ib - 1]! }]
      return { ops: [], slideOps: { moves }, applied: [`Swapped slides ${ia + 1} and ${ib + 1}`] }
    }
    let anchor: string | null
    if (v.where === 'start') anchor = null
    else if (v.where === 'end') anchor = [...ctx.virtual.slides].reverse().find((s) => !ids.includes(s.id))?.id ?? null
    else {
      const r = v.after ? ctx.resolveAnchor([v.after]) : { ok: false as const, refuse: 'Tell me after which slide it should go.' }
      if (!r.ok) return { ops: [], refused: ['refuse' in r ? r.refuse : r.ask.text] }
      anchor = r.ids.at(-1) ?? null
      if (anchor && ids.includes(anchor)) return { ops: [], refused: ['A slide cannot be moved after itself.'] }
    }
    // the moved slides keep their own order after the anchor
    const moves: { slideId: string; afterSlideId: string | null }[] = []
    let prev = anchor
    for (const id of ids) { moves.push({ slideId: id, afterSlideId: prev }); prev = id }
    const where = v.where === 'start' ? 'to the start' : v.where === 'end' ? 'to the end' : `after slide ${anchor ? n(ctx, anchor) : 1}`
    const sceneNote = sceneMoveNote(ctx.virtual, ids, 'move')
    return { ops: [], ...(sceneNote ? { notes: [sceneNote] } : {}), slideOps: { moves }, applied: [`Moved ${list(ids.map((id) => n(ctx, id)))} ${where}`] }
  },
}

export const duplicateSlide: Capability<z.infer<typeof VALUES.duplicate_slide>> = {
  family: 'duplicate_slide', values: VALUES.duplicate_slide, scope: 'slides', cost: 'action',
  async run(ctx, ids) {
    const duplicates = ids.slice(0, 10).map((id) => ({ slideId: id, newId: ctx.newId() }))
    return { ops: [], slideOps: { duplicates }, added: duplicates.map((d) => d.newId), applied: [`Duplicated ${list(ids.slice(0, 10).map((id) => n(ctx, id)))}`] }
  },
}

export const lockSlide: Capability<z.infer<typeof VALUES.lock_slide>> = {
  family: 'lock_slide', values: VALUES.lock_slide, scope: 'slides', cost: 'action',
  async run(ctx, ids, v) {
    const change = ids.filter((id) => !!ctx.virtual.slides.find((s) => s.id === id)?.locked !== v.locked)
    if (!change.length) return { ops: [], already: [v.locked ? 'Those slides are already locked.' : 'Those slides are not locked.'] }
    return { ops: [], slideOps: { locks: change.map((id) => ({ slideId: id, locked: v.locked })) }, applied: [`${v.locked ? 'Locked' : 'Unlocked'} ${list(change.map((id) => n(ctx, id)))}${v.locked ? ' (the AI will not change it)' : ''}`] }
  },
}

export const undo: Capability<z.infer<typeof VALUES.undo>> = {
  family: 'undo', values: VALUES.undo, scope: 'none', cost: 'free',
  async run(ctx, ids, v): Promise<Step> {
    if (!ctx.state.recent.length) return { ops: [], refused: ["There is no earlier change of mine to put back. Describe what you want instead (for example \"make the theme dark\"), or press Cmd+Z."] }
    return { ops: [{ op: 'revert', change: Math.min(v.change, ctx.state.recent.length - 1), part: v.part, ...(v.part === 'slide' && ids[0] ? { slideId: ids[0] } : {}) }] }
  },
}

export const rewriteDeck: Capability<z.infer<typeof VALUES.rewrite_deck>> = {
  family: 'rewrite_deck', values: VALUES.rewrite_deck, scope: 'none', cost: 'action', deckWide: true,
  async run(ctx, _ids, v) {
    // rebuilding EVERY slide is shown first and confirmed; the confirmed brief comes from the request, never from the model's answer
    if (ctx.confirm?.kind === 'rewrite') return { ops: [{ op: 'rewrite_deck', brief: ctx.confirm.brief }] }
    const n = ctx.virtual.slides.length
    return { ops: [], ask: { text: `This rebuilds all ${n} slide${n === 1 ? '' : 's'} from this brief: "${v.brief.slice(0, 300)}${v.brief.length > 300 ? '…' : ''}". Your current words are replaced; the version you have now stays in the version history, so you can go back to it. Rebuild the whole deck?`, options: [{ label: 'Yes, rebuild it', reply: 'Yes, rebuild the whole deck', confirm: { kind: 'rewrite', brief: v.brief } }, { label: 'No, keep my deck', reply: 'No, keep my deck as it is' }] } }
  },
}

export const enrich: Capability<z.infer<typeof VALUES.enrich>> = {
  family: 'enrich', values: VALUES.enrich, scope: 'none', cost: 'action',
  async run(ctx) {
    if (!ctx.state.hasSources) return { ops: [], refused: ['There is no attached document to take content from — attach a PDF or link with the 📎 button, then ask again.'] }
    return { ops: [{ op: 'enrich_deck' }] }
  },
}
