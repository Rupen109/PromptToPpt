import { designById, templateSlides } from '@prompttoppt/theme'
import type { AspectRatio, Slide } from '@prompttoppt/validation'
import { SITE_URL } from '@/lib/env'

/** Compose a design's starter slide on the client (pure + cheap), so the page ships design data, not images. */
export function slidesFor(designId: string, aspect: AspectRatio = '16:9', only?: number): Slide[] {
  const d = designById(designId)
  if (!d) return []
  let n = 0
  const built = templateSlides(d.id, aspect, () => `${d.id}-e${n++}`, `${SITE_URL}/template-assets`)!
  return built.slides.flatMap((s, i) => (only === undefined || only === i ? [{ id: `${d.id}-${i}`, locked: false, validation: { status: 'passed' as const, issues: [] }, ...s }] : []))
}
