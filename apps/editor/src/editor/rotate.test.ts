import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { normAngle, transformOf, turnOf, visualBox, type Presentation } from '@prompttoppt/validation'
import { flipElements, handleAngle, handleCursor, resizeTurned, rotateElements, snapAngle, turnPoint } from './rotate'

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.01)

describe('angles are stored one way', () => {
  it('within (-180, 180], a tenth of a degree, no -0', () => {
    expect(normAngle(270)).toBe(-90)
    expect(normAngle(-270)).toBe(90)
    expect(normAngle(360)).toBe(0)
    expect(Object.is(normAngle(-360), 0)).toBe(true)
    expect(normAngle(180)).toBe(180)
    expect(normAngle(12.345)).toBe(12.3)
  })
  it('charts and tables are drawn upright even when an old deck holds an angle on one', () => {
    expect(turnOf({ type: 'chart', rotation: 30 })).toBe(0)
    expect(turnOf({ type: 'table', rotation: 30 })).toBe(0)
    expect(turnOf({ type: 'shape', rotation: 30 })).toBe(30)
  })
  it('the box a turned object fills on the slide (for lining up and for the toolbars)', () => {
    const b = visualBox({ x: 0, y: 0, width: 200, height: 100 }, 90)
    near(b.x, 50); near(b.y, -50); near(b.width, 100); near(b.height, 200)
  })
})

describe('the rotate handle', () => {
  it('pointing straight down (where the handle rests) is upright; right of the object is a quarter turn back', () => {
    expect(handleAngle(100, 100, 100, 300)).toBe(0)
    expect(handleAngle(100, 100, 300, 100)).toBe(-90)
    expect(handleAngle(100, 100, -100, 100)).toBe(90)
    expect(handleAngle(100, 100, 100, -100)).toBe(180)
  })
  it('clicks onto straight and every 45° within 3°; Shift gives 15° steps; otherwise whole degrees', () => {
    expect(snapAngle(2.4, false)).toBe(0)
    expect(snapAngle(-46.9, false)).toBe(-45)
    expect(snapAngle(31.4, false)).toBe(31)
    expect(snapAngle(31.4, true)).toBe(30)
    expect(snapAngle(178, false)).toBe(180)
  })
})

describe('resizing an object that is turned', () => {
  it('unturned: the same as before', () => {
    expect(resizeTurned({ x: 10, y: 10, width: 100, height: 50 }, 0, 'se', 20, 10)).toEqual({ x: 10, y: 10, width: 120, height: 60 })
  })
  it('turned a quarter: dragging the right handle DOWN the slide widens it, and its left side stays where it is on the slide', () => {
    const b = { x: 0, y: 0, width: 200, height: 100 }
    const n = resizeTurned(b, 90, 'e', 0, 50)
    near(n.width, 250); near(n.height, 100)
    // the middle of the left side (the handle opposite) is still in the same place on the slide
    const leftMid = (box: typeof b) => turnPoint({ x: box.x, y: box.y + box.height / 2 }, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 90)
    near(leftMid(n).x, leftMid(b).x); near(leftMid(n).y, leftMid(b).y)
  })
  it('a corner keeps the opposite corner still at any angle', () => {
    const b = { x: 300, y: 200, width: 300, height: 160 }
    const n = resizeTurned(b, 30, 'se', 40, 25)
    const nw = (box: typeof b) => turnPoint({ x: box.x, y: box.y }, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 30)
    near(nw(n).x, nw(b).x); near(nw(n).y, nw(b).y)
  })
  it('the resize cursor follows the turn', () => {
    expect(handleCursor('e')).toBe('ew-resize')
    expect(handleCursor('e', 90)).toBe('ns-resize')
    expect(handleCursor('n', 45)).toBe('nesw-resize')
  })
})

const deck = () => ({
  slides: [{ id: 's', elements: [
    { id: 'a', type: 'shape', x: 0, y: 0, width: 200, height: 100, rotation: 0, locked: false, zIndex: 1, opacity: 1 },
    { id: 'b', type: 'shape', x: 300, y: 0, width: 100, height: 100, rotation: 10, locked: false, zIndex: 2, opacity: 1 },
    { id: 'c', type: 'chart', x: 0, y: 300, width: 400, height: 300, rotation: 0, locked: false, zIndex: 3, opacity: 1 },
    { id: 'l', type: 'shape', x: 0, y: 700, width: 100, height: 100, rotation: 0, locked: true, zIndex: 4, opacity: 1 },
  ] }],
}) as unknown as Presentation
const el = (d: Presentation, id: string) => d.slides[0]!.elements.find((e) => e.id === id)!

describe('rotateElements', () => {
  it('to an angle, or by one; each around its own centre; marks the slide hand-edited', () => {
    const d = produce(deck(), (x) => { rotateElements(x, 's', ['a', 'b'], { by: 90 }) })
    expect(el(d, 'a')).toMatchObject({ x: 0, y: 0, rotation: 90 })
    expect(el(d, 'b').rotation).toBe(100)
    expect((d.slides[0] as { manual?: boolean }).manual).toBe(true)
  })
  it('never a chart, a table or a locked object; nothing to do records nothing', () => {
    let n = -1
    const d = produce(deck(), (x) => { n = rotateElements(x, 's', ['c', 'l'], { to: 45 }) })
    expect(n).toBe(0)
    expect(el(d, 'c').rotation).toBe(0)
    expect(el(d, 'l').rotation).toBe(0)
    const same = produce(deck(), (x) => { n = rotateElements(x, 's', ['b'], { to: 370 }) }) // 370 is 10, which it already is
    expect(n).toBe(0); expect(same).toBe(same)
  })
  it('a whole group turns as one piece around its middle, and a quarter turn and back puts it exactly where it was', () => {
    const start = deck()
    const turned = produce(start, (x) => { rotateElements(x, 's', ['a', 'b'], { by: 90 }, true) })
    expect(el(turned, 'a').rotation).toBe(90)
    expect(el(turned, 'a').x).not.toBe(0) // it moved round the middle of the piece
    const back = produce(turned, (x) => { rotateElements(x, 's', ['a', 'b'], { by: -90 }, true) })
    for (const id of ['a', 'b']) {
      expect(Math.abs(el(back, id).x - el(start, id).x)).toBeLessThanOrEqual(1)
      expect(Math.abs(el(back, id).y - el(start, id).y)).toBeLessThanOrEqual(1)
      expect(el(back, id).rotation).toBe(el(start, id).rotation)
    }
  })
  it('a group holding a chart is not turned at all (it would come apart)', () => {
    let n = -1
    produce(deck(), (x) => { n = rotateElements(x, 's', ['a', 'c'], { by: 90 }, true) })
    expect(n).toBe(0)
  })
})

describe('flipping (PowerPoint\'s Flip: mirrored as seen)', () => {
  const fdeck = () => ({ slides: [{ id: 's', elements: [
    { id: 'pic', type: 'image', x: 0, y: 0, width: 200, height: 100, rotation: 0, locked: false, zIndex: 1, opacity: 1 },
    { id: 'arrow', type: 'shape', x: 300, y: 0, width: 100, height: 100, rotation: 30, locked: false, zIndex: 2, opacity: 1 },
    { id: 'txt', type: 'text', x: 0, y: 200, width: 400, height: 100, rotation: 0, locked: false, zIndex: 3, opacity: 1 },
  ] }] }) as unknown as Presentation
  it('a picture mirrors left-right, and back again; its box never moves', () => {
    const once = produce(fdeck(), (x) => { flipElements(x, 's', ['pic'], 'h') })
    expect(el(once, 'pic')).toMatchObject({ x: 0, y: 0, width: 200, height: 100, flipH: true })
    const twice = produce(once, (x) => { flipElements(x, 's', ['pic'], 'h') })
    expect('flipH' in el(twice, 'pic')).toBe(false)
  })
  it('a turned shape mirrors as SEEN: its angle reverses (30° → -30°)', () => {
    const d = produce(fdeck(), (x) => { flipElements(x, 's', ['arrow'], 'v') })
    expect(el(d, 'arrow')).toMatchObject({ flipV: true, rotation: -30 })
  })
  it('a text box alone is never mirrored (its words would read backwards)', () => {
    let n = -1
    produce(fdeck(), (x) => { n = flipElements(x, 's', ['txt'], 'h') })
    expect(n).toBe(0)
  })
  it('a whole group mirrors as one piece: members swap sides; its words move but stay readable', () => {
    const d = produce(fdeck(), (x) => { flipElements(x, 's', ['pic', 'txt'], 'h', true) })
    expect(el(d, 'pic').flipH).toBe(true)
    expect('flipH' in el(d, 'txt')).toBe(false)
    expect(el(d, 'pic').x).toBe(200) // was at the left edge of a 400-wide piece: now at its right
  })
  it('drawn with one transform everywhere (slide, editor, Morph): turn and mirror; nothing for a text box', () => {
    expect(transformOf({ type: 'image', rotation: 0, flipH: true })).toBe('scale(-1, 1)')
    expect(transformOf({ type: 'shape', rotation: 30, flipV: true })).toBe('rotate(30deg) scale(1, -1)')
    expect(transformOf({ type: 'text', rotation: 0, flipH: true })).toBeUndefined()
    expect(transformOf({ type: 'image', rotation: 0 }, true)).toBe('rotate(0deg) scale(1, 1)')
  })
})

describe('background pattern commands', () => {
  it('a pattern on a picture slide: the slide becomes the deck colour with the pattern; changing the colour keeps the pattern, re-tinted; none takes it off', async () => {
    const C = await import('./commands')
    const d0 = { theme: { colors: { background: '#0B1020', textPrimary: '#FFFFFF', textSecondary: '#CCCCCC', primary: '#2563EB', accent: '#F59E0B', onPrimary: '#FFFFFF', surface: '#111827', secondary: '#64748B' } }, slides: [{ id: 's', elements: [], background: { type: 'image', value: 'https://x/y.jpg' } }] } as unknown as Presentation
    const a = produce(d0, (x) => { C.setBackgroundPattern(x, 's', 'grid') })
    expect(a.slides[0]!.background).toMatchObject({ type: 'color', value: '#0B1020', pattern: { kind: 'grid', color: '#FFFFFF' } })
    const b = produce(a, (x) => { C.setSlideBackground(x, 's', '#F8FAFC') })
    expect(b.slides[0]!.background).toMatchObject({ value: '#F8FAFC', pattern: { kind: 'grid', color: '#000000' } })
    const c = produce(b, (x) => { C.setBackgroundPattern(x, 's', null) })
    expect('pattern' in (c.slides[0]!.background as object)).toBe(false)
  })
})

describe('a new background keeps coloured words readable', () => {
  it('a dark-blue word in a title goes lighter (still blue-ish) on a black background; a highlighted word is left on its marker', async () => {
    const C = await import('./commands')
    const title = { id: 't', type: 'text', role: 'title', x: 0, y: 0, width: 800, height: 200, rotation: 0, locked: false, zIndex: 1, opacity: 1, fontSize: 60, align: 'left', valign: 'top', color: 'textPrimary', bullet: '•', paragraphs: [{ runs: [{ text: 'Journey ' }, { text: 'Physics', color: '#0056B3' }, { text: ' marked', color: '#0056B3', highlight: '#FFF176' }] }] }
    const d0 = { theme: { colors: { background: '#FFFFFF', textPrimary: '#111111', textSecondary: '#555555', primary: '#2563EB', accent: '#F59E0B', onPrimary: '#FFFFFF', surface: '#F3F4F6', secondary: '#64748B' } }, slides: [{ id: 's', elements: [title] }] } as unknown as Presentation
    const d = produce(d0, (x) => { C.setSlideBackground(x, 's', '#000000') })
    const runs = (d.slides[0]!.elements[0] as unknown as { paragraphs: { runs: { color?: string }[] }[] }).paragraphs[0]!.runs
    expect(runs[1]!.color).not.toBe('#0056B3')
    expect(parseInt(runs[1]!.color!.slice(5, 7), 16)).toBeGreaterThan(parseInt(runs[1]!.color!.slice(1, 3), 16)) // still blue (blue channel above red)
    expect(runs[2]!.color).toBe('#0056B3')
  })
})
