import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { assertSurface, CanvasUnsupportedError, type Surface } from './canvasSupport'
import { readPictureInfo } from './imageInfo'
import { detectEnv, effectiveLimits, megapixels, readOverrideMegapixels, type PixelLimits } from './limits'
import { MaskEditor } from './mask'
import { Renderer } from './renderer'
import { ProviderError, type ForegroundMask, type SegmentationProvider } from './types'
import { BgWorker } from './workerClient'

/** What the dialog works with once the mask exists. Everything in it is released by `dispose` when the dialog closes. */
export interface Session { editor: MaskEditor; renderer: Renderer; worker: BgWorker; image: Blob; width: number; height: number; limits: PixelLimits; /** the mask was refined against the picture's colours */ refined: boolean }
export type LoadState =
  | { kind: 'loading'; label: string }
  | { kind: 'ready' }
  | { kind: 'error'; message: string; canRetry: boolean }

const isAbort = (e: unknown) => (e instanceof DOMException && e.name === 'AbortError') || (e instanceof ProviderError && e.code === 'aborted')
const domCanvas = (w: number, h: number): Surface => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c as unknown as Surface }

/** The most pixels this device can edit with this provider (see limits.ts): never a fixed number. */
export const limitsFor = (provider: SegmentationProvider): PixelLimits => effectiveLimits({ env: detectEnv(), provider: provider.capabilities, overrideMegapixels: readOverrideMegapixels() })

/** The sentence shown when a picture is over the limit. The picture is untouched. */
export function tooLargeMessage(width: number, height: number, l: PixelLimits): string {
  const side = Math.max(width, height) > l.maxSide
  return `That picture is ${width} × ${height} pixels (${megapixels(width, height)} megapixels). On this device the editor works on pictures up to ${Math.floor(l.maxPixels / 1e6)} megapixels${side ? ` and ${l.maxSide} pixels on the longest side` : ''} (${l.why}). Your picture was not changed. Make a smaller copy and try again.`
}

/** A mask the provider gave back that cannot be right is refused here, before anything is built on it. */
export function checkMask(m: ForegroundMask): void {
  if (!(m.width > 0 && m.height > 0) || m.data.length !== m.width * m.height) throw new ProviderError('bad-output', 'The mask did not come back in a form I can use. Please try again.')
  let any = false
  for (let i = 0; i < m.data.length; i++) if (m.data[i]! > 8) { any = true; break }
  if (!any) throw new ProviderError('no-subject', 'I could not find a clear subject in that picture, so nothing was changed.')
}

/**
 * Loads one picture and its mask: the picture's own bytes (from our server), its size read from the file header and checked against what this device can edit BEFORE it is decoded,
 * a check that canvases that large really work here, the provider's mask, then the mask brought to the picture's size and improved by the worker. The provider is whatever
 * `SegmentationProvider` it is given; nothing here knows which. Cancelling, closing and retrying all stop the work and free what it made.
 */
export function useBackgroundRemoval(o: { deckId: string; url: string; provider: SegmentationProvider }) {
  const { deckId, url, provider } = o
  const [state, setState] = useState<LoadState>({ kind: 'loading', label: 'Loading the picture…' })
  const [session, setSession] = useState<Session | null>(null)
  const [attempt, setAttempt] = useState(0)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    abort.current = ac
    let worker: BgWorker | null = null
    let bitmap: ImageBitmap | null = null
    let renderer: Renderer | null = null
    let made: Session | null = null
    const fail = (message: string, canRetry = true) => { if (!ac.signal.aborted) setState({ kind: 'error', message, canRetry }) }
    ;(async () => {
      setSession(null)
      setState({ kind: 'loading', label: 'Loading the picture…' })
      const limits = limitsFor(provider)
      const image = await api.originalPicture(deckId, url, ac.signal)
      // what the file really is and how big, from its first bytes: nothing is decoded (and no memory spent) on a picture this device cannot edit
      const info = readPictureInfo(new Uint8Array(await image.slice(0, 262_144).arrayBuffer()))
      if (!info) return fail('Use a JPG, PNG or WebP picture.', false)
      if (info.width * info.height > limits.maxPixels || Math.max(info.width, info.height) > limits.maxSide) return fail(tooLargeMessage(info.width, info.height, limits), false)
      let bmp: ImageBitmap
      try { bmp = await createImageBitmap(image, { imageOrientation: 'from-image' }) } catch { return fail('That picture is damaged or in a format this browser cannot read.', false) }
      bitmap = bmp
      const { width, height } = bmp
      if (width * height > limits.maxPixels || Math.max(width, height) > limits.maxSide) return fail(tooLargeMessage(width, height, limits), false) // (a turned picture, or a header that lied)
      // canvases of this size fail quietly in some browsers: find out now, before the provider is asked (it may cost time or money)
      try { assertSurface(domCanvas, width, height) } catch (e) { return fail(e instanceof CanvasUnsupportedError ? e.message : 'This browser cannot work on a picture this large.', false) }
      ac.signal.throwIfAborted()
      worker = new BgWorker()
      // a picture that already has a transparent background (a cut-out made before) is refined from its own transparency: no provider is needed
      const t = await worker.transparency(image)
      ac.signal.throwIfAborted()
      if (t.alpha && t.opaque) {
        bmp.close(); bitmap = t.opaque
        let editor: MaskEditor
        try { editor = new MaskEditor(t.alpha, width, height); renderer = new Renderer(t.opaque, editor) } catch (e) { return fail(e instanceof CanvasUnsupportedError ? e.message : 'This picture needs more memory than this device can spare. Try a smaller picture.', false) }
        bitmap = null
        made = { editor, renderer, worker, image, width, height, limits, refined: false }
        setSession(made)
        setState({ kind: 'ready' })
        return
      }
      const progress = (p: { phase: string; fraction?: number }) => setState({ kind: 'loading', label: p.phase === 'loading-model' ? `Preparing the model${p.fraction != null ? ` (${Math.round(p.fraction * 100)}%)` : '…'}` : p.phase === 'segmenting' ? 'Finding the subject…' : p.phase === 'refining' ? 'Fitting the mask to your picture…' : 'Loading the picture…' })
      if (provider.warmUp) { setState({ kind: 'loading', label: 'Preparing…' }); await provider.warmUp({ signal: ac.signal, onProgress: progress }) }
      ac.signal.throwIfAborted()
      setState({ kind: 'loading', label: 'Finding the subject…' })
      const mask = await provider.segment({ image, width, height, source: { deckId, url } }, { signal: ac.signal, onProgress: progress })
      ac.signal.throwIfAborted()
      checkMask(mask)
      const nativeSide = Math.max(1, Math.min(provider.capabilities.nativeMaskSide, Math.max(mask.width, mask.height))) // (read before the buffer is handed to the worker)
      setState({ kind: 'loading', label: 'Fitting the mask to your picture…' })
      const prepared = await worker.prepare({ mask, image, width, height, nativeSide })
      ac.signal.throwIfAborted()
      let editor: MaskEditor
      try { editor = new MaskEditor(prepared.alpha, width, height); renderer = new Renderer(bmp, editor); renderer.setSubject(prepared.subject) } catch (e) { prepared.subject.close(); return fail(e instanceof CanvasUnsupportedError ? e.message : 'This picture needs more memory than this device can spare. Try a smaller picture.', false) }
      bitmap = null // the renderer owns it now
      made = { editor, renderer, worker, image, width, height, limits, refined: prepared.refined }
      setSession(made)
      setState({ kind: 'ready' })
    })().catch((e: unknown) => {
      if (ac.signal.aborted || isAbort(e)) return
      if (e instanceof ProviderError) return fail(e.message, e.retryable)
      if (e instanceof CanvasUnsupportedError) return fail(e.message, false)
      fail(e instanceof Error && e.message ? e.message : 'Removing the background did not work. Nothing was changed.')
    })
    return () => {
      ac.abort()
      made?.renderer.dispose()
      if (!made) { renderer?.dispose(); bitmap?.close() }
      worker?.dispose()
      provider.dispose?.()
      setSession(null)
    }
  }, [deckId, url, provider, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const cancel = useCallback(() => { abort.current?.abort(); setState({ kind: 'error', message: 'Cancelled. Nothing was changed.', canRetry: true }) }, [])
  return { state, session, retry, cancel }
}
