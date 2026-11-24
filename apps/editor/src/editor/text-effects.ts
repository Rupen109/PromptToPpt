import type { Draft } from 'immer'
import { TEXT_OUTLINE_MAX, type Presentation, type TextElement } from '@prompttoppt/validation'

export type TextEffects = { textShadow?: TextElement['textShadow'] | null; textOutline?: TextElement['textOutline'] | null }

/**
 * A shadow and / or an outline for text boxes (every selected one, in one step). `null` takes an effect off. Locked boxes and locked slides are left as they are.
 * Returns how many boxes changed (0 = nothing recorded).
 */
export function setTextEffects(d: Draft<Presentation>, slideId: string, ids: readonly string[], fx: TextEffects): number {
  const s = d.slides.find((x) => x.id === slideId)
  if (!s || s.locked) return 0
  let n = 0
  for (const e of s.elements) {
    if (!ids.includes(e.id) || e.type !== 'text' || e.locked) continue
    let changed = false
    if ('textShadow' in fx) {
      const next = fx.textShadow ?? undefined
      if (e.textShadow !== next) { if (next) e.textShadow = next; else delete e.textShadow; changed = true }
    }
    if ('textOutline' in fx) {
      const o = fx.textOutline ? { color: fx.textOutline.color, width: Math.round(Math.min(TEXT_OUTLINE_MAX, Math.max(0.5, fx.textOutline.width)) * 10) / 10 } : undefined
      if (JSON.stringify(e.textOutline) !== JSON.stringify(o)) { if (o) e.textOutline = o; else delete e.textOutline; changed = true }
    }
    if (changed) n++
  }
  if (n) s.manual = true
  return n
}
