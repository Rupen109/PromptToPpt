import type { Ref } from './understand.ts'
import type { DeckState, SlideRow } from './state.ts'

/**
 * STAGE 3 (code, no model): references → real slide ids. Numbers, ranges, "last 2", "current", "what you just changed" are exact.
 * A title is matched against the slide index: one match is that slide, several are a question with the matches as buttons, none is
 * said plainly with what the deck does have. The model never invents an id, so a wrong guess becomes a question, never a wrong edit.
 */
export interface Question { text: string; options: { label: string; reply: string }[] }
export type Resolved = { ok: true; ids: string[]; notes: string[] } | { ok: false; ask: Question } | { ok: false; refuse: string }

/** words that say nothing about WHICH slide ("the", "slide", "page") are not used to match titles */
const FILLER = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'to', 'on', 'in', 'for', 'my', 'our', 'your', 'this', 'that', 'slide', 'slides', 'page', 'pages', 'one', 'ones'])
const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').split(' ').filter((w) => w.length > 1 && !FILLER.has(w))
const label = (r: SlideRow) => `Slide ${r.n}${r.title ? ` — ${r.title.slice(0, 40)}` : ''}`

function byTitle(s: DeckState, text: string): SlideRow[] {
  const want = words(text)
  if (!want.length) return []
  const score = (r: SlideRow) => {
    const have = new Set([...words(r.title), ...words(r.layout.replace(/-/g, ' '))])
    return want.filter((w) => have.has(w) || [...have].some((h) => h.length > 3 && (h.startsWith(w) || w.startsWith(h)))).length
  }
  const scored = s.slides.map((r) => ({ r, n: score(r) })).filter((x) => x.n > 0)
  const best = Math.max(0, ...scored.map((x) => x.n))
  return scored.filter((x) => x.n === best).map((x) => x.r)
}

/** `anchor`: the reference names a POSITION ("after slide 3"), not a slide to change: resolved exactly, with no default and no "This slide" limit. */
export function resolveTargets(s: DeckState, refs: Ref[], o: { instruction: string; addedByTask?: Map<number, string[]> | undefined; defaultToCurrent?: boolean | undefined; anchor?: boolean | undefined }): Resolved {
  const total = s.slides.length
  const ids: string[] = []
  const notes: string[] = []
  const push = (r: SlideRow | undefined) => { if (r && !ids.includes(r.id)) ids.push(r.id) }
  const at = (n: number) => s.slides[n - 1]
  for (const ref of refs) {
    switch (ref.by) {
      case 'number':
        if (ref.n > total) return { ok: false, refuse: `There is no slide ${ref.n} — this deck has ${total} slide${total === 1 ? '' : 's'}.` }
        push(at(ref.n)); break
      case 'range': {
        const [a, b] = ref.from <= ref.to ? [ref.from, ref.to] : [ref.to, ref.from]
        if (a > total) return { ok: false, refuse: `There is no slide ${a} — this deck has ${total} slides.` }
        for (let n = a; n <= Math.min(b, total); n++) push(at(n))
        break
      }
      case 'last': for (let n = Math.max(1, total - ref.count + 1); n <= total; n++) push(at(n)); break
      case 'first': for (let n = 1; n <= Math.min(ref.count, total); n++) push(at(n)); break
      case 'current': push(s.slides.find((r) => r.id === s.focus.current)); break
      case 'just_changed': {
        const changed = s.slides.filter((r) => s.focus.lastChanged.includes(r.id))
        if (changed.length) changed.forEach(push)
        else push(s.slides.find((r) => r.id === s.focus.current)) // nothing was changed yet: "it" is the slide on screen
        break
      }
      case 'all': s.slides.forEach(push); break
      case 'layout': s.slides.filter((r) => r.layout === ref.layout).forEach(push); break
      case 'added_by_task': (o.addedByTask?.get(ref.task) ?? []).forEach((id) => { if (!ids.includes(id)) ids.push(id) }); break
      case 'title': {
        const found = byTitle(s, ref.text)
        if (found.length === 0) return { ok: false, refuse: `I couldn't find a slide about "${ref.text}". The slides are: ${s.slides.map((r) => `${r.n}. ${r.title || r.layout}`).join(', ').slice(0, 400)}.` }
        if (found.length > 1 && refs.length === 1 && !s.onlySlideId) {
          return { ok: false, ask: { text: `Which slide do you mean — ${found.map((r) => `slide ${r.n}`).join(' or ')}?`, options: [...found.map((r) => ({ label: label(r), reply: `${o.instruction} (slide ${r.n})` })), { label: 'All of them', reply: `${o.instruction} (slides ${found.map((r) => r.n).join(', ')})` }] } }
        }
        found.forEach(push)
        break
      }
    }
  }
  if (o.anchor) return ids.length ? { ok: true, ids, notes } : { ok: false, refuse: 'I could not find the slide you want them next to.' }
  if (ids.length === 0 && o.defaultToCurrent !== false) {
    const cur = s.slides.find((r) => r.id === s.focus.current)
    if (!cur) return { ok: false, ask: { text: 'Which slide should I change?', options: s.slides.slice(0, 12).map((r) => ({ label: label(r), reply: `${o.instruction} (slide ${r.n})` })) } }
    push(cur)
  }
  // "This slide" mode: only the panel's slide may change. A request naming other slides is refused, never moved onto this one ("delete slide 5" must not delete the selected slide)
  if (s.onlySlideId && ids.some((id) => id !== s.onlySlideId)) return { ok: false, refuse: 'Only the selected slide can be changed here — switch to "Whole deck" to change other slides.' }
  return { ok: true, ids, notes }
}

/** Where new slides go: after a given slide, at the start or end, or spread through the middle ("4 slides in between"). Returns the slide each new one follows (null = the very start). */
export function insertionPoints(s: DeckState, count: number, where: 'end' | 'start' | 'after' | 'spread', afterId?: string): (string | null)[] {
  const total = s.slides.length
  if (where === 'start') return Array.from({ length: count }, () => null)
  if (where === 'after' && afterId) return Array.from({ length: count }, () => afterId)
  if (where === 'spread' && total >= 3) {
    // evenly through the middle: never before the cover, never after the closing slide
    return Array.from({ length: count }, (_, i) => s.slides[Math.min(total - 2, Math.max(0, Math.round(((i + 1) * (total - 1)) / (count + 1)) - 1))]!.id)
  }
  return Array.from({ length: count }, () => s.slides[total - 1]?.id ?? null)
}
