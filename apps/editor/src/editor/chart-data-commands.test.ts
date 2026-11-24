import { beforeEach, describe, expect, it } from 'vitest'
import { getTheme } from '@prompttoppt/theme'
import { presentationSchema, type Presentation } from '@prompttoppt/validation'
import * as C from './commands'
import * as T from './toolbar-commands'
import { useDoc } from './store'

const theme = getTheme('cobalt')
const chart = (extra: Record<string, unknown> = {}) => ({ type: 'chart', id: 'c1', x: 0, y: 0, width: 800, height: 400, rotation: 0, locked: false, zIndex: 1, opacity: 1, chartType: 'bar', labels: ['Item 1', 'Item 2'], series: [{ name: 'Series 1', values: [20, 30] }], placeholder: true, ...extra })
const mk = (el = chart()): Presentation => ({ schemaVersion: 1, id: 'p1', title: 'T', aspectRatio: '16:9', language: 'en', theme, sources: [], slides: [{ ...C.blankSlide(theme, 's0'), elements: [el as never] }] })
const doc = () => useDoc.getState().doc!
const apply = (r: (d: C.D) => void) => useDoc.getState().apply('t', r)
const c = () => doc().slides[0]!.elements[0] as ReturnType<typeof chart> & { labels: string[]; series: { name: string; values: number[] }[]; unit?: string; placeholder?: boolean }

beforeEach(() => { useDoc.getState().load(mk(), 1) })

describe('chart data commands', () => {
  it('edits labels, names and values; the document stays valid', () => {
    apply((d) => { T.setChartLabel(d, 's0', 'c1', 0, 'North'); T.setChartSeriesName(d, 's0', 'c1', 0, 'Sales'); T.setChartValue(d, 's0', 'c1', 0, 1, 77); T.setChartUnit(d, 's0', 'c1', ' %') })
    expect(c().labels[0]).toBe('North'); expect(c().series[0]!.name).toBe('Sales'); expect(c().series[0]!.values).toEqual([20, 77]); expect(c().unit).toBe('%')
    apply((d) => { T.setChartValue(d, 's0', 'c1', 0, 0, Number.NaN); T.setChartUnit(d, 's0', 'c1', '') })
    expect(c().series[0]!.values[0]).toBe(20); expect(c().unit).toBeUndefined()
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
  })

  it('adds and removes categories and series within the schema limits; pie keeps one series', () => {
    apply((d) => { T.addChartRow(d, 's0', 'c1'); T.addChartSeries(d, 's0', 'c1') })
    expect(c().labels).toHaveLength(3); expect(c().series).toHaveLength(2); expect(c().series[1]!.values).toHaveLength(3)
    for (let i = 0; i < 40; i++) apply((d) => { T.addChartRow(d, 's0', 'c1'); T.addChartSeries(d, 's0', 'c1') })
    expect(c().labels).toHaveLength(T.CHART_MAX_LABELS); expect(c().series).toHaveLength(T.CHART_MAX_SERIES)
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
    for (let i = 0; i < 40; i++) apply((d) => { T.removeChartRow(d, 's0', 'c1', 0); T.removeChartSeries(d, 's0', 'c1', 0) })
    expect(c().labels).toHaveLength(1); expect(c().series).toHaveLength(1); expect(c().series[0]!.values).toHaveLength(1)
    useDoc.getState().load(mk(chart({ chartType: 'pie' })), 1)
    apply((d) => T.addChartSeries(d, 's0', 'c1'))
    expect(c().series).toHaveLength(1)
  })

  it('only "confirm" clears the sample-data flag; locked charts refuse edits', () => {
    apply((d) => T.setChartLabel(d, 's0', 'c1', 0, 'Mine'))
    expect(c().placeholder).toBe(true)
    apply((d) => T.confirmChartData(d, 's0', 'c1'))
    expect(c().placeholder).toBeUndefined()
    useDoc.getState().load(mk(chart({ locked: true })), 1)
    apply((d) => { T.setChartLabel(d, 's0', 'c1', 0, 'x'); T.confirmChartData(d, 's0', 'c1') })
    expect(c().labels[0]).toBe('Item 1'); expect(c().placeholder).toBe(true)
  })
})

describe('chart style commands (colours, legend, trend line, figures)', () => {
  const style = () => c() as unknown as { colors?: string[]; legend?: string; trendline?: boolean; dataLabels?: boolean; stack?: string }
  const deck = ['#111111', '#222222', '#333333', '#444444']
  it('the first colour choice makes every colour explicit (the others do not move); later choices change only theirs; reset goes back to the deck', () => {
    apply((d) => { T.addChartSeries(d, 's0', 'c1') })
    apply((d) => T.setChartColor(d, 's0', 'c1', 1, '#FF0000', deck))
    expect(style().colors).toEqual(['#111111', '#ff0000'])
    apply((d) => T.setChartColor(d, 's0', 'c1', 0, '#00ff00', deck))
    expect(style().colors).toEqual(['#00ff00', '#ff0000'])
    apply((d) => T.setChartColor(d, 's0', 'c1', 5, '#00ff00', deck)); apply((d) => T.setChartColor(d, 's0', 'c1', 0, 'red', deck))
    expect(style().colors).toEqual(['#00ff00', '#ff0000']) // an unknown series and a non-hex colour change nothing
    apply((d) => T.resetChartColors(d, 's0', 'c1'))
    expect(style().colors).toBeUndefined()
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
  })
  it('deleting a series (or a pie slice) takes its colour with it', () => {
    apply((d) => { T.addChartSeries(d, 's0', 'c1') }); apply((d) => T.setChartColor(d, 's0', 'c1', 0, '#aa0000', deck)); apply((d) => T.setChartColor(d, 's0', 'c1', 1, '#00aa00', deck))
    apply((d) => T.removeChartSeries(d, 's0', 'c1', 0))
    expect(style().colors).toEqual(['#00aa00'])
  })
  it('the legend, trend line and figures are set and cleared; a pie has no trend line', () => {
    apply((d) => { T.setChartLegend(d, 's0', 'c1', 'right'); T.setChartTrendline(d, 's0', 'c1', true); T.setChartDataLabels(d, 's0', 'c1', true) })
    expect(style()).toMatchObject({ legend: 'right', trendline: true, dataLabels: true })
    apply((d) => { T.setChartLegend(d, 's0', 'c1', null); T.setChartTrendline(d, 's0', 'c1', false); T.setChartDataLabels(d, 's0', 'c1', null) })
    expect(style().legend).toBeUndefined(); expect(style().trendline).toBeUndefined(); expect(style().dataLabels).toBeUndefined()
    useDoc.getState().load(mk(chart({ chartType: 'pie' })), 1)
    apply((d) => T.setChartTrendline(d, 's0', 'c1', true))
    expect(style().trendline).toBeUndefined()
  })
  it('bars stack (or as shares of 100%) only with two series or more; stacking takes the trend line off and refuses a new one', () => {
    apply((d) => T.setChartStack(d, 's0', 'c1', 'stacked'))
    expect(style().stack).toBeUndefined() // one series: nothing to stack
    apply((d) => { T.addChartSeries(d, 's0', 'c1'); T.setChartTrendline(d, 's0', 'c1', true) })
    apply((d) => T.setChartStack(d, 's0', 'c1', 'percent'))
    expect(style()).toMatchObject({ stack: 'percent' }); expect(style().trendline).toBeUndefined()
    apply((d) => T.setChartTrendline(d, 's0', 'c1', true))
    expect(style().trendline).toBeUndefined()
    apply((d) => T.setChartStack(d, 's0', 'c1', null))
    expect(style().stack).toBeUndefined()
    useDoc.getState().load(mk(chart({ chartType: 'line', series: [{ name: 'A', values: [1, 2] }, { name: 'B', values: [3, 4] }] })), 1)
    apply((d) => T.setChartStack(d, 's0', 'c1', 'stacked'))
    expect(style().stack).toBeUndefined()
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
  })
  it('a locked chart refuses every style change', () => {
    useDoc.getState().load(mk(chart({ locked: true })), 1)
    apply((d) => { T.setChartLegend(d, 's0', 'c1', 'none'); T.setChartColor(d, 's0', 'c1', 0, '#ff0000', deck) })
    expect(style().legend).toBeUndefined(); expect(style().colors).toBeUndefined()
  })
})

describe('cropping a picture', () => {
  const pic = (extra: Record<string, unknown> = {}) => ({ type: 'image', id: 'p1', x: 400, y: 200, width: 600, height: 300, rotation: 0, locked: false, zIndex: 1, opacity: 1, src: 'https://example.test/a.jpg', alt: 'a', fit: 'cover', clip: 'none', ...extra })
  const p = () => doc().slides[0]!.elements[0] as unknown as { x: number; y: number; width: number; height: number; crop?: object; zoom?: number }
  it('stores the crop and gives the frame the cut-out\'s shape (a 2:1 picture cut to its left half is a square), in one undo step', () => {
    useDoc.getState().load(mk(pic({ zoom: 2 }) as never), 1)
    apply((d) => { C.setPictureCrop(d, 's0', 'p1', { x: 0, y: 0, w: 0.5, h: 1 }, 2) })
    expect(p().crop).toEqual({ x: 0, y: 0, w: 0.5, h: 1 }); expect(p().width).toBe(600); expect(p().height).toBe(600); expect(p().zoom).toBeUndefined()
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
    useDoc.getState().undo()
    expect(p().crop).toBeUndefined(); expect(p().height).toBe(300); expect(p().zoom).toBe(2)
  })
  it('no crop (or the whole picture) takes the crop off and gives the whole picture\'s shape back', () => {
    useDoc.getState().load(mk(pic() as never), 1)
    apply((d) => { C.setPictureCrop(d, 's0', 'p1', { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 2) })
    apply((d) => { C.setPictureCrop(d, 's0', 'p1', null, 2) })
    expect(p().crop).toBeUndefined(); expect(p().width).toBe(600); expect(p().height).toBe(300)
  })
  it('a locked picture, a missing picture and a picture that is not cropped refuse without recording anything', () => {
    useDoc.getState().load(mk(pic({ locked: true }) as never), 1)
    apply((d) => { expect(C.setPictureCrop(d, 's0', 'p1', { x: 0, y: 0, w: 0.5, h: 1 }, 2)).toBe(false) })
    expect(p().crop).toBeUndefined()
    useDoc.getState().load(mk(pic() as never), 1)
    apply((d) => { expect(C.setPictureCrop(d, 's0', 'nope', { x: 0, y: 0, w: 0.5, h: 1 }, 2)).toBe(false); expect(C.setPictureCrop(d, 's0', 'p1', null, 2)).toBe(false) })
  })
})
