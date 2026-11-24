import sharp from 'sharp'
import { safeFetch } from '../sources/ssrf.ts'
import { pictureBytes } from './cutout-picture.ts'

/** the free photos our decks link to (Unsplash's own picture host); the only outside pictures the assistant reads, and only through safeFetch */
const PHOTO_HOST = 'images.unsplash.com'
const MAX_PHOTO_BYTES = 15 * 1024 * 1024
export async function freePhotoBytes(url: string): Promise<Uint8Array | null> {
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (u.protocol !== 'https:' || u.host !== PHOTO_HOST || u.username || u.password || u.port) return null
  u.searchParams.set('w', '1600') // (Unsplash serves a smaller copy: the shape is the same)
  try {
    const r = await safeFetch(u.toString(), { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
    if (!r.ok || Number(r.headers.get('content-length') ?? 0) > MAX_PHOTO_BYTES) return null
    const b = new Uint8Array(await r.arrayBuffer())
    return b.length > 0 && b.length <= MAX_PHOTO_BYTES ? b : null
  } catch { return null }
}

/** one of the deck's pictures: the owner's STORED pictures, our template pictures, or a free photo from Unsplash (never any other address): its bytes and its own shape, read by sharp; for the vision step a copy at most 1024 px wide is enough (the box is a fraction) */
export async function storedPicture(ownerId: string, url: string): Promise<{ aspect: number; bytes: Uint8Array; mime: string } | null> {
  const bytes = (await pictureBytes(ownerId, url)) ?? (await freePhotoBytes(url))
  if (!bytes) return null
  try {
    const img = sharp(bytes, { failOn: 'none' }).rotate()
    const meta = await img.metadata()
    const w = meta.autoOrient?.width ?? meta.width, h = meta.autoOrient?.height ?? meta.height
    if (!w || !h) return null
    const small = await img.resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
    return { aspect: w / h, bytes: new Uint8Array(small), mime: 'image/jpeg' }
  } catch { return null }
}
