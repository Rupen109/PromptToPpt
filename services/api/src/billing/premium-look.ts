import { DESIGNS, PREMIUM_THEME_IDS, THEMES } from '@prompttoppt/theme'
import { themeSchema, type Theme } from '@prompttoppt/validation'

/**
 * A "premium look" is identified by WHAT IT LOOKS LIKE (colours, fonts, shape, style, motion), not by the id/name a client chooses to send.
 * Checking only `theme.id` let a free account paste a premium theme's JSON under any id. The fingerprint ignores id, name and templateId.
 */
export const lookOf = (raw: Theme) => {
  // normalised through the schema first: a theme stored before a style field existed and the same theme parsed today (defaults filled in) are the same look
  const t = themeSchema.safeParse(raw).data ?? raw
  return JSON.stringify([t.colors, t.fonts, t.radius, t.style ?? null, t.motion ?? null])
}

/**
 * The DESIGN (layout kit + photo frame + ornament + card style + motion + corner radius), without colours or fonts. Colour palettes and fonts are free for everyone, so a
 * premium design in a different palette must still count as that premium design.
 */
export const designKey = (raw: Theme) => {
  const t = themeSchema.safeParse(raw).data ?? raw
  return JSON.stringify([t.radius, t.style ?? null, t.motion ?? null])
}

let premium: Set<string> | null = null
const premiumLooks = () => {
  if (premium) return premium
  // a design whose kit is identical to a FREE design's is free: only designs unique to the paid catalogue are protected
  const free = new Set([...DESIGNS.filter((d) => !d.premium).map((d) => designKey(d.theme)), ...THEMES.filter((t) => !PREMIUM_THEME_IDS.includes(t.id)).map((t) => designKey(t))])
  return (premium = new Set([...DESIGNS.filter((d) => d.premium).map((d) => designKey(d.theme)), ...THEMES.filter((t) => PREMIUM_THEME_IDS.includes(t.id)).map((t) => designKey(t))].filter((k) => !free.has(k))))
}

export const isPremiumTheme = (t: Theme): boolean =>
  PREMIUM_THEME_IDS.includes(t.id) || !!(t.templateId && DESIGNS.find((d) => d.id === t.templateId)?.premium) || premiumLooks().has(designKey(t))
