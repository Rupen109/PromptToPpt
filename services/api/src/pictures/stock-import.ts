import { and, count, eq, isNull } from 'drizzle-orm'
import { assetUrl, checkRaster, storeAsset } from '../brand/assets.ts'
import { fetchLimited } from '../brand/find.ts'
import { db } from '../db/index.ts'
import { generatedAsset } from '../db/schema.ts'
import { pingStockUse, type EditorStockPhoto } from './pick.ts'

/** The editor's picture storage rules, shared by the Media library (uploads, stock) and the assistant (free photos). */
export const MAX_PICTURE_BYTES = 8 * 1024 * 1024
export const MAX_KEPT_PICTURES = 300

/** The deck owner can still store another picture (uploads and stock photos count; deleted ones do not). */
export async function hasPictureRoom(ownerId: string): Promise<boolean> {
  const [held] = await db.select({ n: count() }).from(generatedAsset).where(and(eq(generatedAsset.userId, ownerId), eq(generatedAsset.kind, 'brand'), isNull(generatedAsset.deletedAt)))
  return (held?.n ?? 0) < MAX_KEPT_PICTURES
}
const STOCK_HOSTS = { unsplash: /^images\.unsplash\.com$/, pexels: /^images\.pexels\.com$/ } as const

export interface ImportedPhoto { assetId: string; url: string; mime: 'image/png' | 'image/jpeg'; aspect: number; alt: string; attribution: { source: string; license: string; url?: string } }

/** A stock photo is only ever fetched from its provider's own picture host (never an address a person typed). */
export const isStockHost = (provider: keyof typeof STOCK_HOSTS, imageUrl: string): boolean => {
  try { return STOCK_HOSTS[provider].test(new URL(imageUrl).hostname) } catch { return false }
}

/**
 * Copies one stock photo into OUR storage under the deck owner (a slide must keep working when the other site moves the file) and tells Unsplash it was used (their API terms).
 * Used by the Media library AND by the assistant, so both behave the same. Throws InvalidImageError / BrandReadError / BlockedUrlError for a picture that cannot be used; returns null when it cannot be downloaded.
 */
export async function importStockPhoto(ownerId: string, p: { provider: EditorStockPhoto['provider']; full: string; trackUrl?: string | undefined; alt: string; author: string; pageUrl?: string | undefined }): Promise<ImportedPhoto | null> {
  if (!isStockHost(p.provider, p.full)) return null
  const got = await fetchLimited(p.full, { accept: /^(image\/(png|jpe?g)|application\/octet-stream|binary\/octet-stream)$/, maxBytes: MAX_PICTURE_BYTES, timeoutMs: 15_000, headerAccept: 'image/jpeg,image/png,*/*;q=0.5' })
  if (!got) return null
  const { mime, aspect } = checkRaster(got.bytes, { maxBytes: MAX_PICTURE_BYTES, minSide: 16, maxAspect: 20 })
  const id = await storeAsset(ownerId, 'brand', got.bytes, mime, `${p.provider} photo by ${p.author || 'unknown'}`.slice(0, 200))
  void pingStockUse(p.trackUrl)
  const source = p.provider === 'unsplash' ? `Photo by ${p.author || 'an Unsplash photographer'} on Unsplash` : `Photo by ${p.author || 'a Pexels photographer'} on Pexels`
  return { assetId: id, url: assetUrl(id), mime, aspect, alt: p.alt, attribution: { source, license: p.provider === 'unsplash' ? 'Unsplash License' : 'Pexels License', ...(p.pageUrl ? { url: p.pageUrl } : {}) } }
}
