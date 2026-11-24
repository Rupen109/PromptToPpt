import type { Presentation, Restructure, Slide } from '@prompttoppt/validation'
import { reviewFindings } from './review'

/**
 * Deck-level restructuring that needs the person's confirmation first: delete slides, put the slides in a new order. This file is pure and holds every RULE: which slides are empty or duplicates
 * (found by code), whether a proposed list or order is valid for THIS deck, and what a confirmed plan turns into (deletions, moves). The model only ever proposes numbers; nothing here trusts them.
 */

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const textOf = (s: Slide) => s.elements.filter((e) => e.type === 'text' && !e.hidden && !e.decorative).map((e) => (e.type === 'text' ? e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' ') : '')).join(' ')

/** Slides with nothing on them (the review's "nothing on the slide" finding). Locked slides are never proposed. */
export function emptySlideIds(doc: Presentation): string[] {
  const empty = new Set((reviewFindings(doc).find((f) => f.id === 'empty')?.slides ?? []).map((s) => s.n))
  return doc.slides.filter((s, i) => empty.has(i + 1) && !s.locked).map((s) => s.id)
}

/** The later copies of a slide that says exactly the same (same words in the same order, ignoring case and punctuation) as an earlier one: the first one is kept. Slides with no words are not duplicates of each other. */
export function duplicateSlideIds(doc: Presentation): string[] {
  const seen = new Set<string>(), out: string[] = []
  for (const s of doc.slides) {
    const key = norm(textOf(s))
    if (!key) continue
    if (seen.has(key)) { if (!s.locked) out.push(s.id) } else seen.add(key)
  }
  return out
}

export type PlanResult = { ok: true; removals: string[]; moves: { slideId: string; afterSlideId: string | null }[]; additions: { afterSlideId: string; title: string }[]; notes: string[] } | { ok: false; why: string }
const STALE = 'The deck has changed since I suggested this, so I did not apply it. Ask me again and I will make a fresh suggestion.'

/**
 * What a confirmed plan turns into, or why it cannot be applied. Everything is checked against the deck AS IT IS NOW: a slide that is gone, a locked slide, a list that would empty the deck, an
 * order that is not exactly this deck's slides, or one that would move a locked slide, is refused or skipped with the reason.
 */
export function planRestructure(doc: Presentation, r: Restructure): PlanResult {
  if (r.kind !== 'remove' && r.kind !== 'reorder' && r.kind !== 'sections') return { ok: false, why: 'That is not a slide plan.' }
  const byId = new Map(doc.slides.map((s, i) => [s.id, { s, n: i + 1 }]))
  if (r.kind === 'sections') {
    // section dividers: each goes right before a slide of THIS deck (never before the first one), titles are real and different
    const items = r.items.map((x) => ({ title: x.title.trim().slice(0, 60), at: byId.get(x.beforeSlideId)?.n ?? 0 }))
    if (items.some((x) => !x.at)) return { ok: false, why: STALE }
    if (items.some((x) => x.at === 1)) return { ok: false, why: 'A section divider cannot go before the first slide: it stays the first slide.' }
    if (items.some((x) => !x.title)) return { ok: false, why: 'A section needs a title.' }
    if (new Set(items.map((x) => x.at)).size !== items.length) return { ok: false, why: 'Two sections cannot start at the same slide.' }
    if (new Set(items.map((x) => x.title.toLowerCase())).size !== items.length) return { ok: false, why: 'The sections need different titles.' }
    return { ok: true, removals: [], moves: [], additions: [...items].sort((a, b) => a.at - b.at).map((x) => ({ afterSlideId: doc.slides[x.at - 2]!.id, title: x.title })), notes: [] }
  }
  if (r.kind === 'remove') {
    const notes: string[] = []
    const ids = [...new Set(r.slideIds)]
    const gone = ids.filter((id) => !byId.has(id))
    if (gone.length === ids.length) return { ok: false, why: STALE }
    if (gone.length) notes.push(`${gone.length} of the slides I suggested are no longer in the deck, so I skipped them.`)
    const present = ids.filter((id) => byId.has(id))
    const locked = present.filter((id) => byId.get(id)!.s.locked)
    for (const id of locked) notes.push(`Slide ${byId.get(id)!.n} is locked, so I kept it.`)
    const removals = present.filter((id) => !byId.get(id)!.s.locked)
    if (!removals.length) return { ok: false, why: notes.join(' ') || STALE }
    if (removals.length >= doc.slides.length) return { ok: false, why: 'That would delete every slide, and a presentation needs at least one.' }
    return { ok: true, removals, moves: [], additions: [], notes }
  }
  const same = r.order.length === doc.slides.length && new Set(r.order).size === r.order.length && r.order.every((id) => byId.has(id))
  if (!same) return { ok: false, why: STALE }
  const lockedMoved = doc.slides.flatMap((s, i) => (s.locked && r.order[i] !== s.id ? [i + 1] : []))
  if (lockedMoved.length) return { ok: false, why: `Slide ${lockedMoved.join(', ')} ${lockedMoved.length === 1 ? 'is' : 'are'} locked and would move, so I did not reorder anything. Unlock ${lockedMoved.length === 1 ? 'it' : 'them'} and ask again.` }
  if (r.order.every((id, i) => doc.slides[i]!.id === id)) return { ok: true, removals: [], moves: [], additions: [], notes: ['The slides are already in that order.'] }
  // every slide is placed right after the one before it (the first at the start): applied in this order they give exactly this order, and each one is checked in the saved deck
  return { ok: true, removals: [], moves: r.order.map((id, i) => ({ slideId: id, afterSlideId: i === 0 ? null : r.order[i - 1]! })), additions: [], notes: [] }
}

/** A proposal from the model, as slide NUMBERS: valid only if it is exactly what the rules allow. `target` = the number of slides the deck must end with. */
export function checkReduce(doc: Presentation, remove: number[], target: number): { ok: true; slideIds: string[] } | { ok: false; why: string } {
  const n = doc.slides.length
  const nums = [...new Set(remove)]
  if (nums.length !== remove.length) return { ok: false, why: 'a slide was listed twice' }
  if (nums.some((x) => !Number.isInteger(x) || x < 1 || x > n)) return { ok: false, why: 'a slide number is not in the deck' }
  if (nums.includes(1)) return { ok: false, why: 'the first slide must stay' }
  if (nums.some((x) => doc.slides[x - 1]!.locked)) return { ok: false, why: 'a locked slide cannot be removed' }
  if (n - nums.length !== target) return { ok: false, why: `that leaves ${n - nums.length} slides, not ${target}` }
  return { ok: true, slideIds: nums.sort((a, b) => a - b).map((x) => doc.slides[x - 1]!.id) }
}

/** A proposed order, as slide NUMBERS: every slide exactly once, locked slides where they are, and different from the current order. */
export function checkOrder(doc: Presentation, order: number[]): { ok: true; order: string[] } | { ok: false; why: string } {
  const n = doc.slides.length
  if (order.length !== n || new Set(order).size !== n || order.some((x) => !Number.isInteger(x) || x < 1 || x > n)) return { ok: false, why: `the order must list each of the ${n} slides exactly once` }
  const lockedMoved = doc.slides.some((s, i) => s.locked && order[i] !== i + 1)
  if (lockedMoved) return { ok: false, why: 'a locked slide would move' }
  if (order.every((x, i) => x === i + 1)) return { ok: false, why: 'it is the order the deck already has' }
  return { ok: true, order: order.map((x) => doc.slides[x - 1]!.id) }
}


/** Section titles and where each starts, as slide NUMBERS (from the model): 2 to 6 sections, in order, each starting at a different slide after the first, with short different titles. */
export function checkSections(doc: Presentation, sections: { title: string; startsAtSlide: number }[]): { ok: true; items: { title: string; beforeSlideId: string }[] } | { ok: false; why: string } {
  const n = doc.slides.length
  if (n < 4) return { ok: false, why: 'the deck is too short for sections' }
  if (sections.length < 2 || sections.length > 6) return { ok: false, why: 'it needs 2 to 6 sections' }
  const starts = sections.map((x) => x.startsAtSlide)
  if (starts.some((x) => !Number.isInteger(x) || x < 2 || x > n)) return { ok: false, why: 'every section must start at a slide from 2 to ' + n }
  if (starts.some((x, i) => i > 0 && x <= starts[i - 1]!)) return { ok: false, why: 'the sections must start at later and later slides' }
  const titles = sections.map((x) => x.title.trim())
  if (titles.some((t) => !t || t.length > 40)) return { ok: false, why: 'every section needs a short title (40 characters at most)' }
  if (new Set(titles.map((t) => t.toLowerCase())).size !== titles.length) return { ok: false, why: 'the section titles must be different' }
  return { ok: true, items: sections.map((x) => ({ title: x.title.trim(), beforeSlideId: doc.slides[x.startsAtSlide - 1]!.id })) }
}
