import sharp from 'sharp'
import { CutoutError } from './cutout.ts'
import type { CutoutResult } from './cutout.ts'

const ENDPOINT = 'https://sdk.photoroom.com/v1/segment'
/** Photoroom takes at most 6,000 px on the widest side and 50 MB */
const MAX_SIDE = 6000

/**
 * The picture with its background removed by Photoroom's Remove Background API (one call, $0.02 on the Basic plan), as a PNG already cropped to the subject. The picture is sent to Photoroom:
 * that is stated in the product's privacy text. Every failure becomes a sentence a person can act on; a result without transparency is judged by the caller, like any provider's.
 */
export async function photoroomRemoveBackground(input: Uint8Array, apiKey: string, o: { signal?: AbortSignal | undefined; fetchFn?: typeof fetch } = {}): Promise<CutoutResult> {
  // one upload format for everything: a PNG no larger than the service takes
  const meta = await sharp(input, { limitInputPixels: 300_000_000 }).metadata()
  let send = sharp(input, { limitInputPixels: 300_000_000 }).rotate()
  if (Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_SIDE) send = send.resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside' })
  const upload = await send.png().toBuffer()
  const form = new FormData()
  form.append('image_file', new Blob([new Uint8Array(upload)], { type: 'image/png' }), 'picture.png')
  form.append('format', 'png')
  form.append('crop', 'true')
  const signal = o.signal ? AbortSignal.any([o.signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000)
  let res: Response
  try { res = await (o.fetchFn ?? fetch)(ENDPOINT, { method: 'POST', headers: { 'x-api-key': apiKey }, body: form, signal }) } catch (e) {
    if (o.signal?.aborted) throw e
    throw new CutoutError('The background removal service did not answer. Nothing was changed; please try again in a moment.')
  }
  if (res.status === 401 || res.status === 403) { console.error('[photoroom] the key was refused', res.status); throw new CutoutError('Background removal is not available right now, so nothing was changed.') }
  if (res.status === 402 || res.status === 429) { console.error('[photoroom] quota or rate limit', res.status); throw new CutoutError('Background removal is busy right now, so nothing was changed. Please try again in a few minutes.') }
  if (!res.ok) { console.error('[photoroom] failed', res.status); throw new CutoutError('The background removal service could not process this picture, so nothing was changed.') }
  const png = Buffer.from(await res.arrayBuffer())
  let out
  try { out = await sharp(png).ensureAlpha().png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true }) } catch { throw new CutoutError('The background removal service sent back something that is not a picture, so nothing was changed.') }
  return { png: out.data, width: out.info.width, height: out.info.height }
}
