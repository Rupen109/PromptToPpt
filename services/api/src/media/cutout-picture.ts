import { and, eq, isNull } from 'drizzle-orm'
import { assetIdFromUrl, assetUrl, storeAsset } from '../brand/assets.ts'
import { db } from '../db/index.ts'
import { generatedAsset } from '../db/schema.ts'
import { env } from '../env.ts'
import { MAX_PICTURE_BYTES } from '../pictures/stock-import.ts'
import { getStorage } from '../storage/index.ts'
import { CutoutBusyError, CutoutError, maskToPng, removeBackground, segmentForeground, transparentShareOfPng } from './cutout.ts'
import { MIME, sniffPicture } from './image-format.ts'
import { activeBackgroundProvider } from './bg-providers.ts'
import { photoroomRemoveBackground } from './photoroom.ts'

export { CutoutBusyError }

/** The bytes of a picture of this owner: one of their own stored pictures, or a picture that ships with a template (served by our website). Anything else is refused (null). */
export async function pictureBytes(ownerId: string, url: string): Promise<Uint8Array | null> {
  const id = assetIdFromUrl(url)
  if (id) {
    const [row] = await db.select().from(generatedAsset).where(and(eq(generatedAsset.id, id), eq(generatedAsset.userId, ownerId), eq(generatedAsset.status, 'ready'), isNull(generatedAsset.deletedAt)))
    return row ? await (await getStorage()).get(row.storageKey) : null
  }
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (u.origin !== new URL(env.WEB_URL).origin || !/^\/(morph-templates|template-assets)\/[A-Za-z0-9._-]+$/.test(u.pathname)) return null
  const r = await fetch(`${u.origin}${u.pathname}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null)
  if (!r?.ok || Number(r.headers.get('content-length') ?? 0) > MAX_PICTURE_BYTES) return null
  const b = new Uint8Array(await r.arrayBuffer())
  return b.length > 0 && b.length <= MAX_PICTURE_BYTES ? b : null
}

/** the least see-through share (2%) a result needs to count as a cut-out */
export const MIN_TRANSPARENT_SHARE = 0.02
const NOT_YOURS = 'I can only remove the background of one of your own pictures. Add it with "Upload" or from the Media library first.'
const NOT_SUPPORTED = 'That picture is not a PNG, JPEG or WebP picture, so I cannot work on it.'

/** The owner's picture bytes, checked to be a PNG, JPEG or WebP by their first bytes. */
async function checkedBytes(ownerId: string, url: string): Promise<Uint8Array> {
  const bytes = await pictureBytes(ownerId, url)
  if (!bytes) throw new CutoutError(NOT_YOURS)
  if (!sniffPicture(bytes)) throw new CutoutError(NOT_SUPPORTED)
  return bytes
}

/** Cuts the background out of one of the owner's pictures and keeps the result as a new picture of theirs (the original stays). Throws CutoutError (a person can act on it), CutoutBusyError, CutoutCancelledError, or the model's own error. `signal` stops the work when the person goes away. */
export async function cutOutPicture(ownerId: string, url: string, o: { signal?: AbortSignal | undefined } = {}): Promise<{ assetId: string; url: string; mime: 'image/png'; aspect: number; name: string; width: number; height: number; transparentShare: number }> {
  const bytes = await checkedBytes(ownerId, url)
  // the provider that is allowed to run (production: the approved one; development: the chosen one, default our own model)
  const provider = activeBackgroundProvider(env.NODE_ENV, env.BACKGROUND_REMOVAL_PROVIDER)
  const { png, width, height } = provider === 'photoroom' ? await photoroomRemoveBackground(bytes, env.PHOTOROOM_API_KEY!, o) : await removeBackground(bytes, o)
  const transparentShare = await transparentShareOfPng(png)
  // a result without a transparent background is not a cut-out: it is never stored or offered
  if (transparentShare < MIN_TRANSPARENT_SHARE) throw new CutoutError('This picture has hardly any background to remove, so nothing was changed.')
  const name = 'Picture without background'
  const assetId = await storeAsset(ownerId, 'brand', Buffer.from(png), 'image/png', name)
  return { assetId, url: assetUrl(assetId), mime: 'image/png', aspect: Math.round((width / height) * 1000) / 1000, name, width, height, transparentShare }
}

/** The model's foreground mask of one of the owner's pictures as a grey-scale PNG (nothing is stored): what the editor's background removal dialog edits. */
export async function maskOfPicture(ownerId: string, url: string, o: { signal?: AbortSignal | undefined } = {}): Promise<{ png: Buffer; width: number; height: number }> {
  const bytes = await checkedBytes(ownerId, url)
  const m = await segmentForeground(bytes, o)
  return { png: await maskToPng(m), width: m.width, height: m.height }
}

/** The owner's picture exactly as stored, for the editor (any provider needs the bytes; it never needs the removal feature). Throws CutoutError for what a person can fix. */
export async function originalOfPicture(ownerId: string, url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const bytes = await pictureBytes(ownerId, url)
  if (!bytes) throw new CutoutError('I can only open one of your own pictures here. Add it with "Upload" or from the Media library first.')
  const format = sniffPicture(bytes)
  if (!format) throw new CutoutError(NOT_SUPPORTED)
  return { bytes, mime: MIME[format] }
}

/** How see-through one of the owner's STORED pictures is, read from its bytes (used when credits are settled: the file that is really there, not what was reported). Null when it cannot be read. */
export async function transparentShareOfStored(ownerId: string, url: string): Promise<number | null> {
  const bytes = await pictureBytes(ownerId, url)
  if (!bytes) return null
  try { return await transparentShareOfPng(bytes) } catch { return null }
}
