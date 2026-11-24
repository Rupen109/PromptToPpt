import { isSectionStart, sectionsOf, type Restructure } from '@prompttoppt/validation'
import type { Ref } from './understand.ts'
import type { DeckState, SlideRow } from './state.ts'

/**
 * STAGE 3 (code, no model): references → real slide ids. Numbers, ranges, "last 2", "current", "what you just changed" are exact.
 * A title is matched against the slide index: one match is that slide, several are a question with the matches as buttons, none is
 * said plainly with what the deck does have. The model never invents an id, so a wrong guess becomes a question, never a wrong edit.
 */
export interface Question { text: string; options: { label: string; reply: string; /** a plan the person confirms by choosing this option: sent back with the next request and checked against the deck again */ confirm?: Restructure }[] }
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
      case 'section': {
        // the same rule as the editor's "Use on this section": a section runs from a section-divider slide to the next
        const rows = s.slides.map((r) => ({ layoutId: r.layout }))
        if (!rows.some(isSectionStart)) return { ok: false, refuse: 'This deck has no sections yet: a section starts at a section divider slide. Add one, or tell me which slides you mean.' }
        const secs = sectionsOf(rows)
        const cur = s.slides.findIndex((r) => r.id === s.focus.current)
        // "section 2" counts the DIVIDERS, as a person does (the cover slides before the first divider are not a numbered section)
        const numbered = secs.filter((x) => isSectionStart(rows[x.start]!))
        const sec = ref.n !== undefined ? numbered[ref.n - 1] : secs.find((x) => cur >= x.start && cur <= x.end)
        if (!sec) return { ok: false, refuse: ref.n !== undefined ? `There is no section ${ref.n} — this deck has ${numbered.length} section${numbered.length === 1 ? '' : 's'}.` : 'Which section do you mean?' }
        for (let i = sec.start; i <= sec.end; i++) push(s.slides[i])
        break
      }
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


// ── elements ─────────────────────────────────────────────────────────────────────────────────────────────────────────
import type { SlideElement } from '@prompttoppt/validation'
import { describeElement, resolveColor } from '@prompttoppt/theme'
import type { ElementRef } from './understand.ts'

/** the words an object shows (text, table cells, chart labels): what "the box that says Revenue" is matched against */
const wordsOf = (e: SlideElement): string => e.type === 'text' ? e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' ') : e.type === 'table' ? [...e.header, ...e.rows.flat()].join(' ') : e.type === 'chart' ? e.labels.join(' ') : ''
const hsl = (hex: string) => {
  const m = /^#?([0-9a-f]{6})/i.exec(hex); if (!m) return null
  const n = parseInt(m[1]!, 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  const h = d === 0 ? 0 : max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)
  return { h: (h + 360) % 360, s: sat, l }
}
/** the colour name a hue goes by (the ranges people mean by red, orange, yellow, green, teal, blue, purple, pink) */
const hueName = (h: number) => (h < 15 || h >= 345 ? 'red' : h < 40 ? 'orange' : h < 66 ? 'yellow' : h < 165 ? 'green' : h < 195 ? 'teal' : h < 255 ? 'blue' : h < 290 ? 'purple' : 'pink')
/** two colours a person would call the same ("the blue shapes"): the same hue family for colours, the same lightness for greys, black and white */
export function sameColourFamily(a: string, b: string): boolean {
  const x = hsl(a), y = hsl(b); if (!x || !y) return false
  const grey = (c: { s: number; l: number }) => c.s < 0.18 || c.l < 0.15 || c.l > 0.94 // (near-black navy text is "black" to a person, not "blue")
  if (grey(x) || grey(y)) return grey(x) && grey(y) && Math.abs(x.l - y.l) < 0.25
  // the colour NAMES people use cover ranges of hue (a navy-ish #0056B3 and a pure #0000FF are both "blue"): same named range = same family
  return hueName(x.h) === hueName(y.h) && Math.abs(x.l - y.l) < 0.45
}
/** the colours an object shows: a text's colour and its coloured words, a shape's or an icon's fill */
const coloursOf = (e: SlideElement, doc: DeckState['doc'], slide: DeckState['doc']['slides'][number]): string[] => {
  const r = (c: string | undefined) => (c && c !== 'none' ? resolveColor(c, doc.theme, slide) : null)
  const out = e.type === 'text' ? [r(e.color), ...e.paragraphs.flatMap((p) => p.runs.map((x) => r(x.color)))] : e.type === 'shape' ? [r(e.fill as string), r(e.gradient?.from), r(e.gradient?.to)] : e.type === 'icon' ? [r((e as { color?: string }).color)] : []
  return out.filter((c): c is string => !!c && c.startsWith('#'))
}
/** colours a person names by word ("the blue box"): one typical shade each; matching is by colour FAMILY (sameColourFamily), so the exact shade does not matter */
export const COLOUR_NAMES: Record<string, string> = { red: '#DC2626', orange: '#EA580C', yellow: '#FACC15', gold: '#EAB308', green: '#16A34A', teal: '#0D9488', cyan: '#06B6D4', blue: '#2563EB', navy: '#1E3A8A', purple: '#7C3AED', violet: '#7C3AED', pink: '#DB2777', brown: '#92400E', black: '#000000', white: '#FFFFFF', grey: '#6B7280', gray: '#6B7280' }
/** refs that NAME a set of objects ("the decorations", "all hidden objects"): every match is meant, even for an operation on one object */
const SET_REFS = new Set(['all_text', 'decorative', 'hidden', 'all_objects', 'text', 'color']) // (a colour ref with "which" names ONE object)

export type ResolvedElements = { ok: true; items: { slideId: string; element: SlideElement }[]; notes: string[] } | { ok: false; ask: Question } | { ok: false; refuse: string }
const SINGLE_OBJECT_OPS = new Set(['table_highlight', 'table_format', 'trigger_object', 'move', 'resize', 'align', 'delete', 'chart_type', 'chart_order', 'table_order', 'table_rows', 'table_columns', 'copy_object'])

/** Whether a list of operations works on objects that must be found first. Adding a shape does not (it goes on the slide) unless it is added AROUND named objects. One rule, used by the pipeline and the capability. */
export const needsObjects = (ops: { op: string; around?: boolean | undefined }[]): boolean => ops.some((o) => (o.op !== 'add_shape' && o.op !== 'copy_object' && o.op !== 'add_chart' && o.op !== 'animate_remove_at' && o.op !== 'animate_sequence') || o.around === true)
/** the most objects one request changes; more is refused BEFORE anything changes, with the count (it used to keep the first 60 silently: "text red" left slides 9-10 and said Done) */
export const MAX_ELEMENTS = 400

/**
 * STAGE 3 for objects (code, no model): which elements, on the slides already resolved. "Selected" is exactly what the person has selected; "the title" / "the picture" must be exactly one
 * such object (several is a question, never a guess) unless the action fits many (a text size or style applies to every match). Nothing selected and nothing named is a question.
 */
export function resolveElements(s: DeckState, slideIds: string[], refs: ElementRef[], opNames: string[]): ResolvedElements {
  const oneObject = opNames.some((o) => SINGLE_OBJECT_OPS.has(o))
  const items: { slideId: string; element: SlideElement }[] = []
  const notes: string[] = []
  const have = (slideId: string, el: SlideElement) => items.some((x) => x.slideId === slideId && x.element.id === el.id)
  const add = (slideId: string, el: SlideElement) => { if (!have(slideId, el)) items.push({ slideId, element: el }) }
  const askWhich = (what: string, n: number, slide: number): ResolvedElements => ({ ok: false, ask: { text: `There ${n === 1 ? 'is' : 'are'} ${n} ${what} on slide ${slide}. Select the one you mean on the slide, then ask again.`, options: [] } })
  for (const ref of refs.length ? refs : [{ by: 'selected' } as ElementRef]) {
    if (ref.by === 'selected') {
      const picked = slideIds.flatMap((id) => (s.doc.slides.find((x) => x.id === id)?.elements ?? []).filter((e) => s.selection.elementIds.includes(e.id)).map((e) => ({ id, e })))
      if (picked.length === 0) return { ok: false, ask: { text: 'Which object do you mean? Select it on the slide (or tell me: the title, the picture) and ask again.', options: [] } }
      picked.forEach((x) => add(x.id, x.e))
      continue
    }
    for (const id of slideIds) {
      const slide = s.doc.slides.find((x) => x.id === id)
      // a slide this message added (a Morph copy) has no row yet: its number is its place in the deck as it will be
      const row = s.slides.find((r) => r.id === id) ?? (slide ? { n: s.doc.slides.indexOf(slide) + 1 } : undefined)
      if (!slide || !row) continue
      const pool = slide.elements.filter((e) => !e.decorative && !e.brand)
      const want = ref.by === 'color' ? (/^#[0-9a-f]{6}$/i.test(ref.color) ? ref.color : (s.doc.theme.colors as Record<string, string>)[ref.color === 'text' ? 'textPrimary' : ref.color] ?? COLOUR_NAMES[ref.color.trim().toLowerCase()] ?? '') : ''
      const area = (e: SlideElement) => e.width * e.height
      const match = ref.by === 'role' ? pool.filter((e) => e.type === 'text' && e.role === ref.role)
        : ref.by === 'type' ? pool.filter((e) => e.type === ref.type)
        : ref.by === 'text' ? pool.filter((e) => wordsOf(e).toLowerCase().includes(ref.text.toLowerCase().trim()))
        : ref.by === 'color' ? (want ? [...pool.filter((e) => (!ref.type || e.type === ref.type) && coloursOf(e, s.doc, slide).some((c) => sameColourFamily(c, want)))].sort((p, q) => (ref.which === 'smallest' ? area(p) - area(q) : area(q) - area(p))).slice(0, ref.which ? 1 : undefined) : [])
        : ref.by === 'size' ? [...pool.filter((e) => !ref.type || e.type === ref.type)].sort((a, b) => (ref.which === 'largest' ? area(b) - area(a) : area(a) - area(b))).slice(0, 1)
        : ref.by === 'decorative' ? slide.elements.filter((e) => e.decorative && !e.brand)
        : ref.by === 'hidden' ? slide.elements.filter((e) => e.hidden)
        : ref.by === 'all_objects' ? slide.elements.filter((e) => !e.brand && !e.decorative) // (the design's own decorations are named on their own: "the decorations")
        : pool.filter((e) => e.type === 'text')
      const what = ref.by === 'role' ? ref.role : ref.by === 'type' ? (ref.type === 'image' ? 'picture' : ref.type) : ref.by === 'text' ? `object with the words "${ref.text}"` : ref.by === 'color' ? `object in ${ref.color}` : ref.by === 'decorative' ? 'decoration' : ref.by === 'hidden' ? 'hidden object' : ref.by === 'size' ? (ref.type ? (ref.type === 'image' ? 'picture' : ref.type) : 'object') : ref.by === 'all_objects' ? 'object' : 'text'
      if (match.length === 0) { notes.push(`Slide ${row.n} has no ${what} to change.`); continue }
      const chosen = match.filter((e) => s.selection.elementIds.includes(e.id))
      const use = chosen.length ? chosen : match
      if (oneObject && use.length > 1 && !SET_REFS.has(ref.by)) return askWhich(`${ref.by === 'type' && ref.type === 'image' ? 'pictures' : describeElement(use[0]!).replace(/^(the|a) /, '') + 's'}`, use.length, row.n)
      use.forEach((e) => add(id, e))
    }
  }
  if (items.length === 0) return { ok: false, refuse: notes[0] ?? 'I could not find that on the slide, so nothing was changed.' }
  if (items.length > MAX_ELEMENTS) return { ok: false, refuse: `That is ${items.length} objects, more than the ${MAX_ELEMENTS} I can change in one request, so nothing was changed. Ask for fewer slides at a time (for example "slides 1 to 10").` }
  return { ok: true, items, notes }
}
