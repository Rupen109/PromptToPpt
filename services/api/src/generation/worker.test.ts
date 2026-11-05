import { describe, expect, it } from 'vitest'
import { laneOfSpeed, nextLane, type JobQueue } from './queue.ts'
import { notifyJob } from './wake.ts'
import { startWorker } from './worker.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** an in-memory queue: jobs are handed out once, in order */
function stubQueue(ids: string[]): JobQueue & { add(id: string): void } {
  const q = [...ids]
  return { claim: async () => q.shift() ?? null, add: (id) => void q.push(id) }
}

describe('lanes: how busy slots are shared', () => {
  const shares = [30, 40, 30]
  it('serves the line furthest below its share; a line with nobody waiting lends its share', () => {
    expect(nextLane([5, 5, 5], [0, 0, 0], shares)).toBe(0) // nothing running: the paid line first (tie)
    expect(nextLane([5, 5, 5], [3, 0, 0], shares)).toBe(1) // Gold has its share running: Pro is next
    expect(nextLane([5, 5, 5], [3, 4, 0], shares)).toBe(2)
    expect(nextLane([5, 0, 5], [9, 0, 0], shares)).toBe(2) // Pro is empty: Starter takes the slot, Gold already has plenty
    expect(nextLane([0, 0, 4], [9, 9, 0], shares)).toBe(2) // only Starter waits: it gets everything free
    expect(nextLane([0, 0, 0], [0, 0, 0], shares)).toBeNull()
  })
  it('a surge of free users cannot starve the paid lines, and paid lines are not stuck behind free users', () => {
    // 100 slots busy, all of them Starter; one Gold and one Pro job arrive: both go before another Starter job
    expect(nextLane([1, 1, 500], [0, 0, 100], shares)).toBe(0)
    expect(nextLane([0, 1, 500], [0, 0, 100], shares)).toBe(1)
  })
  it('the plan\'s promised speed decides the line', () => {
    expect([laneOfSpeed('ultra'), laneOfSpeed('fast'), laneOfSpeed('standard')]).toEqual([0, 1, 2])
  })
})

describe('the worker: slots, wake-up and shutdown', () => {
  it('never runs more jobs at once than it has slots, and runs every job', async () => {
    const queue = stubQueue(Array.from({ length: 20 }, (_, i) => `j${i}`))
    let now = 0, peak = 0
    const done: string[] = []
    const w = startWorker({ slots: 5, queue, pollMs: 20, run: async (id) => { now++; peak = Math.max(peak, now); await sleep(30); now--; done.push(id) } })
    for (let i = 0; i < 100 && done.length < 20; i++) await sleep(20)
    expect(done).toHaveLength(20)
    expect(peak).toBe(5)
    await w.stop()
    expect(w.stats()).toMatchObject({ slots: 5, busy: 0, free: 5, claimed: 20, finished: 20 })
  })

  it('an idle worker starts a new job at once when told, not at its next poll', async () => {
    const queue = stubQueue([])
    const started: number[] = []
    const w = startWorker({ slots: 2, queue, pollMs: 5000, run: async () => { started.push(Date.now()) } })
    await sleep(50)
    const t0 = Date.now()
    queue.add('late')
    await notifyJob()
    for (let i = 0; i < 50 && started.length === 0; i++) await sleep(10)
    expect(started).toHaveLength(1)
    expect(started[0]! - t0).toBeLessThan(500) // far below the 5 s poll
    await w.stop()
  })

  it('stop() lets running jobs finish within the grace time and stops taking new ones', async () => {
    const queue = stubQueue(['a', 'b', 'c'])
    const finished: string[] = []
    const w = startWorker({ slots: 2, queue, pollMs: 20, run: async (id) => { await sleep(100); finished.push(id) } })
    await sleep(30) // a and b are running, c waits for a slot
    await w.stop(2000)
    expect(finished.sort()).toEqual(['a', 'b'])
    expect(w.stats().busy).toBe(0)
    expect(await queue.claim(1)).toBe('c') // never taken
  })

  it('a job that outlives the grace time is handed back instead of waiting for its lease to run out', async () => {
    const queue = stubQueue(['slow'])
    const w = startWorker({ slots: 1, queue, pollMs: 20, run: async () => { await sleep(1500) } })
    await sleep(30)
    const t0 = Date.now()
    await w.stop(100)
    expect(Date.now() - t0).toBeLessThan(1000)
  })
})
