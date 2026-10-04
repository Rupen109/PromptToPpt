import type { ThemeStyle } from '@prompttoppt/validation'
import { contrastRatio, hexToHsl, hslToHex, mix, readableOn } from './color'

export interface PaletteSeed {
  /** brand colour — becomes the title/fill colour AND the colour of large headline text on cards */
  primary: string
  /** ornament colour */
  accent: string
  mode: 'light' | 'dark'
  /** light mode only: slide background temperature */
  bg?: 'white' | 'warm' | 'cool' | 'sun'
  /** exact slide ground colour (#RRGGBB), either mode: lets a design BE a colour (pure yellow, deep green) instead of a tinted white/near-black */
  ground?: string
}

export interface Colors {
  background: string
  surface: string
  textPrimary: string
  textSecondary: string
  primary: string
  secondary: string
  accent: string
  onPrimary: string
}

/** Nudge lightness of `hex` until it reaches `min` contrast against every colour in `against` (or runs out of room). */
function ensureContrast(hex: string, against: string[], min: number, direction: 1 | -1): string {
  let [h, s, l] = hexToHsl(hex)
  for (let i = 0; i < 40; i++) {
    const c = hslToHex(h, s, l)
    if (against.every((bg) => contrastRatio(c, bg) >= min)) return c
    l = Math.max(0, Math.min(1, l + direction * 0.015))
  }
  return hslToHex(h, s, l)
}

/**
 * Turns two seed colours into a full, ACCESSIBLE colour system. The guarantees that matter to the layout engine:
 *   · textPrimary / textSecondary read on both background and surface (≥ 4.5 / 4.6 : 1)
 *   · primary is usable as headline text on background and surface (≥ 3.2 : 1) AND as a fill (onPrimary reads on it)
 *   · surface is visibly different from background but never competes with text
 * The test-suite then composes every layout with every template to prove it.
 */
export function makeColors(seed: PaletteSeed): Colors {
  const [ph, ps] = hexToHsl(seed.primary)
  const [ah, as] = hexToHsl(seed.accent)
  const dark = seed.mode === 'dark'

  const background = seed.ground ?? (dark
    ? hslToHex(ph, Math.min(0.5, 0.18 + ps * 0.3), 0.075)
    : seed.bg === 'sun' ? '#FFF6CC' : seed.bg === 'warm' ? '#FFFBF5' : seed.bg === 'cool' ? '#F7FAFF' : '#FFFFFF')
  // on a saturated ground the surface is a lighter wash of it (a darker one would muddy it)
  const surface = dark ? mix(background, '#FFFFFF', 0.075) : seed.ground ? mix(background, '#FFFFFF', 0.55) : mix(background, seed.primary, 0.065)

  const textPrimary = dark ? mix('#FFFFFF', hslToHex(ph, 0.4, 0.9), 0.5) : hslToHex(ph, Math.min(0.35, ps * 0.4), 0.1)
  const sec = dark ? mix(textPrimary, background, 0.32) : hslToHex(ph, Math.min(0.15, ps * 0.2), 0.34)
  const textSecondary = ensureContrast(sec, [background, surface], 4.7, dark ? 1 : -1)

  // primary: dark enough to be text on light slides / light enough to be text on dark slides
  let primary = seed.primary
  const [, , pl] = hexToHsl(primary)
  if (dark && pl < 0.6) primary = hslToHex(ph, Math.max(ps, 0.55), 0.64)
  if (!dark && pl > 0.45) primary = hslToHex(ph, Math.max(ps, 0.5), 0.4)
  primary = ensureContrast(primary, [background, surface], 3.4, dark ? 1 : -1)
  // …and a fill that reads with white/dark text on top. Mid-tones fail both, so push out of that band (darker on light slides, lighter on dark)
  const readable = (c: string) => Math.max(contrastRatio('#FFFFFF', c), contrastRatio('#0B0F1A', c))
  for (let i = 0; i < 60 && readable(primary) < 4.8; i++) {
    const [h, s, l] = hexToHsl(primary)
    primary = hslToHex(h, s, Math.max(0.05, Math.min(0.95, l + (dark ? 0.012 : -0.012))))
  }

  const accent = seed.accent
  // secondary: an analogous, brighter sibling of the accent (used for bars/ornaments, never as text)
  const secondary = hslToHex(ah + (dark ? 28 : -28), Math.max(as, 0.7), dark ? 0.62 : 0.58)
  const onPrimary = readableOn(primary, ['#FFFFFF', '#0B0F1A'], 4.5)
  return { background, surface, textPrimary, textSecondary, primary, secondary, accent, onPrimary }
}

export const styleKit = (partial: Partial<ThemeStyle>): Partial<ThemeStyle> => partial
