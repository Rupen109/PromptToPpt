import { textBaseWeight, type TextElement, type Theme } from '@prompttoppt/validation'
import { FONT_ADVANCES, GLYPHS, WEIGHTS } from './font-widths'

/**
 * Average glyph advance as a fraction of the font size, for fonts and characters the measured table (font-widths.ts) does not cover. The table is what normally
 * decides: real per-character widths at the weight the text is drawn, so a short bold figure like "99.95%" is measured as wide as it really is.
 */
export const FONT_WIDTH: Record<string, number> = {
  Inter: 0.54, 'Plus Jakarta Sans': 0.56, 'DM Sans': 0.55, Manrope: 0.56, Outfit: 0.54, 'Space Grotesk': 0.56, Sora: 0.58, Poppins: 0.6, Montserrat: 0.62,
  Raleway: 0.57, 'Work Sans': 0.56, 'IBM Plex Sans': 0.55, 'Nunito Sans': 0.54, Lato: 0.52, 'Playfair Display': 0.56, 'DM Serif Display': 0.52, Lora: 0.54,
  Merriweather: 0.6, Fraunces: 0.57, 'Source Serif 4': 0.52, 'Bebas Neue': 0.42, 'Archivo Narrow': 0.45, Oswald: 0.46, 'Space Mono': 0.62, 'JetBrains Mono': 0.6,
  'Josefin Sans': 0.5, Anton: 0.46,
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
  /** the gap between paragraphs, in multiples of the size (the slide draws `paraGap ?? 0.5`) */
  paraGap?: number | undefined
  /** the weight the text is drawn at (bold text is wider); default 400 */
  weight?: number | undefined
}

const HEADING_ROLES = new Set<TextElement['role']>(['title', 'heading', 'metric', 'subtitle'])
/** Metric options for an element, derived the same way the renderer picks fonts — so estimator and renderer agree. */
export function metricOptsFor(el: Pick<TextElement, 'role' | 'uppercase' | 'letterSpacing' | 'lineHeight'> & { weight?: number | undefined; paraGap?: number | undefined }, theme: Pick<Theme, 'fonts'>): MetricOpts {
  return { font: HEADING_ROLES.has(el.role) ? theme.fonts.heading : theme.fonts.body, uppercase: el.uppercase, tracking: el.letterSpacing, lineHeight: el.lineHeight, paraGap: el.paraGap, weight: textBaseWeight(el) }
}

const GLYPH_INDEX = new Map([...GLYPHS].map((ch, i) => [ch, i]))
const parsed = new Map<string, number[] | null>()
/** the measured widths (thousandths of the size) for a font at the nearest measured weight, or null when the font is not in the table */
function advances(font: string | undefined, weight: number): number[] | null {
  const w = WEIGHTS.reduce((best, x) => (Math.abs(x - weight) < Math.abs(best - weight) || (Math.abs(x - weight) === Math.abs(best - weight) && x > best) ? x : best), WEIGHTS[0])
  const key = `${font}|${w}`
  if (!parsed.has(key)) { const row = font ? FONT_ADVANCES[font]?.[w] : undefined; parsed.set(key, row ? row.match(/../g)!.map((x) => parseInt(x, 36)) : null) }
  return parsed.get(key)!
}

/** how wide this text is drawn on one line, in px */
export function textWidth(text: string, fontSize: number, o: MetricOpts = {}): number {
  const t = o.uppercase ? text.toUpperCase() : text
  const table = advances(o.font, o.weight ?? 400)
  const avg = (FONT_WIDTH[o.font ?? ''] ?? DEFAULT_WIDTH) * (table || !o.uppercase ? 1 : 1.14)
  let units = 0
  let n = 0
  for (const ch of t) {
    const i = table ? GLYPH_INDEX.get(ch) : undefined
    units += i !== undefined ? table![i]! / 1000 : avg
    n++
  }
  return units * fontSize + (o.tracking ?? 0) * n
}

export function estimateLines(text: string, fontSize: number, width: number, o: MetricOpts = {}): number {
  const space = textWidth(' ', fontSize, o)
  let lines = 0
  for (const hard of text.split('\n')) {
    // greedy word wrap on measured widths, as the browser does it; a word wider than the line breaks across lines (the slide allows breaking anywhere)
    let cur = 0
    let n = 1
    for (const word of hard.split(/\s+/).filter(Boolean)) {
      // a hyphen is a break opportunity too ("MONTH-ON-" / "MONTH"), with no space before the next piece
      word.match(/[^-]*-+|[^-]+$/g)!.forEach((piece, k) => {
        const w = textWidth(piece, fontSize, o)
        const gap = k === 0 ? space : 0
        if (cur === 0) cur = w
        else if (cur + gap + w <= width) cur += gap + w
        else { n++; cur = w }
        while (cur > width) { n++; cur -= width }
      })
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
    if (i < paragraphs.length - 1) h += fontSize * (o.paraGap ?? 0.5) // the box's own gap, as the slide draws it
  })
  return h
}

/** Largest font size in [min,max] at which the text fits the box; returns min if even that overflows (validator will flag it). */
export function fitFontSize(paragraphs: TextElement['paragraphs'], width: number, height: number, max: number, min: number, o: MetricOpts = {}): number {
  for (let s = max; s > min; s -= 2) if (estimateTextHeight(paragraphs, s, width, o) <= height) return s
  return min
}
