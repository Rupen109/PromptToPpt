import type { Effect, SlideElement } from '@prompttoppt/validation'
import { EFFECT_INFO } from './catalog'

/**
 * Each effect as Web Animations keyframes, with a start state and an end state that are the same every time it plays. Only `transform`, `opacity`, `clip-path`
 * and `visibility` are animated (no layout). An element that has an entrance starts hidden; an entrance ends visible, an exit ends hidden and an emphasis
 * ends where it began (unless the effect persists, see catalog.ts). Directions mean where an entrance comes FROM and where an exit goes TO.
 */
export interface Built {
  keyframes: Keyframe[]
  /** `both` when the end state stays, `none` when the element goes back to how it was */
  fill: FillMode
  /** for colour change: it animates the element inside the wrapper, not the wrapper */
  inner?: boolean
  /** the keyframes already sample the motion's own curve (bounce, shake): an easing on top would bend it, so it plays linearly */
  linear?: boolean
}

const EASE: Record<Effect['easing'], string> = {
  linear: 'linear', ease: 'ease', 'ease-in': 'ease-in', 'ease-out': 'ease-out', 'ease-in-out': 'ease-in-out',
  'power2-out': 'cubic-bezier(0.215, 0.61, 0.355, 1)', 'power2-in-out': 'cubic-bezier(0.645, 0.045, 0.355, 1)', 'back-out': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
}
export const easingCss = (e: Effect['easing']) => EASE[e]

const FROM: Record<NonNullable<Effect['direction']>, (d: number) => string> = {
  left: (d) => `translate(${-d}px, 0)`, right: (d) => `translate(${d}px, 0)`, up: (d) => `translate(0, ${-d}px)`, down: (d) => `translate(0, ${d}px)`,
}
/** a clip that has collapsed to the edge the direction names (left: to the left edge) */
const COLLAPSED: Record<NonNullable<Effect['direction']>, string> = { left: 'inset(0 100% 0 0)', right: 'inset(0 0 0 100%)', up: 'inset(0 0 100% 0)', down: 'inset(100% 0 0 0)' }
const OPEN = 'inset(0 0 0 0)'
const HIDDEN: Keyframe = { visibility: 'hidden' }
const SHOWN: Keyframe = { visibility: 'visible' }

/** the standard "ease out bounce" curve, sampled so the motion lands exactly on 0 */
const bounceOut = (t: number) => {
  const n = 7.5625, d = 2.75
  if (t < 1 / d) return n * t * t
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
  return n * (t -= 2.625 / d) * t + 0.984375
}
const sample = (frames: number, at: (t: number) => Keyframe): Keyframe[] => Array.from({ length: frames + 1 }, (_, i) => ({ offset: i / frames, ...at(i / frames) }))

export function buildKeyframes(e: Effect, element: Pick<SlideElement, 'type'> = { type: 'text' }): Built {
  const info = EFFECT_INFO[e.type]
  const dir = e.direction ?? info.defaults.direction ?? 'left'
  const dist = e.distance ?? info.defaults.distance ?? 0
  const scale = e.scale ?? info.defaults.scale ?? 1
  const rot = e.rotation ?? info.defaults.rotation ?? 0
  const opacity = e.opacity ?? info.defaults.opacity ?? 1
  const color = e.color ?? info.defaults.color ?? '#e11d48'
  const fill: FillMode = info.persists ? 'both' : 'none'
  const done = (keyframes: Keyframe[], linear = false): Built => ({ keyframes, fill, ...(linear ? { linear } : {}) })

  switch (e.type) {
    // ─ entrance: hidden → visible
    case 'appear': return done([HIDDEN, SHOWN])
    case 'fade-in': return done([{ opacity: 0, visibility: 'visible' }, { opacity: 1, visibility: 'visible' }])
    case 'fly-in': return done([{ transform: FROM[dir](dist), opacity: 0, visibility: 'visible' }, { transform: 'translate(0, 0)', opacity: 1, visibility: 'visible' }])
    case 'float-in': return done([{ transform: FROM[dir](dist), opacity: 0, visibility: 'visible' }, { transform: 'translate(0, 0)', opacity: 1, visibility: 'visible' }])
    case 'rise-up': return done([{ transform: `translate(0, ${dist}px)`, opacity: 0, visibility: 'visible' }, { transform: 'translate(0, 0)', opacity: 1, visibility: 'visible' }])
    case 'zoom-in': return done([{ transform: `scale(${scale})`, opacity: 0, visibility: 'visible' }, { transform: 'scale(1)', opacity: 1, visibility: 'visible' }])
    case 'wipe-in': return done([{ clipPath: COLLAPSED[dir], visibility: 'visible' }, { clipPath: OPEN, visibility: 'visible' }])
    case 'split-in': {
      const vertical = dir === 'up' || dir === 'down'
      return done([{ clipPath: vertical ? 'inset(50% 0 50% 0)' : 'inset(0 50% 0 50%)', visibility: 'visible' }, { clipPath: OPEN, visibility: 'visible' }])
    }
    case 'bounce-in': return done(sample(24, (t) => ({ transform: `translate(0, ${-dist * (1 - bounceOut(t))}px)`, opacity: Math.min(1, t * 8), visibility: 'visible' })), true)
    case 'pop-in': return done([{ transform: 'scale(0)', opacity: 0, visibility: 'visible', offset: 0 }, { transform: `scale(${scale})`, opacity: 1, visibility: 'visible', offset: 0.6 }, { transform: 'scale(1)', opacity: 1, visibility: 'visible', offset: 1 }])
    case 'spin-in': return done([{ transform: `rotate(${-rot}deg) scale(0)`, opacity: 0, visibility: 'visible' }, { transform: 'rotate(0deg) scale(1)', opacity: 1, visibility: 'visible' }])

    // ─ exit: visible → hidden (the last frame is hidden, so the element is gone for good)
    case 'disappear': return done([SHOWN, HIDDEN])
    case 'fade-out': return done([{ opacity: 1, visibility: 'visible' }, { opacity: 0, visibility: 'hidden' }])
    case 'fly-out': return done([{ transform: 'translate(0, 0)', opacity: 1, visibility: 'visible' }, { transform: FROM[dir](dist), opacity: 0, visibility: 'hidden' }])
    case 'float-out': return done([{ transform: 'translate(0, 0)', opacity: 1, visibility: 'visible' }, { transform: FROM[dir](dist), opacity: 0, visibility: 'hidden' }])
    case 'zoom-out': return done([{ transform: 'scale(1)', opacity: 1, visibility: 'visible' }, { transform: `scale(${scale})`, opacity: 0, visibility: 'hidden' }])
    case 'wipe-out': return done([{ clipPath: OPEN, visibility: 'visible' }, { clipPath: COLLAPSED[dir], visibility: 'hidden' }])
    case 'shrink': return done([{ transform: 'scale(1)', visibility: 'visible' }, { transform: 'scale(0)', visibility: 'hidden' }])
    case 'spin-out': return done([{ transform: 'rotate(0deg) scale(1)', opacity: 1, visibility: 'visible' }, { transform: `rotate(${rot}deg) scale(0)`, opacity: 0, visibility: 'hidden' }])

    // ─ emphasis: the element is on screen the whole time
    case 'pulse': return done([{ transform: 'scale(1)' }, { transform: `scale(${scale})`, offset: 0.5 }, { transform: 'scale(1)' }])
    case 'grow-shrink': return done([{ transform: 'scale(1)' }, { transform: `scale(${scale})` }])
    case 'spin': return done([{ transform: 'rotate(0deg)' }, { transform: `rotate(${rot}deg)` }])
    case 'shake': return done(sample(12, (t) => ({ transform: `translate(${Math.sin(t * Math.PI * 6) * dist * (t === 1 ? 0 : 1)}px, 0)` })), true)
    case 'bounce': return done(sample(24, (t) => ({ transform: `translate(0, ${-Math.abs(Math.sin(t * Math.PI * 3)) * dist * (1 - t)}px)` })), true)
    case 'teeter': return done([{ transform: 'rotate(0deg)' }, { transform: `rotate(${-rot}deg)`, offset: 0.2 }, { transform: `rotate(${rot}deg)`, offset: 0.4 }, { transform: `rotate(${-rot * 0.6}deg)`, offset: 0.6 }, { transform: `rotate(${rot * 0.6}deg)`, offset: 0.8 }, { transform: 'rotate(0deg)' }])
    case 'transparency': return done([{ opacity: 1 }, { opacity }])
    // one frame: the animation starts from the element's own colour (text and icons change their colour, a shape its fill)
    case 'color-change': return { keyframes: [element.type === 'shape' ? { backgroundColor: color } : { color }], fill, inner: true }
  }
}
