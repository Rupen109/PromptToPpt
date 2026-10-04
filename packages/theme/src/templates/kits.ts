import type { Motion, ThemeStyle } from '@prompttoppt/validation'

type K = Partial<ThemeStyle>

/** 24 curated style kits. A kit is a coherent LOOK (title composition + header + cards + ornament + type treatment). */
export const KITS = {
  orbSplit: { title: 'split', header: 'underline', card: 'shadow', decor: 'circles', titleBackground: 'gradient', headingWeight: 800 },
  classicBar: { title: 'bar', header: 'bar', card: 'accent-top', decor: 'dots', bodyBackground: 'tint', headingWeight: 800 },
  badgeGlow: { title: 'badge', header: 'dot', card: 'tint', decor: 'blobs', titleBackground: 'gradient', bodyBackground: 'gradient', headingWeight: 800 },
  stackBold: { title: 'stack', header: 'rule', card: 'outline', decor: 'diagonal', titleBackground: 'dark', uppercaseHeadings: true, headingTracking: 2, headingWeight: 900, footer: 'number' },
  centerRings: { title: 'center', header: 'none', card: 'flat', decor: 'rings', titleBackground: 'dark', headingWeight: 700 },
  minimalGrid: { title: 'minimal', header: 'rule', card: 'outline', decor: 'grid', footer: 'brand', headingWeight: 700 },
  serifFrame: { title: 'frame', header: 'underline', card: 'flat', decor: 'corner', bodyBackground: 'tint', headingWeight: 700, footer: 'brand' },
  bandSide: { title: 'band', header: 'side', card: 'shadow', decor: 'stripes', footer: 'number', headingWeight: 800 },
  diagLeft: { title: 'diagonal', header: 'bar', card: 'accent-left', decor: 'dots', titleBackground: 'dark', headingWeight: 800 },
  frameGrid: { title: 'frame', header: 'rule', card: 'outline', decor: 'grid', headingWeight: 600, titleBackground: 'primary' },
  centerDot: { title: 'center', header: 'dot', card: 'shadow', decor: 'circles', bodyBackground: 'tint', titleBackground: 'gradient', headingWeight: 800 },
  splitSide: { title: 'split', header: 'side', card: 'accent-top', decor: 'none', footer: 'number', headingWeight: 800 },
  minimalSoft: { title: 'minimal', header: 'underline', card: 'tint', decor: 'blobs', bodyBackground: 'gradient', headingWeight: 700 },
  bandBar: { title: 'band', header: 'bar', card: 'flat', decor: 'diagonal', headingWeight: 800 },
  stackLight: { title: 'stack', header: 'underline', card: 'accent-left', decor: 'stripes', titleBackground: 'primary', headingWeight: 800 },
  badgeClean: { title: 'badge', header: 'bar', card: 'shadow', decor: 'rings', titleBackground: 'dark', headingWeight: 800 },
  diagGradient: { title: 'diagonal', header: 'dot', card: 'tint', decor: 'corner', titleBackground: 'gradient', bodyBackground: 'tint', headingWeight: 800 },
  centerMono: { title: 'center', header: 'rule', card: 'outline', decor: 'dots', titleBackground: 'dark', uppercaseHeadings: true, headingTracking: 4, headingWeight: 600, footer: 'brand' },
  splitDark: { title: 'split', header: 'none', card: 'flat', decor: 'circles', titleBackground: 'dark', headingWeight: 800 },
  frameBar: { title: 'frame', header: 'bar', card: 'accent-top', decor: 'blobs', bodyBackground: 'gradient', titleBackground: 'gradient', headingWeight: 800 },
  stackTint: { title: 'stack', header: 'side', card: 'tint', decor: 'corner', uppercaseHeadings: true, headingTracking: 1, headingWeight: 900, titleBackground: 'primary' },
  bandUnderline: { title: 'band', header: 'underline', card: 'accent-top', decor: 'circles', bodyBackground: 'tint', headingWeight: 800 },
  minimalDark: { title: 'minimal', header: 'none', card: 'flat', decor: 'none', headingWeight: 800 },
  badgeStripes: { title: 'badge', header: 'rule', card: 'accent-left', decor: 'stripes', footer: 'number', titleBackground: 'primary', headingWeight: 800 },
} satisfies Record<string, K>
export type KitKey = keyof typeof KITS

/** 8 motion personalities (slide transition + element entrance + stagger). */
export const MOTIONS = {
  rise: { transition: 'fade', entrance: 'fade-up', stagger: 120, duration: 650 },
  zoom: { transition: 'zoom', entrance: 'zoom', stagger: 100, duration: 600 },
  slide: { transition: 'slide', entrance: 'slide-left', stagger: 110, duration: 600 },
  pop: { transition: 'fade', entrance: 'pop', stagger: 90, duration: 520 },
  wipe: { transition: 'wipe', entrance: 'wipe', stagger: 140, duration: 700 },
  blur: { transition: 'fade', entrance: 'blur', stagger: 130, duration: 800 },
  push: { transition: 'push', entrance: 'fade', stagger: 100, duration: 550 },
  drop: { transition: 'slide', entrance: 'fade-down', stagger: 120, duration: 600 },
} satisfies Record<string, Motion>
export type MotionKey = keyof typeof MOTIONS

/** Heading / body pairs. Every family is loaded lazily and has a width entry for overflow estimation. */
export const FONT_PAIRS = {
  jakarta: ['Plus Jakarta Sans', 'Inter'], grotesk: ['Space Grotesk', 'Inter'], sora: ['Sora', 'Inter'], poppins: ['Poppins', 'Inter'], montserrat: ['Montserrat', 'Lato'],
  outfit: ['Outfit', 'DM Sans'], manrope: ['Manrope', 'Inter'], playfair: ['Playfair Display', 'Lora'], dmserif: ['DM Serif Display', 'DM Sans'], fraunces: ['Fraunces', 'Work Sans'],
  raleway: ['Raleway', 'Nunito Sans'], plex: ['IBM Plex Sans', 'IBM Plex Sans'], merri: ['Merriweather', 'Source Serif 4'], bebas: ['Bebas Neue', 'Inter'], oswald: ['Oswald', 'Lato'],
  dmsans: ['DM Sans', 'DM Sans'], worksans: ['Work Sans', 'Work Sans'], mono: ['Space Mono', 'IBM Plex Sans'], nunito: ['Nunito Sans', 'Nunito Sans'], lora: ['Lora', 'Source Serif 4'],
} as const satisfies Record<string, readonly [string, string]>
export type FontKey = keyof typeof FONT_PAIRS

/** Heaviest weight each heading family actually has (browsers fake-bold otherwise, which looks wrong). */
export const MAX_WEIGHT: Record<string, number> = {
  'Bebas Neue': 400, 'DM Serif Display': 400, Oswald: 700, 'Space Mono': 700, Lora: 700, 'IBM Plex Sans': 700, 'Space Grotesk': 700, 'Plus Jakarta Sans': 800, Sora: 800, Manrope: 800,
  Merriweather: 900, Lato: 900,
}
