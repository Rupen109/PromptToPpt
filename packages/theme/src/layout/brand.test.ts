import { describe, expect, it } from 'vitest'
import { CANVAS, elementSchema, type Theme } from '@prompttoppt/validation'
import { SAMPLES } from '../samples'
import { DESIGNS } from '../templates'
import { getTheme } from '../themes'
import { validateSlide } from '../validate'
import { brandLogoElements, composeSlide } from './index'

const logoUrl = 'https://api.example.com/api/v1/assets/abcdefghijklmnopqrstuvwxyz012345'
const withBrand = (t: Theme, aspect = 3.3): Theme => ({ ...t, brand: { name: 'Acme', logo: { src: logoUrl, aspect } } })
const logoOf = (els: { type: string; alt?: string }[]) => els.filter((e) => e.type === 'image' && /logo/i.test(e.alt ?? '')) as unknown as { x: number; y: number; width: number; height: number }[]

describe('brand logo on slides', () => {
  const themes = [getTheme('cobalt'), DESIGNS.find((d) => d.theme.style?.photo && d.theme.style.photo !== 'none')!.theme, DESIGNS.find((d) => !d.premium && d.theme.colors.background < '#555555')!.theme]
  it('every layout carries exactly one logo, in the bottom margin, inside the canvas, left aligned, below the content area', () => {
    for (const theme of themes) {
      for (const aspect of ['16:9', '4:3', '1:1'] as const) {
        const { width: W, height: H } = CANVAS[aspect]
        const M = Math.round(W * 0.05)
        for (const content of SAMPLES) {
          const s = composeSlide(content, withBrand(theme), aspect)
          const logos = logoOf(s.elements)
          expect(logos, `${theme.id} ${aspect} ${content.layout}`).toHaveLength(1)
          const l = logos[0]!
          expect(l.x).toBe(M)
          expect(l.y).toBeGreaterThanOrEqual(H - M)
          expect(l.y + l.height).toBeLessThanOrEqual(H)
          expect(l.x + l.width).toBeLessThanOrEqual(W * 0.2)
          for (const e of s.elements) expect(() => elementSchema.parse(e)).not.toThrow()
        }
      }
    }
  })
  it('no brand → no logo and the slide is exactly what it was', () => {
    const t = getTheme('cobalt')
    for (const content of SAMPLES) {
      const plain = composeSlide(content, t, '16:9', () => 'id')
      expect(logoOf(plain.elements)).toHaveLength(0)
      const branded = composeSlide(content, withBrand(t), '16:9', () => 'id')
      expect(branded.elements.length).toBeGreaterThan(plain.elements.length)
    }
  })
  it('a wide logo is shrunk to fit; a tall one keeps its shape', () => {
    const wide = logoOf(composeSlide(SAMPLES[1]!, withBrand(getTheme('cobalt'), 6), '16:9').elements)[0]!
    const tall = logoOf(composeSlide(SAMPLES[1]!, withBrand(getTheme('cobalt'), 0.5), '16:9').elements)[0]!
    expect(wide.width).toBeLessThanOrEqual(1920 * 0.14 + 1)
    expect(tall.width / tall.height).toBeCloseTo(0.5, 1)
  })
  it('dark and picture slides get a white plate behind the logo; light slides do not', () => {
    const light = composeSlide(SAMPLES.find((s) => s.layout === 'title-body')!, withBrand(getTheme('cobalt')), '16:9')
    const dark = composeSlide(SAMPLES.find((s) => s.layout === 'title-body')!, withBrand(themes[2]!), '16:9')
    const plates = (els: { type: string; fill?: string; y: number }[]) => els.filter((e) => e.type === 'shape' && e.fill === '#FFFFFF' && e.y >= 1080 - 96 - 10)
    expect(plates(light.elements as never)).toHaveLength(0)
    expect(plates(dark.elements as never)).toHaveLength(1)
  })
  it('does not introduce validation problems', () => {
    const t = getTheme('cobalt')
    const full = (th: Theme, content: (typeof SAMPLES)[number]) => ({ id: 's', locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(content, th, '16:9') })
    for (const content of SAMPLES) {
      const before = validateSlide(full(t, content), t).filter((i) => i.severity === 'error').length
      const after = validateSlide(full(withBrand(t), content), withBrand(t)).filter((i) => i.severity === 'error').length
      expect(after, content.layout).toBeLessThanOrEqual(before)
    }
  })
})

describe('brandLogoElements (for hand-edited slides)', () => {
  it('returns the logo flagged as brand, plus a white plate on dark backgrounds, with the same geometry as composed slides', () => {
    const t = withBrand(getTheme('cobalt'))
    let n = 0
    const light = brandLogoElements(t, '16:9', false, () => `b${++n}`)
    const dark = brandLogoElements(t, '16:9', true, () => `b${++n}`)
    expect(light).toHaveLength(1); expect(dark).toHaveLength(2)
    for (const e of [...light, ...dark]) { expect(e.brand).toBe(true); expect(e.decorative).toBe(true); expect(() => elementSchema.parse(e)).not.toThrow() }
    const composed = composeSlide(SAMPLES[1]!, t, '16:9').elements.find((e) => e.type === 'image' && /logo/i.test((e as { alt?: string }).alt ?? ''))!
    const direct = light[0]!
    expect([direct.x, direct.y, direct.width, direct.height]).toEqual([composed.x, composed.y, composed.width, composed.height])
    expect(brandLogoElements(getTheme('cobalt'), '16:9', false, () => 'x')).toHaveLength(0) // no brand → nothing
  })
  it('composed slides flag their logo and plate too, so a later brand change can find and replace them', () => {
    const els = composeSlide(SAMPLES.find((s) => s.layout === 'title-body')!, withBrand(themes0()), '16:9').elements
    expect(els.filter((e) => e.brand).length).toBeGreaterThanOrEqual(1)
  })
})
const themes0 = () => DESIGNS.find((d) => !d.premium && d.theme.colors.background < '#555555')!.theme
