/**
 * How a chart is styled beyond its data: the colour of each series or slice, the legend, a trend line and the figures on the marks. ONE place, read by the editor's SVG chart, by the PowerPoint export
 * and by the editor's chart dialog, so a chart looks the same on screen and in the file.
 */
export type LegendPlace = 'none' | 'bottom' | 'right'

/** every chart the product draws (screen and PowerPoint file): bars, lines, AREAS (filled lines), SCATTER (points at numeric x, y), pie and doughnut */
export const CHART_TYPES = ['bar', 'line', 'area', 'scatter', 'pie', 'doughnut'] as const
export type ChartType = (typeof CHART_TYPES)[number]

/** a scatter chart's x values: its labels read as numbers ("12", "3.5", "1,200"); null when any label is not a number (a scatter needs numbers on both axes) */
export function scatterXs(labels: readonly string[]): number[] | null {
  const xs = labels.map((l) => { const t = l.replace(/,/g, '').trim(); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN })
  return xs.length >= 2 && xs.every(Number.isFinite) ? xs : null
}

/** why a chart cannot be shown as `to` (null = it can): a pie or doughnut shows one series; a scatter needs a number for every label (its x values) */
export function chartTypeProblem(c: { labels: readonly string[]; series: readonly unknown[] }, to: ChartType): string | null {
  if ((to === 'pie' || to === 'doughnut') && c.series.length > 1) return `a ${to} chart shows one series, and this chart has ${c.series.length}`
  if (to === 'scatter' && !scatterXs(c.labels)) return 'a scatter chart needs a number for every label (they are its x values)'
  return null
}

/** the straight line that fits points (x, y) best (least squares): a function giving the line's y at any x, or null with fewer than two different x */
export function linearFitXY(xs: readonly number[], ys: readonly number[]): ((x: number) => number) | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return null
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n, my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) { num += (xs[i]! - mx) * (ys[i]! - my); den += (xs[i]! - mx) ** 2 }
  if (den === 0) return null
  const slope = num / den
  return (x) => my + slope * (x - mx)
}

/** the colour of series or slice `i`: the one the person chose, else the deck's own */
/** the deck's own chart colours, in order (series or slices take them in turn): ONE list for the screen, the PowerPoint export and the assistant */
export const deckChartColors = (c: { primary: string; accent: string; secondary: string; textSecondary: string }): string[] => [c.primary, c.accent, c.secondary, c.textSecondary]
export const chartColor = (chosen: readonly string[] | undefined, i: number, deck: readonly string[]): string => chosen?.[i] ?? deck[i % deck.length]!

/** where the legend goes (never for one series of a bar or line chart unless asked; always for pie and doughnut unless switched off) */
export function legendPlace(o: { legend?: LegendPlace | undefined; circular: boolean; series: number }): LegendPlace {
  if (o.legend) return o.legend
  return o.circular ? 'right' : o.series > 1 ? 'bottom' : 'none'
}

/** the straight line that fits the figures best (least squares over their positions 0, 1, 2…): the values of that line at each position, or null when there are fewer than two figures */
export function linearTrend(values: readonly number[]): number[] | null {
  const n = values.length
  if (n < 2) return null
  const mx = (n - 1) / 2
  const my = values.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  values.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2 })
  const slope = den === 0 ? 0 : num / den
  return values.map((_, i) => my + slope * (i - mx))
}

/**
 * Stacked bars: a bar chart only, and only with two series or more (one series stacked is the same chart). ONE rule for the editor, the assistant and the drawing.
 * A trend line is not drawn on a stacked chart: a series' own line over bars stacked on others would show figures the bars do not.
 */
export const canStack = (c: { chartType: string; series: { length: number } }) => c.chartType === 'bar' && c.series.length >= 2
/** the stacked layout of the bars: for each category, each series' segment from `y0` to `y1` (figures, or shares 0-100 for `percent`) and the axis maximum */
export function stackLayout(series: { values: number[] }[], categories: number, mode: 'stacked' | 'percent'): { seg: { y0: number; y1: number; v: number }[][]; max: number } {
  const totals = Array.from({ length: categories }, (_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0))
  const seg = series.map(() => [] as { y0: number; y1: number; v: number }[])
  for (let i = 0; i < categories; i++) {
    let acc = 0
    series.forEach((s, si) => {
      const v = Math.max(0, s.values[i] ?? 0)
      const h = mode === 'percent' ? (totals[i] ? (v / totals[i]!) * 100 : 0) : v
      seg[si]!.push({ y0: acc, y1: acc + h, v }); acc += h
    })
  }
  return { seg, max: mode === 'percent' ? 100 : Math.max(1, ...totals) * 1.1 }
}

/** whether the figures show on a chart's marks: the person's choice, else on for pies and doughnuts and for charts of 8 items or fewer (the screen, the file, the dialog and the assistant) */
export const chartShowsFigures = (c: { dataLabels?: boolean | undefined; chartType: string; labels: { length: number } }) => c.dataLabels ?? (c.chartType !== 'area' && (c.chartType === 'pie' || c.chartType === 'doughnut' || c.labels.length <= 8)) // (an area chart shows no figures unless asked: on stacked colour fields they only clutter, as PowerPoint's own default)

/*
 * A chart reads on the slide it sits on. ONE rule for the screen, the PowerPoint file, the chart dialog and the assistant:
 *  - the slide's own colours are used (its themeOverrides), not only the deck's;
 *  - a deck colour that cannot be told from the slide's backdrop (nearly the same colour: a primary series on a primary slide) is swapped for the next deck colour that can. Brightness
 *    contrast alone is not the test: a yellow bar on white, or orange next to blue, is plainly visible;
 *  - the chart's words (axis, legend, figures above the bars) take the slide's secondary text colour when it reads on the backdrop (4.5:1, as for text), else its main text colour, else
 *    white or near-black.
 * A person's own chosen colours are kept as they are.
 */
export type ChartColors = { primary: string; accent: string; secondary: string; textSecondary: string; textPrimary: string; background: string }
const HEX6 = /^#[0-9a-f]{6}$/i
const rgbOf = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
const relLum = (h: string) => { const [r, g, b] = rgbOf(h).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number]; return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a: string, b: string) => { const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x) as [number, number]; return (hi + 0.05) / (lo + 0.05) }
/** how far apart two colours are (0 = the same; 441 = black and white) */
const distance = (a: string, b: string) => { const x = rgbOf(a), y = rgbOf(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) }
/** closer than this to the backdrop, a series cannot be told from it */
export const CHART_SAME_AS_BACKDROP = 60

/** the colours a slide's objects sit on: its colour, both ends of its gradient, or (a picture, or nothing chosen) the slide's background colour */
export function slideBackdrop(slide: { background?: { type: string; value: string; gradient?: { from: string; to: string } | undefined } | undefined }, colors: { background: string }): string[] {
  const b = slide.background
  if (b?.type === 'color' && HEX6.test(b.value)) return [b.value]
  if (b?.type === 'gradient' && b.gradient && HEX6.test(b.gradient.from) && HEX6.test(b.gradient.to)) return [b.gradient.from, b.gradient.to]
  return [colors.background]
}

/** the deck's chart colours for this backdrop: the ones that cannot be told from it are left out and the rest move up, then the slide's text colour fills in (the same deck colours, in the same order, wherever they show) */
export function chartPalette(colors: ChartColors, backdrop: readonly string[]): string[] {
  const shows = (c: string) => !HEX6.test(c) || backdrop.every((b) => !HEX6.test(b) || distance(c, b) >= CHART_SAME_AS_BACKDROP)
  const base = deckChartColors(colors)
  if (base.every(shows)) return base
  const fallback = backdrop.every((b) => !HEX6.test(b) || relLum(b) < 0.4) ? '#FFFFFF' : '#111111'
  const usable = [...base, colors.textPrimary, fallback].filter((c, i, a) => shows(c) && a.indexOf(c) === i)
  return base.map((_, i) => usable[i] ?? usable[i % usable.length] ?? fallback)
}

/** the colour of a chart's words on this backdrop */
export function chartInk(colors: ChartColors, backdrop: readonly string[]): string {
  const reads = (c: string) => HEX6.test(c) && backdrop.every((b) => !HEX6.test(b) || ratio(c, b) >= 4.5)
  if (reads(colors.textSecondary)) return colors.textSecondary
  if (reads(colors.textPrimary)) return colors.textPrimary
  return backdrop.filter((b) => HEX6.test(b)).every((b) => ratio('#FFFFFF', b) >= ratio('#111111', b)) ? '#FFFFFF' : '#111111'
}

/** a chart's colours on one slide (the deck's colours with the slide's own on top, its backdrop): what every caller uses */
export function chartLookOn(deckColors: ChartColors, slide: Parameters<typeof slideBackdrop>[0] & { themeOverrides?: { [K in keyof ChartColors]?: string | undefined } | undefined }): { colors: ChartColors; backdrop: string[]; palette: string[]; ink: string } {
  const own = Object.fromEntries(Object.entries(slide.themeOverrides ?? {}).filter(([, v]) => typeof v === 'string'))
  const colors = { ...deckColors, ...own } as ChartColors
  const backdrop = slideBackdrop(slide, colors)
  return { colors, backdrop, palette: chartPalette(colors, backdrop), ink: chartInk(colors, backdrop) }
}
