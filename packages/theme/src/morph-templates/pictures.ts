import type { MorphTemplate } from './types'

/**
 * The pictures of a template that a person can make their own. A slot is ONE PICTURE of the template (the same artwork, wherever it is used): changing it changes it on every scene that shows it,
 * including the hidden copies parked off the slide that the Morph moves in, so the old picture never comes back. (An object id is not enough to identify a picture: in an imported template the
 * same id can show a gradient on one scene and a product photo on the next.) Light, haze, ribbons and patterns are `art` (the template's atmosphere); everything else is a `photo`; a team
 * member's portrait is `portrait` (never filled automatically: a product photo must not end up as a team member).
 */
export interface PictureUse { scene: string; id: string }
export interface PictureSlot {
  /** the template's own picture (its file), or for a product template the picture object's id */
  key: string
  /** what the template shows there, in a few words ("A latte and a notebook") */
  label: string
  kind: 'photo' | 'portrait' | 'art'
  /** the scenes it is visible in */
  scenes: string[]
  /** its box in the first scene it is visible in */
  w: number
  h: number
  /** every picture object (visible or parked) that shows it */
  uses: PictureUse[]
}

const ART = /\b(glow|glows|haze|blob|ribbon|swoosh|swooshes|halftone|pattern|tape|ring|rings|halo|wash|gradient|texture|shaft|stripes|nebula|burst|mesh|studio backdrop|cloud of light|beam|noise|grain|bokeh|dots?|lines?|waves?)\b/i
const PORTRAIT = /\b(member of the team|team member|headshot|portrait)\b/i
const onSlide = (o: { alpha?: number; x: number; y: number; w: number; h: number }) => (o.alpha ?? 1) >= 0.5 && o.x + o.w > 0 && o.x < 1920 && o.y + o.h > 0 && o.y < 1080

/** the scene slides of a deck that show the same template picture as this element (null: not a template picture). Shared by the assistant's note and the "nothing else changed" check. */
export function sceneSlidesOfPicture<S extends { id: string; locked?: boolean; content?: unknown }>(slides: S[], slideId: string, elementId: string, find: (id: string) => MorphTemplate | undefined): S[] | null {
  const c = slides.find((s) => s.id === slideId)?.content as { layout?: string; template?: string; scene?: string } | undefined
  if (c?.layout !== 'morph-template' || !c.template) return null
  const tpl = find(c.template)
  const slot = tpl ? pictureSlots(tpl).find((sl) => sl.uses.some((u) => u.scene === c.scene && u.id === elementId)) : null
  if (!slot) return null
  return slides.filter((s) => { const k = s.content as { layout?: string; template?: string; scene?: string } | undefined; return k?.layout === 'morph-template' && k.template === c.template && slot.uses.some((u) => u.scene === k.scene) })
}

export function pictureSlots(tpl: MorphTemplate): PictureSlot[] {
  const by = new Map<string, PictureSlot>()
  for (const s of tpl.data.slides) {
    for (const o of s.objects) {
      if (o.kind !== 'image') continue
      const pic = o.hash ? tpl.pictures[o.hash] : undefined
      if (!pic || pic.drop) continue
      const alt = pic.alt.trim()
      let slot = by.get(pic.src)
      if (!slot) {
        const kind: PictureSlot['kind'] = ART.test(alt) ? 'art' : PORTRAIT.test(alt) ? 'portrait' : 'photo'
        slot = { key: pic.src, label: alt || pic.src, kind, scenes: [], w: 0, h: 0, uses: [] }
        by.set(pic.src, slot)
      }
      slot.uses.push({ scene: `s${s.n}`, id: o.id })
      if (onSlide(o)) {
        if (!slot.scenes.includes(`s${s.n}`)) slot.scenes.push(`s${s.n}`)
        if (!slot.w) { slot.w = Math.round(o.w); slot.h = Math.round(o.h) }
      }
    }
  }
  return [...by.values()].filter((s) => s.scenes.length > 0) // a picture that is never on a slide (a parked staging copy) is not the person's to choose
}

/** Whether a deck from this template places the person's attached pictures (a product swap, or its photo slots). */
export const takesPictures = (tpl: MorphTemplate): boolean => !!tpl.swap || !!tpl.fillPictures

/**
 * The places the person's attached pictures go, most prominent first (how big it is, times how many scenes it is on): for a product template the product objects (one object is one picture on
 * every scene, so the hero stays the same picture); otherwise the template's photos, never its atmosphere or its team portraits, or only the ones the template lists.
 */
export function fillTargets(tpl: MorphTemplate): PictureSlot[] {
  if (tpl.swap) {
    return tpl.swap.pictures.map((id): PictureSlot => {
      const uses: PictureUse[] = []
      const scenes: string[] = []
      let label = id, w = 0, h = 0
      for (const s of tpl.data.slides) for (const o of s.objects) {
        if (o.kind !== 'image' || o.id !== id) continue
        const pic = o.hash ? tpl.pictures[o.hash] : undefined
        if (pic?.drop) continue
        uses.push({ scene: `s${s.n}`, id })
        if (pic && label === id) label = pic.alt
        if (onSlide(o)) { scenes.push(`s${s.n}`); if (!w) { w = Math.round(o.w); h = Math.round(o.h) } }
      }
      return { key: id, label, kind: 'photo', scenes, w, h, uses }
    }).filter((p) => p.uses.length > 0)
  }
  const only = Array.isArray(tpl.fillPictures) ? new Set(tpl.fillPictures) : null
  return pictureSlots(tpl)
    .filter((s) => (only ? s.kind !== 'art' && s.uses.some((u) => only.has(u.id)) : s.kind === 'photo'))
    .sort((a, b) => b.scenes.length * b.w * b.h - a.scenes.length * a.w * a.h)
}
