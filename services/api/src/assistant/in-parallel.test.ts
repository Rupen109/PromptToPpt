import { describe, expect, it } from 'vitest'
import { inParallel } from './capabilities/writing.ts'

describe('writing groups run at the same time (same calls, shorter wait)', () => {
  it('keeps the order of the results, never runs more than the limit at once, and takes about one call\'s time per round', async () => {
    let running = 0, most = 0
    const call = async (n: number) => { running++; most = Math.max(most, running); await new Promise((ok) => setTimeout(ok, 120 - n * 10)); running--; return n * 2 }
    const t0 = Date.now()
    const out = await inParallel([1, 2, 3, 4, 5], 3, call)
    const took = Date.now() - t0
    expect(out).toEqual([2, 4, 6, 8, 10])
    expect(most).toBe(3)
    expect(took).toBeLessThan(400) // one by one: 110+100+90+80+70 = 450 ms
  })
  it('an empty list and a failing call behave', async () => {
    expect(await inParallel([], 3, async () => 1)).toEqual([])
    await expect(inParallel([1, 2], 2, async (n) => { if (n === 2) throw new Error('no'); return n })).rejects.toThrow('no')
  })
})
