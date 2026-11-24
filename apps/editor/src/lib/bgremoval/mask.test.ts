import { describe, expect, it } from 'vitest'
import { MaskEditor } from './mask'

/** A 100 x 80 mask whose left half is subject (255) and right half background (0). */
const half = () => { const d = new Uint8Array(100 * 80); for (let y = 0; y < 80; y++) for (let x = 0; x < 50; x++) d[y * 100 + x] = 255; return d }
const at = (m: MaskEditor, x: number, y: number) => m.alpha[y * m.width + x]!
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i])

describe('MaskEditor: strokes', () => {
  it('erase takes the subject away under the brush (full strength inside, soft at the rim) and leaves the rest alone', () => {
    const m = new MaskEditor(half(), 100, 80)
    m.beginStroke('erase', 10, 0.5, 25, 40); m.endStroke()
    expect(at(m, 25, 40)).toBe(0)
    expect(at(m, 25 + 7, 40)).toBeGreaterThan(0) // the soft rim
    expect(at(m, 25 + 7, 40)).toBeLessThan(255)
    expect(at(m, 25, 40 + 12)).toBe(255) // outside the brush
    expect(at(m, 75, 40)).toBe(0) // background untouched
  })
  it('restore brings the subject back under the brush, without ever darkening what is already there', () => {
    const m = new MaskEditor(half(), 100, 80)
    m.beginStroke('restore', 8, 1, 75, 40); m.endStroke()
    expect(at(m, 75, 40)).toBe(255)
    expect(at(m, 75, 40 + 7)).toBe(255)
    expect(at(m, 75, 40 + 9)).toBe(0)
    expect(at(m, 10, 10)).toBe(255)
  })
  it('a stroke follows the pointer in a line and painting the same spot twice does not change it', () => {
    const m = new MaskEditor(half(), 100, 80)
    m.beginStroke('erase', 4, 1, 10, 20); m.lineTo(40, 20); m.endStroke()
    for (const x of [10, 20, 30, 40]) expect(at(m, x, 20), `x=${x}`).toBe(0)
    const once = Uint8Array.from(m.alpha)
    m.beginStroke('erase', 4, 1, 10, 20); m.lineTo(40, 20); m.endStroke()
    expect(same(m.alpha, once)).toBe(true)
    expect(m.undo() !== null).toBe(true) // the first stroke is one step; the repeat changed nothing and made none
    expect(m.canUndo).toBe(false)
  })
  it('the model\'s mask is never touched', () => {
    const base = half(), keep = Uint8Array.from(base)
    const m = new MaskEditor(base, 100, 80)
    m.beginStroke('erase', 20, 1, 30, 30); m.endStroke()
    expect(same(m.original, keep)).toBe(true)
    expect(same(m.alpha, keep)).toBe(false)
  })
  it('strokes at the picture\'s edges and corners are clipped, not wrapped or thrown', () => {
    const m = new MaskEditor(half(), 100, 80)
    expect(() => { m.beginStroke('erase', 30, 0.2, -5, -5); m.lineTo(110, 90); m.endStroke() }).not.toThrow()
    expect(at(m, 0, 0)).toBe(0)
  })
})

describe('MaskEditor: undo, redo, reset (no new inference is ever needed)', () => {
  it('undo restores the exact mask before each stroke, redo reapplies it, in order', () => {
    const m = new MaskEditor(half(), 100, 80)
    const s0 = Uint8Array.from(m.alpha)
    m.beginStroke('erase', 6, 1, 20, 20); m.endStroke(); const s1 = Uint8Array.from(m.alpha)
    m.beginStroke('restore', 6, 1, 80, 60); m.lineTo(90, 60); m.endStroke(); const s2 = Uint8Array.from(m.alpha)
    m.beginStroke('erase', 9, 0.3, 40, 70); m.endStroke(); const s3 = Uint8Array.from(m.alpha)
    expect(m.undo()).not.toBeNull(); expect(same(m.alpha, s2)).toBe(true)
    expect(m.undo()).not.toBeNull(); expect(same(m.alpha, s1)).toBe(true)
    expect(m.undo()).not.toBeNull(); expect(same(m.alpha, s0)).toBe(true)
    expect(m.undo()).toBeNull(); expect(m.canUndo).toBe(false)
    m.redo(); expect(same(m.alpha, s1)).toBe(true)
    m.redo(); expect(same(m.alpha, s2)).toBe(true)
    m.redo(); expect(same(m.alpha, s3)).toBe(true)
    expect(m.redo()).toBeNull()
  })
  it('a new stroke after an undo drops the redo steps', () => {
    const m = new MaskEditor(half(), 100, 80)
    m.beginStroke('erase', 5, 1, 10, 10); m.endStroke()
    m.undo(); expect(m.canRedo).toBe(true)
    m.beginStroke('erase', 5, 1, 30, 30); m.endStroke()
    expect(m.canRedo).toBe(false)
  })
  it('reset goes back to the model\'s mask in one step that can itself be undone', () => {
    const m = new MaskEditor(half(), 100, 80)
    m.beginStroke('erase', 12, 1, 25, 40); m.endStroke()
    m.beginStroke('restore', 12, 1, 80, 40); m.endStroke()
    const edited = Uint8Array.from(m.alpha)
    expect(m.isEdited).toBe(true)
    expect(m.reset()).not.toBeNull()
    expect(same(m.alpha, m.original)).toBe(true)
    m.undo(); expect(same(m.alpha, edited)).toBe(true) // the reset is undone, the work is back
    expect(m.reset()).not.toBeNull()
    expect(m.reset()).toBeNull() // nothing left to reset
    expect(m.isEdited).toBe(false) // the mask is the model's again, so Reset is not offered
    m.undo(); expect(m.isEdited).toBe(true)
  })
  it('isEdited is exact: false at the start, true after a stroke, false again once the stroke is undone', () => {
    const m = new MaskEditor(half(), 100, 80)
    expect(m.isEdited).toBe(false)
    m.beginStroke('erase', 6, 1, 20, 20); m.endStroke()
    expect(m.isEdited).toBe(true)
    m.undo(); expect(m.isEdited).toBe(false)
    m.redo(); expect(m.isEdited).toBe(true)
  })
  it('history is bounded: old steps are dropped, never memory without limit, and undo keeps working for the recent ones', () => {
    const m = new MaskEditor(half(), 100, 80, { maxHistoryEntries: 5 })
    for (let i = 0; i < 12; i++) { m.beginStroke(i % 2 ? 'restore' : 'erase', 5, 1, 10 + i * 6, 20 + (i % 3) * 15); m.endStroke() }
    let undone = 0
    while (m.undo()) undone++
    expect(undone).toBe(5)
    expect(m.isEdited).toBe(true) // older steps were dropped, so the mask is not the model's any more and Reset stays available
  })
  it('works on a picture whose size is not a multiple of the 64 pixel patches', () => {
    const w = 130, h = 70, base = new Uint8Array(w * h).fill(255)
    const m = new MaskEditor(base, w, h)
    m.beginStroke('erase', 20, 1, 125, 66); m.endStroke()
    const edited = Uint8Array.from(m.alpha)
    m.undo(); expect(same(m.alpha, base)).toBe(true)
    m.redo(); expect(same(m.alpha, edited)).toBe(true)
  })
  it('rejects a mask whose size does not match', () => { expect(() => new MaskEditor(new Uint8Array(10), 4, 4)).toThrow(/10 values for 4 x 4/) })

  describe('cancelStroke', () => {
    it('puts the mask back exactly, adds no history step, and keeps the redo steps', () => {
      const e = new MaskEditor(new Uint8Array(100 * 100).fill(255), 100, 100)
      e.beginStroke('erase', 10, 1, 20, 20); e.lineTo(40, 20); e.endStroke() // one committed step
      e.undo() // ... which is now a redo step
      expect(e.canRedo).toBe(true)
      const before = Uint8Array.from(e.alpha)
      e.beginStroke('erase', 12, 1, 60, 60); e.lineTo(80, 70)
      expect(e.painting).toBe(true)
      expect(e.alpha).not.toEqual(before) // paint is on the mask while the stroke is in progress
      const rect = e.cancelStroke()
      expect(rect).not.toBeNull()
      expect(e.alpha).toEqual(before) // exactly as before
      expect(e.painting).toBe(false)
      expect(e.canUndo).toBe(false) // no phantom step
      expect(e.canRedo).toBe(true) // the redo step survived
      expect(e.isEdited).toBe(false)
    })

    it('does nothing when there is no stroke, and a new stroke works afterwards and is one undo step', () => {
      const e = new MaskEditor(new Uint8Array(50 * 50).fill(255), 50, 50)
      expect(e.cancelStroke()).toBeNull()
      e.beginStroke('erase', 6, 1, 10, 10); e.cancelStroke()
      e.cancelStroke() // twice is harmless
      e.beginStroke('erase', 6, 1, 25, 25); e.lineTo(30, 25); e.endStroke()
      expect(e.canUndo).toBe(true)
      expect(e.alpha[25 * 50 + 25]).toBe(0)
      e.undo()
      expect(e.alpha[25 * 50 + 25]).toBe(255)
      expect(e.canUndo).toBe(false)
    })

    it('restores a stroke that crossed several tiles and kept earlier committed edits intact', () => {
      const e = new MaskEditor(new Uint8Array(300 * 200).fill(255), 300, 200)
      e.beginStroke('erase', 8, 1, 20, 20); e.endStroke()
      const committed = Uint8Array.from(e.alpha)
      e.beginStroke('erase', 20, 0.5, 10, 100); e.lineTo(290, 100) // many 64 px tiles
      e.cancelStroke()
      expect(e.alpha).toEqual(committed)
      expect(e.canUndo).toBe(true) // the committed one is still there
    })

    it('a restore stroke that is cancelled leaves an erased area erased', () => {
      const e = new MaskEditor(new Uint8Array(60 * 60).fill(255), 60, 60)
      e.beginStroke('erase', 10, 1, 30, 30); e.endStroke()
      e.beginStroke('restore', 10, 1, 30, 30); expect(e.alpha[30 * 60 + 30]).toBe(255)
      e.cancelStroke()
      expect(e.alpha[30 * 60 + 30]).toBe(0)
    })
  })

  describe('replace (one undoable step for a computed result)', () => {
    it('makes the mask the given one, undo goes back exactly, redo forward, and Reset still returns to the model\'s mask', () => {
      const base = new Uint8Array(100 * 100).fill(255)
      const e = new MaskEditor(base, 100, 100)
      const next = Uint8Array.from(base); for (let y = 20; y < 50; y++) for (let x = 10; x < 90; x++) next[y * 100 + x] = 40
      const rect = e.replace(next)
      expect(rect).not.toBeNull()
      expect(e.alpha).toEqual(next); expect(e.isEdited).toBe(true); expect(e.canUndo).toBe(true)
      e.undo(); expect(e.alpha).toEqual(base); expect(e.canUndo).toBe(false)
      e.redo(); expect(e.alpha).toEqual(next)
      e.reset(); expect(e.alpha).toEqual(base) // the model's mask is untouched by replace
      e.undo(); expect(e.alpha).toEqual(next)
    })
    it('does nothing (no history step) when the result is the same, rejects a result of the wrong size, and ends a stroke first', () => {
      const e = new MaskEditor(new Uint8Array(30 * 30).fill(200), 30, 30)
      expect(e.replace(Uint8Array.from(e.alpha))).toBeNull(); expect(e.canUndo).toBe(false)
      expect(() => e.replace(new Uint8Array(5))).toThrow(/values for 30 x 30/)
      e.beginStroke('erase', 5, 1, 15, 15)
      const next = new Uint8Array(30 * 30).fill(10)
      e.replace(next)
      expect(e.painting).toBe(false); expect(e.alpha).toEqual(next)
      e.undo(); expect(e.canUndo).toBe(true) // the stroke is its own step, the replace another
    })
  })

  it('knows whether the step it just undid or redid was a whole-mask step (so the preview colours can be refreshed), not a brush stroke', () => {
    const e = new MaskEditor(new Uint8Array(40 * 40).fill(255), 40, 40)
    e.beginStroke('erase', 5, 1, 10, 10); e.endStroke()
    e.replace(new Uint8Array(40 * 40).fill(90))
    e.undo(); expect(e.lastWasBulk).toBe(true)
    e.undo(); expect(e.lastWasBulk).toBe(false) // the stroke
    e.redo(); expect(e.lastWasBulk).toBe(false)
    e.redo(); expect(e.lastWasBulk).toBe(true)
    e.reset(); expect(e.lastWasBulk).toBe(true)
  })
})
