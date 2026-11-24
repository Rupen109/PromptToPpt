import { bestSpot, mix } from '@prompttoppt/theme'
import { CANVAS, alignCells, canStack, chartTypeProblem, type ChartType, insertColumn, insertRow, mergeCells, removeColumn, removeRow, shapeDef, unmergeCells, type CellArea, type GridParts, type Slide } from '@prompttoppt/validation'
import { addElement, backToDeckBackground, makeElement, newId, plain, setSlideBackground, type D, type IdGen } from './commands'

/** Commands of the top toolbar (Text, Shapes, Table, Chart, Background). Pure mutators like the ones in commands.ts: the store makes undo / redo from them. */

const findSlide = (d: D, slideId: string) => d.slides.find((s) => s.id === slideId)
const base = (id: string) => ({ id, rotation: 0, locked: false, zIndex: 0, opacity: 1 })
/** where a new object goes: the free spot nearest the middle (never on top of what is there), else the place that covers the least */
const place = (d: D, s: Slide, w: number, h: number) => bestSpot(d, s, w, h)

export function addTextBox(d: D, slideId: string, gen: IdGen = newId): string | null {
  const s = findSlide(d, slideId)
  if (!s || s.locked) return null
  const id = gen()
  const { width: W } = CANVAS[d.aspectRatio]
  const w = Math.round(W * 0.45)
  // empty, with the editor-only prompt: a box nobody typed in never shows words in Present, the shared view or an export
  addElement(d, slideId, makeElement({ ...base(id), type: 'text', ...place(d, s, w, 140), role: 'body', paragraphs: [{ runs: [{ text: '' }] }], hint: 'Click to add text', fontSize: 48, align: 'left', color: 'textPrimary', valign: 'top' }))
  return id
}

/** A shape from the Shapes menu, in the free spot nearest the middle of the slide, black until a colour is chosen (Fill in the bar above it). Basic shapes keep their own drawing; library shapes (arrows, stars, bubbles …) come from the shared outline list. */
export function addShape(d: D, slideId: string, shape: string, gen: IdGen = newId): string | null {
  const s = findSlide(d, slideId)
  if (!s || s.locked) return null
  const id = gen()
  const { width: W } = CANVAS[d.aspectRatio]
  const unit = Math.round(W * 0.2)
  const def = shapeDef(shape)
  const square = shape === 'ellipse' || shape === 'ring' || shape === 'triangle' || !!def?.square
  const line = shape === 'line'
  const w = line ? Math.round(W * 0.3) : square ? unit : Math.round(unit * 1.6)
  const h = line ? 8 : square ? unit : unit
  addElement(d, slideId, makeElement({ ...base(id), type: 'shape', shape, ...place(d, s, w, h), fill: '#000000', radius: shape === 'rect' ? d.theme.radius : 0, ...(line ? { strokeWidth: 8 } : {}) }))
  return id
}

/** An empty picture frame (16:9, 40% of the slide wide) in the free spot nearest the middle; its picture is set afterwards (Image URL, AI image, Media library). */
export function addImageFrame(d: D, slideId: string, gen: IdGen = newId): string | null {
  const s = findSlide(d, slideId)
  if (!s || s.locked) return null
  const id = gen()
  const { width: W } = CANVAS[d.aspectRatio]
  const w = Math.round(W * 0.4), h = Math.round(w * 9 / 16)
  addElement(d, slideId, makeElement({ ...base(id), type: 'image', ...place(d, s, w, h), alt: 'Image', fit: 'cover' }))
  return id
}

/** A new table is a plain table: a thin grid around every cell, a coloured header row (the deck's primary colour), no stripes, text in the deck's text colour (colours can be added from the bar above the table). */
const PLAIN_TABLE = (d: D) => ({ headerFill: d.theme.colors.primary, rowFill: 'none', altRowFill: 'none', headerColor: d.theme.colors.onPrimary, textColor: d.theme.colors.textPrimary, borderColor: d.theme.colors.textPrimary })

export function addTable(d: D, slideId: string, rows: number, cols: number, gen: IdGen = newId): string | null {
  const s = findSlide(d, slideId)
  if (!s || s.locked) return null
  const r = Math.max(1, Math.min(rows, 21)), c = Math.max(1, Math.min(cols, 8))
  const { width: W } = CANVAS[d.aspectRatio]
  const w = Math.round(W * 0.7)
  const id = gen()
  addElement(d, slideId, makeElement({ ...base(id), type: 'table', ...place(d, s, w, Math.round(r * 86)), header: Array.from({ length: c }, (_, i) => `Column ${i + 1}`), rows: Array.from({ length: r - 1 }, () => Array.from({ length: c }, () => '')), ...PLAIN_TABLE(d) }))
  return id
}

type TableEl = Extract<Slide['elements'][number], { type: 'table' }>
function tableOf(d: D, slideId: string, elId: string): { s: NonNullable<ReturnType<typeof findSlide>>; t: TableEl } | null {
  const s = findSlide(d, slideId)
  const t = s?.elements.find((e) => e.id === elId)
  if (!s || !t || t.type !== 'table' || s.locked || t.locked) return null
  return { s, t: t as TableEl }
}

/** Row -1 is the header row. */
export function setTableCell(d: D, slideId: string, elId: string, row: number, col: number, text: string) {
  const f = tableOf(d, slideId, elId)
  if (!f) return
  const value = text.slice(0, 200)
  if (row < 0) { if (col >= 0 && col < f.t.header.length) f.t.header[col] = value }
  else if (f.t.rows[row] && col >= 0 && col < f.t.header.length) f.t.rows[row]![col] = value
  f.s.manual = true
}
/** a grid change from the shared rule (packages/validation table-merge.ts): merges and highlights follow their cells */
function setGrid(t: TableEl, g: GridParts) {
  t.header = g.header; t.rows = g.rows
  if (g.merges) t.merges = g.merges; else delete t.merges
  if (g.highlights) t.highlights = g.highlights; else delete t.highlights
  if (g.aligns) t.aligns = g.aligns; else delete t.aligns
}
/** Aligns the words of a block of cells (row -1 = the header): across (left / center / right) and up and down (top / middle / bottom); one undo step. */
export function alignTableCells(d: D, slideId: string, elId: string, area: CellArea, set: { h?: 'left' | 'center' | 'right'; v?: 'top' | 'middle' | 'bottom' }): boolean {
  const f = tableOf(d, slideId, elId)
  if (!f || (!set.h && !set.v)) return false
  setGrid(f.t, alignCells(plain(f.t), area, set))
  f.s.manual = true
  return true
}
export function addTableRow(d: D, slideId: string, elId: string, at?: number) {
  const f = tableOf(d, slideId, elId)
  if (!f || f.t.rows.length >= 20) return
  setGrid(f.t, insertRow(plain(f.t), at ?? f.t.rows.length))
  f.t.height = Math.round(f.t.height + 86)
  f.s.manual = true
}
export function removeTableRow(d: D, slideId: string, elId: string, at: number) {
  const f = tableOf(d, slideId, elId)
  if (!f || f.t.rows.length <= 1 || !f.t.rows[at]) return
  setGrid(f.t, removeRow(plain(f.t), at))
  f.t.height = Math.max(120, Math.round(f.t.height - 86))
  f.s.manual = true
}
export function addTableColumn(d: D, slideId: string, elId: string, at?: number) {
  const f = tableOf(d, slideId, elId)
  if (!f || f.t.header.length >= 8) return
  setGrid(f.t, insertColumn(plain(f.t), at ?? f.t.header.length, `Column ${f.t.header.length + 1}`))
  f.s.manual = true
}
export function removeTableColumn(d: D, slideId: string, elId: string, at: number) {
  const f = tableOf(d, slideId, elId)
  if (!f || f.t.header.length <= 1 || at < 0 || at >= f.t.header.length) return
  setGrid(f.t, removeColumn(plain(f.t), at))
  f.s.manual = true
}
/** Merges a block of cells (row -1 = the header): the words of every cell go to the top-left one. Returns why not when it cannot be merged (nothing changes then). */
export function mergeTableCells(d: D, slideId: string, elId: string, area: CellArea): string | null {
  const f = tableOf(d, slideId, elId)
  if (!f) return 'the table is locked'
  const r = mergeCells(plain(f.t), area)
  if (!r.ok) return r.why
  setGrid(f.t, r.parts)
  f.s.manual = true
  return null
}
/** Unmerges the merged areas that touch `area` (none given = all of them). */
export function unmergeTableCells(d: D, slideId: string, elId: string, area?: CellArea): string | null {
  const f = tableOf(d, slideId, elId)
  if (!f) return 'the table is locked'
  const r = unmergeCells(plain(f.t), area)
  if (!r.ok) return r.why
  setGrid(f.t, r.parts)
  f.s.manual = true
  return null
}

export type ChartKind = ChartType
export function addChart(d: D, slideId: string, chartType: ChartKind, gen: IdGen = newId): string | null {
  const s = findSlide(d, slideId)
  if (!s || s.locked) return null
  const { width: W, height: H } = CANVAS[d.aspectRatio]
  const id = gen()
  const pie = chartType === 'pie' || chartType === 'doughnut'
  // a scatter starts with numbers as its labels (its x values: chart-style.ts scatterXs); the others with four quarters
  const start = chartType === 'scatter' ? { labels: ['1', '2', '3', '4', '5'], values: [3, 5, 4, 7, 8] } : { labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: pie ? [40, 25, 20, 15] : [12, 19, 15, 24] }
  addElement(d, slideId, makeElement({ ...base(id), type: 'chart', ...place(d, s, Math.round(W * 0.6), Math.round(H * 0.6)), chartType, labels: start.labels, series: [{ name: 'Series 1', values: start.values }] }))
  return id
}

// ─── chart data ──────────────────────────────────────────────────────────────

type ChartEl = Extract<Slide['elements'][number], { type: 'chart' }>
export const CHART_MAX_LABELS = 24
export const CHART_MAX_SERIES = 6
function chartOf(d: D, slideId: string, elId: string): ChartEl | null {
  const s = findSlide(d, slideId)
  const c = s?.elements.find((e) => e.id === elId)
  if (!s || !c || c.type !== 'chart' || s.locked || c.locked) return null
  s.manual = true
  return c as ChartEl
}
export function setChartLabel(d: D, slideId: string, elId: string, i: number, text: string) {
  const c = chartOf(d, slideId, elId)
  if (c && i >= 0 && i < c.labels.length) c.labels[i] = text.slice(0, 80)
}
export function setChartSeriesName(d: D, slideId: string, elId: string, si: number, text: string) {
  const c = chartOf(d, slideId, elId)
  if (c?.series[si]) c.series[si]!.name = text.slice(0, 80)
}
/** `value` must be a finite number (the dialog turns text into a number and ignores what is not one) */
export function setChartValue(d: D, slideId: string, elId: string, si: number, i: number, value: number) {
  const c = chartOf(d, slideId, elId)
  if (c?.series[si] && i >= 0 && i < c.labels.length && Number.isFinite(value)) c.series[si]!.values[i] = value
}
export function setChartUnit(d: D, slideId: string, elId: string, unit: string) {
  const c = chartOf(d, slideId, elId)
  if (!c) return
  const u = unit.trim().slice(0, 16)
  if (u) c.unit = u; else delete c.unit
}
export function addChartRow(d: D, slideId: string, elId: string) {
  const c = chartOf(d, slideId, elId)
  if (!c || c.labels.length >= CHART_MAX_LABELS) return
  c.labels.push(`Item ${c.labels.length + 1}`)
  for (const s of c.series) s.values.push(0)
}
export function removeChartRow(d: D, slideId: string, elId: string, at: number) {
  const c = chartOf(d, slideId, elId)
  if (!c || c.labels.length <= 1 || at < 0 || at >= c.labels.length) return
  c.labels.splice(at, 1)
  for (const s of c.series) s.values.splice(at, 1)
  if (c.colors && (c.chartType === 'pie' || c.chartType === 'doughnut')) c.colors.splice(at, 1) // (a slice's colour goes with the slice)
}
export function addChartSeries(d: D, slideId: string, elId: string) {
  const c = chartOf(d, slideId, elId)
  if (!c || c.series.length >= CHART_MAX_SERIES || c.chartType === 'pie' || c.chartType === 'doughnut') return
  c.series.push({ name: `Series ${c.series.length + 1}`, values: c.labels.map(() => 0) })
}
export function removeChartSeries(d: D, slideId: string, elId: string, si: number) {
  const c = chartOf(d, slideId, elId)
  if (!c || c.series.length <= 1 || !c.series[si]) return
  c.series.splice(si, 1)
  if (c.colors) c.colors.splice(si, 1) // (a series' colour goes with the series)
}
/** The colour of series (bar, line) or slice (pie, doughnut) number `i`. The first choice makes every colour explicit from `deck` (what the chart shows now), so the others do not move. */
export function setChartColor(d: D, slideId: string, elId: string, i: number, color: string, deck: string[]) {
  const c = chartOf(d, slideId, elId)
  if (!c || !/^#[0-9a-fA-F]{6}$/.test(color)) return
  const circular = c.chartType === 'pie' || c.chartType === 'doughnut'
  const n = circular ? c.labels.length : c.series.length
  if (i < 0 || i >= n) return
  const now = Array.from({ length: n }, (_, k) => c.colors?.[k] ?? deck[k % deck.length]!)
  now[i] = color.toLowerCase()
  c.colors = now
}
/** Back to the deck's own colours. */
export function resetChartColors(d: D, slideId: string, elId: string) {
  const c = chartOf(d, slideId, elId)
  if (c) delete c.colors
}
/** `place` null = automatic (the legend shows for several series and for a pie or doughnut). */
export function setChartLegend(d: D, slideId: string, elId: string, place: 'none' | 'bottom' | 'right' | null) {
  const c = chartOf(d, slideId, elId)
  if (!c) return
  if (place) c.legend = place; else delete c.legend
}
export function setChartTrendline(d: D, slideId: string, elId: string, on: boolean) {
  const c = chartOf(d, slideId, elId)
  if (!c || c.chartType === 'pie' || c.chartType === 'doughnut') return
  if (on && c.stack && canStack(c)) return // (no trend line over stacked bars: chart-style.ts)
  if (on) c.trendline = true; else delete c.trendline
}
/** Bars stacked, or as shares of 100% (`mode` null = side by side). Only a bar chart with two series or more stacks; a trend line comes off (it would show figures the bars do not). */
/** Shows the chart as another type (the same figures); returns why not when it cannot be (chart-style.ts chartTypeProblem: a pie shows one series, a scatter needs numbers as labels). */
export function setChartType(d: D, slideId: string, elId: string, to: ChartType): string | null {
  const c = chartOf(d, slideId, elId)
  if (!c) return 'the chart is locked'
  const why = chartTypeProblem(c, to)
  if (why) return why
  if (c.chartType === to) return null
  c.chartType = to
  if (to !== 'bar') delete c.stack // (stacking is for bars)
  if (to === 'pie' || to === 'doughnut') delete c.trendline
  return null
}
export function setChartStack(d: D, slideId: string, elId: string, mode: 'stacked' | 'percent' | null) {
  const c = chartOf(d, slideId, elId)
  if (!c) return
  if (!mode) { delete c.stack; return }
  if (!canStack(c)) return
  c.stack = mode
  delete c.trendline
}
/** `on` null = automatic. */
export function setChartDataLabels(d: D, slideId: string, elId: string, on: boolean | null) {
  const c = chartOf(d, slideId, elId)
  if (!c) return
  if (on === null) delete c.dataLabels; else c.dataLabels = on
}
/** The person has entered their own figures: the "sample data" cue goes away (and stays away). */
export function confirmChartData(d: D, slideId: string, elId: string) {
  const c = chartOf(d, slideId, elId)
  if (c) delete c.placeholder
}

// ─── backgrounds ─────────────────────────────────────────────────────────────

/** The chosen colour at a given strength: blended toward the deck's own background colour (a slide background is always solid, so "opacity" is a lighter tint of the colour). */
export function tint(d: D, color: string, opacityPct: number): string {
  const t = Math.max(0, Math.min(100, opacityPct)) / 100
  return t >= 1 ? color : mix(d.theme.colors.background, color, t)
}

export function setBackgroundColor(d: D, slideId: string, color: string, opacityPct = 100) {
  setSlideBackground(d, slideId, tint(d, color, opacityPct))
}

export { setBackgroundBlur, setBackgroundGradient, setBackgroundPattern, setBackgroundPicture } from './commands'

/** Back to the slide's own background: the deck's, or its own brand's when it has one (commands.ts backToDeckBackground). */
export function removeBackground(d: D, slideId: string) {
  backToDeckBackground(d, slideId)
}
