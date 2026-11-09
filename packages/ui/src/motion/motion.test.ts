import { describe, expect, it } from 'vitest'
import { EFFECTS, effectSchema, type Effect } from '@prompttoppt/validation'
import { EFFECT_INFO, effectApplies } from './catalog'
import { buildKeyframes } from './keyframes'
import { compileTimeline, hiddenAtStart, initiallyHidden, playTime, SlidePlayer } from '.'
import { ElementView } from '../SlideCanvas'

const fx = (id: string, extra: Partial<Effect> = {}): Effect => effectSchema.parse({ id, elementId: 'e1', category: 'entrance', type: 'fade-in', ...extra })
const ids = (...x: string[]) => new Set(x)

describe('the effect catalogue', () => {
  it('describes every effect the schema allows, in the category the schema files it under', () => {
    for (const [category, types] of Object.entries(EFFECTS)) for (const t of types) expect(EFFECT_INFO[t].category, t).toBe(category)
    expect(Object.keys(EFFECT_INFO).sort()).toEqual([...EFFECTS.entrance, ...EFFECTS.emphasis, ...EFFECTS.exit].sort())
  })
  it('a colour change plays only on things that have a colour', () => {
    expect(effectApplies('color-change', { type: 'text' })).toBe(true)
    expect(effectApplies('color-change', { type: 'shape' })).toBe(true)
    expect(effectApplies('color-change', { type: 'image' })).toBe(false)
    expect(effectApplies('fade-in', { type: 'image' })).toBe(true)
  })
})

describe('every effect has a predictable start and end', () => {
  const visibleOf = (k: Keyframe | undefined) => k?.['visibility'] ?? 'visible'
  const opacityOf = (k: Keyframe | undefined) => (k?.['opacity'] === undefined ? 1 : Number(k['opacity']))
  for (const [category, types] of Object.entries(EFFECTS)) {
    for (const type of types) {
      it(`${type} (${category})`, () => {
        const e = fx('a', { category: category as Effect['category'], type: type as Effect['type'] })
        const { keyframes, fill } = buildKeyframes(e, { type: 'text' })
        const first = keyframes[0], last = keyframes[keyframes.length - 1]
        expect(keyframes.length).toBeGreaterThan(0)
        if (category === 'entrance') {
          expect(fill).toBe('both')
          expect(visibleOf(last)).toBe('visible')
          expect(opacityOf(last)).toBe(1)
          // it starts hidden: either not visible, or fully transparent, or clipped away, or shrunk to nothing
          const hiddenStart = visibleOf(first) === 'hidden' || opacityOf(first) === 0 || String(first?.['clipPath'] ?? '').includes('100%') || String(first?.['clipPath'] ?? '').includes('50%')
          expect(hiddenStart).toBe(true)
        }
        if (category === 'exit') {
          expect(fill).toBe('both')
          expect(visibleOf(first)).toBe('visible')
          expect(visibleOf(last)).toBe('hidden') // gone for good
        }
        if (category === 'emphasis') {
          expect(fill).toBe(EFFECT_INFO[type as Effect['type']].persists ? 'both' : 'none')
          expect(keyframes.every((k) => visibleOf(k) === 'visible')).toBe(true) // on screen the whole time
          if (!EFFECT_INFO[type as Effect['type']].persists) {
            // a one-off emphasis lands where it began
            const t = String(last?.['transform'] ?? '')
            expect(/^(translate\(-?0(\.0+)?px, 0\)|translate\(0, -?0(\.0+)?px\)|scale\(1\)|rotate\(0deg\))?$/.test(t) || t === '').toBe(true)
          }
        }
      })
    }
  }
  it('options change the motion: direction, distance, scale and rotation', () => {
    expect(buildKeyframes(fx('a', { type: 'fly-in', direction: 'right', distance: 100 })).keyframes[0]!['transform']).toBe('translate(100px, 0)')
    expect(buildKeyframes(fx('a', { type: 'fly-in', direction: 'up', distance: 100 })).keyframes[0]!['transform']).toBe('translate(0, -100px)')
    expect(buildKeyframes(fx('a', { type: 'zoom-in', scale: 0.5 })).keyframes[0]!['transform']).toBe('scale(0.5)')
    expect(buildKeyframes(fx('a', { category: 'exit', type: 'spin-out', rotation: 90 })).keyframes[1]!['transform']).toBe('rotate(90deg) scale(0)')
    expect(buildKeyframes(fx('a', { category: 'emphasis', type: 'transparency', opacity: 0.2 })).keyframes[1]).toEqual({ opacity: 0.2 })
  })
  it('a colour change animates the colour of text and the fill of a shape, from where it is now', () => {
    const e = fx('a', { category: 'emphasis', type: 'color-change', color: '#00ff00' })
    expect(buildKeyframes(e, { type: 'text' })).toMatchObject({ keyframes: [{ color: '#00ff00' }], inner: true })
    expect(buildKeyframes(e, { type: 'shape' })).toMatchObject({ keyframes: [{ backgroundColor: '#00ff00' }], inner: true })
  })
  it('the curves that are already sampled (bounce, shake) are played linearly', () => {
    expect(buildKeyframes(fx('a', { type: 'bounce-in' })).linear).toBe(true)
    expect(buildKeyframes(fx('a', { category: 'emphasis', type: 'shake' })).linear).toBe(true)
    expect(buildKeyframes(fx('a', { type: 'fade-in' })).linear).toBeUndefined()
  })
  it('the bounce lands exactly where it should (no drift at the end)', () => {
    const { keyframes } = buildKeyframes(fx('a', { type: 'bounce-in', distance: 300 }))
    expect(keyframes[0]!['transform']).toBe('translate(0, -300px)')
    expect(keyframes[keyframes.length - 1]!['transform']).toBe('translate(0, 0px)')
  })
})

describe('the timeline (On Click, With Previous, After Previous)', () => {
  const all = ids('e1', 'e2', 'e3')
  it('the example from the brief: click, then after previous with a delay, then with previous', () => {
    const steps = compileTimeline([
      fx('1', { elementId: 'e1', start: 'click', duration: 800 }),
      fx('2', { elementId: 'e2', start: 'after', duration: 1000, delay: 200 }),
      fx('3', { elementId: 'e3', start: 'with', duration: 700 }),
    ], all)
    expect(steps).toHaveLength(2) // the automatic step (empty) and the one click
    expect(steps[0]!.effects).toHaveLength(0)
    const [a, b, c] = steps[1]!.effects
    expect([a!.at, a!.begin, a!.end]).toEqual([0, 0, 800])
    expect([b!.at, b!.begin, b!.end]).toEqual([800, 1000, 2000]) // starts when 1 ends, plus its own 200 ms delay
    expect([c!.at, c!.begin, c!.end]).toEqual([800, 800, 1500]) // with 2: starts when 2 starts
    expect(steps[1]!.duration).toBe(2000)
  })
  it('effects before the first click play on their own (step 0); each click is a new step', () => {
    const steps = compileTimeline([fx('1', { start: 'with' }), fx('2', { elementId: 'e2', start: 'after' }), fx('3', { elementId: 'e3', start: 'click' }), fx('4', { start: 'click' })], all)
    expect(steps.map((s) => s.effects.map((p) => p.effect.id))).toEqual([['1', '2'], ['3'], ['4']])
  })
  it('an effect counts its repeats and its play-back in its length', () => {
    expect(playTime(fx('1', { duration: 500, repeat: 3 }))).toBe(1500)
    expect(playTime(fx('1', { duration: 500, repeat: 2, reverse: true }))).toBe(2000)
    const steps = compileTimeline([fx('1', { start: 'click', duration: 500, repeat: 2 }), fx('2', { elementId: 'e2', start: 'after', duration: 100 })], all)
    expect(steps[1]!.effects[1]!.at).toBe(1000)
  })
  it('an effect whose element is gone is skipped, and what follows it still lines up', () => {
    const steps = compileTimeline([fx('1', { elementId: 'gone', start: 'click' }), fx('2', { elementId: 'e2', start: 'click' })], all)
    expect(steps.map((s) => s.effects.length)).toEqual([0, 1])
  })
  it('a slide with no effects has one empty step', () => {
    expect(compileTimeline([], all)).toEqual([{ effects: [], duration: 0 }])
  })
  it('elements are hidden from the start only when their first effect is an entrance', () => {
    const list = [fx('1', { elementId: 'e1' }), fx('2', { elementId: 'e2', category: 'exit', type: 'fade-out' }), fx('3', { elementId: 'e2' }), fx('4', { elementId: 'gone' })]
    expect([...initiallyHidden(list, all)]).toEqual(['e1'])
  })
})

/** A stand-in for the browser's animations: records what was made and lets a test finish or cancel it. */
function fake() {
  const made: { target: string; frames: Keyframe[]; options: KeyframeAnimationOptions; state: string; finish: () => void; resolve: () => void }[] = []
  const animate = (el: Element, frames: Keyframe[], options: KeyframeAnimationOptions) => {
    let resolve!: () => void
    const finished = new Promise<Animation>((r) => { resolve = () => r(a as unknown as Animation) })
    const rec = { target: (el as unknown as { id: string }).id, frames, options, state: 'running', finish: () => { rec.state = 'finished'; resolve() }, resolve }
    const a = { get playState() { return rec.state }, finished, finish: () => rec.finish(), cancel: () => { rec.state = 'idle' } }
    made.push(rec)
    return a as unknown as Animation
  }
  const root = { querySelector: (sel: string) => { const m = /data-pt-el="([^"]+)"/.exec(sel); return m ? ({ id: m[1], firstElementChild: { id: `${m[1]}-inner` } } as unknown as Element) : null } } as unknown as ParentNode
  return { made, animate, root }
}
const el = (id: string, type = 'text') => ({ id, type }) as never
const slideOf = (effects: Effect[], ...elementIds: string[]) => ({ elements: elementIds.map((i) => el(i)), effects })
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('the player', () => {
  it('start plays the automatic step with one clock: every effect gets its own offset as a delay', () => {
    const f = fake()
    const p = new SlidePlayer(f.root, slideOf([fx('1', { start: 'with', duration: 800 }), fx('2', { elementId: 'e2', start: 'after', delay: 100, duration: 500 })], 'e1', 'e2'), { animate: f.animate })
    p.start()
    expect(f.made.map((m) => [m.target, m.options.delay, m.options.duration])).toEqual([['e1', 0, 800], ['e2', 900, 500]])
    expect(p.running).toBe(true)
  })

  it('clicks: the first click plays step one; a click while it moves finishes it; the next click plays the next step; at the end there is nothing left', async () => {
    const f = fake()
    const p = new SlidePlayer(f.root, slideOf([fx('1', { start: 'click' }), fx('2', { elementId: 'e2', start: 'click' })], 'e1', 'e2'), { animate: f.animate })
    p.start()
    expect(f.made).toHaveLength(0) // nothing is automatic
    expect(p.advance()).toBe('played'); expect(f.made.map((m) => m.target)).toEqual(['e1'])
    expect(p.advance()).toBe('finished'); expect(f.made[0]!.state).toBe('finished'); expect(p.running).toBe(false)
    expect(p.advance()).toBe('played'); expect(f.made.map((m) => m.target)).toEqual(['e1', 'e2'])
    f.made[1]!.finish(); await flush()
    expect(p.running).toBe(false)
    expect(p.advance()).toBe('none')
    expect(p.remaining).toBe(0)
  })

  it('a step that finishes on its own tells the page, once', async () => {
    const f = fake(); let changes = 0
    const p = new SlidePlayer(f.root, slideOf([fx('1', { start: 'with' })], 'e1'), { animate: f.animate, onChange: () => changes++ })
    p.start(); const afterStart = changes
    f.made[0]!.finish(); await flush()
    expect(changes).toBe(afterStart + 1)
    expect(p.running).toBe(false)
  })

  it('back takes one step back at once (no animation); with nothing to take back it says so, and the page goes to the previous slide', () => {
    const f = fake()
    const p = new SlidePlayer(f.root, slideOf([fx('1', { start: 'click' }), fx('2', { elementId: 'e2', start: 'click' })], 'e1', 'e2'), { animate: f.animate })
    p.start(); p.advance(); p.advance(); p.advance() // finish, play step 2
    expect(p.clicks).toBe(2)
    expect(p.back()).toBe(true) // running → finishes it
    expect(p.back()).toBe(true) // now one step back
    expect(p.clicks).toBe(1)
    expect(f.made.filter((m) => m.state === 'finished').length).toBeGreaterThan(0)
    expect(p.back()).toBe(true)
    expect(p.clicks).toBe(0)
    expect(p.back()).toBe(false)
  })

  it('showAll finishes everything at once; reset puts it back (nothing left running either way)', () => {
    const f = fake()
    const p = new SlidePlayer(f.root, slideOf([fx('1', { start: 'click' }), fx('2', { elementId: 'e2', start: 'click' })], 'e1', 'e2'), { animate: f.animate })
    p.start(); p.showAll()
    expect(p.running).toBe(false); expect(p.remaining).toBe(0)
    expect(f.made.every((m) => m.options.delay === 0)).toBe(true) // jumped, not played
    p.reset(); expect(p.remaining).toBe(p.totalClicks + 1)
    expect(f.made.filter((m) => m.state === 'running')).toHaveLength(0)
  })

  it('reduced motion: the effects still happen, at once', () => {
    const f = fake()
    const p = new SlidePlayer(f.root, slideOf([fx('1', { start: 'with', duration: 5000 })], 'e1'), { animate: f.animate, reducedMotion: true })
    p.start()
    expect(f.made[0]!.state).toBe('finished'); expect(p.running).toBe(false)
  })

  it('rapid clicking never leaves two steps running or a step played twice', () => {
    const f = fake()
    const list = Array.from({ length: 6 }, (_, i) => fx(`f${i}`, { elementId: 'e1', start: 'click' }))
    const p = new SlidePlayer(f.root, slideOf(list, 'e1'), { animate: f.animate })
    p.start()
    for (let i = 0; i < 40; i++) p.advance()
    expect(f.made).toHaveLength(6) // each step exactly once
    expect(p.running).toBe(false)
    expect(p.advance()).toBe('none')
  })

  it('destroy cancels everything and the player stops answering', () => {
    const f = fake()
    const p = new SlidePlayer(f.root, slideOf([fx('1', { start: 'with' })], 'e1'), { animate: f.animate })
    p.start(); p.destroy()
    expect(f.made.every((m) => m.state === 'idle')).toBe(true)
    expect(p.advance()).toBe('none'); expect(p.back()).toBe(false)
  })

  it('a colour change animates the element inside the wrapper; the others animate the wrapper', () => {
    const f = fake()
    const p = new SlidePlayer(f.root, slideOf([fx('1', { start: 'with', category: 'emphasis', type: 'color-change' }), fx('2', { start: 'with', elementId: 'e2' })], 'e1', 'e2'), { animate: f.animate })
    p.start()
    expect(f.made.map((m) => m.target)).toEqual(['e1-inner', 'e2'])
  })
})

describe('drawing a slide that is played by effects', () => {
  const theme = { colors: { primary: '#111', onPrimary: '#fff', surface: '#eee', secondary: '#888', textPrimary: '#000', textSecondary: '#555' }, fonts: { heading: 'Inter', body: 'Inter' } } as never
  const box = { id: 'e1', x: 100, y: 50, width: 300, height: 200, zIndex: 3, opacity: 1, rotation: 0 }
  const shape = { ...box, type: 'shape', shape: 'rect', fill: '#fff' }
  type Node = { props: { style: Record<string, unknown>; children?: unknown; [k: string]: unknown } }
  it('an element with effects sits in a marked wrapper, hidden when it starts with an entrance, and its own box is at 0,0 inside', () => {
    const slide = { effects: [fx('1')] } as never
    const w = ElementView({ el: shape as never, theme, slide, fx: { hidden: true } }) as unknown as Node
    expect(w.props['data-pt-el']).toBe('e1')
    expect(w.props.style).toMatchObject({ position: 'absolute', left: 100, top: 50, width: 300, height: 200, zIndex: 3, visibility: 'hidden' })
    expect((w.props.children as Node).props.style).toMatchObject({ left: 0, top: 0 })
    const shown = ElementView({ el: shape as never, theme, slide, fx: { hidden: false } }) as unknown as Node
    expect(shown.props.style['visibility']).toBeUndefined()
  })
  it('an element without effects is drawn exactly as before (no wrapper)', () => {
    const n = ElementView({ el: shape as never, theme, slide: {} as never }) as unknown as Node
    expect(n.props['data-pt-el']).toBeUndefined()
    expect(n.props.style).toMatchObject({ left: 100, top: 50 })
  })
  it('hiddenAtStart lists the elements whose first effect is an entrance', () => {
    expect([...hiddenAtStart({ elements: [el('e1'), el('e2')], effects: [fx('1'), fx('2', { elementId: 'e2', category: 'exit', type: 'fade-out' })] })]).toEqual(['e1'])
  })
})
