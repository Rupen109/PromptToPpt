import type { SlideElement, TextElement } from '@prompttoppt/validation'

/**
 * One size per level, deck-wide. Each text box is fitted on its own, so the same kind of text ended up at 30 px on one slide and 38 px on the next
 * (and the cards of one slide at three different sizes): the unmistakable "generated" look. Here every group of like text - same role on the same layout
 * (all slide titles share one group) - is pulled to the group's MEDIAN size. A box is only ever made smaller (so nothing can start to overflow); the few
 * boxes that already needed to be smaller than the median (very long text) keep their own size.
 */
const COVER_KINDS = new Set(['title', 'section-divider', 'thank-you'])
const SKIP = new Set<TextElement['role']>(['metric', 'quote'])

export function harmonizeType<T extends { layoutId: string; elements: SlideElement[] }>(slides: T[]): T[] {
  const key = (layoutId: string, e: TextElement) => (e.role === 'title' && !COVER_KINDS.has(layoutId) ? 'title|content' : `${e.role}|${layoutId}`)
  const groups = new Map<string, number[]>()
  for (const s of slides) for (const e of s.elements) if (e.type === 'text' && !SKIP.has(e.role) && !e.rotation) {
    const k = key(s.layoutId, e); const a = groups.get(k) ?? []; a.push(e.fontSize); groups.set(k, a)
  }
  const target = new Map<string, number>()
  for (const [k, sizes] of groups) { const sorted = [...sizes].sort((a, b) => a - b); target.set(k, sorted[Math.floor((sorted.length - 1) / 2)]!) }
  return slides.map((s) => ({
    ...s,
    elements: s.elements.map((e) => {
      if (e.type !== 'text' || SKIP.has(e.role) || e.rotation) return e
      const t = target.get(key(s.layoutId, e))
      return t !== undefined && e.fontSize > t ? { ...e, fontSize: t } : e
    }),
  }))
}
