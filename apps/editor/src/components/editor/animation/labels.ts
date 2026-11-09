import { SLIDE_TRANSITION_TYPES, type SlideElement } from '@prompttoppt/validation'

/** What a person reads for an element in the animation list: its words for text, otherwise its kind. */
export function elementLabel(el: SlideElement | undefined): string {
  if (!el) return 'Missing object'
  if (el.type === 'text') {
    const t = el.paragraphs.flatMap((p) => p.runs.map((r) => r.text)).join(' ').trim()
    return t ? (t.length > 28 ? `${t.slice(0, 27)}…` : t) : 'Text'
  }
  return ({ image: 'Picture', shape: 'Shape', icon: 'Icon', chart: 'Chart', table: 'Table' } as Record<string, string>)[el.type] ?? el.type
}

export const START_LABEL = { click: 'On click', with: 'With previous', after: 'After previous' } as const
export const TRANSITION_LABEL: Record<(typeof SLIDE_TRANSITION_TYPES)[number], string> = { none: 'None', fade: 'Fade', slide: 'Slide', zoom: 'Zoom', push: 'Push', wipe: 'Wipe', morph: 'Morph' }
export const DIRECTION_TRANSITIONS = ['slide', 'push', 'wipe'] as const
export const MORPH_LOCKED_REASON = 'Morph animation is available on the Gold plan.'
export const easingLabel = (e: string) => e.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())
