import { describe, expect, it } from 'vitest'
import type { SlideContent } from '@prompttoppt/validation'
import { figuresNotInSources, figuresOf } from './policy.ts'

const chart = (values: number[], labels = ['A', 'B', 'C', 'D']) => ({ layout: 'chart', title: 'Market share', chartType: 'pie', labels, series: [{ name: 'Share', values }], unit: '%', takeaway: 'We lead.', speakerNotes: '', sources: [] }) as unknown as SlideContent
const table = (rows: string[][]) => ({ layout: 'table', title: 'Comparison', header: ['Feature', 'Us', 'Them'], rows, speakerNotes: '', sources: [] }) as unknown as SlideContent
const body = (...bullets: string[]) => ({ layout: 'title-body', title: 'Update', bullets, speakerNotes: '', sources: [] }) as SlideContent

describe('figuresNotInSources: never invent data', () => {
  it('a chart with figures that are nowhere in the message, the deck or the sources is caught, figure by figure', () => {
    expect(figuresNotInSources(chart([15, 35, 25, 25]), 'add a pie chart showing our market share\nQ3 deck about logistics')).toEqual(['15', '35', '25'])
  })
  it('the same chart is fine when the person gave the figures, or they are in the deck or a source', () => {
    expect(figuresNotInSources(chart([15, 35, 25, 25]), 'market share is 15, 35, 25 and 25')).toEqual([])
    expect(figuresNotInSources(chart([40, 60], ['A', 'B']), '{"title":"Share","bullets":["We hold 40% and they hold 60%"]}')).toEqual([])
    expect(figuresNotInSources(chart([40, 60], ['A', 'B']), 'source text: 40 percent vs 60 percent')).toEqual([])
  })
  it('a table of words needs no figures; a table with numbers needs them traced', () => {
    expect(figuresNotInSources(table([['Cost', 'High', 'Low'], ['Speed', 'Fast', 'Slow']]), 'compare three products')).toEqual([])
    expect(figuresNotInSources(table([['Price', '$49', '$79']]), 'compare three products')).toEqual(['49', '79'])
    expect(figuresNotInSources(table([['Price', '$49', '$79']]), 'our plans cost $49 and $79 a month')).toEqual([])
  })
  it('ordinary wording is never refused: small numbers, 24/7, a year, steps; only invented statistics are', () => {
    expect(figuresNotInSources(body('3 simple steps', 'Support 24/7', 'Launch in 2026', 'Top 5 priorities'), 'make it short')).toEqual([])
    expect(figuresNotInSources(body('Revenue grew 40% last year'), 'make it short')).toEqual(['40'])
    expect(figuresNotInSources(body('Over 1200 customers'), 'make it short')).toEqual(['1200'])
    expect(figuresNotInSources(body('Rated 4.8 by users'), 'make it short')).toEqual(['4.8'])
  })
  it('numbers match across formatting: thousands separators, trailing zeros, percent signs, and digits of another script', () => {
    expect(figuresNotInSources(body('Over 1,200 customers'), 'we have 1200 customers')).toEqual([])
    expect(figuresNotInSources(body('Rated 3.50'), 'rating 3.5')).toEqual([])
    expect(figuresNotInSources(body('Growth of 15%'), 'growth was 15 percent')).toEqual([])
    expect(figuresNotInSources(body('विकास १५%'), 'growth 15%')).toEqual([]) // a Hindi translation keeps the number
  })
  it('titles, speaker notes and picture fields are not data', () => {
    const c = { ...chart([5, 6], ['A', 'B']), title: 'Top 100 firms of 2024', speakerNotes: 'about 300 words' } as SlideContent
    expect(figuresNotInSources(c, 'x')).toEqual(['5', '6'])
  })
})

describe('figuresOf: only figures worth reporting', () => {
  it('two or more digits, decimals and percentages count; a lone digit (a step number, "3 steps") does not; digits of other scripts are the same number', () => {
    expect(figuresOf('Step 1, step 2 and 3 steps')).toEqual([])
    expect(figuresOf('42 customers, revenue 1,150 and 3.5 growth, 7% churn')).toEqual(['42', '1150', '3.5', '7'])
    expect(figuresOf('१५% वृद्धि')).toEqual(['15'])
  })
})
