import { parentPort } from 'node:worker_threads'
import { SourceError } from './errors.ts'
import { fromFile } from './extract.ts'

/**
 * The thread that reads uploaded files (see parse-pool.ts). It answers one job at a time and may be reused for further quick jobs; the pool terminates it
 * after any heavy, slow or failed job, so whatever a hostile file made it allocate is released with it. It must not import the API's env or database code.
 */
parentPort?.on('message', async (job: { id: number; bytes: Uint8Array; filename: string; task?: 'template' | 'brand' }) => {
  const t0 = Date.now() // how long the READING took (not the worker's start-up): the pool reuses only workers that were quick
  try {
    if (job.task === 'template') {
      // an uploaded file read as a design to reuse (template-import): same worker, same limits, pictures come back as bytes (moved, not copied)
      const isPdf = job.bytes.length > 4 && job.bytes[0] === 0x25 && job.bytes[1] === 0x50 && job.bytes[2] === 0x44 && job.bytes[3] === 0x46
      // loaded when first needed: reading ordinary uploads never pulls in the picture library
      const t = isPdf ? await (await import('../template-import/parse-pdf.ts')).parsePdfTemplate(job.bytes, job.filename) : await (await import('../template-import/parse.ts')).parsePptxTemplate(job.bytes, job.filename)
      parentPort!.postMessage({ id: job.id, ok: true, took: Date.now() - t0, kind: isPdf ? 'pdf' : 'pptx', template: t.template, pictures: t.pictures }, t.pictures.map((p) => p.bytes.buffer as ArrayBuffer))
      return
    }
    if (job.task === 'brand') {
      // an uploaded PowerPoint or PDF read for its brand: the logo's bytes come back moved, not copied
      const { readBrandFile } = await import('../brand/read-file.ts')
      const brand = await readBrandFile(job.bytes, job.filename)
      parentPort!.postMessage({ id: job.id, ok: true, took: Date.now() - t0, kind: brand.kind, brand }, brand.logo ? [brand.logo.bytes.buffer as ArrayBuffer] : [])
      return
    }
    const r = await fromFile(job.bytes, job.filename)
    parentPort!.postMessage({ id: job.id, ok: true, took: Date.now() - t0, kind: r.kind, extracted: r.extracted })
  } catch (e) {
    parentPort!.postMessage({ id: job.id, ok: false, took: Date.now() - t0, source: e instanceof SourceError, message: String((e as Error)?.message ?? 'Could not read that file').slice(0, 400) })
  }
})
