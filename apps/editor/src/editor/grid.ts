import { create } from 'zustand'
import type { Box, Guide, Handle } from './commands'

/**
 * The editor's grid: a viewing and placing aid, NEVER part of the deck (thumbnails, Present, the shared view and every download never show it). Remembered per person in
 * this browser (a convenience: if the browser forgets, the grid is just off). Sizes are canvas units (the slide is 1920 wide).
 */
export const GRID_SIZES = [{ size: 20, label: 'Small' }, { size: 40, label: 'Medium' }, { size: 80, label: 'Large' }] as const
export interface GridPrefs { show: boolean; snap: boolean; size: number }
const KEY = 'sd:editor-grid'
const read = (): GridPrefs => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (v && typeof v.size === 'number') return { show: !!v.show, snap: !!v.snap, size: v.size } } catch { /* private window */ } return { show: false, snap: false, size: 40 } }

export const useGrid = create<GridPrefs & { set: (p: Partial<GridPrefs>) => void }>((setState, get) => ({
  ...read(),
  set: (p) => { setState(p); const { show, snap, size } = get(); try { localStorage.setItem(KEY, JSON.stringify({ show, snap, size })) } catch { /* not kept */ } },
}))

const onGrid = (v: number, size: number) => Math.round(v / size) * size
/**
 * Snap to the grid: a moved object's left and top edges land on grid lines. The person turned "Snap to grid" on, so the grid wins (on a busy slide the alignment
 * guides fire almost everywhere and would keep objects off the grid); a guide is still shown when the object, on the grid, really is aligned there.
 * `box` = the object's size (to keep guides that touch its other edges); `snapped` = what the guides found (C.snap); `raw` = where the pointer put it.
 */
export function snapMoveToGrid(raw: { x: number; y: number; width?: number; height?: number }, snapped: { x: number; y: number; guides: Guide[] }, size: number): { x: number; y: number; guides: Guide[] } {
  const x = onGrid(raw.x, size), y = onGrid(raw.y, size)
  const w = raw.width ?? 0, h = raw.height ?? 0
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5
  const guides = snapped.guides.filter((g) => (g.axis === 'x' ? [x, x + w / 2, x + w] : [y, y + h / 2, y + h]).some((v) => near(v, g.at)))
  return { x, y, guides }
}

/** a resize on the grid: the edges the handle moves land on grid lines (the others stay); never smaller than one grid step */
export function snapResizeToGrid(b: Box, handle: Handle, size: number): Box {
  let { x, y, width, height } = b
  const right = x + width, bottom = y + height
  if (handle.includes('w')) { x = onGrid(x, size); width = Math.max(size, right - x) }
  if (handle.includes('e')) { width = Math.max(size, onGrid(right, size) - x) }
  if (handle.includes('n')) { y = onGrid(y, size); height = Math.max(size, bottom - y) }
  if (handle.includes('s')) { height = Math.max(size, onGrid(bottom, size) - y) }
  return { x, y, width, height }
}
