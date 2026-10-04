import { describe, expect, it } from 'vitest'
import { ASPECT_RATIOS, type SlideContent } from '@prompttoppt/validation'
import { THEMES, composeSlide, validateSlide } from './index'

const b = ['Customers want faster onboarding with fewer steps', 'Support costs fall when answers are found in-product', 'Partners extend reach into regions we cannot serve alone', 'A single dashboard replaces three separate tools', 'Security reviews finish in days instead of weeks']

describe('title-body looks', () => {
  for (const n of [2, 3, 4, 5]) for (const variant of [0, 1, 2, 3]) it(`${n} bullets, variant ${variant}: no errors on any theme × aspect`, () => {
    const content = { layout: 'title-body', title: 'Why customers choose us', bullets: b.slice(0, n), speakerNotes: '', sources: [] } as unknown as SlideContent
    for (const theme of THEMES) for (const aspect of ASPECT_RATIOS) {
      const slide = composeSlide(content, theme, aspect, undefined, { variant })
      const errs = validateSlide({ id: 's', ...slide } as never, theme).filter((i) => i.severity === 'error')
      expect(errs, `${theme.id} ${aspect}`).toEqual([])
    }
  })
  it('neighbouring variants produce different compositions', () => {
    const content = { layout: 'title-body', title: 'T', bullets: b.slice(0, 4), speakerNotes: '', sources: [] } as unknown as SlideContent
    const sig = (v: number) => composeSlide(content, THEMES[0]!, '16:9', () => 'x', { variant: v }).elements.map((e) => `${e.type}${Math.round(e.x)}`).join()
    expect(sig(0)).not.toBe(sig(1))
  })
})
