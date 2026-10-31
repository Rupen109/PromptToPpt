import { describe, expect, it } from 'vitest'
import { DESIGNS, contrastRatio, isDark } from '@prompttoppt/theme'
import { themeForAnalysis } from './theming.ts'

const lightDesign = DESIGNS.find((d) => d.look.mode === 'light' && isDark(d.theme.colors.background) === false)!
const darkDesign = DESIGNS.find((d) => d.look.mode === 'dark')!
describe('deck colours follow the topic; light or dark follows the design', () => {
  it('a light design gives a light deck and a dark design a dark one (decks no longer all come out dark)', () => {
    expect(isDark(themeForAnalysis(lightDesign.theme, {}, lightDesign.look).colors.background)).toBe(false)
    expect(isDark(themeForAnalysis(darkDesign.theme, {}, darkDesign.look).colors.background)).toBe(true)
  })
  it('keeps the design layout, fonts and style', () => {
    const t = themeForAnalysis(lightDesign.theme, { palette: { primary: '#1B7F3B', accent: '#B6F500' } }, lightDesign.look)
    expect(t.fonts).toEqual(lightDesign.theme.fonts)
    expect(t.style).toEqual(lightDesign.theme.style)
  })
  it('uses the topic palette (greens for the environment) and stays accessible, in dark and in light', () => {
    const dark = themeForAnalysis(darkDesign.theme, { palette: { primary: '#1B7F3B', accent: '#B6F500' } }, darkDesign.look)
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(dark.colors.background.slice(i, i + 2), 16)) as [number, number, number]
    expect(g).toBeGreaterThan(r) // a green-tinted dark background
    expect(g).toBeGreaterThanOrEqual(b)
    for (const t of [dark, themeForAnalysis(lightDesign.theme, { palette: { primary: '#1B7F3B', accent: '#B6F500' } }, lightDesign.look)]) {
      expect(contrastRatio(t.colors.textPrimary, t.colors.background)).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(t.colors.textSecondary, t.colors.background)).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('an explicit request wins over the design: "light" and "dark"', () => {
    expect(isDark(themeForAnalysis(darkDesign.theme, { lightMode: true, palette: { primary: '#C2410C', accent: '#FACC15' } }, darkDesign.look).colors.background)).toBe(false)
    expect(isDark(themeForAnalysis(lightDesign.theme, { darkMode: true }, lightDesign.look).colors.background)).toBe(true)
  })
  it('without a design look it stays dark, as before', () => {
    expect(isDark(themeForAnalysis(lightDesign.theme, {}).colors.background)).toBe(true)
  })
})
