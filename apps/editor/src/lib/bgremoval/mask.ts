import type { Rect } from './types'

/**
 * The editable mask. The picture and the model's mask (`original`) are never touched: every erase or restore is a stroke applied on top, kept as a small patch so that undo and redo
 * need no new inference. A stroke paints with `min` (erase) or `max` (restore) against a soft round brush, which makes painting the same spot twice harmless; patches are stored per
 * 64 x 64 tile of what the stroke touched, so memory follows the area painted and not the size of the picture.
 */
export type Tool = 'erase' | 'restore'

const TILE = 64
type Tiles = Map<number, Uint8Array>
interface Entry { before: Tiles; after: Tiles; rect: Rect; bytes: number; /** a whole-mask step (expand, shrink, soften, reset), not a brush stroke */ bulk?: boolean }
interface Active { tool: Tool; radius: number; hardness: number; before: Tiles; rect: Rect | null; last: [number, number] | null }

export class MaskEditor {
  readonly width: number
  readonly height: number
  private readonly base: Uint8Array
  private readonly cur: Uint8Array
  private readonly tilesX: number
  private undoStack: Entry[] = []
  private redoStack: Entry[] = []
  private active: Active | null = null
  private bytes = 0
  private evicted = false
  /** whether the step that undo, redo or replace last applied was a whole-mask step (the preview's cleaned colours then need to be worked out again) */
  lastWasBulk = false
  /** bumped by every change of the mask, so `isEdited` is worked out once per change and not on every render */
  private version = 0
  private edited: { v: number; value: boolean } = { v: 0, value: false }
  private readonly maxBytes: number
  private readonly maxEntries: number

  constructor(base: Uint8Array, width: number, height: number, o: { maxHistoryBytes?: number; maxHistoryEntries?: number } = {}) {
    if (base.length !== width * height) throw new Error(`mask has ${base.length} values for ${width} x ${height} pixels`)
    this.width = width; this.height = height
    this.base = base
    this.cur = Uint8Array.from(base)
    this.tilesX = Math.ceil(width / TILE)
    this.maxBytes = o.maxHistoryBytes ?? 96 * 1024 * 1024
    this.maxEntries = o.maxHistoryEntries ?? 200
  }

  /** The mask as it is now (live: read it, never write it). */
  get alpha(): Uint8Array { return this.cur }
  /** The mask the model made (never changes). */
  get original(): Uint8Array { return this.base }
  get canUndo() { return this.undoStack.length > 0 }
  get canRedo() { return this.redoStack.length > 0 }
  /** Whether the mask differs from the model's (what "Reset" would change): exact, so it is false again after a reset or after everything was undone. */
  get isEdited(): boolean {
    if (this.edited.v === this.version) return this.edited.value
    let value = false
    for (let i = 0; i < this.cur.length; i++) if (this.cur[i] !== this.base[i]) { value = true; break }
    this.edited = { v: this.version, value }
    return value
  }

  // ── strokes ────────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Starts a stroke at (x, y) in picture pixels; returns the area that changed. */
  beginStroke(tool: Tool, radius: number, hardness: number, x: number, y: number): Rect | null {
    this.endStroke()
    this.active = { tool, radius: Math.max(0.5, radius), hardness: Math.min(1, Math.max(0, hardness)), before: new Map(), rect: null, last: null }
    return this.lineTo(x, y)
  }

  /** Continues the stroke to (x, y); returns the area that changed (null when nothing did). */
  lineTo(x: number, y: number): Rect | null {
    const a = this.active
    if (!a) return null
    const [lx, ly] = a.last ?? [x, y]
    const step = Math.max(0.5, a.radius * 0.2)
    const dist = Math.hypot(x - lx, y - ly)
    const n = Math.max(1, Math.ceil(dist / step))
    let dirty: Rect | null = null
    for (let i = a.last ? 1 : 0; i <= n; i++) {
      const t = n === 0 ? 1 : i / n
      const r = this.stamp(a, lx + (x - lx) * t, ly + (y - ly) * t)
      if (r) dirty = union(dirty, r)
    }
    a.last = [x, y]
    if (dirty) a.rect = union(a.rect, dirty)
    return dirty
  }

  /** Ends the stroke and keeps it as one undo step (nothing is kept when it changed nothing). */
  endStroke(): void {
    const a = this.active
    this.active = null
    if (!a || a.before.size === 0 || !a.rect) return
    const after: Tiles = new Map()
    let changed = false
    for (const [idx, before] of a.before) {
      const now = this.copyTile(this.cur, idx)
      after.set(idx, now)
      if (!changed) for (let i = 0; i < now.length; i++) if (now[i] !== before[i]) { changed = true; break }
    }
    if (!changed) return
    this.push({ before: a.before, after, rect: a.rect, bytes: tilesBytes(a.before) + tilesBytes(after) })
  }

  /** Whether a stroke is in progress (begun and not yet ended or cancelled). */
  get painting(): boolean { return this.active !== null }

  /**
   * Throws the stroke in progress away as if it had never started: the mask goes back exactly to how it was when the stroke began, NOTHING is added to the history (so undo does not
   * show a phantom step) and the redo steps are kept (they are only dropped when a stroke is committed). Returns the area that changed (null when there was nothing to cancel).
   * This is what two fingers on the screen do: a pinch must never leave paint behind.
   */
  cancelStroke(): Rect | null {
    const a = this.active
    this.active = null
    if (!a || a.before.size === 0) return null
    let rect: Rect | null = null
    for (const [idx, t] of a.before) { this.writeTile(idx, t); rect = union(rect, this.tileRect(idx)) }
    this.version++
    return rect
  }

  undo(): Rect | null {
    this.endStroke()
    const e = this.undoStack.pop()
    if (!e) return null
    for (const [idx, t] of e.before) this.writeTile(idx, t)
    this.version++
    this.lastWasBulk = !!e.bulk
    this.bytes -= e.bytes
    this.redoStack.push(e)
    return e.rect
  }

  redo(): Rect | null {
    const e = this.redoStack.pop()
    if (!e) return null
    for (const [idx, t] of e.after) this.writeTile(idx, t)
    this.version++
    this.lastWasBulk = !!e.bulk
    this.undoStack.push(e)
    this.bytes += e.bytes
    return e.rect
  }

  /** Back to the model's mask. This is a step too: it can be undone. Returns the area that changed (null when nothing differed). */
  reset(): Rect | null {
    return this.replace(this.base)
  }

  /**
   * Makes the whole mask `next` (a result computed elsewhere, e.g. feather or expand/contract in the worker) as ONE undoable step; only the tiles that differ are kept in the history.
   * Returns the area that changed (null when nothing differed). The model's mask (what Reset returns to) is not touched.
   */
  replace(next: Uint8Array): Rect | null {
    if (next.length !== this.cur.length) throw new Error(`mask has ${next.length} values for ${this.width} x ${this.height} pixels`)
    this.endStroke()
    const before: Tiles = new Map(), after: Tiles = new Map()
    let rect: Rect | null = null
    const tilesY = Math.ceil(this.height / TILE)
    for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < this.tilesX; tx++) {
      const idx = ty * this.tilesX + tx
      const cur = this.copyTile(this.cur, idx), want = this.copyTile(next, idx)
      let differs = false
      for (let i = 0; i < cur.length; i++) if (cur[i] !== want[i]) { differs = true; break }
      if (!differs) continue
      before.set(idx, cur); after.set(idx, want)
      rect = union(rect, this.tileRect(idx))
    }
    if (!rect) return null
    for (const [idx, t] of after) this.writeTile(idx, t)
    this.version++
    this.lastWasBulk = true
    this.push({ before, after, rect, bytes: tilesBytes(before) + tilesBytes(after), bulk: true })
    return rect
  }

  // ── internals ──────────────────────────────────────────────────────────────────────────────────────────────────────
  private push(e: Entry) {
    this.undoStack.push(e)
    this.bytes += e.bytes
    this.redoStack = []
    while (this.undoStack.length > 1 && (this.bytes > this.maxBytes || this.undoStack.length > this.maxEntries)) {
      const old = this.undoStack.shift()!
      this.bytes -= old.bytes
      this.evicted = true
    }
  }

  private tileRect(idx: number): Rect {
    const tx = idx % this.tilesX, ty = Math.floor(idx / this.tilesX)
    return { x: tx * TILE, y: ty * TILE, w: Math.min(TILE, this.width - tx * TILE), h: Math.min(TILE, this.height - ty * TILE) }
  }
  private copyTile(buf: Uint8Array, idx: number): Uint8Array {
    const r = this.tileRect(idx)
    const out = new Uint8Array(r.w * r.h)
    for (let y = 0; y < r.h; y++) out.set(buf.subarray((r.y + y) * this.width + r.x, (r.y + y) * this.width + r.x + r.w), y * r.w)
    return out
  }
  private writeTile(idx: number, data: Uint8Array) {
    const r = this.tileRect(idx)
    for (let y = 0; y < r.h; y++) this.cur.set(data.subarray(y * r.w, (y + 1) * r.w), (r.y + y) * this.width + r.x)
  }

  /** One round dab of the brush; saves the original of each tile it touches the first time (for undo). */
  private stamp(a: Active, cx: number, cy: number): Rect | null {
    const r = a.radius
    const x0 = Math.max(0, Math.floor(cx - r)), y0 = Math.max(0, Math.floor(cy - r))
    const x1 = Math.min(this.width - 1, Math.ceil(cx + r)), y1 = Math.min(this.height - 1, Math.ceil(cy + r))
    if (x1 < x0 || y1 < y0) return null
    for (let ty = Math.floor(y0 / TILE); ty <= Math.floor(y1 / TILE); ty++) for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) {
      const idx = ty * this.tilesX + tx
      if (!a.before.has(idx)) a.before.set(idx, this.copyTile(this.cur, idx))
    }
    const inner = r * a.hardness
    const erase = a.tool === 'erase'
    let touched = false
    for (let y = y0; y <= y1; y++) {
      const row = y * this.width
      const dy = y + 0.5 - cy
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, dy)
        if (d >= r) continue
        const cov = d <= inner ? 255 : Math.round(255 * (1 - (d - inner) / (r - inner)))
        const v = this.cur[row + x]!
        const nv = erase ? Math.min(v, 255 - cov) : Math.max(v, cov)
        if (nv !== v) { this.cur[row + x] = nv; touched = true; this.version++ }
      }
    }
    return touched ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null
  }
}

const tilesBytes = (t: Tiles) => { let n = 0; for (const v of t.values()) n += v.length; return n }
export function union(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b }
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}
