import type { z } from 'zod'
import { numberOf } from '../state.ts'
import { VALUES } from '../understand.ts'
import type { Capability, RunCtx, Step } from './types.ts'

/** Managing slides (delete, move, duplicate, lock) and the assistant's history (undo, rebuild, enrich): all done by code. */

const n = (ctx: RunCtx, id: string) => numberOf(ctx.state, id) || ctx.virtual.slides.findIndex((s) => s.id === id) + 1
const list = (ns: number[]) => (ns.length === 1 ? `slide ${ns[0]}` : `slides ${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`)

export const removeSlide: Capability<z.infer<typeof VALUES.remove_slide>> = {
  family: 'remove_slide', values: VALUES.remove_slide, scope: 'slides', cost: 'action',
  async run(ctx, ids) {
    const notes: string[] = []
    const ok = ids.filter((id) => { const s = ctx.virtual.slides.find((x) => x.id === id); if (s?.locked) notes.push(`Slide ${n(ctx, id)} is locked, so I kept it.`); return s && !s.locked })
    if (ok.length >= ctx.virtual.slides.length) return { ops: [], notes: ["I can't delete every slide — a presentation needs at least one."] }
    if (!ok.length) return { ops: [], notes }
    return { ops: [], notes, slideOps: { removals: ok }, applied: [`Deleted ${list(ok.map((id) => n(ctx, id)))}`] }
  },
}

export const moveSlide: Capability<z.infer<typeof VALUES.move_slide>> = {
  family: 'move_slide', values: VALUES.move_slide, scope: 'slides', cost: 'action',
  async run(ctx, ids, v) {
    let anchor: string | null
    if (v.where === 'start') anchor = null
    else if (v.where === 'end') anchor = [...ctx.virtual.slides].reverse().find((s) => !ids.includes(s.id))?.id ?? null
    else {
      const r = v.after ? ctx.resolveAnchor([v.after]) : { ok: false as const, refuse: 'Tell me after which slide it should go.' }
      if (!r.ok) return { ops: [], notes: ['refuse' in r ? r.refuse : r.ask.text] }
      anchor = r.ids.at(-1) ?? null
      if (anchor && ids.includes(anchor)) return { ops: [], notes: ['A slide cannot be moved after itself.'] }
    }
    // the moved slides keep their own order after the anchor
    const moves: { slideId: string; afterSlideId: string | null }[] = []
    let prev = anchor
    for (const id of ids) { moves.push({ slideId: id, afterSlideId: prev }); prev = id }
    const where = v.where === 'start' ? 'to the start' : v.where === 'end' ? 'to the end' : `after slide ${anchor ? n(ctx, anchor) : 1}`
    return { ops: [], slideOps: { moves }, applied: [`Moved ${list(ids.map((id) => n(ctx, id)))} ${where}`] }
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
    if (!change.length) return { ops: [], notes: [v.locked ? 'Those slides are already locked.' : 'Those slides are not locked.'] }
    return { ops: [], slideOps: { locks: change.map((id) => ({ slideId: id, locked: v.locked })) }, applied: [`${v.locked ? 'Locked' : 'Unlocked'} ${list(change.map((id) => n(ctx, id)))}${v.locked ? ' (the AI will not change it)' : ''}`] }
  },
}

export const undo: Capability<z.infer<typeof VALUES.undo>> = {
  family: 'undo', values: VALUES.undo, scope: 'none', cost: 'free',
  async run(ctx, ids, v): Promise<Step> {
    if (!ctx.state.recent.length) return { ops: [], notes: ["There is no earlier change of mine to put back. Describe what you want instead (for example \"make the theme dark\"), or press Cmd+Z."] }
    return { ops: [{ op: 'revert', change: Math.min(v.change, ctx.state.recent.length - 1), part: v.part, ...(v.part === 'slide' && ids[0] ? { slideId: ids[0] } : {}) }] }
  },
}

export const rewriteDeck: Capability<z.infer<typeof VALUES.rewrite_deck>> = {
  family: 'rewrite_deck', values: VALUES.rewrite_deck, scope: 'none', cost: 'action', deckWide: true,
  async run(_ctx, _ids, v) { return { ops: [{ op: 'rewrite_deck', brief: v.brief }] } },
}

export const enrich: Capability<z.infer<typeof VALUES.enrich>> = {
  family: 'enrich', values: VALUES.enrich, scope: 'none', cost: 'action',
  async run(ctx) {
    if (!ctx.state.hasSources) return { ops: [], notes: ['There is no attached document to take content from — attach a PDF or link with the 📎 button, then ask again.'] }
    return { ops: [{ op: 'enrich_deck' }] }
  },
}
