import type { Draft } from 'immer'
import type { MorphScene, Presentation, Slide, SlideElement, Theme } from '@prompttoppt/validation'
import { planMorph } from '@prompttoppt/ui'
import { composeSlide } from '@prompttoppt/theme'

/**
 * The Morph check: for a slide and the one before it, which objects will travel (same id and type), which will come in or go out, what looks wrong, and which fixes
 * would connect objects that a person means to be the same one. Pure. Only ids ever match for Morph; names (`label`) and words are used here only to SUGGEST a link.
 */
export interface MorphWarning { kind: 'duplicate-name' | 'text-without-partner' | 'picture-changes' | 'kind-differs' | 'by-fallback' | 'no-previous' | 'not-morph'; message: string; elementId?: string }
export interface MorphSuggestion { /** the object on this slide */ elementId: string; /** the object on the previous slide it probably is */ partnerId: string; reason: string }
export interface MorphReport {
  moving: { id: string; type: SlideElement['type']; crossfade: boolean }[]
  entering: SlideElement[]
  exiting: SlideElement[]
  warnings: MorphWarning[]
  suggestions: MorphSuggestion[]
}

export const nameOf = (e: SlideElement): string => {
  if (e.label) return e.label
  if (e.type === 'text') { const t = e.paragraphs.flatMap((p) => p.runs.map((r) => r.text)).join(' ').trim(); return t ? (t.length > 28 ? `${t.slice(0, 27)}…` : t) : 'Text' }
  return ({ image: 'Picture', shape: 'Shape', icon: 'Icon', chart: 'Chart', table: 'Table' } as Record<string, string>)[e.type] ?? e.type
}
const words = (e: SlideElement) => (e.type === 'text' ? e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n').trim() : '')

export function morphReport(prev: Slide | undefined, cur: Slide): MorphReport {
  const warnings: MorphWarning[] = []
  const seen = new Map<string, SlideElement>()
  for (const e of cur.elements) {
    if (!e.label) continue
    const key = e.label.toLowerCase()
    if (seen.has(key)) warnings.push({ kind: 'duplicate-name', message: `Two objects are named "${e.label}". Give each its own name so you can tell them apart.`, elementId: e.id })
    else seen.set(key, e)
  }
  if (cur.transition?.type !== 'morph') warnings.push({ kind: 'not-morph', message: 'This slide does not use Morph yet.' })
  if (!prev) {
    warnings.push({ kind: 'no-previous', message: 'This is the first slide: Morph needs a slide before it to move from.' })
    return { moving: [], entering: [], exiting: [], warnings, suggestions: [] }
  }
  const real = (e: SlideElement) => !e.decorative
  const by = cur.transition?.by ?? 'object'
  const plan = planMorph({ elements: prev.elements.filter(real) }, { elements: cur.elements.filter(real) }, new Set(), by)
  if (by !== 'object') for (const p of plan.pairs) if (p.to.type === 'text' && !p.pieces) warnings.push({ kind: 'by-fallback', message: `The text "${nameOf(p.to)}" is too different or too long to move ${by === 'word' ? 'word by word' : 'character by character'}, so it moves as one object.`, elementId: p.to.id })
  const moving = plan.pairs.map((p) => ({ id: p.to.id, type: p.to.type, crossfade: p.crossfade }))
  for (const p of plan.pairs) if (p.to.type === 'image' && p.from.type === 'image' && p.crossfade) warnings.push({ kind: 'picture-changes', message: `The picture "${nameOf(p.to)}" is a different picture here, so it cross-fades instead of moving.`, elementId: p.to.id })
  // the same id on both slides but another kind of object: it cannot move into it
  const before = new Map(prev.elements.map((e) => [e.id, e]))
  for (const e of cur.elements) { const was = before.get(e.id); if (was && was.type !== e.type) warnings.push({ kind: 'kind-differs', message: `"${nameOf(e)}" has the same id as a ${was.type} on the previous slide, so they cannot move into each other.`, elementId: e.id }) }
  const suggestions: MorphSuggestion[] = []
  const taken = new Set<string>()
  for (const e of plan.entering) {
    const cand = plan.exiting.find((x) => !taken.has(x.id) && x.type === e.type && ((!!e.label && x.label?.toLowerCase() === e.label.toLowerCase()) || (e.type === 'text' && words(e) !== '' && words(e) === words(x)) || (e.type === 'image' && x.type === 'image' && e.src === x.src)))
    if (cand) { taken.add(cand.id); suggestions.push({ elementId: e.id, partnerId: cand.id, reason: e.label && cand.label?.toLowerCase() === e.label.toLowerCase() ? 'same name' : e.type === 'text' ? 'same words' : 'same picture' }) }
  }
  const suggested = new Set(suggestions.map((s) => s.elementId))
  for (const e of plan.entering) if (e.type === 'text' && !e.decorative && !suggested.has(e.id)) warnings.push({ kind: 'text-without-partner', message: `The text "${nameOf(e)}" has no partner on the previous slide: it will fade in. Match it to a text there to make it move.`, elementId: e.id })
  return { moving, entering: plan.entering, exiting: plan.exiting, warnings, suggestions }
}

type D = Draft<Presentation>
/**
 * "Make this the same object as…": gives an object the id of an object on the previous slide, so Morph moves one into the other. The effects (and triggers) that named the old id follow it.
 * Refused when the slide is locked, the object is locked or missing, the kinds differ, or another object on this slide already has that id.
 */
export function matchToPrevious(d: D, slideId: string, elementId: string, partnerId: string): boolean {
  const i = d.slides.findIndex((s) => s.id === slideId)
  const s = d.slides[i], prev = d.slides[i - 1]
  const el = s?.elements.find((e) => e.id === elementId)
  const partner = prev?.elements.find((e) => e.id === partnerId)
  if (!s || s.locked || !el || el.locked || !partner || el.type !== partner.type) return false
  if (elementId === partnerId) return true
  if (s.elements.some((e) => e.id === partnerId)) return false
  el.id = partnerId
  for (const fx of s.effects ?? []) { if (fx.elementId === elementId) fx.elementId = partnerId; if (fx.trigger === elementId) fx.trigger = partnerId }
  s.manual = true
  return true
}

/** Gives an object a fresh id (so it no longer morphs into the object with the same id on the other slide). */
export function unlinkElement(d: D, slideId: string, elementId: string, newId: string): boolean {
  const s = d.slides.find((x) => x.id === slideId)
  const el = s?.elements.find((e) => e.id === elementId)
  if (!s || s.locked || !el || el.locked || s.elements.some((e) => e.id === newId)) return false
  el.id = newId
  for (const fx of s.effects ?? []) { if (fx.elementId === elementId) fx.elementId = newId; if (fx.trigger === elementId) fx.trigger = newId }
  return true
}

/**
 * Adds a slide from the Morph layout family (one of the twelve scenes) after the given slide. The cards (concepts) are taken from the nearest Morph slide before it, so the new scene
 * is made of the SAME parts (same ids and words) and Morph moves them; a deck with no Morph slide yet starts with three placeholder cards. The slide arrives with the Morph transition.
 * Returns the new slide's id, or null when the slide is unknown. (The server refuses to save a Morph transition on a plan without Morph.)
 */
export function addMorphScene(d: D, afterSlideId: string, scene: MorphScene, gen: () => string): string | null {
  const i = d.slides.findIndex((s) => s.id === afterSlideId)
  if (i < 0) return null
  let items: { heading: string; text: string }[] = []
  for (let k = i; k >= 0; k--) { const c = d.slides[k]!.content as { layout?: string; items?: { heading: string; text: string }[] } | undefined; if (c?.layout === 'morph' && c.items?.length) { items = c.items.map((x) => ({ ...x })); break } }
  if (items.length === 0) items = [{ heading: 'First idea', text: 'Say it in one line.' }, { heading: 'Second idea', text: 'Say it in one line.' }, { heading: 'Third idea', text: 'Say it in one line.' }]
  const content = { layout: 'morph' as const, scene, title: scene === 'cover' ? 'Your title here' : 'The point of this slide', items, speakerNotes: '', sources: [] }
  const composed = composeSlide(content, d.theme as Theme, d.aspectRatio, gen)
  const slide = { id: gen(), locked: false, validation: { status: 'pending' as const, issues: [] }, ...composed, manual: false } as unknown as Slide
  d.slides.splice(i + 1, 0, slide as Draft<Slide>)
  return slide.id
}
