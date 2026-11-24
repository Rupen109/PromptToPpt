import type { Draft } from 'immer'
import { CANVAS, type Presentation, type TextElement, type Theme } from '@prompttoppt/validation'
import { estimateTextHeight, metricOptsFor } from '@prompttoppt/theme'

/**
 * Spacing of text: between lines, between paragraphs, between letters. The same fields and ranges the slide draws, the PowerPoint file writes and the assistant changes
 * (`lineHeight` × size, `paraGap` × size, `letterSpacing` px). Unset = the slide's own default (1.3, 0.5, 0), so "Reset" removes them.
 */
export type Spacing = { lineHeight?: number | null; paraGap?: number | null; letterSpacing?: number | null }
export const SPACING_DEFAULT = { lineHeight: 1.3, paraGap: 0.5, letterSpacing: 0 } as const
export const SPACING_RANGE = { lineHeight: [0.7, 2.2], paraGap: [0, 2], letterSpacing: [-12, 30] } as const
/** the line spacings people pick by name (PowerPoint's 1.0 / 1.15 / 1.5 / 2.0, plus this deck's normal) */
export const LINE_PRESETS = [{ v: 1, label: '1.0' }, { v: 1.15, label: '1.15' }, { v: 1.3, label: 'Normal' }, { v: 1.5, label: '1.5' }, { v: 2, label: '2.0' }] as const

const round = (n: number) => Math.round(n * 100) / 100
const clamp = (n: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, n))

/**
 * Sets the spacing of text boxes (all the selected ones: three bullet boxes get the same spacing in one step). A value equal to the default is REMOVED (the box follows the
 * deck's normal again), `null` resets it. Locked boxes and locked slides are left as they are. Returns how many boxes changed (0 = nothing recorded).
 */
export function setTextSpacing(d: Draft<Presentation>, slideId: string, ids: readonly string[], sp: Spacing): number {
  const s = d.slides.find((x) => x.id === slideId)
  if (!s || s.locked) return 0
  let n = 0
  for (const e of s.elements) {
    if (!ids.includes(e.id) || e.type !== 'text' || e.locked) continue
    let changed = false
    for (const k of ['lineHeight', 'paraGap', 'letterSpacing'] as const) {
      if (!(k in sp)) continue
      const want = sp[k] === null || sp[k] === undefined ? null : round(clamp(sp[k]!, SPACING_RANGE[k]))
      const next = want === null || want === SPACING_DEFAULT[k] ? undefined : want
      if ((e[k] ?? undefined) === next) continue
      if (next === undefined) delete e[k]; else e[k] = next
      changed = true
    }
    if (changed) n++
  }
  if (n) s.manual = true
  return n
}

/**
 * How tall a text box's words are at its spacing (the same estimate the assistant uses), and whether they run past the box. `fits` leaves a little slack (the estimate is not
 * pixel exact), so a box is only called too small when it clearly is.
 */
export function textFit(el: TextElement, theme: Theme, aspect: Presentation['aspectRatio']) {
  const need = Math.ceil(estimateTextHeight(el.paragraphs, el.fontSize, el.width, metricOptsFor(el, theme)))
  const room = CANVAS[aspect].height - el.y
  return { need, fits: need <= el.height + Math.max(4, el.fontSize * 0.25), canGrowTo: Math.min(need, room) }
}
