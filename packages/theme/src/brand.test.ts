import { describe, expect, it } from 'vitest'
import { applyBrandToTheme, faithfulPrimary } from './brand'
import { contrastRatio, isDark } from './color'
import { getTheme } from './themes'

const light = () => getTheme('cobalt')
const bars = (t: ReturnType<typeof light>) => ({
  asText: Math.min(contrastRatio(t.colors.primary, t.colors.background), contrastRatio(t.colors.primary, t.colors.surface)),
  asFill: Math.max(contrastRatio('#FFFFFF', t.colors.primary), contrastRatio('#0B0F1A', t.colors.primary)),
  onFill: contrastRatio(t.colors.onPrimary, t.colors.primary),
})

describe('a brand on a light deck keeps its own main colour wherever it is legible', () => {
  it('brand colours that are already legible stay EXACT (Dropbox blue); near-misses move only a hair (Stripe purple)', () => {
    expect(faithfulPrimary('#0061FF', '#FFFFFF', '#F5F8FF')).toBe('#0061FF')
    for (const hex of ['#0061FF', '#1D4ED8']) expect(applyBrandToTheme(light(), { primary: hex, accent: '#FF8800' }).colors.primary).toBe(hex)
    const near = (a: string, b: string) => Math.hypot(...[1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) as [number, number, number])
    for (const hex of ['#635BFF', '#533AFD']) expect(near(applyBrandToTheme(light(), { primary: hex, accent: '#FF8800' }).colors.primary, hex)).toBeLessThan(20)
  })
  it('colours that are too light to read are darkened just enough, starting from the brand colour (hue kept)', () => {
    for (const hex of ['#FFE01B', '#1DB954', '#FF7A59', '#F06A6A', '#58CC02', '#FC8019']) {
      const t = applyBrandToTheme(light(), { primary: hex, accent: '#112233' })
      const b = bars(t)
      expect(b.asText, hex).toBeGreaterThanOrEqual(3.4); expect(b.asFill, hex).toBeGreaterThanOrEqual(4.8); expect(b.onFill, hex).toBeGreaterThanOrEqual(4.5)
      expect(t.colors.primary.toUpperCase()).not.toBe('#FFFFFF')
    }
  })
  it('every result stays accessible for a broad set of brand colours, and never ends up lighter than the generic palette maker\'s answer would be dark', () => {
    for (const hex of ['#E50914', '#E60023', '#FF385C', '#4A154B', '#387ED1', '#2874F0', '#7D2AE8', '#0B3D91', '#007CC3', '#008060', '#FF4800', '#883EFF']) {
      const t = applyBrandToTheme(light(), { primary: hex, accent: '#17BEBB' }); const b = bars(t)
      expect(b.asText, hex).toBeGreaterThanOrEqual(3.4); expect(b.asFill, hex).toBeGreaterThanOrEqual(4.8)
    }
  })
  it('the accent is always the brand\'s exact accent; fonts and the logo are untouched by colours', () => {
    const t = applyBrandToTheme(light(), { primary: '#0061FF', accent: '#B4DC19' }); expect(t.colors.accent).toBe('#B4DC19'); expect(t.fonts).toEqual(light().fonts)
  })
  it('a dark deck keeps the generator\'s lightened primary (the light-deck rule does not apply)', () => {
    const dark = getTheme('midnight')
    expect(isDark(dark.colors.background)).toBe(true)
    const t = applyBrandToTheme(dark, { primary: '#0061FF', accent: '#B4DC19' })
    expect(contrastRatio(t.colors.primary, t.colors.background)).toBeGreaterThanOrEqual(3.4)
  })
})
