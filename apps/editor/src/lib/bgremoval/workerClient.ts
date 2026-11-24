import { CanvasUnsupportedError } from './canvasSupport'
import type { BackgroundSpec, ForegroundMask } from './types'
import type { EditOp, WorkerRequest, WorkerResponse } from './worker'

type Without<T> = T extends unknown ? Omit<T, 'id'> : never
type Pending = { resolve: (r: Extract<WorkerResponse, { ok: true }>) => void; reject: (e: Error) => void }

/** The dialog's one worker: asks it to prepare a mask, edit it, clean the colours or make the final PNG. `dispose()` ends it (and anything it was doing). */
export class BgWorker {
  private worker: Worker | null = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  private next = 1
  private pending = new Map<number, Pending>()

  constructor() {
    this.worker!.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const p = this.pending.get(ev.data.id)
      if (!p) return
      this.pending.delete(ev.data.id)
      if (ev.data.ok) p.resolve(ev.data)
      else p.reject(ev.data.canvas ? new CanvasUnsupportedError(ev.data.error) : new Error(ev.data.error))
    }
    this.worker!.onerror = () => this.failAll(new Error('The picture could not be processed in this browser.'))
  }

  private call(req: Without<WorkerRequest>, transfer: Transferable[] = []): Promise<Extract<WorkerResponse, { ok: true }>> {
    const w = this.worker
    if (!w) return Promise.reject(new Error('The editor was closed.'))
    const id = this.next++
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); w.postMessage({ ...req, id } as WorkerRequest, transfer) })
  }

  /**
   * The provider's mask at the picture's own size and improved there (matte refinement when the mask was enlarged a lot, smooth normalisation), plus the cleaned subject colours for the
   * preview. The mask's buffer is handed over (not copied). `nativeSide` is how large the provider's mask really is.
   */
  async prepare(o: { mask: ForegroundMask; image: Blob; width: number; height: number; nativeSide: number; refine?: boolean }): Promise<{ alpha: Uint8Array; subject: ImageBitmap; refined: boolean }> {
    const r = await this.call({ op: 'prepare', mask: o.mask, image: o.image, width: o.width, height: o.height, nativeSide: o.nativeSide, refine: o.refine ?? true }, [o.mask.data.buffer])
    return { alpha: r.data!, subject: r.subject!, refined: !!r.refined }
  }

  /** Feather or expand/contract a mask (a copy is worked on; the editor keeps its own). */
  async edit(alpha: Uint8Array, width: number, height: number, edit: EditOp): Promise<Uint8Array> {
    const copy = Uint8Array.from(alpha)
    const r = await this.call({ op: 'edit', alpha: copy, width, height, edit }, [copy.buffer])
    return r.data!
  }

  /** The cleaned subject colours for a mask (for the preview). */
  async clean(image: Blob, alpha: Uint8Array, width: number, height: number): Promise<ImageBitmap> {
    const copy = Uint8Array.from(alpha)
    return (await this.call({ op: 'clean', image, alpha: copy, width, height }, [copy.buffer])).subject!
  }

  /** Whether the picture already has a transparent background; if so its own alpha (the first mask) and the picture with that transparency taken out. */
  async transparency(image: Blob): Promise<{ share: number; alpha?: Uint8Array; opaque?: ImageBitmap }> {
    const r = await this.call({ op: 'transparency', image })
    return { share: r.share ?? 0, ...(r.data ? { alpha: r.data } : {}), ...(r.opaque ? { opaque: r.opaque } : {}) }
  }

  /** The finished PNG. `alpha` is copied for the worker so the editor keeps working on its own mask. `scale` below 1 makes a smaller picture (only for placing on a slide within the upload limit). */
  async exportPng(o: { image: Blob; alpha: Uint8Array; width: number; height: number; background: BackgroundSpec; backgroundImage?: Blob | undefined; scale?: number }): Promise<{ blob: Blob; width: number; height: number }> {
    const alpha = Uint8Array.from(o.alpha)
    const r = await this.call({ op: 'export', image: o.image, alpha, width: o.width, height: o.height, background: o.background, backgroundImage: o.backgroundImage, scale: o.scale ?? 1 }, [alpha.buffer])
    return { blob: r.blob!, width: r.width!, height: r.height! }
  }

  private failAll(e: Error) { for (const p of this.pending.values()) p.reject(e); this.pending.clear() }
  dispose() { this.failAll(new Error('The editor was closed.')); this.worker?.terminate(); this.worker = null }
}
