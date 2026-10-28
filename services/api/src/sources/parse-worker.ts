import { parentPort } from 'node:worker_threads'
import { SourceError } from './errors.ts'
import { fromFile } from './extract.ts'

/**
 * The thread that reads uploaded files (see parse-pool.ts). It answers one job at a time and may be reused for further quick jobs; the pool terminates it
 * after any heavy, slow or failed job, so whatever a hostile file made it allocate is released with it. It must not import the API's env or database code.
 */
parentPort?.on('message', async (job: { id: number; bytes: Uint8Array; filename: string }) => {
  const t0 = Date.now() // how long the READING took (not the worker's start-up): the pool reuses only workers that were quick
  try {
    const r = await fromFile(job.bytes, job.filename)
    parentPort!.postMessage({ id: job.id, ok: true, took: Date.now() - t0, kind: r.kind, extracted: r.extracted })
  } catch (e) {
    parentPort!.postMessage({ id: job.id, ok: false, took: Date.now() - t0, source: e instanceof SourceError, message: String((e as Error)?.message ?? 'Could not read that file').slice(0, 400) })
  }
})
