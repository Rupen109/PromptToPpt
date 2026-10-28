import { Worker } from 'node:worker_threads'
import { env } from '../env.ts'
import { SourceError } from './errors.ts'
import { fromFile, type Extracted, type FileKind } from './extract.ts'

/**
 * Reads uploaded files OFF the main thread. Each job runs in a worker with a memory limit and a time limit; at most poolConfig.concurrency run at once,
 * poolConfig.queue more wait their turn, and anything beyond that is answered "busy, try again" at once instead of piling memory up. A file that crashes,
 * runs out of memory or runs too long ends only its own worker — the API and every other person's request carry on. (Before this, reading a heavy file
 * blocked the whole server for seconds and held hundreds of MB.)
 *
 * Starting a worker costs ~100 ms (it loads every reader), so a worker that finished a QUICK job stays warm for the next one; any worker that did slow or
 * heavy work, refused a file, timed out, ran out of memory or sat idle for 30 s is terminated, so memory a hostile file took never lingers.
 */
export class BusyError extends Error {}

export interface Parsed { kind: FileKind; extracted: Extracted }
const WORKER_URL = new URL(import.meta.url.endsWith('.ts') ? './parse-worker.ts' : './parse-worker.js', import.meta.url)

/** the limits in force (read from the environment at start; tests change them) */
export const poolConfig = { concurrency: env.SOURCE_PARSE_CONCURRENCY, queue: env.SOURCE_PARSE_QUEUE, timeoutMs: env.SOURCE_PARSE_TIMEOUT_MS, heapMb: env.SOURCE_PARSE_HEAP_MB }
export const parseStats = { started: 0, reused: 0, ok: 0, refused: 0, timedOut: 0, outOfMemory: 0, crashed: 0, busy: 0, peakWaiting: 0 }

const QUICK_MS = 100 // a job faster than this leaves the worker clean enough to reuse
const MAX_REUSES = 40
const IDLE_MS = 30_000
const MAX_WAIT_MS = 30_000

interface Job { bytes: Uint8Array; filename: string; resolve: (p: Parsed) => void; reject: (e: unknown) => void; waitTimer?: NodeJS.Timeout }
interface Slot { worker: Worker; jobs: number; idleTimer?: NodeJS.Timeout; heapMb: number }
let active = 0
let nextId = 0
const waiting: Job[] = []
const idle: Slot[] = []
export const poolState = () => ({ active, waiting: waiting.length, idle: idle.length })

const spawn = (): Slot => {
  parseStats.started++
  const worker = new Worker(WORKER_URL, { resourceLimits: { maxOldGenerationSizeMb: poolConfig.heapMb, maxYoungGenerationSizeMb: 64, stackSizeMb: 4 } })
  worker.unref() // an idle worker must never keep the process alive
  return { worker, jobs: 0, heapMb: poolConfig.heapMb }
}
const takeSlot = (): Slot => {
  while (idle.length) { const s = idle.pop()!; if (s.idleTimer) clearTimeout(s.idleTimer); if (s.heapMb === poolConfig.heapMb) { parseStats.reused++; return s } void s.worker.terminate() }
  return spawn()
}
const park = (s: Slot) => {
  s.idleTimer = setTimeout(() => { const i = idle.indexOf(s); if (i >= 0) idle.splice(i, 1); void s.worker.terminate() }, IDLE_MS); s.idleTimer.unref()
  idle.push(s)
}

function runJob(job: Job) {
  active++
  const slot = takeSlot(); const { worker } = slot; const id = ++nextId
  let done = false
  const cleanup = () => { clearTimeout(timer); worker.off('message', onMessage); worker.off('error', onError); worker.off('exit', onExit) }
  const finish = (reuse: boolean, fn: () => void) => { if (done) return; done = true; cleanup(); active--; if (reuse && slot.jobs < MAX_REUSES) park(slot); else void worker.terminate(); fn(); next() }
  const timer = setTimeout(() => finish(false, () => { parseStats.timedOut++; console.warn(`[sources] reading "${job.filename.slice(0, 60)}" stopped after ${poolConfig.timeoutMs} ms`); job.reject(new SourceError('That file took too long to read. Try a smaller file, or save just the part you need.')) }), poolConfig.timeoutMs)
  const onMessage = (m: { id: number; took: number; ok: true; kind: FileKind; extracted: Extracted } | { id: number; took: number; ok: false; source: boolean; message: string }) => {
    if (m.id !== id) return
    slot.jobs++
    const quick = m.took < QUICK_MS
    finish(quick, () => { if (m.ok) { parseStats.ok++; job.resolve({ kind: m.kind, extracted: m.extracted }) } else { parseStats.refused++; job.reject(m.source ? new SourceError(m.message) : new Error(m.message)) } })
  }
  const onError = (e: Error & { code?: string }) => finish(false, () => {
    if (e.code === 'ERR_WORKER_OUT_OF_MEMORY') { parseStats.outOfMemory++; console.warn(`[sources] reading "${job.filename.slice(0, 60)}" ran out of memory`); job.reject(new SourceError('That file is too large or too complex to read. Save just the part you need as a smaller file.')) }
    else { parseStats.crashed++; console.warn('[sources] worker error:', e.message); job.reject(new Error('Could not read that file')) }
  })
  const onExit = () => finish(false, () => { parseStats.crashed++; job.reject(new Error('Could not read that file')) })
  worker.on('message', onMessage); worker.on('error', onError); worker.on('exit', onExit)
  // the bytes move to the worker without being copied (the caller does not use them again)
  const own = job.bytes.byteOffset === 0 && job.bytes.byteLength === job.bytes.buffer.byteLength ? job.bytes : job.bytes.slice()
  worker.postMessage({ id, bytes: own, filename: job.filename }, [own.buffer as ArrayBuffer])
}

function next() {
  while (active < poolConfig.concurrency && waiting.length) {
    const j = waiting.shift()!
    if (j.waitTimer) clearTimeout(j.waitTimer)
    runJob(j)
  }
}

/** Small plain files (text, CSV, e-mail) cost microseconds and cannot inflate, so they skip the worker; anything zip-based, PDF or old-Office can be a bomb at any size and always goes to one. */
const SMALL_PLAIN_BYTES = 256 * 1024
const mayBeHeavy = (b: Uint8Array) => (b[0] === 0x50 && b[1] === 0x4b) || (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) || (b[0] === 0xd0 && b[1] === 0xcf)

/** Reads an uploaded file (type decided from its content). Throws BusyError when too many are already being read. */
export function parseUpload(bytes: Uint8Array, filename: string): Promise<Parsed> {
  if (env.SOURCE_PARSE_MODE === 'inline' || (bytes.length <= SMALL_PLAIN_BYTES && !mayBeHeavy(bytes))) return fromFile(bytes, filename)
  return new Promise<Parsed>((resolve, reject) => {
    const job: Job = { bytes, filename, resolve, reject }
    if (active < poolConfig.concurrency) return runJob(job)
    if (waiting.length >= poolConfig.queue) { parseStats.busy++; return reject(new BusyError('busy')) }
    job.waitTimer = setTimeout(() => { const i = waiting.indexOf(job); if (i >= 0) { waiting.splice(i, 1); parseStats.busy++; reject(new BusyError('busy')) } }, MAX_WAIT_MS)
    waiting.push(job); parseStats.peakWaiting = Math.max(parseStats.peakWaiting, waiting.length)
  })
}

/** for tests and shutdown: stop every warm worker */
export const closePool = async () => { for (const s of idle.splice(0)) { if (s.idleTimer) clearTimeout(s.idleTimer); await s.worker.terminate() } }
