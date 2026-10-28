import { describe, expect, it } from 'vitest'
import { runPool } from './pool.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('runPool', () => {
  it('returns results in item order and never exceeds the limit', async () => {
    let live = 0, peak = 0
    const out = await runPool([30, 5, 20, 1, 10], 2, async (ms, i) => { live++; peak = Math.max(peak, live); await sleep(ms); live--; return i })
    expect(out).toEqual([0, 1, 2, 3, 4])
    expect(peak).toBe(2)
  })
  it('is genuinely faster than one at a time', async () => {
    const t = Date.now()
    await runPool([1, 2, 3, 4], 4, async () => sleep(60))
    expect(Date.now() - t).toBeLessThan(160)
  })
  it('on failure starts nothing new, lets running work finish, reports finished items, and rethrows the first error', async () => {
    const started: number[] = [], done: number[] = []
    await expect(runPool([0, 1, 2, 3, 4, 5], 2, async (n) => { started.push(n); await sleep(n === 1 ? 5 : 30); if (n === 1) throw new Error('boom'); return n }, (_r, i) => { done.push(i) })).rejects.toThrow('boom')
    expect(started.length).toBeLessThan(6) // the queue stopped
    expect(done).toContain(0) // the call that was already running was allowed to finish and was reported
  })
})
