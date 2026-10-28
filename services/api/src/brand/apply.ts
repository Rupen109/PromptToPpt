import { applyBrandToTheme } from '@prompttoppt/theme'
import type { Theme } from '@prompttoppt/validation'
import type { KitView } from './kits.ts'

/** A deck's theme in the user's brand kit: the kit's colours, fonts and logo (any part the kit does not have is left as the design had it). */
export function themeWithKit(theme: Theme, kit: Pick<KitView, 'name' | 'colors' | 'fonts' | 'logo'>): Theme {
  return applyBrandToTheme(theme, { primary: kit.colors.primary, accent: kit.colors.accent, headingFont: kit.fonts.heading, bodyFont: kit.fonts.body, name: kit.name, logo: kit.logo })
}
