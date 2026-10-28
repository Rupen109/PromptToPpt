import { strToU8, zipSync } from 'fflate'
import { Hono } from 'hono'
import { afterEach, describe, expect, it } from 'vitest'
import { uploadGate } from '../middleware/upload-gate.ts'
import { env } from '../env.ts'
import { fromFile, SourceError } from './extract.ts'
import { BusyError, closePool, parseStats, parseUpload, poolConfig, poolState } from './parse-pool.ts'

const normal = { ...poolConfig }
afterEach(async () => { Object.assign(poolConfig, normal); await closePool() })

const PARA = '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Heading text that repeats and repeats</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>cell a</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>cell b</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
const docx = (mb: number) => { let body = ''; while (body.length < mb * 1024 * 1024) body += PARA; return zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8(`<w:document><w:body>${body}</w:body></w:document>`) }, { level: 6 }) }
const small = () => docx(0.01)
const copy = (b: Uint8Array) => new Uint8Array(b) // the pool takes ownership of the bytes it is given

describe('file reading happens in worker threads', () => {
  it('small plain files are read in this thread (no worker); a zip-based file of ANY size goes to a worker', async () => {
    const started = parseStats.started
    await parseUpload(strToU8('Meeting notes: ship the beta on Friday, then review everything.'), 'n.txt'); await parseUpload(strToU8('a,b\n1,2'), 'd.csv')
    expect(parseStats.started).toBe(started)
    await parseUpload(copy(small()), 'a.docx')
    expect(parseStats.started).toBe(started + 1)
  })
  it('gives the same answer as reading in the same thread, for every kind of file the readers know', async () => {
    const files: [string, Uint8Array][] = [['a.docx', small()], ['n.txt', strToU8('Meeting notes: ship the beta on Friday, then review everything.')], ['d.csv', strToU8('a,b\n1,2\n3,4')]]
    for (const [name, bytes] of files) {
      const viaWorker = await parseUpload(copy(bytes), name); const inline = await fromFile(copy(bytes), name)
      expect(viaWorker).toEqual(inline)
    }
  })
  it('a file that cannot be read keeps its plain-language message through the worker; unexpected errors become the generic line', async () => {
    await expect(parseUpload(strToU8('MZ\u0090\u0000\u0003'), 'setup.docx')).rejects.toThrow(/not a valid Office document/)
    await expect(parseUpload(strToU8('MZ\u0090\u0000\u0003'), 'setup.docx')).rejects.toBeInstanceOf(SourceError)
    await expect(parseUpload(strToU8('x'), 'a.exe')).rejects.toThrow(/Unsupported file type/)
  })
  it('the main thread keeps running while a heavy file is read (reading the same file in this thread blocks it)', async () => {
    const heavy = docx(28); const lagOf = async (work: () => Promise<unknown>) => { let max = 0, last = Date.now(); const t = setInterval(() => { const n = Date.now(); max = Math.max(max, n - last - 10); last = n }, 10); await work(); await new Promise((r) => setTimeout(r, 30)); clearInterval(t); return max /* (the pause lets a tick that was delayed by a frozen thread fire and be measured) */ }
    const worker = await lagOf(() => parseUpload(copy(heavy), 'h.docx'))
    const inline = await lagOf(() => fromFile(copy(heavy), 'h.docx'))
    expect(inline).toBeGreaterThan(150) // this thread was frozen for the whole read
    expect(worker).toBeLessThan(120) // …while with a worker it kept answering
  })
  it('only SOURCE_PARSE_CONCURRENCY files are read at once, the rest wait in a line, and beyond the line the answer is "busy" at once', async () => {
    Object.assign(poolConfig, { concurrency: 2, queue: 3 })
    const big = docx(20)
    const jobs = Array.from({ length: 8 }, (_, i) => parseUpload(copy(big), `f${i}.docx`).then(() => 'ok', (e) => (e instanceof BusyError ? 'busy' : 'error')))
    expect(poolState()).toMatchObject({ active: 2, waiting: 3 })
    const out = await Promise.all(jobs)
    expect(out.filter((x) => x === 'ok')).toHaveLength(5); expect(out.filter((x) => x === 'busy')).toHaveLength(3); expect(out.includes('error')).toBe(false)
    expect(poolState()).toMatchObject({ active: 0, waiting: 0 })
  }, 60_000)
  it('a worker that finished a quick job is reused for the next one (no 100 ms start-up each time); a worker that did slow or heavy work is discarded', async () => {
    const before = { started: parseStats.started, reused: parseStats.reused }
    for (let i = 0; i < 6; i++) expect((await parseUpload(copy(small()), `q${i}.docx`)).kind).toBe('docx')
    expect(parseStats.started - before.started).toBeLessThanOrEqual(2); expect(parseStats.reused - before.reused).toBeGreaterThanOrEqual(4)
    await parseUpload(copy(docx(28)), 'heavy.docx') // slow: its worker must not stay
    expect(poolState().idle).toBe(0)
  }, 30_000)
  it('a reused worker still answers a refusal in plain words and a later good file is read correctly (one bad file does not poison it)', async () => {
    await parseUpload(copy(small()), 'a.docx')
    await expect(parseUpload(strToU8('MZ\u0090\u0000\u0003'), 'setup.docx')).rejects.toThrow(/not a valid Office document/)
    expect((await parseUpload(copy(small()), 'b.docx')).extracted.parts[0]!.text).toContain('Heading text')
  })
  it('a file that takes too long is stopped with a plain message, and the next file is read normally', async () => {
    Object.assign(poolConfig, { timeoutMs: 120 }); const before = parseStats.timedOut
    await expect(parseUpload(copy(docx(28)), 'slow.docx')).rejects.toThrow(/took too long to read/)
    expect(parseStats.timedOut).toBe(before + 1)
    Object.assign(poolConfig, { timeoutMs: 25_000 })
    expect((await parseUpload(copy(small()), 'ok.docx')).kind).toBe('docx')
  }, 30_000)
  it('a file that needs more memory than allowed ends only its own worker, with a plain message', async () => {
    Object.assign(poolConfig, { heapMb: 40 }); const before = parseStats.outOfMemory
    await expect(parseUpload(copy(docx(28)), 'greedy.docx')).rejects.toThrow(/too large or too complex/)
    expect(parseStats.outOfMemory).toBe(before + 1)
    Object.assign(poolConfig, { heapMb: normal.heapMb })
    expect((await parseUpload(copy(small()), 'ok.docx')).kind).toBe('docx')
  }, 30_000)
  it('twelve heavy files read in parallel leave this thread\'s own memory alone: the data lives in the workers, which are gone afterwards', async () => {
    Object.assign(poolConfig, { concurrency: 2, queue: 30 }); const ownHeap = () => process.memoryUsage().heapUsed + process.memoryUsage().arrayBuffers
    const before = ownHeap(); let peak = before; const t = setInterval(() => { peak = Math.max(peak, ownHeap()) }, 25)
    const big = docx(20); await Promise.all(Array.from({ length: 12 }, (_, i) => parseUpload(copy(big), `p${i}.docx`).catch(() => null))); clearInterval(t)
    expect((peak - before) / 1048576).toBeLessThan(80)
    expect(poolState()).toMatchObject({ active: 0, waiting: 0 })
  }, 90_000)
})

describe('upload admission gate', () => {
  const MB = 1024 * 1024
  const gateApp = () => { const app = new Hono(); let release: () => void = () => {}; const hold = new Promise<void>((r) => { release = r }); app.post('/up', uploadGate, async (c) => { await hold; return c.json({ ok: true }) }); return { app, release: () => release() } }
  const post = (app: Hono, mb: number) => app.request('/up', { method: 'POST', headers: { 'content-length': String(Math.round(mb * MB)) } })
  it('admits uploads by the memory they will hold: big ones fill the budget, the next big one is answered "busy" with Retry-After before its body is read, small ones still flow', async () => {
    const { app, release } = gateApp(); const fits = Math.floor(env.SOURCE_UPLOAD_BUDGET_MB / 15)
    const held = Array.from({ length: fits }, () => post(app, 15))
    await new Promise((r) => setTimeout(r, 30))
    const refused = await post(app, 15)
    expect(refused.status).toBe(503); expect(refused.headers.get('retry-after')).toBe('5'); expect(((await refused.json()) as { error: unknown }).error).toMatchObject({ code: 'BUSY', message: expect.stringMatching(/try again in a few seconds/) })
    release(); expect((await Promise.all(held)).every((r) => r.status === 200)).toBe(true)
    const again = gateApp(); again.release(); expect((await post(again.app, 15)).status).toBe(200) // and the budget is free again afterwards
  })
  it('a slow upload does not use up the number of slots: many small uploads are admitted at the same time as one big one', async () => {
    const { app, release } = gateApp(); const all = [post(app, 15), ...Array.from({ length: 20 }, () => post(app, 0.2))]
    await new Promise((r) => setTimeout(r, 30)); release()
    expect((await Promise.all(all)).map((r) => r.status).every((s) => s === 200)).toBe(true)
  })
  it('a missing size counts as the largest allowed, so it cannot slip past the budget', async () => {
    const { app, release } = gateApp(); const n = Math.floor(env.SOURCE_UPLOAD_BUDGET_MB / 16)
    const held = Array.from({ length: n }, () => app.request('/up', { method: 'POST' })); await new Promise((r) => setTimeout(r, 30))
    expect((await app.request('/up', { method: 'POST' })).status).toBe(503); release(); await Promise.all(held)
  })
})
