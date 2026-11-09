import type { Effect, EffectCategory, SlideElement } from '@prompttoppt/validation'

/**
 * What each effect is: its name on screen, which options it understands (the editor shows only these), whether its end state stays (a colour change, a
 * grow, a spin) and which kinds of element it works on. The engine (keyframes.ts) and the editor read this one table, so a control is never shown for
 * an option an effect ignores, and no effect is offered on an element it cannot play on.
 */
export type EffectOption = 'direction' | 'distance' | 'scale' | 'rotation' | 'opacity' | 'color' | 'reverse'
type ElementType = SlideElement['type']

export interface EffectInfo {
  label: string
  category: EffectCategory
  options: EffectOption[]
  /** the effect's end state is still there after it has played (the element stays grown, recoloured, …) */
  persists: boolean
  /** element types it can play on; absent = every type */
  on?: ElementType[]
  /** what an option is when the effect does not set it */
  defaults: { direction?: Effect['direction']; distance?: number; scale?: number; rotation?: number; opacity?: number; color?: string }
}

const COLORABLE: ElementType[] = ['text', 'shape', 'icon']

export const EFFECT_INFO: Record<Effect['type'], EffectInfo> = {
  // entrance
  appear: { label: 'Appear', category: 'entrance', options: [], persists: true, defaults: {} },
  'fade-in': { label: 'Fade In', category: 'entrance', options: [], persists: true, defaults: {} },
  'fly-in': { label: 'Fly In', category: 'entrance', options: ['direction', 'distance'], persists: true, defaults: { direction: 'left', distance: 400 } },
  'zoom-in': { label: 'Zoom In', category: 'entrance', options: ['scale'], persists: true, defaults: { scale: 0.3 } },
  'float-in': { label: 'Float In', category: 'entrance', options: ['direction', 'distance'], persists: true, defaults: { direction: 'down', distance: 60 } },
  'wipe-in': { label: 'Wipe In', category: 'entrance', options: ['direction'], persists: true, defaults: { direction: 'left' } },
  'split-in': { label: 'Split In', category: 'entrance', options: ['direction'], persists: true, defaults: { direction: 'left' } },
  'rise-up': { label: 'Rise Up', category: 'entrance', options: ['distance'], persists: true, defaults: { distance: 360 } },
  'bounce-in': { label: 'Bounce In', category: 'entrance', options: ['distance'], persists: true, defaults: { distance: 360 } },
  'pop-in': { label: 'Pop In', category: 'entrance', options: ['scale'], persists: true, defaults: { scale: 1.15 } },
  'spin-in': { label: 'Spin In', category: 'entrance', options: ['rotation'], persists: true, defaults: { rotation: 360 } },
  // emphasis
  pulse: { label: 'Pulse', category: 'emphasis', options: ['scale', 'reverse'], persists: false, defaults: { scale: 1.1 } },
  'grow-shrink': { label: 'Grow / Shrink', category: 'emphasis', options: ['scale', 'reverse'], persists: true, defaults: { scale: 1.5 } },
  spin: { label: 'Spin', category: 'emphasis', options: ['rotation', 'reverse'], persists: true, defaults: { rotation: 360 } },
  shake: { label: 'Shake', category: 'emphasis', options: ['distance'], persists: false, defaults: { distance: 14 } },
  bounce: { label: 'Bounce', category: 'emphasis', options: ['distance'], persists: false, defaults: { distance: 50 } },
  'color-change': { label: 'Color Change', category: 'emphasis', options: ['color', 'reverse'], persists: true, on: COLORABLE, defaults: { color: '#e11d48' } },
  transparency: { label: 'Transparency', category: 'emphasis', options: ['opacity', 'reverse'], persists: true, defaults: { opacity: 0.4 } },
  teeter: { label: 'Teeter', category: 'emphasis', options: ['rotation'], persists: false, defaults: { rotation: 8 } },
  // exit
  disappear: { label: 'Disappear', category: 'exit', options: [], persists: true, defaults: {} },
  'fade-out': { label: 'Fade Out', category: 'exit', options: [], persists: true, defaults: {} },
  'fly-out': { label: 'Fly Out', category: 'exit', options: ['direction', 'distance'], persists: true, defaults: { direction: 'left', distance: 400 } },
  'zoom-out': { label: 'Zoom Out', category: 'exit', options: ['scale'], persists: true, defaults: { scale: 0.3 } },
  'float-out': { label: 'Float Out', category: 'exit', options: ['direction', 'distance'], persists: true, defaults: { direction: 'down', distance: 60 } },
  'wipe-out': { label: 'Wipe Out', category: 'exit', options: ['direction'], persists: true, defaults: { direction: 'left' } },
  shrink: { label: 'Shrink', category: 'exit', options: [], persists: true, defaults: {} },
  'spin-out': { label: 'Spin Out', category: 'exit', options: ['rotation'], persists: true, defaults: { rotation: 360 } },
}

/** Can this effect play on this kind of element? (A colour change needs something with a colour.) */
export const effectApplies = (type: Effect['type'], element: Pick<SlideElement, 'type'>) => !EFFECT_INFO[type].on || EFFECT_INFO[type].on!.includes(element.type)
