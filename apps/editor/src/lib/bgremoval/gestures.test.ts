import { describe, expect, it } from 'vitest'
import { GestureMachine, type Handlers } from './gestures'
import type { Pt } from './view'

const spy = () => {
  const log: string[] = []
  const h: Handlers = {
    beginStroke: (p) => log.push(`begin ${p.x},${p.y}`), strokeTo: (p) => log.push(`to ${p.x},${p.y}`), endStroke: () => log.push('end'), cancelStroke: () => log.push('cancel'),
    panBy: (dx, dy) => log.push(`pan ${dx},${dy}`), pinch: (a0, b0, a1, b1) => log.push(`pinch ${a0.x}-${b0.x} -> ${a1.x}-${b1.x}`),
  }
  return { log, m: new GestureMachine(h) }
}
const P = (x: number, y = 0): Pt => ({ x, y })

describe('GestureMachine', () => {
  it('one pointer with a paint tool is one stroke, committed when it lifts', () => {
    const { m, log } = spy()
    m.down(1, P(10, 10), 'paint'); m.move(1, P(20, 10)); m.move(1, P(30, 10)); m.up(1)
    expect(log).toEqual(['begin 10,10', 'to 20,10', 'to 30,10', 'end'])
    expect(m.current).toBe('idle')
  })

  it('a second finger cancels the stroke (never commits it) and the two pinch; lifting one finger does not start painting with the other', () => {
    const { m, log } = spy()
    m.down(1, P(100), 'paint'); m.move(1, P(110))
    m.down(2, P(200), 'paint')
    expect(log).toEqual(['begin 100,0', 'to 110,0', 'cancel'])
    m.move(2, P(220))
    m.move(1, P(90))
    expect(log.slice(3)).toEqual(['pinch 110-200 -> 110-220', 'pinch 110-220 -> 90-220'])
    m.up(2)
    m.move(1, P(50)); m.move(1, P(40)) // the remaining finger moves: nothing paints, nothing pans
    expect(log.length).toBe(5)
    m.up(1)
    expect(m.current).toBe('idle')
    expect(log.filter((l) => l === 'end')).toHaveLength(0) // not a single stroke was committed
    m.down(3, P(5), 'paint') // a new touch after all fingers are up paints again
    expect(log.at(-1)).toBe('begin 5,0')
  })

  it('a pinch that starts from two fingers at once never paints at all beyond the cancelled first dab', () => {
    const { m, log } = spy()
    m.down(1, P(0), 'paint'); m.down(2, P(50), 'paint')
    m.move(1, P(-10)); m.move(2, P(60)); m.up(1); m.up(2)
    expect(log.filter((l) => l.startsWith('to') || l === 'end')).toEqual([])
    expect(log.filter((l) => l === 'cancel')).toHaveLength(1)
  })

  it('the move tool, Space or the middle button pan with one pointer; a second pointer turns that into a pinch', () => {
    const { m, log } = spy()
    m.down(1, P(10, 10), 'pan'); m.move(1, P(15, 18))
    expect(log).toEqual(['pan 5,8'])
    m.down(2, P(100, 10), 'pan'); m.move(2, P(110, 10))
    expect(log.at(-1)).toBe('pinch 15-100 -> 15-110')
    expect(log.some((l) => l === 'cancel')).toBe(false)
  })

  it('a pointer the system cancels throws its stroke away; reset ends everything without keeping a half stroke; a pointer that does nothing waits', () => {
    const a = spy(); a.m.down(1, P(1), 'paint'); a.m.up(1, true)
    expect(a.log).toEqual(['begin 1,0', 'cancel'])
    const b = spy(); b.m.down(1, P(1), 'paint'); b.m.reset()
    expect(b.log).toEqual(['begin 1,0', 'cancel']); expect(b.m.count).toBe(0)
    const c = spy(); c.m.down(1, P(1), 'none'); c.m.move(1, P(9))
    expect(c.log).toEqual([])
  })

  it('ignores moves of pointers it does not know, and a repeated down of the same pointer', () => {
    const { m, log } = spy()
    m.move(7, P(1)); m.up(7)
    m.down(1, P(1), 'paint'); m.down(1, P(5), 'paint')
    expect(log).toEqual(['begin 1,0'])
  })
})
