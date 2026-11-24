/**
 * Effects on text: a shadow and an outline for a whole text box, a highlight (marker colour) behind single words. ONE place for the numbers, read by the slide (CSS),
 * the editor and the PowerPoint file, so the download shows what the screen shows. Sizes are in slide pixels (a slide pixel is half a point).
 */
export const TEXT_SHADOWS = {
  soft: { dy: 3, blur: 10, alpha: 0.35 },
  strong: { dy: 6, blur: 18, alpha: 0.6 },
} as const
export type TextShadow = keyof typeof TEXT_SHADOWS

/** the CSS text-shadow of a named shadow (straight down, black, as PowerPoint's outer shadow at 90°) */
export function textShadowCss(s: TextShadow | undefined): string | undefined {
  if (!s) return undefined
  const t = TEXT_SHADOWS[s]
  return `0 ${t.dy}px ${t.blur}px rgba(0,0,0,${t.alpha})`
}

/** the marker colours offered for highlighting words (any colour can be stored; these are the ones a highlighter has) */
export const HIGHLIGHTS = [
  { hex: '#FFF176', label: 'Yellow' },
  { hex: '#B9F6CA', label: 'Green' },
  { hex: '#FFC1E3', label: 'Pink' },
  { hex: '#B3E5FC', label: 'Blue' },
  { hex: '#FFD59E', label: 'Orange' },
] as const

/** an outline is drawn centred on the letters' edges (CSS text stroke and PowerPoint's text outline both are), never thicker than this many pixels */
export const TEXT_OUTLINE_MAX = 12
