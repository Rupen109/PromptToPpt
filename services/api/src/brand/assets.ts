import { and, count, eq, isNull, ne, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db/index.ts'
import { brandKit, brandKitImage, generatedAsset, presentation, presentationVersion } from '../db/schema.ts'
import { env } from '../env.ts'
import { imageSize } from '../export/png.ts'
import { getStorage } from '../storage/index.ts'

const isPng = (b: Buffer) => b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG'
const isJpeg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8

export class InvalidImageError extends Error {}

/** A real PNG or JPEG of a usable size and shape (magic bytes decide, never the file name or declared type). */
export function checkRaster(bytes: Buffer, o: { maxBytes: number; minSide: number; maxAspect?: number }): { mime: 'image/png' | 'image/jpeg'; aspect: number } {
  if (bytes.length > o.maxBytes) throw new InvalidImageError(`That picture is larger than ${Math.round(o.maxBytes / 1024 / 1024)} MB.`)
  if (!isPng(bytes) && !isJpeg(bytes)) throw new InvalidImageError('Use a PNG or JPEG picture.')
  const size = imageSize(bytes)
  if (!size) throw new InvalidImageError('That picture could not be read.')
  if (size.w < o.minSide || size.h < o.minSide) throw new InvalidImageError(`That picture is too small (at least ${o.minSide}px on each side).`)
  const aspect = size.w / size.h
  const max = o.maxAspect ?? 6
  if (aspect > max || aspect < 1 / max) throw new InvalidImageError('That picture is too wide or too tall.')
  return { mime: isPng(bytes) ? 'image/png' : 'image/jpeg', aspect: Math.round(aspect * 1000) / 1000 }
}

export const assetUrl = (id: string) => `${env.API_URL}/api/v1/assets/${id}`
const ASSET_URL = /\/api\/v1\/assets\/([A-Za-z0-9_-]{32})$/
/** The asset id inside one of OUR asset URLs, or null for anything else. */
export function assetIdFromUrl(url: string): string | null {
  try { const u = new URL(url); return u.origin === new URL(env.API_URL).origin ? (ASSET_URL.exec(u.pathname)?.[1] ?? null) : null } catch { return null }
}

/** Saves picture bytes as one of the user's assets. kind: 'logo' (a company logo) or 'brand' (an extra brand picture); neither counts as an AI picture. */
export async function storeAsset(userId: string, kind: 'logo' | 'brand', bytes: Buffer, mime: 'image/png' | 'image/jpeg', label: string): Promise<string> {
  const id = nanoid(32)
  const key = `${nanoid(32)}.${mime === 'image/jpeg' ? 'jpg' : 'png'}`
  await (await getStorage()).put(key, new Uint8Array(bytes), mime)
  await db.insert(generatedAsset).values({ id, userId, kind, status: 'ready', provider: 'brand', model: kind === 'logo' ? 'website-or-upload' : 'upload', prompt: label.slice(0, 500), mime, bytes: bytes.length, storageKey: key })
  return id
}

/** One of the user's own live assets of the given kinds (null when it is someone else's, deleted, or the wrong kind). */
export async function ownedAsset(userId: string, assetId: string, kinds: string[]) {
  const [row] = await db.select().from(generatedAsset).where(and(eq(generatedAsset.id, assetId), eq(generatedAsset.userId, userId), eq(generatedAsset.status, 'ready'), isNull(generatedAsset.deletedAt)))
  return row && kinds.includes(row.kind) ? row : null
}

/**
 * Removes one of the person's assets — unless something still shows it: a slide in any of their decks (any saved version, so undo and
 * restore keep working) or another brand kit. Deleting a kit used to delete the logo file under every deck that had applied it, which left
 * those decks with a broken image. `ignoreKitId` = the kit being changed (it still points at the asset while we decide).
 */
export async function deleteAsset(userId: string, assetId: string, ignoreKitId?: string): Promise<boolean> {
  const needle = `%${assetId}%`
  const [inDeck] = await db.select({ n: sql<number>`1` }).from(presentationVersion).innerJoin(presentation, eq(presentation.id, presentationVersion.presentationId))
    .where(and(eq(presentation.userId, userId), sql`${presentationVersion.document}::text like ${needle}`)).limit(1)
  if (inDeck) return false
  const otherKit = ignoreKitId ? ne(brandKit.id, ignoreKitId) : sql`true`
  const [inKit] = await db.select({ n: sql<number>`1` }).from(brandKit).where(and(eq(brandKit.userId, userId), eq(brandKit.logoAssetId, assetId), otherKit)).limit(1)
  const otherImg = ignoreKitId ? ne(brandKitImage.kitId, ignoreKitId) : sql`true`
  const [inImg] = inKit ? [inKit] : await db.select({ n: sql<number>`1` }).from(brandKitImage).where(and(eq(brandKitImage.assetId, assetId), otherImg)).limit(1)
  if (inKit || inImg) return false
  await db.update(generatedAsset).set({ deletedAt: new Date() }).where(and(eq(generatedAsset.id, assetId), eq(generatedAsset.userId, userId)))
  return true
}

/** Most logos a person can keep from website lookups; past this the lookup still returns colours and fonts, just no stored logo. */
export const MAX_LOGO_ASSETS = 100

/**
 * Saves a logo read from a website. Looking up the same site again reuses the logo already stored for it (same address, same size),
 * so repeated lookups do not pile up files. Returns null when the person is at the limit.
 */
export async function storeWebsiteLogo(userId: string, bytes: Buffer, mime: 'image/png' | 'image/jpeg', sourceUrl: string): Promise<string | null> {
  const mine = and(eq(generatedAsset.userId, userId), eq(generatedAsset.kind, 'logo'), eq(generatedAsset.status, 'ready'), isNull(generatedAsset.deletedAt))
  const [same] = await db.select({ id: generatedAsset.id }).from(generatedAsset).where(and(mine, eq(generatedAsset.prompt, sourceUrl.slice(0, 500)), eq(generatedAsset.bytes, bytes.length), eq(generatedAsset.mime, mime))).limit(1)
  if (same) return same.id
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(generatedAsset).where(mine)
  if (n >= MAX_LOGO_ASSETS) return null
  return storeAsset(userId, 'logo', bytes, mime, sourceUrl)
}
