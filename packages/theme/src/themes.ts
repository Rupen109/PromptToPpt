import type { Theme } from '@prompttoppt/validation'

const fonts = { heading: 'Plus Jakarta Sans', body: 'Inter' }

/** Built-in themes. All text/background pairs are checked by the contrast validator in tests. */
export const THEMES: Theme[] = [
  {
    id: 'cobalt', name: 'Cobalt', fonts, radius: 16,
    colors: { background: '#FFFFFF', surface: '#F3F4F9', textPrimary: '#181B25', textSecondary: '#475569', primary: '#0B3DD0', secondary: '#FFDF00', accent: '#FF5722', onPrimary: '#FFFFFF' },
  },
  {
    id: 'forest', name: 'Forest', fonts, radius: 4,
    colors: { background: '#FFFFFF', surface: '#EEF5EE', textPrimary: '#14231A', textSecondary: '#475A4D', primary: '#0F4A14', secondary: '#D4F933', accent: '#B7791F', onPrimary: '#FFFFFF' },
  },
  {
    id: 'midnight', name: 'Midnight', fonts, radius: 20,
    colors: { background: '#0F172A', surface: '#1E293B', textPrimary: '#F1F5F9', textSecondary: '#A5B4C7', primary: '#818CF8', secondary: '#22D3EE', accent: '#F472B6', onPrimary: '#0F172A' },
  },
  {
    id: 'slate', name: 'Slate', fonts, radius: 8,
    colors: { background: '#FFFFFF', surface: '#F1F5F9', textPrimary: '#0F172A', textSecondary: '#475569', primary: '#0F172A', secondary: '#38BDF8', accent: '#EA580C', onPrimary: '#FFFFFF' },
  },
]
export const DEFAULT_THEME_ID = 'cobalt'
/** Themes gated behind the `premiumTemplates` plan feature (Starter gets the others). */
export const PREMIUM_THEME_IDS = ['forest', 'midnight']
export const getTheme = (id: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0]!

/** Fonts the editor/present mode load and PPTX export can map; anything else triggers a font_fallback warning. */
export const SUPPORTED_FONTS = [
  'Plus Jakarta Sans', 'Inter', 'Space Grotesk', 'Sora', 'Poppins', 'Montserrat', 'Lato', 'Outfit', 'DM Sans', 'Manrope', 'Playfair Display', 'Lora', 'DM Serif Display',
  'Fraunces', 'Work Sans', 'Raleway', 'Nunito Sans', 'IBM Plex Sans', 'Merriweather', 'Source Serif 4', 'Bebas Neue', 'Oswald', 'Space Mono',
  'Arial', 'Calibri', 'Georgia', 'Helvetica', 'Times New Roman', 'Verdana',
]
