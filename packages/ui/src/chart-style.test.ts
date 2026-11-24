import { describe, expect, it } from 'vitest'
import { canStack, chartColor, chartInk, chartLookOn, chartPalette, slideBackdrop, chartShowsFigures, legendPlace, linearTrend, stackLayout } from '@prompttoppt/validation'

describe('chart style helpers', () => {
  it('uses the chosen colour, else the deck colour (wrapping round)', () => {
    expect(chartColor(['#111111'], 0, ['#aaaaaa', '#bbbbbb'])).toBe('#111111')
    expect(chartColor(['#111111'], 1, ['#aaaaaa', '#bbbbbb'])).toBe('#bbbbbb')
    expect(chartColor(undefined, 2, ['#aaaaaa', '#bbbbbb'])).toBe('#aaaaaa')
  })
  it('the legend is automatic (several series, or a pie) unless chosen', () => {
    expect(legendPlace({ circular: false, series: 1 })).toBe('none')
    expect(legendPlace({ circular: false, series: 2 })).toBe('bottom')
    expect(legendPlace({ circular: true, series: 1 })).toBe('right')
    expect(legendPlace({ circular: true, series: 1, legend: 'none' })).toBe('none')
    expect(legendPlace({ circular: false, series: 1, legend: 'right' })).toBe('right')
  })
  it('the trend line is the least-squares line through the figures', () => {
    expect(linearTrend([1, 2, 3, 4])!.map((v) => Math.round(v * 100) / 100)).toEqual([1, 2, 3, 4])
    expect(linearTrend([5, 5, 5])).toEqual([5, 5, 5])
    expect(linearTrend([10, 0])!.map(Math.round)).toEqual([10, 0])
    expect(linearTrend([7])).toBeNull()
    const t = linearTrend([1, 3, 2, 5, 4])!
    expect(t[4]! - t[0]!).toBeGreaterThan(0) // rising
  })
})

import { cropImgCss, isCropped } from '@prompttoppt/validation'
describe('crop helpers', () => {
  it('the picture is sized and moved so the cut-out exactly fills the frame', () => {
    expect(cropImgCss({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 })).toMatchObject({ width: '200%', height: '400%', left: '-50%', top: '-200%', objectFit: 'fill' })
    expect(cropImgCss({ x: 0, y: 0, w: 1, h: 1 })).toMatchObject({ width: '100%', height: '100%', left: '0%', top: '0%' })
  })
  it('the whole picture is not a crop', () => {
    expect(isCropped(undefined)).toBe(false)
    expect(isCropped({ x: 0, y: 0, w: 1, h: 1 })).toBe(false)
    expect(isCropped({ x: 0, y: 0, w: 0.9, h: 1 })).toBe(true)
  })
})

import { cellNumber, formatCell, highlightText } from '@prompttoppt/validation'
describe('table number formats and highlights', () => {
  it('thousands separators, a percent sign and currency signs change how a number looks, never its value', () => {
    expect(formatCell('1234567', 'thousands')).toBe('1,234,567')
    expect(formatCell('$1150.50', 'thousands')).toBe('$1,150.50')
    expect(formatCell('12', 'percent')).toBe('12%')
    expect(formatCell('12%', 'percent')).toBe('12%')
    expect(formatCell('1150', 'inr')).toBe('₹1,150')
    expect(formatCell('$30', 'eur')).toBe('€30')
    expect(formatCell('3.14159', 'thousands', 2)).toBe('3.14')
    for (const t of ['1234567', '$1,150.50', '12%', '3.5']) expect(cellNumber(formatCell(t, 'thousands')!)).toBe(cellNumber(t))
  })
  it('a cell that is not a number is left alone', () => {
    expect(formatCell('Basic', 'thousands')).toBeNull()
    expect(formatCell('', 'usd')).toBeNull()
    expect(formatCell('n/a', 'percent')).toBeNull()
  })
  it('the number in a cell is read the way people read it', () => {
    expect(cellNumber('$1,150')).toBe(1150); expect(cellNumber('12%')).toBe(12); expect(cellNumber('-3.5')).toBe(-3.5); expect(cellNumber('Basic')).toBeNull()
  })
  it('text on a highlighted cell reads: dark on light, white on dark', () => {
    expect(highlightText('#ffff00')).toBe('#111111'); expect(highlightText('#102040')).toBe('#FFFFFF')
  })
  it('stacks bars only for a bar chart with two series or more', () => {
    expect(canStack({ chartType: 'bar', series: [1, 2] })).toBe(true)
    expect(canStack({ chartType: 'bar', series: [1] })).toBe(false)
    expect(canStack({ chartType: 'line', series: [1, 2] })).toBe(false)
  })
  it('stacked segments sit on each other; the axis fits the biggest total, or 0-100 for shares', () => {
    const s = [{ values: [10, 30] }, { values: [30, 10] }]
    const st = stackLayout(s, 2, 'stacked')
    expect(st.seg[1]![0]).toEqual({ y0: 10, y1: 40, v: 30 }); expect(st.max).toBeCloseTo(44)
    const pc = stackLayout(s, 2, 'percent')
    expect(pc.seg[0]![0]).toEqual({ y0: 0, y1: 25, v: 10 }); expect(pc.seg[1]![0]!.y1).toBe(100); expect(pc.max).toBe(100)
    expect(stackLayout([{ values: [0] }, { values: [0] }], 1, 'percent').seg[1]![0]!.y1).toBe(0) // (an empty category stays empty, no division by zero)
  })
  it('figures show by the person\'s choice, else on pies and on charts of 8 items or fewer', () => {
    expect(chartShowsFigures({ chartType: 'bar', labels: Array(8) })).toBe(true)
    expect(chartShowsFigures({ chartType: 'bar', labels: Array(9) })).toBe(false)
    expect(chartShowsFigures({ chartType: 'pie', labels: Array(12) })).toBe(true)
    expect(chartShowsFigures({ chartType: 'bar', labels: Array(3), dataLabels: false })).toBe(false)
  })
  const deckC = { primary: '#0B3DD0', accent: '#FF5A1F', secondary: '#FFDF00', textSecondary: '#5B6475', textPrimary: '#111827', background: '#FFFFFF' }
  it('a chart reads on its slide: designed colours stay, a colour the same as the backdrop moves out, the words read', () => {
    expect(chartPalette(deckC, ['#FFFFFF'])).toEqual(['#0B3DD0', '#FF5A1F', '#FFDF00', '#5B6475']) // (yellow on white is plainly visible: kept)
    const onBlue = chartPalette(deckC, ['#0B3DD0'])
    expect(onBlue[0]).toBe('#FF5A1F'); expect(onBlue).not.toContain('#0B3DD0'); expect(new Set(onBlue).size).toBe(4)
    expect(chartInk(deckC, ['#FFFFFF'])).toBe('#5B6475')
    expect(chartInk(deckC, ['#0B3DD0'])).toBe('#FFFFFF') // (neither text colour reads on the blue)
    expect(chartInk({ ...deckC, textSecondary: '#DDE3F0' }, ['#0B3DD0'])).toBe('#DDE3F0') // (the slide's own light text colour is used when it reads)
  })
  it('the backdrop is the slide colour, both gradient ends, or the slide background; the slide\'s own colours count', () => {
    expect(slideBackdrop({ background: { type: 'color', value: '#0B3DD0' } }, deckC)).toEqual(['#0B3DD0'])
    expect(slideBackdrop({ background: { type: 'gradient', value: 'x', gradient: { from: '#000000', to: '#333333' } } }, deckC)).toEqual(['#000000', '#333333'])
    expect(slideBackdrop({ background: { type: 'image', value: 'https://x' } }, deckC)).toEqual(['#FFFFFF'])
    const look = chartLookOn(deckC, { themeOverrides: { background: '#0B3DD0', textSecondary: undefined } })
    expect(look.backdrop).toEqual(['#0B3DD0']); expect(look.palette[0]).toBe('#FF5A1F')
  })
})
