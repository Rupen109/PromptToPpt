import { makeColors } from '@prompttoppt/theme'
import type { PromptAnalysis, Theme } from '@prompttoppt/validation'

/**
 * The colours of a generated deck: the chosen design supplies layout, fonts, style and motion; the COLOURS come from the topic
 * (analysis.palette — environment → greens, Gandhi Jayanti → saffron/green …) and are DARK by default. Only an explicit request for
 * light ("make it white / light mode") produces a light deck. makeColors guarantees accessible contrast either way.
 */
export function themeForAnalysis(base: Theme, analysis: Pick<PromptAnalysis, 'palette' | 'lightMode'>): Theme {
  const primary = analysis.palette?.primary ?? base.colors.primary
  const accent = analysis.palette?.accent ?? base.colors.accent
  return { ...base, colors: makeColors({ primary, accent, mode: analysis.lightMode ? 'light' : 'dark', bg: 'white' }) }
}
