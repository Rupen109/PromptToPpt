import { Worker } from 'node:worker_threads'
import { env } from '../env.ts'
import { SourceError } from './errors.ts'
import { fromFile, type Extracted, type FileKind } from './extract.ts'
import type { ParsedTemplate } from '../template-import/types.ts'
import type { RawFileBrand } from '../brand/file-types.ts'

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

type Task = 'template' | 'brand'
interface Job { bytes: Uint8Array; filename: string; task?: Task; resolve: (p: Parsed & ParsedTemplate & { brand?: RawFileBrand }) => void; reject: (e: unknown) => void; waitTimer?: NodeJS.Timeout }
interface Slot { worker: Worker; jobs: number; idleTimer?: NodeJS.Timeout; heapMb: number; /** template and brand jobs get their own workers (see spawn) */ task: Task | undefined }
let active = 0
let nextId = 0
const waiting: Job[] = []
const idle: Slot[] = []
export const poolState = () => ({ active, waiting: waiting.length, idle: idle.length })

/** When the worker is TypeScript source (development and tests), reading a template needs the workspace packages' extension-less imports resolved: that worker starts through parse-worker-dev.mjs (tsx). The built worker (dist/parse-worker.js) bundles everything and needs nothing. */
const TS_WORKER = WORKER_URL.pathname.endsWith('.ts')
const DEV_WORKER_URL = new URL('./parse-worker-dev.mjs', import.meta.url)
const spawn = (task?: Task): Slot => {
  parseStats.started++
  const viaTsx = !!task && TS_WORKER
  const worker = new Worker(viaTsx ? DEV_WORKER_URL : WORKER_URL, { resourceLimits: { maxOldGenerationSizeMb: poolConfig.heapMb, maxYoungGenerationSizeMb: 64, stackSizeMb: 4 }, ...(viaTsx ? { execArgv: ['--no-experimental-strip-types'] } : {}) })
  worker.unref() // an idle worker must never keep the process alive
  return { worker, jobs: 0, heapMb: poolConfig.heapMb, task }
}
const takeSlot = (task?: Task): Slot => {
  for (let i = idle.length - 1; i >= 0; i--) {
    const s = idle[i]!
    if (s.heapMb !== poolConfig.heapMb) { idle.splice(i, 1); if (s.idleTimer) clearTimeout(s.idleTimer); void s.worker.terminate(); continue }
    if (s.task !== task) continue
    idle.splice(i, 1); if (s.idleTimer) clearTimeout(s.idleTimer); parseStats.reused++; return s
  }
  return spawn(task)
}
const park = (s: Slot) => {
  s.idleTimer = setTimeout(() => { const i = idle.indexOf(s); if (i >= 0) idle.splice(i, 1); void s.worker.terminate() }, IDLE_MS); s.idleTimer.unref()
  idle.push(s)
}

function runJob(job: Job) {
  active++
  const slot = takeSlot(job.task); const { worker } = slot; const id = ++nextId
  let done = false
  const cleanup = () => { clearTimeout(timer); worker.off('message', onMessage); worker.off('error', onError); worker.off('exit', onExit) }
  const finish = (reuse: boolean, fn: () => void) => { if (done) return; done = true; cleanup(); active--; if (reuse && slot.jobs < MAX_REUSES) park(slot); else void worker.terminate(); fn(); next() }
  const timer = setTimeout(() => finish(false, () => { parseStats.timedOut++; console.warn(`[sources] reading "${job.filename.slice(0, 60)}" stopped after ${poolConfig.timeoutMs} ms`); job.reject(new SourceError('That file took too long to read. Try a smaller file, or save just the part you need.')) }), poolConfig.timeoutMs)
  const onMessage = (m: { id: number; took: number; ok: true; kind: FileKind; extracted: Extracted; template?: ParsedTemplate['template']; pictures?: ParsedTemplate['pictures']; brand?: RawFileBrand } | { id: number; took: number; ok: false; source: boolean; message: string }) => {
    if (m.id !== id) return
    slot.jobs++
    const quick = m.took < QUICK_MS
    finish(quick, () => { if (m.ok) { parseStats.ok++; job.resolve({ kind: m.kind, extracted: m.extracted, template: m.template as never, pictures: m.pictures as never, ...(m.brand ? { brand: m.brand } : {}) }) } else { parseStats.refused++; job.reject(m.source ? new SourceError(m.message) : new Error(m.message)) } })
  }
  const onError = (e: Error & { code?: string }) => finish(false, () => {
    if (e.code === 'ERR_WORKER_OUT_OF_MEMORY') { parseStats.outOfMemory++; console.warn(`[sources] reading "${job.filename.slice(0, 60)}" ran out of memory`); job.reject(new SourceError('That file is too large or too complex to read. Save just the part you need as a smaller file.')) }
    else { parseStats.crashed++; console.warn('[sources] worker error:', e.message); job.reject(new Error('Could not read that file')) }
  })
  const onExit = () => finish(false, () => { parseStats.crashed++; job.reject(new Error('Could not read that file')) })
  worker.on('message', onMessage); worker.on('error', onError); worker.on('exit', onExit)
  // the bytes move to the worker without being copied (the caller does not use them again)
  const own = job.bytes.byteOffset === 0 && job.bytes.byteLength === job.bytes.buffer.byteLength ? job.bytes : job.bytes.slice()
  worker.postMessage({ id, bytes: own, filename: job.filename, ...(job.task ? { task: job.task } : {}) }, [own.buffer as ArrayBuffer])
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

/**
 * Reads an uploaded .pptx or PDF as a template (design, layouts, text slots, pictures; see template-import/). Same worker pool, memory and time limits as parseUpload: a hostile or
 * enormous file ends only its own worker. Throws SourceError (a sentence for the person) or BusyError.
 */
export function parseTemplateUpload(bytes: Uint8Array, filename: string): Promise<ParsedTemplate> {
  // loaded on demand: the picture library (sharp) belongs in the worker, not in the API process
  if (env.SOURCE_PARSE_MODE === 'inline') return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 ? import('../template-import/parse-pdf.ts').then((m) => m.parsePdfTemplate(bytes, filename)) : import('../template-import/parse.ts').then((m) => m.parsePptxTemplate(bytes, filename))
  return new Promise<ParsedTemplate>((resolve, reject) => {
    const job: Job = { bytes, filename, task: 'template', resolve: (p) => resolve({ template: p.template, pictures: p.pictures }), reject }
    if (active < poolConfig.concurrency) return runJob(job)
    if (waiting.length >= poolConfig.queue) { parseStats.busy++; return reject(new BusyError('busy')) }
    job.waitTimer = setTimeout(() => { const i = waiting.indexOf(job); if (i >= 0) { waiting.splice(i, 1); parseStats.busy++; reject(new BusyError('busy')) } }, MAX_WAIT_MS)
    waiting.push(job); parseStats.peakWaiting = Math.max(parseStats.peakWaiting, waiting.length)
  })
}

/**
 * Reads an uploaded .pptx or .pdf for its BRAND (colours, fonts, logo, name; see brand/read-pptx.ts and read-pdf.ts). Same pool, memory and time limits as every other upload:
 * a hostile or enormous file ends only its own worker. Throws SourceError (a sentence for the person) or BusyError.
 */
export function parseBrandUpload(bytes: Uint8Array, filename: string): Promise<RawFileBrand> {
  if (env.SOURCE_PARSE_MODE === 'inline') return import('../brand/read-file.ts').then((m) => m.readBrandFile(bytes, filename)) // loaded on demand, like the template reader
  return new Promise<RawFileBrand>((resolve, reject) => {
    const job: Job = { bytes, filename, task: 'brand', resolve: (p) => resolve(p.brand!), reject }
    if (active < poolConfig.concurrency) return runJob(job)
    if (waiting.length >= poolConfig.queue) { parseStats.busy++; return reject(new BusyError('busy')) }
    job.waitTimer = setTimeout(() => { const i = waiting.indexOf(job); if (i >= 0) { waiting.splice(i, 1); parseStats.busy++; reject(new BusyError('busy')) } }, MAX_WAIT_MS)
    waiting.push(job); parseStats.peakWaiting = Math.max(parseStats.peakWaiting, waiting.length)
  })
}

/** for tests and shutdown: stop every warm worker */
export const closePool = async () => { for (const s of idle.splice(0)) { if (s.idleTimer) clearTimeout(s.idleTimer); await s.worker.terminate() } }
