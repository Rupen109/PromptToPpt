import { describe, expect, it } from 'vitest'
import { ASPECT_RATIOS, BULLET_GLYPHS, CARD_STYLES, DECOR_STYLES, GENERATABLE_LAYOUTS, HEADER_STYLES, TITLE_STYLES, presentationSchema, slideContentSchema, type Presentation, type SlideContent, type Theme, type ThemeStyle } from '@prompttoppt/validation'
import { THEMES, applyValidation, composeSlide, contrastRatio, estimateLines, validateSlide } from './index'

import { CLASSIC, SAMPLES, common, long } from './samples'

describe('layout engine', () => {
  it('has a sample for every generatable layout', () => {
    expect(SAMPLES.map((s) => s.layout).sort()).toEqual([...GENERATABLE_LAYOUTS].sort())
    for (const s of SAMPLES) expect(slideContentSchema.safeParse(s).success).toBe(true)
  })

  for (const theme of THEMES) {
    for (const aspect of ASPECT_RATIOS) {
      it(`${theme.id} @ ${aspect}: every layout composes into a schema-valid slide with no validation errors`, () => {
        let n = 0
        const doc: Presentation = {
          schemaVersion: 1, id: 'p', title: 'T', aspectRatio: aspect, language: 'en', theme, sources: [],
          slides: SAMPLES.map((c, i) => ({ id: `s${i}`, locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(c, theme, aspect, () => `e${n++}`) })),
        }
        expect(presentationSchema.safeParse(doc).success).toBe(true)
        const { report } = applyValidation(doc)
        const errors = report.slides.flatMap((s) => s.issues.map((i) => ({ ...i, layout: doc.slides.find((d) => d.id === s.slideId)!.layoutId }))).filter((i) => i.severity === 'error' || i.code === 'contrast')
        expect(errors, JSON.stringify(errors.slice(0, 3))).toEqual([])
      })
    }
  }

  const classic = THEMES[0]!
  const variants: [string, Partial<ThemeStyle>][] = [
    ...TITLE_STYLES.map((v) => [`title:${v}`, { title: v }] as [string, Partial<ThemeStyle>]),
    ...HEADER_STYLES.map((v) => [`header:${v}`, { header: v }] as [string, Partial<ThemeStyle>]),
    ...CARD_STYLES.map((v) => [`card:${v}`, { card: v }] as [string, Partial<ThemeStyle>]),
    ...DECOR_STYLES.map((v) => [`decor:${v}`, { decor: v }] as [string, Partial<ThemeStyle>]),
    ...(['gradient', 'tint'] as const).map((v) => [`body:${v}`, { bodyBackground: v }] as [string, Partial<ThemeStyle>]),
    ...(['gradient', 'dark', 'surface', 'accent'] as const).map((v) => [`titleBg:${v}`, { titleBackground: v }] as [string, Partial<ThemeStyle>]),
    ['uppercase+tracking', { uppercaseHeadings: true, headingTracking: 4, headingWeight: 900 }],
    ['footer', { footer: 'number' }],
    ...BULLET_GLYPHS.map((g) => [`bullet:${g}`, { bullet: g }] as [string, Partial<ThemeStyle>]),
  ]
  for (const [name, style] of variants) {
    it(`style variant ${name}: every layout × every aspect composes clean`, () => {
      const theme: Theme = { ...classic, style: { ...CLASSIC, ...style } as ThemeStyle, motion: { transition: 'fade', entrance: 'fade-up', stagger: 120, duration: 600 } }
      for (const aspect of ASPECT_RATIOS) {
        let n = 0
        const doc: Presentation = {
          schemaVersion: 1, id: 'p', title: 'T', aspectRatio: aspect, language: 'en', theme, sources: [],
          slides: SAMPLES.map((c, i) => ({ id: `s${i}`, locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(c, theme, aspect, () => `e${n++}`) })),
        }
        const parsed = presentationSchema.safeParse(doc)
        expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 2))).toBe(true)
        const bad = applyValidation(doc).report.slides.flatMap((s) => s.issues.map((i) => ({ ...i, layout: doc.slides.find((d) => d.id === s.slideId)!.layoutId }))).filter((i) => i.severity === 'error' || i.code === 'contrast')
        expect(bad, `${name} @ ${aspect}: ${JSON.stringify(bad.slice(0, 3))}`).toEqual([])
      }
    })
  }

  it('is deterministic for a fixed id generator', () => {
    const mk = () => { let n = 0; return composeSlide(SAMPLES[2]!, THEMES[0]!, '16:9', () => `e${n++}`) }
    expect(mk()).toEqual(mk())
  })
})

describe('validators', () => {
  it('flags overflow when text cannot fit even at the minimum size', () => {
    const slide = { id: 's', locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(SAMPLES[2]!, THEMES[0]!, '16:9', () => Math.random().toString()) }
    const t = slide.elements.find((e) => e.type === 'text' && e.role === 'body')!
    if (t.type === 'text') { t.fontSize = 60; t.height = 100 }
    expect(validateSlide(slide, THEMES[0]!).some((i) => i.code === 'overflow' && i.severity === 'error')).toBe(true)
  })
  it('flags low contrast', () => {
    const slide = { id: 's', locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(SAMPLES[2]!, THEMES[0]!, '16:9') }
    slide.background = { type: 'color', value: '#FFFFFF' }
    for (const e of slide.elements) if (e.type === 'text') e.color = '#EEEEEE'
    expect(validateSlide(slide, THEMES[0]!).some((i) => i.code === 'contrast')).toBe(true)
  })
  it('contrast math matches WCAG reference (black on white = 21)', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0)
  })
  it('estimates wrapping', () => {
    expect(estimateLines('a b c', 20, 2000)).toBe(1)
    expect(estimateLines('word '.repeat(200), 20, 400)).toBeGreaterThan(5)
  })
})
