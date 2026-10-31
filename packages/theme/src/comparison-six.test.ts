import { describe, expect, it } from 'vitest'
import type { SlideContent } from '@prompttoppt/validation'
import { DESIGNS, composeSlide, validateSlide } from './index'

/** The assistant can be asked for "2 more points on both sides" of a comparison (4 → 6): every design must still lay that out cleanly. */
const six = (tag: string) => Array.from({ length: 6 }, (_, i) => `${tag} point ${i + 1}: a clear, complete idea in one line`)
const content = { layout: 'comparison', title: 'Balancing state authority and individual rights', left: { heading: 'Strong central state', bullets: six('Left') }, right: { heading: 'Protected individual rights', bullets: six('Right') }, speakerNotes: '', sources: [] } as SlideContent

describe('a comparison slide with 6 points on each side', () => {
  for (const aspect of ['16:9', '4:3'] as const) {
    it(`every one of the ${DESIGNS.length} designs lays it out without overflow at ${aspect}`, () => {
      const bad: string[] = []
      for (const d of DESIGNS) {
        let n = 0
        const c = composeSlide(content, d.theme, aspect, () => `e${n++}`)
        const slide = { id: 's', locked: false, validation: { status: 'pending' as const, issues: [] }, ...c }
        for (const i of validateSlide(slide as never, d.theme)) if (i.code === 'overflow' && i.severity === 'error') bad.push(`${d.id}: ${i.message}`)
      }
      expect(bad.slice(0, 5), `${bad.length} overflowing boxes`).toEqual([])
    })
  }
})
