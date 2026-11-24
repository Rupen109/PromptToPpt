import { numberOf } from '../state.ts'
import type { Preflight, RunCtx } from './types.ts'

/**
 * The shared PREFLIGHT of slide-level capabilities that leave locked slides alone (background, picture, transition, delete): the locked slides among the targets are blocked,
 * the rest are doable. Worked out from the deck only: nothing runs, nothing is written or charged.
 */
export function lockedSlides(ctx: RunCtx, ids: string[]): Preflight {
  const blocked = ids.filter((id) => ctx.virtual.slides.find((s) => s.id === id)?.locked).map((slideId) => ({ slideId, why: 'it is locked' }))
  return { blocked, doable: ids.length - blocked.length }
}

/** "slide 9 (locked) and slide 10 (locked)": the blocked parts in the person's words, grouped by reason */
export function blockedText(ctx: Pick<RunCtx, 'state' | 'virtual'>, blocked: Preflight['blocked']): string {
  const byWhy = new Map<string, number[]>()
  for (const b of blocked) {
    const n = numberOf(ctx.state, b.slideId) || ctx.virtual.slides.findIndex((s) => s.id === b.slideId) + 1
    byWhy.set(b.why, [...new Set([...(byWhy.get(b.why) ?? []), n])])
  }
  const list = (ns: number[]) => (ns.length === 1 ? `slide ${ns[0]}` : `slides ${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`)
  return [...byWhy].map(([why, ns]) => `${list(ns.sort((a, b) => a - b))} (${why.replace(/^it is /, '').replace(/^it was /, '')})`).join('; ')
}
