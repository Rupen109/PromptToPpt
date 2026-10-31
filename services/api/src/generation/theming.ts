import { makeColors, type TemplateDesign } from '@prompttoppt/theme'
import type { PromptAnalysis, Theme } from '@prompttoppt/validation'

/**
 * The colours of a generated deck: the chosen design supplies layout, fonts, style and motion; the COLOURS come from the topic
 * (analysis.palette — environment → greens, Gandhi Jayanti → saffron/green …). Light or dark follows the DESIGN (its own mode and background
 * temperature), so a light template gives a light deck and a dark one a dark deck: that is what makes two decks look different. Only an explicit
 * request ("make it white" / "dark mode") overrides it. makeColors guarantees accessible contrast either way.
 */
export function themeForAnalysis(base: Theme, analysis: Pick<PromptAnalysis, 'palette' | 'lightMode' | 'darkMode'>, look?: TemplateDesign['look']): Theme {
  const primary = analysis.palette?.primary ?? base.colors.primary
  const accent = analysis.palette?.accent ?? base.colors.accent
  const asked = analysis.lightMode ? 'light' : analysis.darkMode ? 'dark' : undefined
  const mode = asked ?? look?.mode ?? 'dark'
  // the design's background temperature only applies to the mode it was made for
  const ground = !asked || asked === look?.mode ? look : undefined
  return { ...base, colors: makeColors({ primary, accent, mode, ...(ground?.ground ? { ground: ground.ground } : { bg: ground?.bg ?? 'white' }) }) }
}
