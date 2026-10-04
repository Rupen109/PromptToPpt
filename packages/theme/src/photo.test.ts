import { describe, expect, it } from 'vitest'
import { ASPECT_RATIOS, presentationSchema, type Presentation } from '@prompttoppt/validation'
import { DESIGNS, IMAGE_BG_LAYOUTS, THEMES, applyValidation, composeSlide, SAMPLES } from './index'

const URL = 'https://api.example.com/api/v1/assets/abcdefghijklmnopqrstuvwxyz012345'
const themes = [...THEMES, ...DESIGNS.filter((_, i) => i % 7 === 0).map((d) => d.theme)] // every kit family, kept fast

describe('picture backgrounds', () => {
  it('every theme × aspect × photo-capable layout composes clean: text stays readable over the WORST-case photo (white)', () => {
    for (const theme of themes) {
      for (const aspect of ASPECT_RATIOS) {
        let n = 0
        const slides = SAMPLES.filter((s) => (IMAGE_BG_LAYOUTS as readonly string[]).includes(s.layout)).map((c, i) => ({ id: `s${i}`, locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(c, theme, aspect, () => `e${n++}`, { backgroundImage: URL }) }))
        expect(slides.length).toBe(IMAGE_BG_LAYOUTS.length)
        const doc: Presentation = { schemaVersion: 1, id: 'p', title: 'T', aspectRatio: aspect, language: 'en', theme, sources: [], slides }
        expect(presentationSchema.safeParse(doc).success).toBe(true)
        for (const s of slides) expect(s.background).toEqual({ type: 'image', value: URL })
        const bad = applyValidation(doc).report.slides.flatMap((s) => s.issues).filter((i) => i.severity === 'error' || i.code === 'contrast' || i.code === 'overflow')
        expect(bad, `${theme.id} @ ${aspect}: ${JSON.stringify(bad.slice(0, 2))}`).toEqual([])
      }
    }
  })

  it('layouts that cannot sit on a photo ignore the option (no scrim, no white-on-card text)', () => {
    const c = SAMPLES.find((s) => s.layout === 'metrics')!
    const plain = composeSlide(c, THEMES[0]!, '16:9', () => 'x')
    const withOpt = composeSlide(c, THEMES[0]!, '16:9', () => 'x', { backgroundImage: URL })
    expect(withOpt.background).toEqual(plain.background)
    expect(withOpt.elements).toEqual(plain.elements)
  })

  it('split-image-text carries its picture so re-composing (theme change) keeps it', () => {
    const c = { ...SAMPLES.find((s) => s.layout === 'split-image-text')!, imageUrl: URL } as never
    const slide = composeSlide(c, THEMES[0]!, '16:9')
    expect(slide.elements.find((e) => e.type === 'image')).toMatchObject({ src: URL })
  })
})
