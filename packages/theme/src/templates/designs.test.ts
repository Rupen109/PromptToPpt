import { describe, expect, it } from 'vitest'
import { ASPECT_RATIOS, presentationSchema, themeSchema, type Presentation } from '@prompttoppt/validation'
import { applyValidation, composeSlide } from '../index'
import { contrastRatio } from '../color'
import { SAMPLES } from '../samples'
import { CATEGORIES } from './categories'
import { DESIGNS } from './build'
import { FONT_PAIRS } from './kits'
import { FONT_WIDTH } from '../text-metrics'
import { SUPPORTED_FONTS } from '../themes'

describe('template design catalogue', () => {
  /** Pitch, Sales, Marketing and Education each gained 3 editorial designs, Business & Strategy gained 3 on top of its 14. */
  const COUNTS: Record<string, number> = { pitch: 15, sales: 15, marketing: 15, education: 15, strategy: 17 }
  it('has the expected number of designs per category (12 each, 15 in Pitch / Sales / Marketing / Education, 17 in Business & Strategy): 137 total', () => {
    expect(DESIGNS).toHaveLength(137)
    for (const c of CATEGORIES) expect(DESIGNS.filter((d) => d.category === c.id), c.id).toHaveLength(COUNTS[c.id] ?? 12)
  })

  it('every category is balanced between light and dark (within one design of half and half), and its dark designs span different hues', () => {
    for (const cat of new Set(DESIGNS.map((d) => d.category))) {
      const ds = DESIGNS.filter((d) => d.category === cat)
      const dark = ds.filter((d) => parseInt(d.theme.colors.background.slice(1, 3), 16) < 128)
      expect(Math.abs(dark.length - (ds.length - dark.length)), `${cat}: ${dark.length} dark of ${ds.length}`).toBeLessThanOrEqual(1)
      expect(new Set(dark.map((d) => d.theme.colors.background)).size, `${cat}: dark backgrounds should differ`).toBeGreaterThanOrEqual(5)
    }
  })

  it('ids and names are unique; no two designs are the same look (kit + colours + fonts + motion + mode + signature style)', () => {
    expect(new Set(DESIGNS.map((d) => d.id)).size).toBe(137)
    expect(new Set(DESIGNS.map((d) => `${d.category}/${d.name}`)).size).toBe(137)
    const looks = new Set(DESIGNS.map((d) => [d.kit, d.theme.colors.primary, d.theme.colors.accent, d.theme.fonts.heading, d.motion, d.theme.colors.background, JSON.stringify(d.theme.style)].join('|')))
    expect(looks.size).toBe(137)
    // visual diversity across the whole catalogue, not just uniqueness
    expect(new Set(DESIGNS.map((d) => d.kit)).size).toBeGreaterThanOrEqual(22)
    expect(new Set(DESIGNS.map((d) => d.theme.fonts.heading)).size).toBeGreaterThanOrEqual(18)
    expect(new Set(DESIGNS.map((d) => d.theme.colors.primary)).size).toBeGreaterThanOrEqual(70)
  })

  it('Starter gets exactly 3 designs per category; the rest are premium', () => {
    for (const c of CATEGORIES) expect(DESIGNS.filter((d) => d.category === c.id && !d.premium)).toHaveLength(3)
  })

  it('every font is metric-known and listed as supported (so overflow checks and the font picker agree)', () => {
    for (const [h, b] of Object.values(FONT_PAIRS)) for (const f of [h, b]) {
      expect(FONT_WIDTH[f], `${f} needs a width entry`).toBeDefined()
      expect(SUPPORTED_FONTS, `${f} must be supported`).toContain(f)
    }
  })

  for (const d of DESIGNS) {
    it(`${d.id}: valid theme, accessible palette`, () => {
      expect(themeSchema.safeParse(d.theme).success).toBe(true)
      const k = d.theme.colors
      expect(contrastRatio(k.textPrimary, k.background), 'text on bg').toBeGreaterThanOrEqual(7)
      expect(contrastRatio(k.textPrimary, k.surface), 'text on surface').toBeGreaterThanOrEqual(7)
      expect(contrastRatio(k.textSecondary, k.background), 'muted on bg').toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(k.textSecondary, k.surface), 'muted on surface').toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(k.primary, k.background), 'primary on bg').toBeGreaterThanOrEqual(3)
      expect(contrastRatio(k.primary, k.surface), 'primary on surface').toBeGreaterThanOrEqual(3)
      expect(contrastRatio(k.onPrimary, k.primary), 'onPrimary on primary').toBeGreaterThanOrEqual(4.5)
    })

    it(`${d.id}: every layout × every aspect ratio composes clean`, () => {
      for (const aspect of ASPECT_RATIOS) {
        let n = 0
        const doc: Presentation = {
          schemaVersion: 1, id: 'p', title: 'T', aspectRatio: aspect, language: 'en', theme: d.theme, sources: [],
          slides: SAMPLES.map((c, i) => ({ id: `s${i}`, locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(c, d.theme, aspect, () => `e${n++}`) })),
        }
        const parsed = presentationSchema.safeParse(doc)
        expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 2))).toBe(true)
        const bad = applyValidation(doc).report.slides.flatMap((s) => s.issues.map((i) => ({ ...i, layout: doc.slides.find((x) => x.id === s.slideId)!.layoutId }))).filter((i) => i.severity === 'error' || i.code === 'contrast')
        expect(bad, `${d.id} @ ${aspect}: ${JSON.stringify(bad.slice(0, 3))}`).toEqual([])
      }
    })
  }
})
