import { describe, expect, it } from 'vitest'
import { DESIGNS, contrastRatio, isDark } from '@prompttoppt/theme'
import { themeForAnalysis } from './theming.ts'

const light = DESIGNS.find((d) => !isDark(d.theme.colors.background))!.theme
describe('deck colours follow the topic and default to dark', () => {
  it('dark by default even when the chosen design is light', () => {
    const t = themeForAnalysis(light, {})
    expect(isDark(t.colors.background)).toBe(true)
    expect(t.fonts).toEqual(light.fonts)
    expect(t.style).toEqual(light.style)
  })
  it('uses the topic palette (greens for the environment) and stays accessible', () => {
    const t = themeForAnalysis(light, { palette: { primary: '#1B7F3B', accent: '#B6F500' } })
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(t.colors.background.slice(i, i + 2), 16)) as [number, number, number]
    expect(g).toBeGreaterThan(r) // a green-tinted dark background
    expect(g).toBeGreaterThanOrEqual(b)
    expect(contrastRatio(t.colors.textPrimary, t.colors.background)).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(t.colors.textSecondary, t.colors.background)).toBeGreaterThanOrEqual(4.5)
  })
  it('light only when explicitly asked', () => {
    expect(isDark(themeForAnalysis(light, { lightMode: true, palette: { primary: '#C2410C', accent: '#FACC15' } }).colors.background)).toBe(false)
    expect(isDark(themeForAnalysis(light, { lightMode: false }).colors.background)).toBe(true)
  })
})
