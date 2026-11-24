/**
 * The queue in front of the segmentation model. The model is big and the machine is small, so:
 *  - at most `slots` jobs run at once, where slots = floor(memory budget / memory one job needs), never less than 1 (the budget is a setting, see env CUTOUT_MEMORY_BUDGET_MB);
 *  - a job that is still waiting is dropped when its caller goes away (it never starts);
 *  - a running job is told to stop (AbortSignal) when the caller goes away or the time limit passes, and **its slot is released only when the work has really stopped**: a timeout
 *    must never free the slot while the model is still using the memory (the old queue did exactly that and could run two inferences at once);
 *  - the caller is told at once (timeout / cancelled); only the slot waits for the work to end.
 * An engine that cannot be interrupted keeps its slot until it finishes, which is the correct (safe) behaviour; the production engine runs in a child process that can be killed.
 */

/** A sentence a person can act on (kept free of other modules so the queue stays testable on its own). */
export class QueueError extends Error {
  constructor(message: string, readonly kind: 'busy' | 'timeout' | 'cancelled') { super(message) }
}

export interface QueueOptions {
  /** how many jobs may run at once */
  slots: number
  /** jobs allowed to wait (not counting the running ones); more than that is refused as busy */
  maxWaiting: number
}

interface Waiter { start: (slot: number) => void }

export class InferenceQueue {
  private readonly free: number[]
  private readonly waiting: Waiter[] = []
  constructor(private readonly o: QueueOptions) {
    this.free = Array.from({ length: Math.max(1, o.slots) }, (_, i) => i)
  }

  get running() { return Math.max(1, this.o.slots) - this.free.length }
  get queued() { return this.waiting.length }

  /**
   * Runs `job` when a slot is free. `job` must stop and settle promptly when its signal aborts (it receives the slot number, so a per-slot engine can be used).
   * Rejects with QueueError('busy') when too many are already waiting, QueueError('cancelled') when `signal` aborts, QueueError('timeout') when `timeoutMs` passes while running.
   */
  run<T>(job: (signal: AbortSignal, slot: number) => Promise<T>, o: { signal?: AbortSignal | undefined; timeoutMs: number; timeoutMessage?: string }): Promise<T> {
    if (o.signal?.aborted) return Promise.reject(new QueueError('Cancelled.', 'cancelled'))
    if (this.free.length === 0 && this.waiting.length >= this.o.maxWaiting) return Promise.reject(new QueueError('Many pictures are being worked on right now. Try again in a moment.', 'busy'))
    return new Promise<T>((resolve, reject) => {
      let settled = false
      const finish = (fn: () => void) => { if (!settled) { settled = true; fn() } }
      const ac = new AbortController()
      let timer: ReturnType<typeof setTimeout> | undefined

      const onCallerAbort = () => {
        const i = this.waiting.indexOf(waiter)
        if (i >= 0) this.waiting.splice(i, 1) // still waiting: it never starts
        finish(() => reject(new QueueError('Cancelled.', 'cancelled')))
        ac.abort(new QueueError('Cancelled.', 'cancelled')) // running: stop the work (the slot is released when it has stopped)
      }
      const waiter: Waiter = {
        start: (s) => {
          if (settled) { this.release(s); return }
          timer = setTimeout(() => {
            finish(() => reject(new QueueError(o.timeoutMessage ?? 'Removing the background took too long. Try a smaller picture.', 'timeout')))
            ac.abort(new QueueError('Timed out.', 'timeout'))
          }, o.timeoutMs)
          timer.unref?.()
          let work: Promise<T>
          try { work = job(ac.signal, s) } catch (e) { work = Promise.reject(e) }
          // the slot is handed back only when the work itself has ended, whatever the caller was told
          work.then((v) => finish(() => resolve(v)), (e) => finish(() => reject(e)))
            .finally(() => { if (timer) clearTimeout(timer); o.signal?.removeEventListener('abort', onCallerAbort); this.release(s) })
        },
      }
      o.signal?.addEventListener('abort', onCallerAbort, { once: true })
      const s = this.free.shift()
      if (s !== undefined) waiter.start(s)
      else this.waiting.push(waiter)
    })
  }

  private release(slot: number) {
    const next = this.waiting.shift()
    if (next) next.start(slot)
    else this.free.push(slot)
  }
}
