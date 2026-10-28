import type { Theme } from '@prompttoppt/validation'
import { isDark } from './color'
import { makeColors } from './palette'

/**
 * Colour palettes a user can drop onto ANY design (the Style panel's palette picker). A palette is just a brand colour + an accent:
 * `recolor` rebuilds the whole accessible colour set from them (contrast-checked by makeColors), keeping the design's layout, fonts and
 * the deck's light/dark mode, so every palette works on every template.
 */
export interface Palette { id: string; name: string; group: PaletteGroup; primary: string; accent: string }
export const PALETTE_GROUPS = ['Blues', 'Greens', 'Warm', 'Purples & pinks', 'Neutrals', 'Soft'] as const
export type PaletteGroup = (typeof PALETTE_GROUPS)[number]

const P = (group: PaletteGroup, id: string, name: string, primary: string, accent: string): Palette => ({ id, name, group, primary, accent })

export const PALETTES: Palette[] = [
  // Blues — deep navy and cerulean bases with one decisive accent
  P('Blues', 'prussian', 'Prussian', '#003049', '#FCBF49'),
  P('Blues', 'cerulean', 'Cerulean', '#219EBC', '#FB8500'),
  P('Blues', 'midnight-mint', 'Midnight Mint', '#0B132B', '#5BC0BE'),
  P('Blues', 'lagoon', 'Lagoon', '#05668D', '#02C39A'),
  P('Blues', 'electric', 'Electric Blue', '#4361EE', '#F72585'),
  P('Blues', 'steel-coral', 'Steel & Coral', '#355C7D', '#F67280'),
  // Greens — from deep teal to matcha
  P('Greens', 'green-mint', 'Green Mint', '#166534', '#86EFAC'),
  P('Greens', 'persian-sun', 'Persian Sun', '#264653', '#E9C46A'),
  P('Greens', 'persian-green', 'Persian Green', '#2A9D8F', '#E76F51'),
  P('Greens', 'olive-grove', 'Olive Grove', '#606C38', '#DDA15E'),
  P('Greens', 'hunter-berry', 'Hunter & Berry', '#386641', '#BC4749'),
  P('Greens', 'matcha', 'Matcha', '#4F772D', '#90A955'),
  // Warm — oranges, brick and gold
  P('Warm', 'aureolin', 'Aureolin', '#CA8A04', '#FACC15'),
  P('Warm', 'burnt-orange', 'Burnt Orange', '#BB3E03', '#EE9B00'),
  P('Warm', 'brick', 'Brick', '#9B2226', '#0A9396'),
  P('Warm', 'tangerine', 'Tangerine', '#F77F00', '#0077B6'),
  P('Warm', 'rust-rose', 'Rust Rose', '#B23A48', '#FCB9B2'),
  P('Warm', 'tuscan', 'Tuscan', '#BC6C25', '#4D908E'),
  // Purples & pinks — vivid and dusky
  P('Purples & pinks', 'mauve-dusk', 'Mauve Dusk', '#6D597A', '#E56B6F'),
  P('Purples & pinks', 'plum-wine', 'Plum Wine', '#5F0F40', '#FB8B24'),
  P('Purples & pinks', 'grape-soda', 'Grape Soda', '#7209B7', '#4CC9F0'),
  P('Purples & pinks', 'neon-berry', 'Neon Berry', '#F72585', '#8338EC'),
  P('Purples & pinks', 'violet-yolk', 'Violet & Yolk', '#560BAD', '#FFD60A'),
  P('Purples & pinks', 'indigo', 'Indigo', '#312E81', '#38BDF8'),
  // Neutrals — near-blacks and warm greys with a single signal colour
  P('Neutrals', 'oxford', 'Oxford', '#14213D', '#FCA311'),
  P('Neutrals', 'space-cadet', 'Space Cadet', '#2B2D42', '#EF233C'),
  P('Neutrals', 'slate', 'Slate', '#334155', '#38BDF8'),
  P('Neutrals', 'espresso', 'Espresso', '#3C2A21', '#D4A373'),
  P('Neutrals', 'ink', 'Ink', '#111827', '#2563EB'),
  P('Neutrals', 'stone', 'Stone', '#44403C', '#D97706'),
  // Soft — gentle brand colours that still read
  P('Soft', 'pastel-blue', 'Pastel Blue', '#4338CA', '#F9A8D4'),
  P('Soft', 'lilac-smoke', 'Lilac Smoke', '#4A4E69', '#C9ADA7'),
  P('Soft', 'candy', 'Candy', '#A06CD5', '#FFAFCC'),
  P('Soft', 'powder-blue', 'Powder Blue', '#3D5A80', '#EE6C4D'),
  P('Soft', 'sage', 'Sage', '#3F6B4F', '#FBBF77'),
  P('Soft', 'peach', 'Peach', '#C2410C', '#F9A8D4'),
]

const HEX = /^#[0-9a-fA-F]{6}$/
export const isHex = (s: string) => HEX.test(s)

/** The theme with a new palette. Mode (light/dark) follows the deck; layout, fonts, style kit and motion are untouched. */
export function recolor(theme: Theme, seed: { primary: string; accent: string }): Theme {
  const mode = isDark(theme.colors.background) ? 'dark' : 'light'
  return { ...theme, colors: makeColors({ primary: seed.primary, accent: seed.accent, mode, bg: 'white' }) }
}
