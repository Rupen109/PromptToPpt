import { describe, expect, it } from 'vitest'
import { snapMoveToGrid, snapResizeToGrid } from './grid'

describe('snap to grid (PowerPoint\'s way)', () => {
  it('a move lands the left / top edges on grid lines; the grid wins over the guides, which show only where the object on the grid really is aligned', () => {
    expect(snapMoveToGrid({ x: 133, y: 61 }, { x: 133, y: 61, guides: [] }, 40)).toEqual({ x: 120, y: 80, guides: [] })
    expect(snapMoveToGrid({ x: 133, y: 61, width: 80, height: 40 }, { x: 140, y: 61, guides: [{ axis: 'x', at: 140 }, { axis: 'y', at: 120 }] }, 40)).toEqual({ x: 120, y: 80, guides: [{ axis: 'y', at: 120 }] })
  })
  it('a resize moves only the dragged edges onto the grid, never below one step', () => {
    expect(snapResizeToGrid({ x: 40, y: 40, width: 213, height: 97 }, 'se', 40)).toEqual({ x: 40, y: 40, width: 200, height: 80 })
    expect(snapResizeToGrid({ x: 47, y: 40, width: 193, height: 80 }, 'w', 40)).toEqual({ x: 40, y: 40, width: 200, height: 80 })
    expect(snapResizeToGrid({ x: 40, y: 40, width: 9, height: 80 }, 'e', 40).width).toBe(40)
  })
})
