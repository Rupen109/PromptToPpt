import type { Presentation, Slide, SlideElement } from '@prompttoppt/validation'

/**
 * Id-addressed differences between two versions of a deck. Undo history and live merging are built on this instead of index-based patches:
 * "slides[3].elements[2].x" means something different the moment a collaborator inserts a slide, but "element e_7 on slide s_2" does not.
 *
 *  · diffDocs(a, b)          what changed to get from a to b (cheap: unchanged slides/elements are skipped by reference)
 *  · applyDiff(doc, d, dir)  replay it forward (a→b) or backward (b→a) onto ANY other version of the deck
 *      guard = true  (undo/redo)  an item is applied only if the document still holds what the entry expects — if a collaborator changed that
 *                                 element meanwhile, undo leaves their work alone instead of clobbering it
 *      guard = false (merging)    the replayed change wins
 *  · mergeDocs(base, mine, theirs)  three-way merge: their version + everything I changed since `base`
 */
type Pair<T> = [T, T]
export interface SlideDiff {
  id: string
  add?: Slide
  remove?: Slide
  fields?: Record<string, Pair<unknown>>
  elements?: Record<string, Pair<SlideElement | null>>
  order?: Pair<string[]>
}
export interface DocDiff {
  fields: Record<string, Pair<unknown>>
  slides: SlideDiff[]
  order?: Pair<string[]>
}
type Dir = 'forward' | 'backward'

export const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b)
const ids = (xs: { id: string }[]) => xs.map((x) => x.id)
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

export function diffDocs(a: Presentation, b: Presentation): DocDiff {
  const diff: DocDiff = { fields: {}, slides: [] }
  const rec = (o: object) => o as Record<string, unknown>
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === 'slides') continue
    if (!same(rec(a)[k], rec(b)[k])) diff.fields[k] = [rec(a)[k], rec(b)[k]]
  }
  const am = new Map(a.slides.map((s) => [s.id, s]))
  const bm = new Map(b.slides.map((s) => [s.id, s]))
  for (const id of new Set([...am.keys(), ...bm.keys()])) {
    const sa = am.get(id), sb = bm.get(id)
    if (!sa && sb) { diff.slides.push({ id, add: sb }); continue }
    if (sa && !sb) { diff.slides.push({ id, remove: sa }); continue }
    if (!sa || !sb || sa === sb) continue
    const sd: SlideDiff = { id }
    for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
      if (k === 'elements' || k === 'id') continue
      if (!same(rec(sa)[k], rec(sb)[k])) (sd.fields ??= {})[k] = [rec(sa)[k], rec(sb)[k]]
    }
    if (sa.elements !== sb.elements) {
      const ea = new Map(sa.elements.map((e) => [e.id, e])), eb = new Map(sb.elements.map((e) => [e.id, e]))
      for (const eid of new Set([...ea.keys(), ...eb.keys()])) {
        const x = ea.get(eid) ?? null, y = eb.get(eid) ?? null
        if (x !== y && !same(x, y)) (sd.elements ??= {})[eid] = [x, y]
      }
      const oa = ids(sa.elements), ob = ids(sb.elements)
      if (!sameList(oa, ob)) sd.order = [oa, ob]
    }
    if (sd.fields || sd.elements || sd.order) diff.slides.push(sd)
  }
  const oa = ids(a.slides), ob = ids(b.slides)
  if (!sameList(oa, ob)) diff.order = [oa, ob]
  return diff
}

/**
 * Re-orders `cur` towards `target` without disturbing ids the target does not know about (e.g. a slide a collaborator just added):
 * the slots held by shared ids are refilled in target order, ids missing from `cur` are inserted after their predecessor in `target`.
 */
export function reorder(cur: string[], target: string[], removed: Set<string>): string[] {
  const out = cur.filter((id) => !removed.has(id))
  const inTarget = new Set(target)
  const slots: number[] = []
  out.forEach((id, i) => { if (inTarget.has(id)) slots.push(i) })
  const present = new Set(out)
  const existing = target.filter((id) => present.has(id))
  slots.forEach((slot, k) => { out[slot] = existing[k]! })
  for (let k = 0; k < target.length; k++) {
    const id = target[k]!
    if (out.includes(id) || removed.has(id)) continue
    const prev = k > 0 ? target[k - 1]! : null
    const at = prev === null ? 0 : out.indexOf(prev) + 1
    out.splice(at, 0, id)
  }
  return out
}

const pick = <T,>(p: Pair<T>, dir: Dir) => ({ expect: dir === 'forward' ? p[0] : p[1], next: dir === 'forward' ? p[1] : p[0] })

function applySlide(s: Slide, sd: SlideDiff, dir: Dir, guard: boolean): Slide {
  let out: Slide = s
  if (sd.fields) {
    const copy: Record<string, unknown> = { ...(s as unknown as Record<string, unknown>) }
    for (const [k, p] of Object.entries(sd.fields)) {
      const { expect, next } = pick(p, dir)
      if (guard && !same(copy[k], expect)) continue
      if (next === undefined) delete copy[k]
      else copy[k] = next
    }
    out = copy as unknown as Slide
  }
  if (sd.elements || sd.order) {
    let els = [...out.elements]
    const removed = new Set<string>()
    for (const [eid, p] of Object.entries(sd.elements ?? {})) {
      const { expect, next } = pick(p, dir)
      const at = els.findIndex((e) => e.id === eid)
      if (next === null) {
        if (at >= 0 && (!guard || same(els[at], expect))) { els.splice(at, 1); removed.add(eid) }
      } else if (at >= 0) {
        if (!guard || same(els[at], expect)) els[at] = next
      } else if (expect === null) els.push(next) // an element this change created
      // else: someone deleted it meanwhile — never resurrect it behind their back
    }
    if (sd.order) {
      const target = dir === 'forward' ? sd.order[1] : sd.order[0]
      const byId = new Map(els.map((e) => [e.id, e]))
      els = reorder(ids(els), target, removed).map((id) => byId.get(id)!).filter(Boolean)
    }
    out = { ...out, elements: els }
  }
  return out
}

export function applyDiff(doc: Presentation, diff: DocDiff, dir: Dir, guard: boolean): Presentation {
  const rec = { ...(doc as unknown as Record<string, unknown>) }
  for (const [k, p] of Object.entries(diff.fields)) {
    const { expect, next } = pick(p, dir)
    if (guard && !same(rec[k], expect)) continue
    if (next === undefined) delete rec[k]
    else rec[k] = next
  }
  const byDiff = new Map(diff.slides.map((d) => [d.id, d]))
  const added = new Map<string, Slide>()
  const removed = new Set<string>()
  for (const sd of diff.slides) {
    if (sd.add) { if (dir === 'forward') added.set(sd.id, sd.add); else removed.add(sd.id) }
    if (sd.remove) { if (dir === 'forward') removed.add(sd.id); else added.set(sd.id, sd.remove) }
  }
  let slides = doc.slides.map((s) => { const sd = byDiff.get(s.id); return sd && !sd.add && !sd.remove ? applySlide(s, sd, dir, guard) : s }).filter((s) => !removed.has(s.id))
  for (const [id, s] of added) if (!slides.some((x) => x.id === id)) slides.push(s)
  if (diff.order) {
    const target = dir === 'forward' ? diff.order[1] : diff.order[0]
    const byId = new Map(slides.map((s) => [s.id, s]))
    slides = reorder(ids(slides), target, removed).map((id) => byId.get(id)!).filter(Boolean)
  }
  return { ...(rec as unknown as Presentation), slides }
}

/** Their version + my changes since `base`. A change of mine to something they also changed wins; something they deleted stays deleted. */
export function mergeDocs(base: Presentation, mine: Presentation, theirs: Presentation): Presentation {
  if (mine === base || same(mine, base)) return theirs
  return applyDiff(theirs, diffDocs(base, mine), 'forward', false)
}
