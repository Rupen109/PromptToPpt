import type { Theme } from '@prompttoppt/validation'
import { applyBrandToTheme, type BrandInput } from './brand'
import { makeColors } from './palette'
import type { TemplateDesign } from './templates/build'

/**
 * A THEME made from a brand kit: a design (its layout style, fonts weight, motion) in light or dark, with the kit's colours, fonts and logo. ONE rule for the editor's preview and
 * "Apply", a new deck built in it, and the assistant. Only the inputs are saved (brand_theme: kit, design, mode), so editing the kit changes every theme made from it.
 * The design's own mode keeps its exact ground (a warm white, a pure colour); the other mode is built from the same seed colours.
 */
export function brandTheme(design: Pick<TemplateDesign, 'id' | 'theme' | 'look'>, mode: 'light' | 'dark', kit: BrandInput, name: string, id = `brand-theme-${design.id}`): Theme {
  const base: Theme = mode === design.look.mode ? design.theme : { ...design.theme, colors: makeColors({ primary: kit.primary ?? design.theme.colors.primary, accent: kit.accent ?? design.theme.colors.accent, mode }) }
  return { ...applyBrandToTheme(base, kit), id, name, templateId: design.id }
}
