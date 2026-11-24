import { fork, type ChildProcess } from 'node:child_process'

/** What the model does: one 0-255 value per pixel (255 = the subject) for an RGB picture of the given size. `signal` aborting must stop the work and settle the promise. */
export interface CutoutEngine { mask(rgb: Uint8Array, width: number, height: number, signal?: AbortSignal): Promise<Uint8Array> }

/** Same file next to the one that imports this, in source (cutout-child.ts) and in the bundle (dist/cutout-child.js). */
const DEFAULT_SCRIPT = new URL(import.meta.url.endsWith('.ts') ? './cutout-child.ts' : './cutout-child.js', import.meta.url)

export interface ChildEngineOptions {
  /** the child's entry point (tests give a stand-in) */
  script?: URL
  /** the child is stopped after this long without work, so its memory is given back (0 = never) */
  idleMs?: number
}

/**
 * Runs the model in a child process and owns its life: one job at a time, started when first needed, killed on abort (so the work really stops and the memory really comes back),
 * restarted by the next job, and retired when idle. The cost of a kill is that the next picture loads the model again.
 */
export class ChildProcessEngine implements CutoutEngine {
  private child: ChildProcess | null = null
  private ready: Promise<ChildProcess> | null = null
  private idle: ReturnType<typeof setTimeout> | undefined
  private nextId = 1
  private readonly script: URL
  private readonly idleMs: number

  constructor(o: ChildEngineOptions = {}) {
    this.script = o.script ?? DEFAULT_SCRIPT
    this.idleMs = o.idleMs ?? Number(process.env['CUTOUT_IDLE_MS'] ?? 300_000)
  }

  /** Whether a child process exists right now (tests and diagnostics). */
  get alive() { return !!this.child && this.child.exitCode === null && !this.child.killed }
  get pid() { return this.child?.pid }

  private start(): Promise<ChildProcess> {
    if (this.ready && this.alive) return this.ready
    const child = fork(this.script, [], { serialization: 'advanced', stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
    this.child = child
    const ready = new Promise<ChildProcess>((resolve, reject) => {
      const onMsg = (m: { ready?: boolean }) => { if (m?.ready) { child.off('message', onMsg); resolve(child) } }
      child.on('message', onMsg)
      child.once('exit', () => reject(new Error('The background removal process stopped.')))
      child.once('error', reject)
    })
    child.once('exit', () => { if (this.child === child) { this.child = null; this.ready = null } })
    ready.catch(() => undefined)
    this.ready = ready
    return ready
  }

  /** Stops the child now and resolves when it is gone. */
  async kill(): Promise<void> {
    clearTimeout(this.idle)
    const c = this.child
    this.child = null; this.ready = null
    if (!c || c.exitCode !== null) return
    await new Promise<void>((resolve) => { c.once('exit', () => resolve()); c.kill('SIGKILL') })
  }

  async mask(rgb: Uint8Array, width: number, height: number, signal?: AbortSignal): Promise<Uint8Array> {
    clearTimeout(this.idle)
    try {
      signal?.throwIfAborted()
      const child = await this.start()
      signal?.throwIfAborted() // (gone while the child was starting: nothing was sent, the child stays for the next picture and is retired when idle)
      const id = this.nextId++
      return await new Promise<Uint8Array>((resolve, reject) => {
        const cleanup = () => { child.off('message', onMsg); child.off('exit', onExit); signal?.removeEventListener('abort', onAbort) }
        const onMsg = (m: { id?: number; mask?: Uint8Array; error?: string }) => {
          if (m?.id !== id) return
          cleanup()
          if (m.error !== undefined) reject(new Error(m.error)); else resolve(m.mask!)
        }
        const onExit = () => { cleanup(); reject(new Error('The background removal process stopped.')) }
        // stopping is real: the process is killed, and this promise settles only once it is gone (so the queue slot is not freed while memory is still in use)
        const onAbort = () => { cleanup(); void this.kill().then(() => reject(signal!.reason ?? new DOMException('Aborted', 'AbortError'))) }
        child.on('message', onMsg); child.once('exit', onExit)
        signal?.addEventListener('abort', onAbort, { once: true })
        child.send({ id, rgb, width, height }, (err) => { if (err) { cleanup(); reject(err) } })
      })
    } finally {
      // whatever happened (answered, failed, aborted before it started), a child that is still there is retired after the idle time: nothing is left running for ever
      if (this.alive && this.idleMs > 0) { clearTimeout(this.idle); this.idle = setTimeout(() => void this.kill(), this.idleMs); this.idle.unref() }
    }
  }
}
