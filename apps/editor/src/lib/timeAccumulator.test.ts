import { describe, expect, it } from 'vitest'
import { ACTIVE_WINDOW_MS, MAX_STEP_MS, TimeAccumulator } from './timeAccumulator'

const run = (a: TimeAccumulator, from: number, seconds: number, slide: string, visible = true) => { let t = from; for (let i = 0; i < seconds * 2; i++) { t += 500; a.tick(t, slide, visible) } return t }

describe('time accumulator', () => {
  it('C1/C7 time accrues on the slide being shown, adds up when the visitor comes back to a slide', () => {
    const a = new TimeAccumulator(0); let t = run(a, 0, 4, 's1'); t = run(a, t, 3, 's2'); t = run(a, t, 2, 's1')
    expect(Object.fromEntries(a.take().map((x) => [x.id, x.ms]))).toEqual({ s1: 6000, s2: 3000 })
  })
  it('C4 nothing accrues while the page is hidden; it resumes when visible again', () => {
    const a = new TimeAccumulator(0); let t = run(a, 0, 2, 's1'); t = run(a, t, 30, 's1', false); run(a, t, 2, 's1')
    expect(a.take()).toEqual([{ id: 's1', ms: 4000 }])
  })
  it('C5 after two minutes without activity the clock stops; any activity starts it again', () => {
    const a = new TimeAccumulator(0); let t = 0
    for (let i = 0; i < 2 * 60 * 2 + 40; i++) { t += 500; a.tick(t, 's1', true) } // 2 min 20 s without a touch
    expect(a.take()[0]!.ms).toBeLessThanOrEqual(ACTIVE_WINDOW_MS)
    a.touch(t); run(a, t, 3, 's1')
    expect(a.take()[0]!.ms).toBe(3000)
  })
  it('a stalled timer or a sleeping laptop cannot add minutes in one step', () => {
    const a = new TimeAccumulator(0); a.touch(10 * 60_000); a.tick(10 * 60_000, 's1', true) // the person is active, but ten minutes passed between two timer ticks
    expect(a.take()[0]!.ms).toBe(MAX_STEP_MS)
  })
  it('a slide that was only passed through still counts as reached (0 ms), and take() resets', () => {
    const a = new TimeAccumulator(0); a.enter('s1'); a.enter('s2'); a.enter(undefined)
    expect(a.take()).toEqual([{ id: 's1', ms: 0 }, { id: 's2', ms: 0 }]); expect(a.size).toBe(0)
  })
})
