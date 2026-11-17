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
