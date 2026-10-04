import type { TextElement, Theme } from '@prompttoppt/validation'

/**
 * Average glyph advance as a fraction of the font size. Display and geometric fonts differ a lot (Bebas Neue is narrow,
 * Poppins/Montserrat wide), so overflow estimation uses a per-family factor. Unknown fonts get a conservative default.
 */
export const FONT_WIDTH: Record<string, number> = {
  Inter: 0.54, 'Plus Jakarta Sans': 0.56, 'DM Sans': 0.55, Manrope: 0.56, Outfit: 0.54, 'Space Grotesk': 0.56, Sora: 0.58, Poppins: 0.6, Montserrat: 0.62,
  Raleway: 0.57, 'Work Sans': 0.56, 'IBM Plex Sans': 0.55, 'Nunito Sans': 0.54, Lato: 0.52, 'Playfair Display': 0.56, 'DM Serif Display': 0.52, Lora: 0.54,
  Merriweather: 0.6, Fraunces: 0.57, 'Source Serif 4': 0.52, 'Bebas Neue': 0.42, 'Archivo Narrow': 0.45, Oswald: 0.46, 'Space Mono': 0.62, 'JetBrains Mono': 0.6,
  Georgia: 0.56, Arial: 0.54, Helvetica: 0.54, Calibri: 0.5, Verdana: 0.62, 'Times New Roman': 0.5,
}
const DEFAULT_WIDTH = 0.58
const LINE_H_DEFAULT = 1.3
const LIST_INDENT = 0.9 // × fontSize

export interface MetricOpts {
  font?: string | undefined
  uppercase?: boolean | undefined
  /** letter-spacing in px */
  tracking?: number | undefined
  lineHeight?: number | undefined
}

const HEADING_ROLES = new Set<TextElement['role']>(['title', 'heading', 'metric', 'subtitle'])
/** Metric options for an element, derived the same way the renderer picks fonts — so estimator and renderer agree. */
export function metricOptsFor(el: Pick<TextElement, 'role' | 'uppercase' | 'letterSpacing' | 'lineHeight'>, theme: Pick<Theme, 'fonts'>): MetricOpts {
  return { font: HEADING_ROLES.has(el.role) ? theme.fonts.heading : theme.fonts.body, uppercase: el.uppercase, tracking: el.letterSpacing, lineHeight: el.lineHeight }
}

const charW = (fontSize: number, o: MetricOpts) => fontSize * ((FONT_WIDTH[o.font ?? ''] ?? DEFAULT_WIDTH) * (o.uppercase ? 1.14 : 1)) + (o.tracking ?? 0)

export function estimateLines(text: string, fontSize: number, width: number, o: MetricOpts = {}): number {
  const perLine = Math.max(1, Math.floor(width / charW(fontSize, o)))
  let lines = 0
  for (const hard of text.split('\n')) {
    // greedy word-wrap simulation — much closer to real layout than length / perLine
    let cur = 0
    let n = 1
    for (const w of hard.split(/\s+/).filter(Boolean)) {
      const len = w.length
      if (cur === 0) cur = len
      else if (cur + 1 + len <= perLine) cur += 1 + len
      else {
        n++
        cur = len
      }
      while (cur > perLine) {
        n++
        cur -= perLine
      }
    }
    lines += n
  }
  return lines
}

export function estimateTextHeight(paragraphs: TextElement['paragraphs'], fontSize: number, width: number, o: MetricOpts = {}): number {
  const lh = o.lineHeight ?? LINE_H_DEFAULT
  let h = 0
  paragraphs.forEach((p, i) => {
    const text = p.runs.map((r) => r.text).join('')
    const w = p.list ? width - fontSize * LIST_INDENT : width
    h += estimateLines(text, fontSize, w, o) * fontSize * lh
    if (i < paragraphs.length - 1) h += fontSize * 0.5
  })
  return h
}

/** Largest font size in [min,max] at which the text fits the box; returns min if even that overflows (validator will flag it). */
export function fitFontSize(paragraphs: TextElement['paragraphs'], width: number, height: number, max: number, min: number, o: MetricOpts = {}): number {
  for (let s = max; s > min; s -= 2) if (estimateTextHeight(paragraphs, s, width, o) <= height) return s
  return min
}
