import type { Presentation, Slide, Theme } from '@prompttoppt/validation'
import { contrastRatio, isDark } from '../color'
import { effectiveBackground, resolveColor } from '../validate'

/**
 * What an assistant answer PROMISES, as small checkable facts. Built by the server from the answer and the saved deck (it knows how things were before), carried with the answer, stored with
 * the request, and checked by `evaluate` (evaluate.ts) against a DOCUMENT: by the editor on its live deck right after applying, and by the server on the saved deck when credits are
 * settled. Nothing here depends on which command did the work: only on what the deck must look like afterwards.
 */
import type { AnswerChanges, Expectation, ThemePart } from '@prompttoppt/validation'
import { alreadyAsked, effectAlready, groupAlready, layerAlready } from './element-ops'
import { transitionMatches } from './evaluate'
export type { AnswerChanges, Expectation, ExpectationKind, ThemePart } from '@prompttoppt/validation'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const slideOf = (d: Presentation, id: string): Slide | undefined => d.slides.find((s) => s.id === id)
/** pictures a "remove the pictures" can take off a slide: its background picture, and on a hand-made slide the photos placed on it */
export function removablePictures(s: Slide): boolean {
  if (s.background?.type === 'image') return true
  if (s.manual || !s.content) return s.elements.some((e) => e.type === 'image' && !e.decorative && !e.locked)
  return false
}

/** which parts of the design the new theme changes (what the person asked for), by comparing with the deck as it is */
export function themeParts(before: Theme, to: Theme): ThemePart[] {
  const parts: ThemePart[] = []
  if (!same(before.colors, to.colors)) parts.push('colours')
  if (!same(before.fonts, to.fonts)) parts.push('fonts')
  if (!same(before.style ?? null, to.style ?? null)) parts.push('style')
  if (!same(before.motion ?? null, to.motion ?? null)) parts.push('motion')
  // a palette of the person's own colours is the pseudo-design `custom`: that is a colour change, not another design
  // a design is APPLIED when a template (or a named design) is put on; a colour change that only drops the old template link is a colour change, said as one
  if ((to.templateId && before.templateId !== to.templateId) || (before.id !== to.id && to.id !== 'custom')) parts.push('design')
  if (isDark(before.colors.background) !== isDark(to.colors.background)) parts.push('mode')
  if ((before.brand?.logo?.src ?? null) !== (to.brand?.logo?.src ?? null) || (before.brand?.logo?.align ?? 'left') !== (to.brand?.logo?.align ?? 'left')) parts.push('logo')
  return parts
}

/**
 * The expectations of one answer, in the order the editor applies its changes (the keys are the same on both sides). `before` is the saved deck the answer was made from.
 * Slides an earlier change of the same answer adds (an edit of a slide that "add a thank you page" creates) are not in `before`; their expectations simply find them in the deck afterwards.
 */
export function expectationsFromChanges(before: Presentation, r: AnswerChanges): Expectation[] {
  const out: Expectation[] = []
  const add = (e: Expectation) => out.push(e)
  if (r.theme) add({ key: 'theme', kind: 'theme', to: r.theme, parts: themeParts(before.theme, r.theme), mode: isDark(r.theme.colors.background) ? 'dark' : 'light' })
  ;(r.additions ?? []).forEach((a, i) => { if (a.id) add({ key: `addition:${i}`, kind: 'addition', id: a.id, layout: a.content.layout }) })
  ;(r.duplicates ?? []).forEach((d, i) => { const at = before.slides.findIndex((s) => s.id === d.slideId); add({ key: `duplicate:${i}`, kind: 'duplicate', slideId: d.slideId, newId: d.newId, ...(at >= 0 ? { from: at + 1 } : {}) }) })
  r.edits.forEach((e, i) => { const s = slideOf(before, e.slideId); add({ key: `edit:${i}`, kind: 'edit', slideId: e.slideId, content: e.content, change: s && s.layoutId !== e.content.layout ? (hasPictureSlot(s.content) && !hasPictureSlot(e.content) ? 'picture_off' : 'layout') : s?.content && onlyNotesDiffer(s.content, e.content) ? 'notes' : 'text' }) })
  ;(r.backgrounds ?? []).forEach((b, i) => { const s = slideOf(before, b.slideId); add({ key: `background:${i}`, kind: 'background', slideId: b.slideId, color: b.color, was: s?.background?.type === 'color' ? s.background.value : null }) })
  ;(r.patterns ?? []).forEach((g, i) => add({ key: `pattern:${i}`, kind: 'background_pattern', slideId: g.slideId, pattern: g.kind }))
  ;(r.backgroundCopies ?? []).forEach((g, i) => g.slideIds.forEach((id, j) => add({ key: `background_copy:${i}:${j}`, kind: 'background_copy', slideId: id, fromSlideId: g.fromSlideId })))
  ;(r.slideBrands ?? []).forEach((g, i) => g.slideIds.forEach((id, j) => add({ key: `slide_brand:${i}:${j}`, kind: 'slide_brand', slideId: id, brand: g.brand })))
  ;(r.blurs ?? []).forEach((g, i) => add({ key: `blur:${i}`, kind: 'background_blur', slideId: g.slideId, blur: g.blur }))
  ;(r.gradients ?? []).forEach((g, i) => add({ key: `gradient:${i}`, kind: 'gradient', slideId: g.slideId, from: g.from, to: g.to, ...(g.kind === 'radial' ? { radial: true } : {}) }))
  ;(r.clearPictures ?? []).forEach((id, i) => { const s = slideOf(before, id); add({ key: `clear_pictures:${i}`, kind: 'clear_pictures', slideId: id, hadPicture: s ? removablePictures(s) : true }) })
  ;(r.pictureSwaps ?? []).forEach((x, i) => {
    const el = slideOf(before, x.slideId)?.elements.find((e) => e.id === x.elementId)
    add({ key: `picture_swap:${i}`, kind: 'picture_swap', slideId: x.slideId, elementId: x.elementId, from: el && el.type === 'image' ? (el.src ?? '') : '', to: x.url, ...(x.transparentShare !== undefined ? { transparentShare: x.transparentShare } : {}), ...(x.replaced ? { replaced: true } : {}), ...(x.source ? { source: x.source } : {}) })
  })
  ;(r.readability ?? []).forEach((id, i) => { const s = slideOf(before, id); add({ key: `readability:${i}`, kind: 'readability', slideId: id, hadIssues: s ? unreadableTexts(s, before.theme) > 0 : true }) })
  ;(r.pictures ?? []).forEach((p, i) => add({ key: `photo:${i}`, kind: 'photo', slideId: p.slideId, url: p.url, placement: p.placement ?? 'background' }))
  ;(r.moves ?? []).forEach((m, i) => {
    const idx = before.slides.findIndex((s) => s.id === m.slideId)
    const anchor = m.afterSlideId ? before.slides.findIndex((s) => s.id === m.afterSlideId) : -1
    add({ key: `move:${i}`, kind: 'move', slideId: m.slideId, afterSlideId: m.afterSlideId, inPlace: idx >= 0 && (m.afterSlideId ? anchor >= 0 && idx === anchor + 1 : idx === 0), ...(idx >= 0 ? { from: idx + 1 } : {}) })
  })
  ;(r.elementChanges ?? []).forEach((c, i) => { const el = slideOf(before, c.slideId)?.elements.find((x) => x.id === c.elementId); add({ key: `element:${i}`, kind: 'element', change: c, already: c.effect ? effectAlready(slideOf(before, c.slideId), c) : c.group ? groupAlready(c.group, slideOf(before, c.slideId)) : c.layer ? layerAlready(slideOf(before, c.slideId), c) : !!el && alreadyAsked(el, c) }) })
  ;(r.transitions ?? []).forEach((t, i) => add({ key: `transition:${i}`, kind: 'transition', slideId: t.slideId, to: t.to, already: transitionMatches(slideOf(before, t.slideId)?.transition, t.to) }))
  ;(r.locks ?? []).forEach((l, i) => add({ key: `lock:${i}`, kind: 'lock', slideId: l.slideId, locked: l.locked, wasLocked: !!slideOf(before, l.slideId)?.locked }))
  ;(r.removals ?? []).forEach((id, i) => add({ key: `removal:${i}`, kind: 'removal', slideId: id, slideNo: before.slides.findIndex((s) => s.id === id) + 1 }))
  if ((r.reverts ?? []).length) add({ key: 'revert', kind: 'revert', theme: (r.reverts ?? []).some((x) => x.part === 'all' || x.part === 'theme'), slideIds: [...new Set((r.reverts ?? []).map((x) => x.slideId).filter((x): x is string => !!x))] })
  if ((r.images ?? []).length) add({ key: 'proposal', kind: 'proposal', count: r.images!.length })
  if (r.rewrite) add({ key: 'rewrite', kind: 'rewrite', picturesOnly: !!r.rewrite.picturesOnly })
  return out
}

// text that cannot be read on what is behind it (the same rule makeSlideReadable uses to decide what to fix); kept here so the check does not depend on the editor
export function unreadableTexts(s: Slide, theme: Theme): number {
  let bad = 0
  for (const e of s.elements) {
    if (e.type !== 'text' || e.decorative) continue
    const bg = effectiveBackground(s, theme, e)
    const fg = resolveColor(e.color, theme, s)
    const need = e.fontSize >= 32 || ((e.weight ?? 400) >= 700 && e.fontSize >= 24) ? 3 : 4.5
    if (!fg || contrastRatio(fg, bg) < need) bad++
  }
  return bad
}


/** the two contents are the same except for the speaker notes (and the notes really differ): such an edit is reported as notes, not as "rewrote the text" */
/** the same content written with its keys in one order (the server's sanitiser may write them in another): two contents compare by what they say, not by how they were written */
const canonical = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([, y]) => y !== undefined).sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0))) : x))
/** a designed slide whose layout shows a picture (its content carries one) */
const hasPictureSlot = (c: unknown) => !!c && typeof c === 'object' && typeof (c as { imageUrl?: unknown }).imageUrl === 'string' && !!(c as { imageUrl: string }).imageUrl
const withoutNotes = (c: unknown) => canonical({ ...(c as object), speakerNotes: '' })
export const onlyNotesDiffer = (a: unknown, b: unknown): boolean => withoutNotes(a) === withoutNotes(b) && JSON.stringify((a as { speakerNotes?: string }).speakerNotes ?? '') !== JSON.stringify((b as { speakerNotes?: string }).speakerNotes ?? '')
