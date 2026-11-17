import { mix } from '@prompttoppt/theme'
import { CANVAS, shapeDef, type Slide } from '@prompttoppt/validation'
import { addElement, clearImageBackground, makeElement, newId, setSlideBackground, type D, type IdGen } from './commands'

/** Commands of the top toolbar (Text, Shapes, Table, Chart, Background). Pure mutators like the ones in commands.ts: the store makes undo / redo from them. */

const findSlide = (d: D, slideId: string) => d.slides.find((s) => s.id === slideId)
const base = (id: string) => ({ id, rotation: 0, locked: false, zIndex: 0, opacity: 1 })
const centred = (d: D, w: number, h: number) => { const { width: W, height: H } = CANVAS[d.aspectRatio]; return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), width: w, height: h } }

export function addTextBox(d: D, slideId: string, gen: IdGen = newId): string | null {
  const s = findSlide(d, slideId)
  if (!s || s.locked) return null
  const id = gen()
  const { width: W } = CANVAS[d.aspectRatio]
  const w = Math.round(W * 0.45)
  addElement(d, slideId, makeElement({ ...base(id), type: 'text', ...centred(d, w, 140), role: 'body', paragraphs: [{ runs: [{ text: 'Type here' }] }], fontSize: 48, align: 'left', color: 'textPrimary', valign: 'top' }))
  return id
}

/** A shape from the Shapes menu, in the middle of the slide, black until a colour is chosen (Fill in the bar above it). Basic shapes keep their own drawing; library shapes (arrows, stars, bubbles …) come from the shared outline list. */
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
  addElement(d, slideId, makeElement({ ...base(id), type: 'shape', shape, ...centred(d, w, h), fill: '#000000', radius: shape === 'rect' ? d.theme.radius : 0, ...(line ? { strokeWidth: 8 } : {}) }))
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
  addElement(d, slideId, makeElement({ ...base(id), type: 'table', ...centred(d, w, Math.round(r * 86)), header: Array.from({ length: c }, (_, i) => `Column ${i + 1}`), rows: Array.from({ length: r - 1 }, () => Array.from({ length: c }, () => '')), ...PLAIN_TABLE(d) }))
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
export function addTableRow(d: D, slideId: string, elId: string, at?: number) {
  const f = tableOf(d, slideId, elId)
  if (!f || f.t.rows.length >= 20) return
  f.t.rows.splice(at ?? f.t.rows.length, 0, f.t.header.map(() => ''))
  f.t.height = Math.round(f.t.height + 86)
  f.s.manual = true
}
export function removeTableRow(d: D, slideId: string, elId: string, at: number) {
  const f = tableOf(d, slideId, elId)
  if (!f || f.t.rows.length <= 1 || !f.t.rows[at]) return
  f.t.rows.splice(at, 1)
  f.t.height = Math.max(120, Math.round(f.t.height - 86))
  f.s.manual = true
}
export function addTableColumn(d: D, slideId: string, elId: string, at?: number) {
  const f = tableOf(d, slideId, elId)
  if (!f || f.t.header.length >= 8) return
  const i = at ?? f.t.header.length
  f.t.header.splice(i, 0, `Column ${f.t.header.length + 1}`)
  for (const r of f.t.rows) r.splice(i, 0, '')
  f.s.manual = true
}
export function removeTableColumn(d: D, slideId: string, elId: string, at: number) {
  const f = tableOf(d, slideId, elId)
  if (!f || f.t.header.length <= 1 || at < 0 || at >= f.t.header.length) return
  f.t.header.splice(at, 1)
  for (const r of f.t.rows) r.splice(at, 1)
  f.s.manual = true
}

export type ChartKind = 'bar' | 'line' | 'pie' | 'doughnut'
export function addChart(d: D, slideId: string, chartType: ChartKind, gen: IdGen = newId): string | null {
  const s = findSlide(d, slideId)
  if (!s || s.locked) return null
  const { width: W, height: H } = CANVAS[d.aspectRatio]
  const id = gen()
  const pie = chartType === 'pie' || chartType === 'doughnut'
  addElement(d, slideId, makeElement({ ...base(id), type: 'chart', ...centred(d, Math.round(W * 0.6), Math.round(H * 0.6)), chartType, labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Series 1', values: pie ? [40, 25, 20, 15] : [12, 19, 15, 24] }] }))
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

export { setBackgroundGradient, setBackgroundPicture } from './commands'

/** Back to the deck's own background. */
export function removeBackground(d: D, slideId: string) {
  const s = findSlide(d, slideId)
  if (!s) return
  if (s.background?.type === 'image' && !s.manual && s.content) { clearImageBackground(d, slideId); return }
  setSlideBackground(d, slideId, d.theme.colors.background)
  delete s.themeOverrides
  delete s.ownLook // back to the deck's own background: nothing of the slide's own look is kept
}
