import { designById, templateSlides } from '@prompttoppt/theme'
import type { AspectRatio, Slide } from '@prompttoppt/validation'
import { SITE_URL } from '@/lib/env'

/**
 * The photos at the size they are shown (scripts/media/resize-template-assets.mjs makes the copies): a gallery thumbnail is a few hundred pixels wide and a
 * template's own preview about a thousand, so neither downloads the 1920 px originals (300-600 KB each, slow far from the server). Decks made in the editor keep the originals.
 */
export type PhotoSize = 'thumb' | 'preview'
const PHOTO_DIR: Record<PhotoSize, string> = { thumb: 'w768', preview: 'w1280' }

/** Compose a design's starter slide on the client (pure + cheap), so the page ships design data, not images. */
export function slidesFor(designId: string, size: PhotoSize, aspect: AspectRatio = '16:9', only?: number): Slide[] {
  const d = designById(designId)
  if (!d) return []
  let n = 0
  const built = templateSlides(d.id, aspect, () => `${d.id}-e${n++}`, `${SITE_URL}/template-assets/${PHOTO_DIR[size]}`)!
  return built.slides.flatMap((s, i) => (only === undefined || only === i ? [{ id: `${d.id}-${i}`, locked: false, validation: { status: 'passed' as const, issues: [] }, ...s }] : []))
}
