import { describe, expect, it } from 'vitest'
import { estimateTextHeight } from './text-metrics'

describe('the estimate uses the box\'s own gap between paragraphs (as the slide draws it)', () => {
  it('a bigger gap = a taller estimate; no gap = shorter', () => {
    const paras = [{ runs: [{ text: 'One' }] }, { runs: [{ text: 'Two' }] }, { runs: [{ text: 'Three' }] }]
    const normal = estimateTextHeight(paras, 40, 800, {})
    expect(estimateTextHeight(paras, 40, 800, { paraGap: 1.5 })).toBeCloseTo(normal + 2 * 40, 5)
    expect(estimateTextHeight(paras, 40, 800, { paraGap: 0 })).toBeCloseTo(normal - 2 * 20, 5)
  })
})
