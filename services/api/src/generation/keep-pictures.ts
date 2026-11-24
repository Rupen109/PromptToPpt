import type { Slide } from '@prompttoppt/validation'
import { samePicture } from '../pictures/pick.ts'

export interface PictureRef { src: string; alt: string; attribution?: { source: string; license: string; url?: string } | undefined }

/** The picture a slide shows now: the picture+text slide's own picture, else its first real (non-decorative) picture, else its background picture. */
export function existingPicture(s: Pick<Slide, 'content' | 'elements' | 'background'>): PictureRef | null {
  const c = s.content as { imageUrl?: string; imageAlt?: string } | null | undefined
  if (c?.imageUrl) return { src: c.imageUrl, alt: c.imageAlt ?? '' }
  const el = (s.elements ?? []).find((e) => e.type === 'image' && !e.decorative && 'src' in e && e.src) as { src: string; alt?: string } | undefined
  if (el) return { src: el.src, alt: el.alt ?? '' }
  if (s.background?.type === 'image') return { src: s.background.value, alt: '' }
  return null
}

/**
 * "Replace the pictures" never LOSES one (real QA case C37: the thank-you slide's picture vanished and another slide got the same photo back): for every slide that showed a
 * picture, the new pick is used only when it is a DIFFERENT picture; when the search found nothing new, the slide keeps its own picture and is listed in `kept` (so the
 * person can be told). Slides without a picture before are left to the normal rule (a missing picture beats a wrong one).
 */
export function keepExistingPictures<P extends PictureRef>(picks: (P | null | undefined)[], before: (PictureRef | null)[]): { picks: (P | PictureRef | null | undefined)[]; kept: number[] } {
  const kept: number[] = []
  const out = picks.map((p, i) => {
    const old = before[i]
    if (!old) return p
    if (!p || samePicture(p.src, old.src)) { kept.push(i); return old }
    return p
  })
  return { picks: out, kept }
}
