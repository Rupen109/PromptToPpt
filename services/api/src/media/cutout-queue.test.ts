import { describe, expect, it } from 'vitest'
import { ChildProcessEngine } from './cutout-engine.ts'
import { InferenceQueue, QueueError } from './cutout-queue.ts'

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))
const gate = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r }); return { p, open } }

describe('InferenceQueue', () => {
  it('runs one job at a time with one slot, in order, and a slot count follows the memory budget', async () => {
    const q = new InferenceQueue({ slots: 1, maxWaiting: 5 })
    const order: string[] = []
    let running = 0, peak = 0
    const job = (name: string) => q.run(async () => { running++; peak = Math.max(peak, running); order.push(`start ${name}`); await tick(15); running--; order.push(`end ${name}`); return name }, { timeoutMs: 1000 })
    expect(await Promise.all([job('a'), job('b'), job('c')])).toEqual(['a', 'b', 'c'])
    expect(peak).toBe(1)
    expect(order).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c'])
    const two = new InferenceQueue({ slots: 2, maxWaiting: 5 })
    let p2 = 0, r2 = 0
    await Promise.all([1, 2, 3, 4].map(() => two.run(async () => { r2++; p2 = Math.max(p2, r2); await tick(15); r2-- }, { timeoutMs: 1000 })))
    expect(p2).toBe(2)
  })

  it('a timeout tells the caller at once but keeps the slot until the work has really stopped (the old queue let the next job start on top of it)', async () => {
    const q = new InferenceQueue({ slots: 1, maxWaiting: 5 })
    const stop = gate()
    let firstStopped = false, secondStarted = false
    const first = q.run(async (signal) => { await new Promise<void>((r) => signal.addEventListener('abort', () => r())); await stop.p; firstStopped = true }, { timeoutMs: 30 })
    const second = q.run(async () => { secondStarted = true; expect(firstStopped).toBe(true); return 'ok' }, { timeoutMs: 1000 })
    await expect(first).rejects.toMatchObject({ kind: 'timeout' })
    await tick(60)
    expect(secondStarted).toBe(false) // the first is still using the memory
    stop.open()
    expect(await second).toBe('ok')
  })

  it('a caller that goes away stops a running job (its signal aborts) and drops a waiting one before it starts', async () => {
    const q = new InferenceQueue({ slots: 1, maxWaiting: 5 })
    const ac1 = new AbortController(), ac2 = new AbortController()
    let sawAbort = false, secondRan = false
    const first = q.run(async (signal) => { await new Promise<void>((r) => signal.addEventListener('abort', () => { sawAbort = true; r() })) }, { signal: ac1.signal, timeoutMs: 5000 })
    const second = q.run(async () => { secondRan = true }, { signal: ac2.signal, timeoutMs: 5000 })
    await tick(10)
    expect(q.queued).toBe(1)
    ac2.abort()
    await expect(second).rejects.toMatchObject({ kind: 'cancelled' })
    expect(q.queued).toBe(0)
    ac1.abort()
    await expect(first).rejects.toMatchObject({ kind: 'cancelled' })
    await tick(10)
    expect(sawAbort).toBe(true); expect(secondRan).toBe(false)
    expect(q.running).toBe(0) // the slot came back
    expect(await q.run(async () => 'next', { timeoutMs: 1000 })).toBe('next')
  })

  it('refuses beyond the waiting limit as busy, and an already-aborted caller never starts', async () => {
    const q = new InferenceQueue({ slots: 1, maxWaiting: 1 })
    const hold = gate()
    const a = q.run(() => hold.p, { timeoutMs: 5000 })
    const b = q.run(async () => 1, { timeoutMs: 5000 })
    await expect(q.run(async () => 2, { timeoutMs: 5000 })).rejects.toMatchObject({ kind: 'busy' })
    const ac = new AbortController(); ac.abort()
    await expect(q.run(async () => 3, { signal: ac.signal, timeoutMs: 5000 })).rejects.toBeInstanceOf(QueueError)
    hold.open(); await a; expect(await b).toBe(1)
  })
})

const fake = new URL('./fixtures/fake-cutout-child.ts', import.meta.url)
const rgb = (w: number, h: number) => new Uint8Array(w * h * 3)

describe('ChildProcessEngine (the model in its own process, with a stand-in model)', () => {
  it('answers, then stops the child when it has been idle', async () => {
    const e = new ChildProcessEngine({ script: fake, idleMs: 80 })
    const m = await e.mask(rgb(4, 3), 4, 3)
    expect(m.length).toBe(12); expect(m[0]).toBe(255)
    expect(e.alive).toBe(true)
    await tick(250)
    expect(e.alive).toBe(false) // its memory was given back
    expect((await e.mask(rgb(4, 3), 4, 3)).length).toBe(12) // and the next picture starts it again
    await e.kill()
  }, 20_000)

  it('an abort really kills the process: the work stops, the promise settles only when the process is gone', async () => {
    const e = new ChildProcessEngine({ script: fake, idleMs: 0 })
    await e.mask(rgb(4, 3), 4, 3)
    const pid = e.pid!
    const ac = new AbortController()
    const hung = e.mask(rgb(1, 1), 1, 1, ac.signal) // a picture the stand-in never answers
    const settled = hung.then(() => 'answered', (err) => (err instanceof Error ? err.name : 'rejected'))
    await tick(100)
    ac.abort()
    expect(await settled).not.toBe('answered')
    expect(() => process.kill(pid, 0)).toThrow() // no such process any more
    expect(e.alive).toBe(false)
    expect((await e.mask(rgb(4, 3), 4, 3)).length).toBe(12) // a new child serves the next picture
    await e.kill()
  }, 20_000)

  it('a failing model is a plain error, and the engine keeps working', async () => {
    const e = new ChildProcessEngine({ script: fake, idleMs: 0 })
    await expect(e.mask(rgb(2, 2), 2, 2)).rejects.toThrow('model exploded')
    expect((await e.mask(rgb(4, 3), 4, 3)).length).toBe(12)
    await e.kill()
  }, 20_000)

  it('the queue and the engine together: a timeout kills the child and the next job gets a fresh one', async () => {
    const q = new InferenceQueue({ slots: 1, maxWaiting: 3 })
    const e = new ChildProcessEngine({ script: fake, idleMs: 0 })
    await expect(q.run((signal) => e.mask(rgb(1, 1), 1, 1, signal), { timeoutMs: 200 })).rejects.toMatchObject({ kind: 'timeout' })
    expect(e.alive).toBe(false)
    expect((await q.run((signal) => e.mask(rgb(4, 3), 4, 3, signal), { timeoutMs: 10_000 })).length).toBe(12)
    await e.kill()
  }, 30_000)

  it('an abort that arrives while the child is still starting up does not leave it running for ever (it is retired when idle)', async () => {
    const e = new ChildProcessEngine({ script: fake, idleMs: 120 })
    const ac = new AbortController()
    const run = e.mask(rgb(4, 3), 4, 3, ac.signal).catch((err) => err)
    setTimeout(() => ac.abort(), 5) // before the child can have said it is ready
    await run
    await tick(600)
    expect(e.alive).toBe(false)
    expect((await e.mask(rgb(4, 3), 4, 3)).length).toBe(12) // and the engine still works
    await e.kill()
  }, 20_000)
})
