import type { Theme } from '@prompttoppt/validation'
import { contrastRatio, hexToHsl, hslToHex, isDark, readableOn } from './color'
import { recolor } from './palettes'

/** What a brand contributes to a deck's theme: colours, fonts, and the logo drawn on every slide. */
export interface BrandInput {
  primary?: string | null | undefined
  accent?: string | null | undefined
  headingFont?: string | null | undefined
  bodyFont?: string | null | undefined
  name?: string | null | undefined
  logo?: { url: string; aspect: number } | null | undefined
}
/**
 * A brand's main colour on a LIGHT deck, as close to the brand as legibility allows. The generic palette maker always darkens any
 * mid-tone (so Dropbox blue #0061FF became #004ECC and the brand colour never appeared). Here the exact colour is kept when it already
 * meets the same two bars (readable as text on both grounds; a fill that white or near-black text reads on); otherwise it is darkened
 * just enough, starting from the brand's own colour.
 */
export function faithfulPrimary(brand: string, background: string, surface: string): string {
  const ok = (c: string) => contrastRatio(c, background) >= 3.4 && contrastRatio(c, surface) >= 3.4 && Math.max(contrastRatio('#FFFFFF', c), contrastRatio('#0B0F1A', c)) >= 4.8
  const exact = brand.toUpperCase()
  if (ok(exact)) return exact
  const [h, s, l0] = hexToHsl(exact)
  for (let l = l0, i = 0; i < 80; i++, l = Math.max(0.05, l - 0.012)) { const c = hslToHex(h, s, l); if (ok(c)) return c }
  return exact
}

export interface BrandPick { colors: boolean; fonts: boolean; logo: boolean }

/**
 * The theme with (the chosen parts of) a brand applied. Colours go through the accessible palette generator (the deck keeps its
 * light/dark mode, layout and style), fonts replace the pairing, and the logo is stored on the theme so every slide shows it.
 * Used by the editor ("Apply") and by deck generation (a new deck built in the user's brand kit).
 */
export function applyBrandToTheme(theme: Theme, b: BrandInput, pick: BrandPick = { colors: true, fonts: true, logo: true }): Theme {
  let t: Theme = theme
  if (pick.colors && b.primary && b.accent) {
    t = recolor(t, { primary: b.primary, accent: b.accent })
    if (!isDark(t.colors.background)) { // light decks keep the brand's own main colour wherever it is legible (dark decks keep the generator's lightened one)
      const primary = faithfulPrimary(b.primary, t.colors.background, t.colors.surface)
      t = { ...t, colors: { ...t.colors, primary, onPrimary: readableOn(primary, ['#FFFFFF', '#0B0F1A'], 4.5) } }
    }
  }
  if (pick.fonts && b.headingFont && b.bodyFont) t = { ...t, fonts: { heading: b.headingFont, body: b.bodyFont } }
  if (pick.logo && b.logo) t = { ...t, brand: { ...(b.name ? { name: b.name } : {}), logo: { src: b.logo.url, aspect: b.logo.aspect } } }
  return t
}
