/**
 * Counts how long each slide was really looked at. Time only accrues while the page is visible AND the person was active in the last two minutes;
 * a single step never counts more than 2 s (a sleeping laptop or a stalled timer cannot add minutes at once).
 */
export const ACTIVE_WINDOW_MS = 2 * 60_000
export const MAX_STEP_MS = 2000

export class TimeAccumulator {
  private ms = new Map<string, number>()
  private last: number
  private activity: number
  constructor(now: number) { this.last = now; this.activity = now }
  /** the person did something (key, pointer, touch, scroll) */
  touch(now: number) { this.activity = now }
  /** a slide is on screen (it counts as reached even with 0 ms) */
  enter(slide: string | undefined) { if (slide && !this.ms.has(slide)) this.ms.set(slide, 0) }
  /** time has passed; credit it to `slide` if the page is visible and the person is active */
  tick(now: number, slide: string | undefined, visible: boolean) {
    const dt = Math.max(0, Math.min(now - this.last, MAX_STEP_MS)); this.last = now
    this.enter(slide)
    if (slide && visible && now - this.activity < ACTIVE_WINDOW_MS) this.ms.set(slide, (this.ms.get(slide) ?? 0) + dt)
  }
  /** what has been counted since the last take, then reset (slides stay "entered" with 0 until they get time again) */
  take(limit = 40): { id: string; ms: number }[] {
    const out = [...this.ms].slice(0, limit).map(([id, ms]) => ({ id, ms: Math.round(ms) }))
    this.ms.clear()
    return out
  }
  get size() { return this.ms.size }
}
