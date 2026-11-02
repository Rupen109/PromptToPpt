import { env } from '../env.ts'
import { LIBRARY_TAGS } from '../pictures/library-tags.ts'
import { searchStockForEditor } from '../pictures/pick.ts'
import { hasPictureRoom, importStockPhoto } from '../pictures/stock-import.ts'

export interface ResolvedPhoto { url: string; alt: string; source: 'stock' | 'library'; credit?: string | undefined }
export type PhotoResult = { ok: true; photo: ResolvedPhoto } | { ok: false; reason: 'no_match' | 'unavailable' }

/** Template pictures matching a request by keyword (free, no quota, no network): at least two shared words, or one when the request is a single word. */
export function libraryPhotoFor(query: string): ResolvedPhoto | null {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  if (!words.length) return null
  const need = words.length === 1 ? 1 : 2
  let best: { key: string; score: number } | null = null
  for (const [key, tag] of Object.entries(LIBRARY_TAGS)) {
    const score = words.filter((w) => tag.keywords.some((k) => k.startsWith(w) || w.startsWith(k))).length
    if (score >= need && (!best || score > best.score)) best = { key, score }
  }
  if (!best) return null
  return { url: `${env.WEB_URL.replace(/\/+$/, '')}/template-assets/${best.key}.jpg`, alt: LIBRARY_TAGS[best.key]!.description, source: 'library' }
}

/**
 * One FREE, INSTANT picture for a request like "a city skyline at night": a landscape stock photo (copied into our storage under the deck owner), else a matching template picture.
 * Never generates anything and never charges credits: AI generation stays a separate, confirmed step. An owner whose picture storage is full
 * gets a template picture (those need no storage), the same limit the Media library holds.
 */
export async function resolvePhoto(query: string, ctx: { userId: string; ownerId: string }): Promise<PhotoResult> {
  let searched = false
  if (await hasPictureRoom(ctx.ownerId)) {
    try {
      const r = await searchStockForEditor(query, ctx.userId, 1, {}, 'landscape')
      searched = r.ok
      if (r.ok) {
        for (const p of r.photos.slice(0, 3)) {
          const got = await importStockPhoto(ctx.ownerId, p).catch(() => null)
          if (got) return { ok: true, photo: { url: got.url, alt: got.alt || query, source: 'stock', credit: got.attribution.source } }
        }
      }
    } catch { /* search is optional: fall through to the template pictures */ }
  }
  const lib = libraryPhotoFor(query)
  if (lib) return { ok: true, photo: lib }
  return { ok: false, reason: searched ? 'no_match' : 'unavailable' }
}
