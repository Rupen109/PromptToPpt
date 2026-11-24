import type { ForegroundMask, SegmentationProvider } from '../types'
import { ProviderError } from '../types'

/**
 * DEVELOPMENT AND TESTS ONLY. A stand-in for a model with a deterministic result, so the editor and its tests need no model, no server and no cost: the subject is an ellipse in the
 * middle of the picture with a soft edge (a smooth ramp, like a real matte, not a hard cut). It has no approval record and is registered only in development builds
 * (providers/index.ts), so it can never be selected as a production provider.
 *
 * `maskSide` is the mask's own (smaller) side so the picture-size step is exercised like with a real model; `fail` makes it fail the way a real provider would (typed errors).
 */
export interface MockOptions { id?: string; maskSide?: number; delayMs?: number; fail?: 'no-subject' | 'busy' | 'network' | null }

export function mockMask(width: number, height: number, side = 256): ForegroundMask {
  const k = Math.min(1, side / Math.max(width, height))
  const w = Math.max(2, Math.round(width * k)), h = Math.max(2, Math.round(height * k))
  const data = new Uint8Array(w * h)
  const rx = w * 0.32, ry = h * 0.36, band = Math.max(1.5, Math.min(w, h) * 0.03)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot((x + 0.5 - w / 2) / rx, (y + 0.5 - h / 2) / ry) // 1 on the ellipse
    const edge = (1 - d) * Math.min(rx, ry) / band // signed distance in "bands", positive inside
    data[y * w + x] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + edge / 2)))
  }
  return { width: w, height: h, data }
}

export function createMockProvider(o: MockOptions = {}): SegmentationProvider {
  return {
    id: o.id ?? 'mock',
    label: 'Mock provider (development only)',
    capabilities: { kind: 'mock', maxInputPixels: 100_000_000, maxInputSide: 20_000, imageLeavesDevice: false, nativeMaskSide: o.maskSide ?? 256, maskKind: 'matte' },
    async segment(input, opts = {}) {
      opts.onProgress?.({ phase: 'segmenting' })
      if (o.delayMs) await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, o.delayMs)
        opts.signal?.addEventListener('abort', () => { clearTimeout(t); reject(new ProviderError('aborted', 'Cancelled.')) }, { once: true })
      })
      if (opts.signal?.aborted) throw new ProviderError('aborted', 'Cancelled.')
      if (o.fail === 'no-subject') throw new ProviderError('no-subject', 'I could not find a clear subject in that picture, so nothing was changed.')
      if (o.fail === 'busy') throw new ProviderError('busy', 'Many pictures are being worked on right now. Try again in a moment.')
      if (o.fail === 'network') throw new ProviderError('network', 'The connection was lost. Check it and try again.')
      return mockMask(input.width, input.height, o.maskSide ?? 256)
    },
  }
}
