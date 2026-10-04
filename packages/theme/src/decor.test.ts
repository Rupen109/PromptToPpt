import { describe, expect, it } from 'vitest'
import { ASPECT_RATIOS, DECOR_STYLES, type SlideContent } from '@prompttoppt/validation'
import { COVER_ONLY_DECOR } from './layout/decor'
import { THEMES, composeSlide, validateSlide } from './index'

const body = { layout: 'title-body', title: 'Photosynthesis in plain words', bullets: ['Plants turn light into sugar', 'Chlorophyll absorbs red and blue light', 'Oxygen is released as a by-product'], speakerNotes: '', sources: [] } as unknown as SlideContent
const title = { layout: 'title', title: 'Photosynthesis', subtitle: 'Grade 7 science', speakerNotes: '', sources: [] } as unknown as SlideContent

describe('decor motifs', () => {
  for (const kind of DECOR_STYLES) it(`${kind}: decorative-only, in budget, no validation errors on any aspect`, () => {
    for (const base of [THEMES[0]!, THEMES[THEMES.length - 1]!]) for (const aspect of ASPECT_RATIOS) for (const content of [body, title]) {
      const theme = { ...base, style: { ...(base.style ?? {}), decor: kind } } as typeof base
      const slide = composeSlide(content, theme, aspect)
      const decos = slide.elements.filter((e) => e.decorative)
      expect(decos.length).toBeLessThanOrEqual(60)
      if (content === body && COVER_ONLY_DECOR.has(kind)) expect(decos.length, `${kind} must not decorate content slides`).toBeLessThanOrEqual(2)
      expect(validateSlide({ id: 's', ...slide } as never, theme).filter((i) => i.severity === 'error'), `${kind} ${aspect}`).toEqual([])
    }
  })
})
