import { type AspectRatio, type SlideContent } from '@prompttoppt/validation'
import { composeSlide, type IdGen, type Photo } from '../layout/index'
import { harmonizeType } from '../layout/harmonize'
import { CATEGORIES } from './categories'
import { DESIGNS, designById, type TemplateDesign } from './build'
import { AVAILABLE_PHOTOS } from './photos.generated'
import { SKELETONS } from './skeletons'

/** The starter slide contents for a design (shared per category; the DESIGN is what differs). */
export const templateContents = (designId: string): SlideContent[] | null => {
  const d = designById(designId)
  return d ? SKELETONS[d.category] : null
}

/**
 * Shared photography: sixteen pictures per category (`<category>-1…16.jpg`). Each slide kind draws from the pictures that fit its
 * shape, and the starting point rotates with the design's position, so two designs of one category show different pictures.
 */
const POOLS = { wide: [1, 2, 8, 11, 15], tall: [3, 4, 9, 12, 16], square: [5, 6, 13], standard: [7, 10, 5, 14] } as const
const HAVE = new Set(AVAILABLE_PHOTOS)
const pick = (pool: readonly number[], design: number, n: number) => pool[(design + n) % pool.length]!
/** The first picture of the design's category that really exists, trying the slot's preferred pool order, then any of the category's, then any picture at all. */
function resolvePhoto(category: string, pool: readonly number[], design: number, n: number, used: Set<string>): string | null {
  if (AVAILABLE_PHOTOS.length === 0) return `${category}-${pick(pool, design, n)}` // no manifest (tests / fresh checkout): trust the slot
  // candidates in order of preference; a picture already used earlier in this deck is only repeated when nothing else exists
  const own = AVAILABLE_PHOTOS.filter((k) => k.startsWith(`${category}-`))
  const preferred = pool.map((_, i) => `${category}-${pool[(design + n + i) % pool.length]}`).filter((k) => HAVE.has(k))
  const rest = [...own.slice((design + n) % Math.max(1, own.length)), ...own.slice(0, (design + n) % Math.max(1, own.length))]
  const any = AVAILABLE_PHOTOS.slice((design + n) % AVAILABLE_PHOTOS.length)
  const candidates = [...preferred, ...rest, ...any]
  return candidates.find((k) => !used.has(k)) ?? candidates[0] ?? null
}

export const templatePhotoKey = (category: string, n: number) => `${category}-${n}`
export const TEMPLATE_PHOTO_COUNT = 10
export const templatePhotoCategories = CATEGORIES.map((c) => c.id)

/**
 * Slide contents → composed slides in a design, with its photography: title / thank-you / quote / big-number slides take photographic
 * compositions and `split-image-text` slides get a catalogue picture. Shared by template decks and AI-generated decks, so both look alike.
 * Pure. Without `assetBase` no pictures are used.
 */
export function composeDeck(contents: SlideContent[], d: TemplateDesign, aspect: AspectRatio, idGen: IdGen, assetBase?: string, photoCategory?: string, picks?: (Photo | null | undefined)[]) {
  // pictures follow the TOPIC (photoCategory), the look follows the design: a QA deck in a pitch template still gets technology pictures
  const pc = CATEGORIES.some((c) => c.id === photoCategory) ? photoCategory! : d.category
  const label = CATEGORIES.find((c) => c.id === pc)?.name ?? pc
  const photo = (pool: readonly number[], n: number): Photo | undefined => {
    const key = resolvePhoto(pc, pool, d.photoSeed, n, used)
    if (key) used.add(key)
    return key ? { src: `${assetBase}/${key}.jpg`, alt: `Photograph for a ${label.toLowerCase()} presentation` } : undefined
  }
  const pick1 = (forced: Photo | null | undefined, pool: readonly number[], n: number) => (forced === undefined ? (assetBase ? photo(pool, n) : undefined) : (forced ?? undefined))
  const used = new Set<string>()
  const seen: Record<string, number> = {}
  let plain = 0
  return harmonizeType(contents.map((content, idx) => {
    if (content.layout === 'title-body') return composeSlide(content, d.theme, aspect, idGen, { variant: plain++ })
    if (!assetBase && !picks) return composeSlide(content, d.theme, aspect, idGen)
    // `picks[i]`: a chosen picture for this slide, `null` = deliberately none (a wrong picture is worse than none), `undefined` = use the library
    const forced = picks?.[idx]
    const nth = (seen[content.layout] = (seen[content.layout] ?? -1) + 1)
    switch (content.layout) {
      case 'title': return composeSlide(content, d.theme, aspect, idGen, { photo: pick1(forced ?? undefined, POOLS.wide, 0) })
      case 'thank-you': case 'section-divider': return composeSlide(content, d.theme, aspect, idGen, { photo: pick1(forced, POOLS.wide, 1 + nth) })
      case 'quote': return composeSlide(content, d.theme, aspect, idGen, { photo: pick1(forced, POOLS.tall, nth) })
      case 'big-number': return composeSlide(content, d.theme, aspect, idGen, nth % 2 === 0 ? { photo: pick1(forced, POOLS.square, nth) } : {})
      case 'split-image-text': { const ph = pick1(forced, POOLS.standard, nth); return composeSlide(forced ? { ...content, imageUrl: forced.src, ...(forced.attribution ? { imageAttribution: forced.attribution } : {}) } : ph && !content.imageUrl ? { ...content, imageUrl: ph.src } : content, d.theme, aspect, idGen) }
      default: return composeSlide(content, d.theme, aspect, idGen)
    }
  }))
}

/**
 * Picks a design for a category: Starter users get the free ones, paid plans any of the twelve. `seed` (the prompt) keeps the choice
 * stable for the same request but varied across requests.
 */
export function pickDesign(category: string | undefined, premiumAllowed: boolean, seed: string): TemplateDesign {
  const cat = CATEGORIES.some((c) => c.id === category) ? category! : 'strategy'
  const pool = DESIGNS.filter((d) => d.category === cat && (premiumAllowed || !d.premium))
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return pool[h % pool.length]!
}

/** A ready-to-edit deck for a design: category story + the design's theme (+ pictures, when `assetBase` is given), composed for the aspect ratio. Pure. */
export function templateSlides(designId: string, aspect: AspectRatio, idGen: IdGen, assetBase?: string) {
  const d = designById(designId)
  if (!d) return null
  return { theme: d.theme, slides: composeDeck(SKELETONS[d.category], d, aspect, idGen, assetBase), title: `${d.name} — ${d.category}` }
}
