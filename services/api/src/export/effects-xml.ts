import type { Animation, Effect, SlideElement } from '@prompttoppt/validation'
import { EFFECT_INFO, compileTimeline, compileTriggers, pathOf, type Placed, type Pt } from '@prompttoppt/ui/motion-core'

/**
 * The slide's animation as PowerPoint writes it: <p:timing> with the MAIN SEQUENCE (one outer <p:par> per click, nested <p:par> per "start at" moment,
 * one <p:par> per effect with presetID / presetClass / presetSubtype) and one INTERACTIVE SEQUENCE per trigger object.
 *
 * The steps come from the editor's own timeline (packages/ui motion/timeline.ts, `compileTimeline`), so the clicks, the With / After Previous chains and the
 * delays are what the editor plays. Every effect is written as the behaviours PowerPoint itself writes for that effect (the XML of PowerPoint 16's own
 * effects was read back from a file saved by PowerPoint and copied: see docs/OBJECT_ANIMATIONS.md), so it plays in PowerPoint with or without a matching preset id.
 */

export interface ShapeInfo {
  /** ids of the exported shapes that carry this element (an image with an overlay, or a placeholder box with its caption, is more than one) */
  spids: number[]
  /** what the first shape is in the file: a shape or text box, a picture, a chart, a table, a connector */
  kind: 'sp' | 'pic' | 'chart' | 'table' | 'cxn'
  /** a text box (not a drawn shape): its background is not animated with it */
  textBox: boolean
  /** paragraphs actually in the file (the editor's paragraphs are checked against it before a per-paragraph effect is written) */
  paragraphs: number
}

export interface LegacyEntrance { elementId: string; animation: Animation; paragraphs: number }

export interface TimingInput {
  effects: readonly Effect[]
  shapes: ReadonlyMap<string, ShapeInfo>
  elementTypes: ReadonlyMap<string, SlideElement['type']>
  canvas: { w: number; h: number }
  /** the theme's automatic entrance of elements that have no effects of their own */
  legacy?: readonly LegacyEntrance[]
}

class Ids {
  private n = 2 // 1 = the root, 2 = the main sequence
  next() { return ++this.n }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)))
const fmt = (n: number, d = 4) => String(Math.round(n * 10 ** d) / 10 ** d)
const num = (n: number) => (Object.is(n, -0) ? '0' : fmt(n))

interface Tgt { spid: number; para?: number }
const tgt = (t: Tgt) => `<p:tgtEl>${t.para === undefined ? `<p:spTgt spid="${t.spid}"/>` : `<p:spTgt spid="${t.spid}"><p:txEl><p:pRg st="${t.para}" end="${t.para}"/></p:txEl></p:spTgt>`}</p:tgtEl>`

// ─── behaviours (the building blocks PowerPoint's own effects are made of) ───────────────────────────────────────────

interface Bx { ids: Ids; t: Tgt }
const cTn = (b: Bx, attrs: string, delay?: number) =>
  delay === undefined ? `<p:cTn id="${b.ids.next()}" ${attrs}/>` : `<p:cTn id="${b.ids.next()}" ${attrs}><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst></p:cTn>`

const setStyle = (b: Bx, attr: string, to: string, attrs: string, delay?: number) =>
  `<p:set><p:cBhvr>${cTn(b, attrs, delay)}${tgt(b.t)}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${to}"/></p:to></p:set>`
const show = (b: Bx) => setStyle(b, 'style.visibility', 'visible', 'dur="1" fill="hold"', 0)
const hide = (b: Bx, at: number) => setStyle(b, 'style.visibility', 'hidden', 'dur="1" fill="hold"', Math.max(0, at))
const fade = (b: Bx, dir: 'in' | 'out', dur: number, delay?: number) => `<p:animEffect transition="${dir}" filter="fade"><p:cBhvr>${cTn(b, `dur="${dur}"`, delay)}${tgt(b.t)}</p:cBhvr></p:animEffect>`
const wipeEffect = (b: Bx, dir: 'in' | 'out', side: string, dur: number) => `<p:animEffect transition="${dir}" filter="wipe(${side})"><p:cBhvr>${cTn(b, `dur="${dur}"`)}${tgt(b.t)}</p:cBhvr></p:animEffect>`
const barn = (b: Bx, dir: 'in' | 'out', filter: string, dur: number) => `<p:animEffect transition="${dir}" filter="barn(${filter})"><p:cBhvr>${cTn(b, `dur="${dur}"`)}${tgt(b.t)}</p:cBhvr></p:animEffect>`

type Tav = [tm: number, value: string | number]
const tav = ([tm, v]: Tav) => `<p:tav tm="${Math.round(tm)}"><p:val>${typeof v === 'number' ? `<p:fltVal val="${num(v)}"/>` : `<p:strVal val="${v}"/>`}</p:val></p:tav>`
const anim = (b: Bx, attr: string, dur: number, vals: Tav[], opts: { base?: boolean; hold?: boolean } = {}) =>
  `<p:anim calcmode="lin" valueType="num"><p:cBhvr${opts.base ? ' additive="base"' : ''}>${cTn(b, `dur="${dur}"${opts.hold === false ? '' : ' fill="hold"'}`)}${tgt(b.t)}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst>${vals.map(tav).join('')}</p:tavLst></p:anim>`

/** `#ppt_x` moved by a fraction of the slide (PowerPoint's formula language: ppt_x / ppt_y / ppt_w / ppt_h are fractions of the slide; `#` = the value the object has when it is not animated) */
const off = (name: string, delta: number, hash = true) => { const base = `${hash ? '#' : ''}${name}`; return Math.abs(delta) < 1e-6 ? base : `${base}${delta < 0 ? '-' : '+'}${fmt(Math.abs(delta))}` }
const times = (name: string, k: number, hash = true) => (k === 0 ? 0 : `${num(k)}*${hash ? '#' : ''}${name}`)

const animScaleBy = (b: Bx, dur: number, k: number, attrs = 'fill="hold"') => `<p:animScale><p:cBhvr>${cTn(b, `dur="${dur}" ${attrs}`)}${tgt(b.t)}</p:cBhvr><p:by x="${Math.round(k * 100000)}" y="${Math.round(k * 100000)}"/></p:animScale>`
const animRotBy = (b: Bx, dur: number, deg: number, delay?: number) => `<p:animRot by="${Math.round(deg * 60000)}"><p:cBhvr>${cTn(b, 'dur="' + dur + '" fill="hold"', delay)}${tgt(b.t)}<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>`
const srgb = (hex: string) => `<a:srgbClr val="${hex.replace('#', '').slice(0, 6).toUpperCase()}"/>`

// ─── geometry of an effect ──────────────────────────────────────────────────────────────────────────────────────────

type Dir8 = NonNullable<Effect['direction']>
/** unit vector the object is offset by at the START of an entrance from `dir` (the editor's FROM table: coming from the left = starting to the left) */
const FROM_VEC: Record<Dir8, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1], 'up-left': [-1, -1], 'up-right': [1, -1], 'down-left': [-1, 1], 'down-right': [1, 1] }
/** PowerPoint's Fly In sub type: the sides it comes from (1 top, 2 right, 4 bottom, 8 left) */
const SIDE_BITS: Record<Dir8, number> = { up: 1, right: 2, down: 4, left: 8, 'up-right': 3, 'down-right': 6, 'down-left': 12, 'up-left': 9 }
/** wipe has four sides only: a corner takes its horizontal side */
const wipeSide = (d: Dir8): 'up' | 'right' | 'down' | 'left' => (d === 'up' || d === 'down' || d === 'left' || d === 'right' ? d : d.endsWith('left') ? 'left' : 'right')
const WIPE_FILTER = { up: 'up', right: 'right', down: 'down', left: 'left' } as const
const WIPE_SUBTYPE = { up: 1, right: 2, down: 4, left: 8 } as const
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' } as const

/** accelerate / decelerate shares (thousandths of a percent) for the editor's easings; "back-out" overshoots in the player, a file can only slow down at the end */
const EASE: Record<Effect['easing'], [number, number]> = { linear: [0, 0], ease: [25000, 75000], 'ease-in': [100000, 0], 'ease-out': [0, 100000], 'ease-in-out': [50000, 50000], 'power2-out': [0, 100000], 'power2-in-out': [50000, 50000], 'back-out': [0, 100000] }
/** effects whose own motion already is a curve the player plays linearly (or steps): an easing on top would bend it */
const NO_EASING = new Set<Effect['type']>(['bounce-in', 'shake', 'bounce', 'teeter', 'blink', 'appear', 'disappear', 'pulse', 'transparency'])

const bounceOut = (t: number) => {
  const n = 7.5625, d = 2.75
  if (t < 1 / d) return n * t * t
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
  return n * (t -= 2.625 / d) * t + 0.984375
}

/** the curve a motion path is written as: a polyline through its points, or (for the preset arc / turn / circle) cubic Béziers through every third point */
export function motionPathString(points: readonly Pt[], W: number, H: number, smooth: boolean): string {
  const p: [number, number][] = points.map((q) => [q[0] / W, q[1] / H])
  if (p.length === 0 || p[0]![0] !== 0 || p[0]![1] !== 0) p.unshift([0, 0])
  const f = (n: number) => fmt(n, 4)
  if (!smooth || p.length < 5) return `M 0 0 ${p.slice(1).map((q) => `L ${f(q[0])} ${f(q[1])}`).join(' ')} E`
  const keep = p.filter((_, i) => i % 3 === 0 || i === p.length - 1)
  const at = (i: number) => keep[Math.min(keep.length - 1, Math.max(0, i))]!
  let d = 'M 0 0'
  for (let i = 0; i < keep.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    d += ` C ${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`
  }
  return `${d} E`
}

interface Ctx { W: number; H: number; elType: SlideElement['type'] }
interface Built { preset: number | null; subtype: number; kids: string }

/** the behaviours of one effect on one target (a shape, or one paragraph of it); `preset` is the nearest built-in of PowerPoint (null = none, it plays as written) */
function behaviours(b: Bx, e: Effect, c: Ctx): Built {
  const info = EFFECT_INFO[e.type]
  const dir = e.direction ?? info.defaults.direction ?? 'left'
  const dist = e.distance ?? info.defaults.distance ?? 0
  const scale = e.scale ?? info.defaults.scale ?? 1
  const rot = e.rotation ?? info.defaults.rotation ?? 0
  const opacity = e.opacity ?? info.defaults.opacity ?? 1
  const d = clamp(e.duration, 1, 3_600_000)
  const [vx, vy] = FROM_VEC[dir]
  const dx = (vx * dist) / c.W, dy = (vy * dist) / c.H
  const X = (v: number, hash = true) => off('ppt_x', v, hash), Y = (v: number, hash = true) => off('ppt_y', v, hash)
  const flat = (name: string) => anim(b, name, d, [[0, off(name, 0)], [100000, off(name, 0)]], { base: name === 'ppt_x' || name === 'ppt_y' })
  const enter = (kids: string, preset: number | null, subtype = 0): Built => ({ preset, subtype, kids: show(b) + kids })
  const leave = (kids: string, preset: number | null, subtype = 0): Built => ({ preset, subtype, kids: kids + hide(b, d - 1) })

  switch (e.type) {
    // ─ entrance
    case 'appear': return enter('', 1)
    case 'fade-in': return enter(fade(b, 'in', d), 10)
    case 'fly-in': {
      const k = show(b) + fade(b, 'in', d) + anim(b, 'ppt_x', d, [[0, X(dx)], [100000, X(0)]], { base: true }) + anim(b, 'ppt_y', d, [[0, Y(dy)], [100000, Y(0)]], { base: true })
      return { preset: 2, subtype: SIDE_BITS[dir], kids: k }
    }
    case 'float-in': return { preset: vy < 0 ? 47 : 42, subtype: 0, kids: show(b) + fade(b, 'in', d) + anim(b, 'ppt_x', d, [[0, X(dx)], [100000, X(0)]]) + anim(b, 'ppt_y', d, [[0, Y(dy)], [100000, Y(0)]]) }
    case 'rise-up': return enter(fade(b, 'in', d) + flat('ppt_x') + anim(b, 'ppt_y', d, [[0, Y(dist / c.H)], [100000, Y(0)]]), 37)
    case 'zoom-in': return enter(fade(b, 'in', d) + anim(b, 'ppt_w', d, [[0, times('ppt_w', scale)], [100000, '#ppt_w']]) + anim(b, 'ppt_h', d, [[0, times('ppt_h', scale)], [100000, '#ppt_h']]), 23, 16)
    case 'wipe-in': { const s = wipeSide(dir); return enter(wipeEffect(b, 'in', WIPE_FILTER[s], d), 22, WIPE_SUBTYPE[s]) }
    case 'split-in': { const vertical = dir === 'up' || dir === 'down'; return enter(barn(b, 'in', vertical ? 'outHorizontal' : 'outVertical', d), 16, vertical ? 42 : 37) }
    case 'bounce-in': {
      const N = 12, ys: Tav[] = Array.from({ length: N + 1 }, (_, i) => [(i / N) * 100000, Y((-(dist / c.H)) * (1 - bounceOut(i / N)))])
      return enter(fade(b, 'in', Math.max(1, Math.round(d / 8))) + flat('ppt_x') + anim(b, 'ppt_y', d, ys), 26)
    }
    case 'pop-in': return enter(fade(b, 'in', Math.round(d * 0.6)) + anim(b, 'ppt_w', d, [[0, 0], [60000, times('ppt_w', scale)], [100000, '#ppt_w']]) + anim(b, 'ppt_h', d, [[0, 0], [60000, times('ppt_h', scale)], [100000, '#ppt_h']]), null)
    case 'grow-turn': return enter(anim(b, 'ppt_w', d, [[0, times('ppt_w', scale)], [100000, '#ppt_w']]) + anim(b, 'ppt_h', d, [[0, times('ppt_h', scale)], [100000, '#ppt_h']]) + anim(b, 'style.rotation', d, [[0, -rot], [100000, 0]]) + fade(b, 'in', d), 31)
    case 'spin-in': return enter(anim(b, 'ppt_w', d, [[0, 0], [100000, '#ppt_w']]) + anim(b, 'ppt_h', d, [[0, 0], [100000, '#ppt_h']]) + anim(b, 'style.rotation', d, [[0, -rot], [100000, 0]]) + fade(b, 'in', d), 49)

    // ─ exit (the object is hidden for good in the last millisecond)
    case 'disappear': return { preset: 1, subtype: 0, kids: hide(b, 0) }
    case 'fade-out': return leave(fade(b, 'out', d), 10)
    case 'fly-out': return leave(fade(b, 'out', d) + anim(b, 'ppt_x', d, [[0, X(0, false)], [100000, X(dx, false)]], { base: true, hold: false }) + anim(b, 'ppt_y', d, [[0, Y(0, false)], [100000, Y(dy, false)]], { base: true, hold: false }), 2, SIDE_BITS[dir])
    case 'float-out': return leave(fade(b, 'out', d) + anim(b, 'ppt_x', d, [[0, X(0, false)], [100000, X(dx, false)]], { hold: false }) + anim(b, 'ppt_y', d, [[0, Y(0, false)], [100000, Y(dy, false)]], { hold: false }), vy < 0 ? 47 : 42)
    case 'zoom-out': return leave(fade(b, 'out', d) + anim(b, 'ppt_w', d, [[0, 'ppt_w'], [100000, times('ppt_w', scale, false)]], { hold: false }) + anim(b, 'ppt_h', d, [[0, 'ppt_h'], [100000, times('ppt_h', scale, false)]], { hold: false }), 23, 16)
    case 'wipe-out': { const s = OPPOSITE[wipeSide(dir)]; return leave(wipeEffect(b, 'out', WIPE_FILTER[s], d), 22, WIPE_SUBTYPE[s]) }
    case 'shrink': return leave(anim(b, 'ppt_w', d, [[0, 'ppt_w'], [100000, 0]], { hold: false }) + anim(b, 'ppt_h', d, [[0, 'ppt_h'], [100000, 0]], { hold: false }), null)
    case 'spin-out': return leave(anim(b, 'ppt_w', d, [[0, 'ppt_w'], [100000, 0]], { hold: false }) + anim(b, 'ppt_h', d, [[0, 'ppt_h'], [100000, 0]], { hold: false }) + anim(b, 'style.rotation', d, [[0, 0], [100000, rot]], { hold: false }) + fade(b, 'out', d), null)

    // ─ emphasis
    case 'pulse': return { preset: 26, subtype: 0, kids: animScaleBy(b, Math.max(1, Math.round(d / 2)), scale, 'autoRev="1" fill="hold"') }
    case 'grow-shrink': return { preset: 6, subtype: 0, kids: animScaleBy(b, d, scale) }
    case 'spin': return { preset: 8, subtype: 0, kids: animRotBy(b, d, rot) }
    case 'shake': {
      const N = 24, xs: Tav[] = Array.from({ length: N + 1 }, (_, i) => [(i / N) * 100000, X((Math.sin((i / N) * Math.PI * 6) * (i === N ? 0 : dist)) / c.W)])
      return { preset: null, subtype: 0, kids: anim(b, 'ppt_x', d, xs, { base: true }) }
    }
    case 'bounce': {
      const N = 24, ys: Tav[] = Array.from({ length: N + 1 }, (_, i) => [(i / N) * 100000, Y((-Math.abs(Math.sin((i / N) * Math.PI * 3)) * dist * (1 - i / N)) / c.H)])
      return { preset: null, subtype: 0, kids: anim(b, 'ppt_y', d, ys, { base: true }) }
    }
    case 'teeter': {
      const steps = [-rot, 2 * rot, -1.6 * rot, 1.2 * rot, -0.6 * rot], each = Math.max(1, Math.round(d / 5))
      return { preset: 32, subtype: 0, kids: steps.map((deg, i) => animRotBy(b, each, deg, i * each)).join('') }
    }
    case 'blink': {
      const q = Math.max(1, Math.round(d / 4)), toggles: ['hidden' | 'visible', number][] = [['hidden', q], ['visible', q * 2], ['hidden', q * 3], ['visible', q * 4]]
      return { preset: 35, subtype: 0, kids: toggles.map(([v, at]) => setStyle(b, 'style.visibility', v, 'dur="1" fill="hold"', Math.min(at, d))).join('') }
    }
    case 'transparency':
      // PowerPoint's own Transparency: the opacity is set at once and holds (there is no duration to it)
      return { preset: 9, subtype: 0, kids: setStyle(b, 'style.opacity', num(opacity), 'dur="indefinite"') + `<p:animEffect filter="image" prLst="opacity: ${num(opacity)}"><p:cBhvr rctx="IE">${cTn(b, 'dur="indefinite"')}${tgt(b.t)}</p:cBhvr></p:animEffect>` }
    case 'color-change': {
      const hex = e.color ?? info.defaults.color ?? '#e11d48'
      if (c.elType === 'shape') {
        return { preset: 1, subtype: 2, kids: `<p:animClr clrSpc="rgb" dir="cw"><p:cBhvr>${cTn(b, `dur="${d}" fill="hold"`)}${tgt(b.t)}<p:attrNameLst><p:attrName>fillcolor</p:attrName></p:attrNameLst></p:cBhvr><p:to>${srgb(hex)}</p:to></p:animClr>` + setStyle(b, 'fill.type', 'solid', `dur="${d}" fill="hold"`) + setStyle(b, 'fill.on', 'true', `dur="${d}" fill="hold"`) }
      }
      return { preset: 3, subtype: 2, kids: `<p:animClr clrSpc="rgb" dir="cw"><p:cBhvr override="childStyle">${cTn(b, `dur="${d}" fill="hold"`)}${tgt(b.t)}<p:attrNameLst><p:attrName>style.color</p:attrName></p:attrNameLst></p:cBhvr><p:to>${srgb(hex)}</p:to></p:animClr>` }
    }

    // ─ motion paths (relative to where the object sits; it stays at the end)
    case 'path-line': case 'path-arc': case 'path-turn': case 'path-circle': case 'path-custom': {
      const path = motionPathString(pathOf(e), c.W, c.H, e.type === 'path-arc' || e.type === 'path-turn' || e.type === 'path-circle')
      return { preset: null, subtype: 0, kids: `<p:animMotion origin="layout" path="${path}" pathEditMode="relative" ptsTypes=""><p:cBhvr>${cTn(b, `dur="${d}" fill="hold"`)}${tgt(b.t)}<p:attrNameLst><p:attrName>ppt_x</p:attrName><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr></p:animMotion>` }
    }
  }
}

const CLASS = { entrance: 'entr', emphasis: 'emph', exit: 'exit', path: 'path' } as const

// ─── one effect → its <p:par> nodes ─────────────────────────────────────────────────────────────────────────────────

type NodeType = 'clickEffect' | 'withEffect' | 'afterEffect'
interface Bld { spid: number; grpId: number; build?: 'p'; animBg: boolean; chart: boolean }

class Build {
  readonly ids = new Ids()
  readonly bld: Bld[] = []
  private grp = new Map<number, number>()
  constructor(readonly input: TimingInput) {}
  /** a build group per effect on a shape that has one (text and drawn shapes, charts; not pictures or tables) */
  group(spid: number, shape: ShapeInfo): number | undefined {
    if (shape.kind !== 'sp' && shape.kind !== 'chart') return undefined
    const g = this.grp.get(spid) ?? 0
    this.grp.set(spid, g + 1)
    return g
  }
}

/** The nodes of one effect (several when a text plays by paragraph, or when the object is more than one shape), the first with `nodeType`, the rest With Previous. */
function effectNodes(bd: Build, p: Placed, nodeType: NodeType, c: { shape: ShapeInfo; elType: SlideElement['type'] }): string {
  const e = p.effect
  const { shape } = c
  const ctx: Ctx = { W: bd.input.canvas.w, H: bd.input.canvas.h, elType: c.elType }
  const textual = shape.kind === 'sp' && shape.textBox
  const by = e.textBy && e.category !== 'path' ? e.textBy : 'object'
  const stagger = e.stagger ?? (by === 'letter' ? 40 : by === 'word' ? 120 : 250)
  const paragraphs = by === 'paragraph' && textual && shape.paragraphs > 1 ? shape.paragraphs : 0
  const iterate = (by === 'word' || by === 'letter') && textual ? (by === 'word' ? 'wd' : 'lt') : null
  const [accel, decel] = NO_EASING.has(e.type) ? [0, 0] : EASE[e.easing]
  const repeat = e.loop ? 'repeatCount="indefinite"' : e.repeat > 1 ? `repeatCount="${e.repeat * 1000}"` : ''
  const rewind = e.reverse && (e.category === 'emphasis' || e.category === 'path') ? 'autoRev="1"' : ''

  const nodes: string[] = []
  let first = true
  shape.spids.forEach((spid, k) => {
    const grpId = bd.group(spid, shape)
    const split = paragraphs > 0 && k === 0
    if (grpId !== undefined) bd.bld.push({ spid, grpId, ...(split ? { build: 'p' as const } : {}), animBg: shape.kind === 'sp' && !shape.textBox, chart: shape.kind === 'chart' })
    for (let part = 0; part < (split ? paragraphs : 1); part++) {
      const t: Tgt = split ? { spid, para: part } : { spid }
      const id = bd.ids.next() // the effect's own node comes before its behaviours
      const built = behaviours({ ids: bd.ids, t }, e, ctx)
      const delay = e.delay + (split ? part * stagger : 0)
      const attrs = [
        `id="${id}"`, ...(built.preset === null ? [] : [`presetID="${built.preset}"`]), `presetClass="${CLASS[e.category]}"`, `presetSubtype="${built.subtype}"`,
        ...(accel ? [`accel="${accel}"`] : []), ...(decel ? [`decel="${decel}"`] : []), ...(rewind ? [rewind] : []), ...(repeat ? [repeat] : []), 'fill="hold"',
        ...(grpId !== undefined ? [`grpId="${grpId}"`] : []), `nodeType="${first ? nodeType : 'withEffect'}"`,
      ]
      first = false
      const iter = iterate && !split && k === 0 ? `<p:iterate type="${iterate}"><p:tmPct val="${clamp((stagger / Math.max(1, e.duration)) * 100000, 1000, 100000)}"/></p:iterate>` : ''
      nodes.push(`<p:par><p:cTn ${attrs.join(' ')}><p:stCondLst><p:cond delay="${clamp(delay, 0, 3_600_000)}"/></p:stCondLst>${iter}<p:childTnLst>${built.kids}</p:childTnLst></p:cTn></p:par>`)
    }
  })
  return nodes.join('')
}

/** the nodes of one step's effects, grouped the way PowerPoint nests them: a new inner <p:par> starts at every "After Previous" moment */
function groupsXml(bd: Build, steps: Placed[], nodeFor: (p: Placed, i: number) => NodeType): string {
  const groups: { at: number; items: { p: Placed; i: number }[] }[] = []
  steps.forEach((p, i) => {
    const g = groups[groups.length - 1]
    if (!g || p.effect.start === 'after') groups.push({ at: p.at, items: [{ p, i }] })
    else g.items.push({ p, i })
  })
  return groups.map((g) => {
    const id = bd.ids.next()
    const nodes = g.items.map(({ p, i }) => {
      const shape = bd.input.shapes.get(p.effect.elementId)!
      return effectNodes(bd, p, nodeFor(p, i), { shape, elType: bd.input.elementTypes.get(p.effect.elementId) ?? 'text' })
    }).join('')
    return `<p:par><p:cTn id="${id}" fill="hold"><p:stCondLst><p:cond delay="${clamp(g.at, 0, 3_600_000)}"/></p:stCondLst><p:childTnLst>${nodes}</p:childTnLst></p:cTn></p:par>`
  }).join('')
}

// ─── the theme's own automatic entrance (elements that have no effects of their own) ────────────────────────────────

const ENTR_MAX_EFFECT_MS = 450
const ENTR_MAX_START_MS = 700

function legacyEntrance(bd: Build, t: Tgt, a: Animation, nodeType: NodeType, delay: number, grpId?: number): string {
  const b: Bx = { ids: bd.ids, t }
  const dur = clamp(a.duration, 100, ENTR_MAX_EFFECT_MS)
  const preset = ({ fade: [10, 0], 'count-up': [10, 0], blur: [10, 0], 'fade-up': [42, 0], 'fade-down': [42, 0], 'slide-left': [2, 8], 'slide-right': [2, 2], zoom: [53, 16], pop: [53, 16], wipe: [22, 8] } as Record<string, number[]>)[a.type] ?? [10, 0]
  const id = bd.ids.next()
  const shown = show(b)
  let body: string
  switch (a.type) {
    case 'wipe': body = wipeEffect(b, 'in', 'left', dur); break
    case 'fade-up': body = fade(b, 'in', dur) + anim(b, 'ppt_y', dur, [[0, '#ppt_y+0.04'], [100000, '#ppt_y']], { base: true }); break
    case 'fade-down': body = fade(b, 'in', dur) + anim(b, 'ppt_y', dur, [[0, '#ppt_y-0.04'], [100000, '#ppt_y']], { base: true }); break
    case 'slide-left': body = fade(b, 'in', dur) + anim(b, 'ppt_x', dur, [[0, '#ppt_x-0.04'], [100000, '#ppt_x']], { base: true }); break
    case 'slide-right': body = fade(b, 'in', dur) + anim(b, 'ppt_x', dur, [[0, '#ppt_x+0.04'], [100000, '#ppt_x']], { base: true }); break
    case 'zoom': case 'pop': {
      const s = a.type === 'pop' ? 70000 : 88000
      body = fade(b, 'in', dur) + `<p:animScale><p:cBhvr>${cTn(b, `dur="${dur}" fill="hold"`)}${tgt(t)}</p:cBhvr><p:from x="${s}" y="${s}"/><p:to x="100000" y="100000"/></p:animScale>`
      break
    }
    default: body = fade(b, 'in', dur) // fade, blur and count-up play as a fade
  }
  return `<p:par><p:cTn id="${id}" presetID="${preset[0]}" presetClass="entr" presetSubtype="${preset[1]}" fill="hold" decel="100000"${grpId !== undefined ? ` grpId="${grpId}"` : ''} nodeType="${nodeType}"><p:stCondLst><p:cond delay="${clamp(delay, 0, 60000)}"/></p:stCondLst><p:childTnLst>${shown}${body}</p:childTnLst></p:cTn></p:par>`
}

function legacyGroup(bd: Build): string {
  const list = (bd.input.legacy ?? []).filter((l) => bd.input.shapes.has(l.elementId))
  if (list.length === 0) return ''
  // one factor for the whole slide keeps the order and rhythm of the stagger while capping the total wait
  const starts = list.flatMap((l) => (l.animation.byParagraph && paraCount(bd, l) > 1 ? Array.from({ length: paraCount(bd, l) }, (_, p) => l.animation.delay + p * (l.animation.stagger ?? 150)) : [l.animation.delay]))
  const squeeze = Math.min(1, ENTR_MAX_START_MS / Math.max(1, ...starts))
  const id = bd.ids.next()
  const nodes: string[] = []
  let first = true
  for (const l of list) {
    const shape = bd.input.shapes.get(l.elementId)!
    const a = l.animation
    const paras = paraCount(bd, l)
    shape.spids.forEach((spid, k) => {
      const grpId = bd.group(spid, shape)
      const split = !!a.byParagraph && paras > 1 && k === 0
      if (grpId !== undefined) bd.bld.push({ spid, grpId, ...(split ? { build: 'p' as const } : {}), animBg: shape.kind === 'sp' && !shape.textBox, chart: shape.kind === 'chart' })
      if (split) for (let p = 0; p < paras; p++) { nodes.push(legacyEntrance(bd, { spid, para: p }, a, first ? 'afterEffect' : 'withEffect', (a.delay + p * (a.stagger ?? 150)) * squeeze, grpId)); first = false }
      else { nodes.push(legacyEntrance(bd, { spid }, a, first ? 'afterEffect' : 'withEffect', a.delay * squeeze, grpId)); first = false }
    })
  }
  return `<p:par><p:cTn id="${id}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${nodes.join('')}</p:childTnLst></p:cTn></p:par>`
}
const paraCount = (bd: Build, l: LegacyEntrance) => { const s = bd.input.shapes.get(l.elementId); return s && s.kind === 'sp' && s.textBox ? Math.min(l.paragraphs, s.paragraphs) : 1 }

// ─── the whole <p:timing> ───────────────────────────────────────────────────────────────────────────────────────────

const stepOuter = (id: number, auto: boolean, inner: string) =>
  `<p:par><p:cTn id="${id}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/>${auto ? '<p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>' : ''}</p:stCondLst><p:childTnLst>${inner}</p:childTnLst></p:cTn></p:par>`

/**
 * <p:timing> for a slide, or '' when it has nothing to play. Throws on anything it cannot write: the caller leaves that slide without timing.
 */
export function buildTiming(input: TimingInput): string {
  const exported = new Set(input.shapes.keys())
  const steps = compileTimeline(input.effects, exported)
  const triggers = compileTriggers(input.effects, exported)
  const bd = new Build(input)
  const legacy = (input.legacy ?? []).some((l) => input.shapes.has(l.elementId))
  const any = steps.some((s) => s.effects.length > 0) || triggers.size > 0 || legacy
  if (!any) return ''

  const main: string[] = []
  // step 0: what plays when the slide appears (the theme's own entrances, then the effects before the first click)
  const auto = steps[0]!.effects
  if (auto.length > 0 || legacy) {
    const id = bd.ids.next()
    const legacyXml = legacyGroup(bd)
    main.push(stepOuter(id, true, legacyXml + groupsXml(bd, auto, (p) => (p.effect.start === 'after' ? 'afterEffect' : 'withEffect'))))
  }
  for (const step of steps.slice(1)) {
    const id = bd.ids.next()
    main.push(stepOuter(id, false, groupsXml(bd, step.effects, (_p, i) => (i === 0 ? 'clickEffect' : _p.effect.start === 'after' ? 'afterEffect' : 'withEffect'))))
  }

  const interactive: string[] = []
  for (const [triggerId, step] of triggers) {
    const trig = input.shapes.get(triggerId)?.spids[0]
    if (trig === undefined || step.effects.length === 0) continue
    const seqId = bd.ids.next()
    const inner = groupsXml(bd, step.effects, (p, i) => (i === 0 ? 'clickEffect' : p.effect.start === 'after' ? 'afterEffect' : 'withEffect'))
    const target = `<p:tgtEl><p:spTgt spid="${trig}"/></p:tgtEl>`
    interactive.push(`<p:seq concurrent="1" nextAc="seek"><p:cTn id="${seqId}" restart="whenNotActive" fill="hold" evtFilter="cancelBubble" nodeType="interactiveSeq"><p:stCondLst><p:cond evt="onClick" delay="0">${target}</p:cond></p:stCondLst><p:endSync evt="end" delay="0"><p:rtn val="all"/></p:endSync><p:childTnLst>${inner}</p:childTnLst></p:cTn></p:seq>`)
  }

  const blds = [...bd.bld].sort((a, b) => a.spid - b.spid || a.grpId - b.grpId).map((x) =>
    x.chart ? `<p:bldGraphic spid="${x.spid}" grpId="${x.grpId}"><p:bldAsOne/></p:bldGraphic>` : `<p:bldP spid="${x.spid}" grpId="${x.grpId}"${x.build ? ` build="${x.build}"` : ''}${x.animBg ? ' animBg="1"' : ''}/>`)
  const mainSeq = `<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${main.join('')}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>`
  return renumber(`<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>${mainSeq}${interactive.join('')}</p:childTnLst></p:cTn></p:par></p:tnLst>${blds.length ? `<p:bldLst>${blds.join('')}</p:bldLst>` : ''}</p:timing>`)
}

/** Node ids are handed out while the XML is composed (some outer nodes after their children): make them 1, 2, 3 … in document order. The root is 1 and the main sequence 2, which the first step refers to. */
function renumber(xml: string): string {
  let n = 0
  return xml.replace(/<p:cTn id="\d+"/g, () => `<p:cTn id="${++n}"`)
}
