import { describe, expect, it } from 'vitest'
import { effectSchema, type Effect } from '@prompttoppt/validation'
import { buildKeyframes } from './keyframes'
import { compileTimeline, compileTriggers, playTime } from './timeline'
import { SlidePlayer } from './player'
import { ElementView } from '../SlideCanvas'
import { hiddenAtStart } from './player'
import { pathEnd, pathLength, pathOf, presetPath, samplePath, simplifyStroke } from './paths'

const fx = (id: string, extra: Partial<Effect> = {}): Effect => effectSchema.parse({ id, elementId: 'e1', category: 'entrance', type: 'fade-in', ...extra })
const ids = (...x: string[]) => new Set(x)

describe('motion paths', () => {
  it('a line goes the distance in its direction; corners are diagonal', () => {
    expect(presetPath('path-line', 'right', 200)).toEqual([[0, 0], [200, 0]])
    expect(presetPath('path-line', 'up', 100)).toEqual([[0, 0], [0, -100]])
    const d = pathEnd(presetPath('path-line', 'down-right', 100))
    expect(d[0]).toBeCloseTo(70.7, 0); expect(d[1]).toBeCloseTo(70.7, 0)
  })
  it('a circle starts and ends where the element is, and its diameter is the size', () => {
    const c = presetPath('path-circle', 'right', 240)
    expect(c[0]).toEqual([0, 0]); expect(pathEnd(c)).toEqual([0, 0])
    expect(Math.max(...c.map((p) => p[1]))).toBeCloseTo(240, 0)
    expect(pathLength(c)).toBeGreaterThan(Math.PI * 240 * 0.98)
  })
  it('a turn ends a quarter circle away; an arc ends the distance away on the way', () => {
    const t = pathEnd(presetPath('path-turn', 'right', 100)); expect(t[0]).toBeCloseTo(100, 0); expect(t[1]).toBeCloseTo(100, 0)
    expect(pathEnd(presetPath('path-arc', 'right', 300))[0]).toBeCloseTo(300, 0)
  })
  it('samples along the length (not by point count) and clamps at both ends', () => {
    const pts: [number, number][] = [[0, 0], [10, 0], [110, 0]]
    expect(samplePath(pts, 0)).toEqual([0, 0])
    expect(samplePath(pts, 0.5)[0]).toBeCloseTo(55)
    expect(samplePath(pts, 2)).toEqual([110, 0])
    expect(samplePath([[5, 5]], 0.5)).toEqual([5, 5])
  })
  it('a hand-drawn stroke is thinned, starts at 0,0 and keeps its end', () => {
    const raw = Array.from({ length: 500 }, (_, i) => [100 + i, 50 + Math.sin(i / 20) * 40] as [number, number])
    const s = simplifyStroke(raw, 100, 2)
    expect(s[0]).toEqual([0, 0]); expect(s.length).toBeLessThanOrEqual(100)
    expect(s.at(-1)![0]).toBeCloseTo(499, 0)
    expect(simplifyStroke([[1, 1]])).toEqual([])
  })
  it('the engine plays the stored points and falls back to the preset of its type', () => {
    const e = fx('p', { category: 'path', type: 'path-custom', path: [[0, 0], [30, 40], [90, 40]] })
    const b = buildKeyframes(e)
    expect(b.fill).toBe('both')
    expect(b.keyframes.map((k) => k['transform'])).toEqual(['translate(0px, 0px)', 'translate(30px, 40px)', 'translate(90px, 40px)'])
    expect(b.keyframes.map((k) => k.offset)).toEqual([0, 0.5, 1])
    expect(pathOf(fx('q', { category: 'path', type: 'path-line' }))).toEqual([[0, 0], [300, 0]])
  })
  it('the schema accepts a path only inside its limits, and the category must match', () => {
    expect(effectSchema.safeParse({ id: 'a', elementId: 'e', category: 'path', type: 'path-line', path: [[0, 0]] }).success).toBe(false)
    expect(effectSchema.safeParse({ id: 'a', elementId: 'e', category: 'path', type: 'path-line', path: [[0, 0], [9999, 0]] }).success).toBe(false)
    expect(effectSchema.safeParse({ id: 'a', elementId: 'e', category: 'entrance', type: 'path-line' }).success).toBe(false)
    expect(effectSchema.safeParse({ id: 'a', elementId: 'e', category: 'path', type: 'path-line', path: [[0, 0], [10, 10]] }).success).toBe(true)
  })
})

describe('new effects and options', () => {
  it('grow and turn starts small and turned and ends upright and visible; blink lands where it began', () => {
    const g = buildKeyframes(fx('g', { type: 'grow-turn' })).keyframes
    expect(g[0]!['opacity']).toBe(0); expect(g.at(-1)!['transform']).toBe('rotate(0deg) scale(1)')
    const bl = buildKeyframes(fx('b', { category: 'emphasis', type: 'blink' }))
    expect(bl.fill).toBe('none'); expect(bl.keyframes.at(-1)!['opacity']).toBe(1)
  })
  it('corner directions move diagonally and wipe from the corner', () => {
    expect(buildKeyframes(fx('a', { type: 'fly-in', direction: 'down-left', distance: 100 })).keyframes[0]!['transform']).toBe('translate(-100px, 100px)')
    expect(buildKeyframes(fx('a', { type: 'wipe-in', direction: 'up-right' })).keyframes[0]!['clipPath']).toBe('inset(0 0 100% 100%)')
  })
})

describe('triggers, loops and text parts in the timeline', () => {
  it('trigger effects leave the click sequence and are grouped by their trigger object', () => {
    const list = [fx('1', { start: 'click' }), fx('2', { elementId: 'e2', trigger: 'e3', start: 'click' }), fx('3', { elementId: 'e4', trigger: 'e3', start: 'with', duration: 800 }), fx('4', { elementId: 'e4', trigger: 'e3', start: 'after', delay: 100, duration: 300 })]
    const all = ids('e1', 'e2', 'e3', 'e4')
    expect(compileTimeline(list, all).map((s) => s.effects.map((p) => p.effect.id))).toEqual([[], ['1']])
    const g = compileTriggers(list, all).get('e3')!
    expect(g.effects.map((p) => [p.effect.id, p.at, p.begin])).toEqual([['2', 0, 0], ['3', 0, 0], ['4', 800, 900]])
    expect(compileTriggers(list, ids('e1', 'e2', 'e4')).size).toBe(0) // trigger object gone: nothing plays
  })
  it('a looping effect counts as one round for what follows', () => {
    expect(playTime(fx('1', { duration: 500, repeat: 5, loop: true }))).toBe(500)
  })
})

function fakeDom() {
  const made: { target: string; frames: Keyframe[]; options: KeyframeAnimationOptions; state: string }[] = []
  const animate = (el: Element, frames: Keyframe[], options: KeyframeAnimationOptions) => {
    const rec = { target: (el as unknown as { id: string }).id, frames, options, state: 'running' }
    const finished = new Promise<Animation>(() => undefined)
    made.push(rec)
    return { get playState() { return rec.state }, finished, finish: () => { rec.state = 'finished' }, cancel: () => { rec.state = 'idle' } } as unknown as Animation
  }
  const part = (id: string) => ({ id })
  const root = {
    querySelector: (sel: string) => { const m = /data-pt-el="([^"]+)"/.exec(sel); return m ? ({ id: m[1], firstElementChild: { id: `${m[1]}-inner` }, querySelectorAll: (q: string) => (q.includes('"w"') ? [part('w0'), part('w1'), part('w2')] : q.includes('"p"') ? [part('p0'), part('p1')] : []) } as unknown as Element) : null },
  } as unknown as ParentNode
  return { made, animate, root }
}
const slideOf = (effects: Effect[], ...elementIds: string[]) => ({ elements: elementIds.map((i) => ({ id: i, type: 'text' }) as never), effects })

describe('the player: triggers, loops, parts', () => {
  it('a click on a trigger object plays its group at once; an object with no trigger plays nothing', () => {
    const f = fakeDom()
    const p = new SlidePlayer(f.root, slideOf([fx('1', { elementId: 'e2', trigger: 'e1', duration: 400 })], 'e1', 'e2'), { animate: f.animate })
    p.start()
    expect(f.made).toHaveLength(0)
    expect(p.hasTrigger('e1')).toBe(true); expect(p.hasTrigger('e2')).toBe(false)
    expect(p.trigger('e2')).toBe(false)
    expect(p.trigger('e1')).toBe(true)
    expect(f.made.map((m) => m.target)).toEqual(['e2']); expect(f.made[0]!.options.delay).toBe(0)
    expect(p.totalClicks).toBe(0) // the slide's own click sequence is untouched
  })
  it('a loop runs forever and never makes a click wait', () => {
    const f = fakeDom()
    const p = new SlidePlayer(f.root, slideOf([fx('1', { category: 'emphasis', type: 'pulse', start: 'with', loop: true })], 'e1'), { animate: f.animate })
    p.start()
    expect(f.made[0]!.options.iterations).toBe(Infinity)
    expect(p.running).toBe(false)
  })
  it('by word: every word gets the keyframes, staggered by the effect\'s own gap, and the box is revealed from the start', () => {
    const f = fakeDom()
    const p = new SlidePlayer(f.root, slideOf([fx('1', { start: 'with', textBy: 'word', stagger: 100, delay: 50 })], 'e1'), { animate: f.animate })
    p.start()
    const words = f.made.filter((m) => m.target.startsWith('w'))
    expect(words.map((m) => m.options.delay)).toEqual([50, 150, 250])
    expect(f.made.some((m) => m.target === 'e1' && m.frames.every((k) => k['visibility'] === 'visible'))).toBe(true)
  })
  it('by paragraph on an exit does not add the reveal animation', () => {
    const f = fakeDom()
    const p = new SlidePlayer(f.root, slideOf([fx('1', { category: 'exit', type: 'fade-out', start: 'with', textBy: 'paragraph' })], 'e1'), { animate: f.animate })
    p.start()
    expect(f.made.map((m) => m.target)).toEqual(['p0', 'p1'])
  })
})

describe('an object switched off (hidden)', () => {
  it('is not drawn, has no effects played, takes no click, and is not listed as hidden-at-start', () => {
    const el = { id: 'e1', type: 'shape', shape: 'rect', fill: 'primary', radius: 0, x: 0, y: 0, width: 10, height: 10, rotation: 0, locked: false, zIndex: 1, opacity: 1, hidden: true }
    expect(ElementView({ el: el as never, theme: {} as never, slide: {} as never })).toBeNull()
    const f = fakeDom()
    const slide = { elements: [{ id: 'e1', type: 'text', hidden: true } as never, { id: 'e2', type: 'text' } as never], effects: [fx('1', { start: 'click' }), fx('2', { elementId: 'e2', start: 'click' })] }
    const p = new SlidePlayer(f.root, slide, { animate: f.animate })
    expect(p.totalClicks).toBe(1) // only the visible object's effect is a click
    p.start(); p.advance()
    expect(f.made.map((m) => m.target)).toEqual(['e2'])
    expect([...hiddenAtStart(slide)]).toEqual(['e2'])
  })
})
