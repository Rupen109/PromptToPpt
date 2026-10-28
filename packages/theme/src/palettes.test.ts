import { describe, expect, it } from 'vitest'
import { ASPECT_RATIOS, presentationSchema, type Presentation } from '@prompttoppt/validation'
import { contrastRatio } from './color'
import { makeColors } from './palette'
import { PALETTES, PALETTE_GROUPS, isHex, recolor } from './palettes'
import { applyValidation } from './validate'
import { DESIGNS, designById } from './templates/build'
import { composeDeck } from './templates/deck'
import { SKELETONS } from './templates/skeletons'

describe('colour palettes', () => {
  it('there are 36 of them, in six groups of six, each with a unique id and name and valid colours', () => {
    expect(PALETTES).toHaveLength(36)
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(36)
    expect(new Set(PALETTES.map((p) => p.name)).size).toBe(36)
    expect(new Set(PALETTES.map((p) => `${p.primary}|${p.accent}`.toLowerCase())).size).toBe(36)
    for (const p of PALETTES) { expect(isHex(p.primary), p.id).toBe(true); expect(isHex(p.accent), p.id).toBe(true); expect(p.primary.toLowerCase()).not.toBe(p.accent.toLowerCase()) }
    for (const g of PALETTE_GROUPS) expect(PALETTES.filter((p) => p.group === g), g).toHaveLength(6)
  })

  it.each(['light', 'dark'] as const)('every palette gives a readable colour set in %s mode (text, headlines, text on the brand colour) and an accent you can actually see', (mode) => {
    for (const p of PALETTES) {
      const c = makeColors({ primary: p.primary, accent: p.accent, mode, bg: 'white' })
      for (const bg of [c.background, c.surface]) {
        expect(contrastRatio(c.textPrimary, bg), `${p.id} text on ${mode}`).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(c.textSecondary, bg), `${p.id} secondary text on ${mode}`).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(c.primary, bg), `${p.id} headline colour on ${mode}`).toBeGreaterThanOrEqual(3.2)
      }
      expect(contrastRatio(c.onPrimary, c.primary), `${p.id} text on brand colour`).toBeGreaterThanOrEqual(4.5)
      // the accent colours ornaments and chart series: pale ones (yellows) are fine on dark slides, dark ones must not vanish there
      expect(contrastRatio(c.accent, c.background), `${p.id} accent on ${mode}`).toBeGreaterThanOrEqual(mode === 'dark' ? 1.8 : 1.4)
    }
  })

  it('a brand colour and its accent are clearly different colours', () => {
    for (const p of PALETTES) {
      const d = [1, 3, 5].map((i) => parseInt(p.primary.slice(i, i + 2), 16) - parseInt(p.accent.slice(i, i + 2), 16))
      expect(Math.hypot(...d), p.id).toBeGreaterThan(60)
    }
  })

  it('every palette composes real template decks cleanly (no overflow or contrast errors): a light, a dark, a warm-tinted and a photo-led design, every aspect ratio on the first', () => {
    const designs = ['pitch-seed-round', 'pitch-launchpad', 'education-notebook', 'marketing-brand-pulse', 'strategy-case-method'].map((id) => designById(id)!).filter(Boolean)
    expect(designs.length).toBeGreaterThanOrEqual(4)
    for (const p of PALETTES) {
      for (const [i, d] of designs.entries()) {
        for (const aspect of i === 0 ? ASPECT_RATIOS : (['16:9'] as const)) {
          const theme = recolor(d.theme, p)
          let n = 0
          const slides = composeDeck(SKELETONS[d.category], { ...d, theme }, aspect, () => `e${n++}`)
          const doc: Presentation = { schemaVersion: 1, id: 'p', title: 't', aspectRatio: aspect, language: 'en', theme, sources: [], slides: slides.map((s, k) => ({ id: `s${k}`, locked: false, validation: { status: 'pending', issues: [] }, ...s })) } as Presentation
          expect(presentationSchema.safeParse(doc).success, `${p.id} on ${d.id}`).toBe(true)
          const bad = applyValidation(doc).report.slides.flatMap((s) => s.issues.map((x) => ({ ...x, slide: s.slideId }))).filter((x) => x.severity === 'error' || x.code === 'contrast' || x.code === 'overflow')
          expect(bad, `${p.id} on ${d.id} @ ${aspect}: ${JSON.stringify(bad.slice(0, 2))}`).toEqual([])
        }
      }
    }
    expect(DESIGNS.length).toBeGreaterThan(100)
  })
})
