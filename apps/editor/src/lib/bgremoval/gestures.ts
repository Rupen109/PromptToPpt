import type { Pt } from './view'

/**
 * What the fingers (or the mouse, or the pen) are doing on the picture, as a small state machine keyed by `pointerId`:
 *   one pointer + a paint tool   -> a brush stroke
 *   one pointer + move tool / Space / middle button -> pan
 *   a SECOND pointer arrives     -> the stroke in progress is cancelled (not committed) and the two pointers pinch-zoom and pan
 *   a pointer leaves a pinch     -> nothing more happens until every pointer is up: the finger that stays must not start painting
 * Pinching therefore never paints. The machine only decides; the stage does the work through `Handlers`.
 */
export interface Handlers {
  beginStroke(p: Pt): void
  strokeTo(p: Pt): void
  endStroke(): void
  cancelStroke(): void
  panBy(dx: number, dy: number): void
  /** the two tracked pointers moved from (a0, b0) to (a1, b1) */
  pinch(a0: Pt, b0: Pt, a1: Pt, b1: Pt): void
}
export type Intent = 'paint' | 'pan' | 'none'
type Mode = 'idle' | 'paint' | 'pan' | 'pinch' | 'locked'

export class GestureMachine {
  private readonly pointers = new Map<number, Pt>() // insertion order = arrival order, so the first two are the pinch pair
  private mode: Mode = 'idle'
  private primary = -1
  constructor(private readonly h: Handlers) {}

  get current(): Mode { return this.mode }
  get count(): number { return this.pointers.size }

  down(id: number, p: Pt, intent: Intent): void {
    if (this.pointers.has(id)) return
    this.pointers.set(id, p)
    if (this.pointers.size === 1) {
      this.primary = id
      if (intent === 'paint') { this.mode = 'paint'; this.h.beginStroke(p) } else if (intent === 'pan') this.mode = 'pan'
      else this.mode = 'locked' // nothing to do (e.g. comparing); wait for the pointer to leave
      return
    }
    // a second (or third) pointer: whatever one finger was doing stops, and two pinch
    if (this.mode === 'paint') this.h.cancelStroke()
    this.mode = 'pinch'
  }

  move(id: number, p: Pt): void {
    const before = this.pointers.get(id)
    if (!before) return
    this.pointers.set(id, p)
    if (this.mode === 'paint' && id === this.primary) this.h.strokeTo(p)
    else if (this.mode === 'pan' && id === this.primary) this.h.panBy(p.x - before.x, p.y - before.y)
    else if (this.mode === 'pinch') {
      const ids = [...this.pointers.keys()].slice(0, 2)
      if (!ids.includes(id) || ids.length < 2) return
      const [a, b] = ids as [number, number]
      const pa = this.pointers.get(a)!, pb = this.pointers.get(b)!
      const a0 = a === id ? before : pa, b0 = b === id ? before : pb
      this.h.pinch(a0, b0, pa, pb)
    }
  }

  /** A pointer lifted (`cancelled` = the system took it away, e.g. a palm or a call: a stroke is then thrown away, not kept). */
  up(id: number, cancelled = false): void {
    if (!this.pointers.has(id)) return
    this.pointers.delete(id)
    if (this.mode === 'paint' && id === this.primary) { if (cancelled) this.h.cancelStroke(); else this.h.endStroke() }
    if (this.pointers.size === 0) { this.mode = 'idle'; this.primary = -1 } else this.mode = 'locked' // fingers remain after a pinch or a one-finger gesture ended: they do nothing until all are up
  }

  /** The stage went away or lost the pointers: end whatever is running without keeping a half stroke. */
  reset(): void {
    if (this.mode === 'paint') this.h.cancelStroke()
    this.pointers.clear(); this.mode = 'idle'; this.primary = -1
  }
}
