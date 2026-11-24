import { ApiError } from '@prompttoppt/api-client'
import { api } from '@/lib/api'
import { ProviderError, type ForegroundMask, type SegmentationProvider } from '../types'

/**
 * DEVELOPMENT ONLY. Asks our own server's model for the mask (POST .../images/cutout-mask) and reads the grey-scale PNG it returns. It has NO approval record and is registered only in
 * development builds (providers/index.ts); the server refuses it unless a provider may run there (media/bg-providers.ts), which in production none may.
 */
export const serverProvider: SegmentationProvider = {
  id: 'server-dev',
  label: 'Our server model (development only)',
  // the server shrinks a picture to 2048 px before the model, and the model itself sees 1024 x 1024
  capabilities: { kind: 'self-hosted', maxInputPixels: 50_000_000, maxInputSide: 10_000, imageLeavesDevice: true, nativeMaskSide: 1024, maskKind: 'matte' },
  async segment(input, opts = {}) {
    const src = input.source
    if (!src) throw new ProviderError('unsupported', 'This picture is not stored on the server, so it cannot be sent for background removal.')
    opts.onProgress?.({ phase: 'segmenting' })
    let blob: Blob
    try { blob = (await api.cutoutMask(src.deckId, src.url, opts.signal)).blob } catch (e) { throw asProviderError(e, opts.signal) }
    opts.signal?.throwIfAborted()
    opts.onProgress?.({ phase: 'refining' })
    try { return await readGreyPng(blob) } catch { throw new ProviderError('bad-output', 'The mask the server made could not be read. Please try again.') }
  },
}

/** What the server (or the network) said, as something the editor can act on. */
export function asProviderError(e: unknown, signal?: AbortSignal): ProviderError {
  if (e instanceof ProviderError) return e
  if (signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) return new ProviderError('aborted', 'Cancelled.')
  if (e instanceof ApiError) {
    if (e.code === 'BUSY') return new ProviderError('busy', e.message)
    if (e.code === 'CANCELLED') return new ProviderError('aborted', e.message)
    if (e.code === 'NOT_A_PICTURE' || e.code === 'UNSUPPORTED_FORMAT') return new ProviderError('unsupported', e.message, false)
    if (e.code === 'CUTOUT_FAILED') return new ProviderError(/clear subject/i.test(e.message) ? 'no-subject' : 'unsupported', e.message, false)
    if (e.code === 'FEATURE_DISABLED') return new ProviderError('unavailable', e.message, false)
    if (e.status === 429) return new ProviderError('quota', e.message, false)
    return new ProviderError('unavailable', e.message)
  }
  return new ProviderError('network', 'The connection was lost. Check it and try again.')
}

/** The values of a grey-scale PNG (the red channel of whatever it decodes to). */
async function readGreyPng(blob: Blob): Promise<ForegroundMask> {
  const bmp = await createImageBitmap(blob)
  try {
    const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height
    const c = cv.getContext('2d', { willReadFrequently: true })!
    c.drawImage(bmp, 0, 0)
    const px = c.getImageData(0, 0, bmp.width, bmp.height).data
    const data = new Uint8Array(bmp.width * bmp.height)
    for (let i = 0; i < data.length; i++) data[i] = px[i * 4]!
    cv.width = 0; cv.height = 0
    return { width: bmp.width, height: bmp.height, data }
  } finally { bmp.close() }
}
