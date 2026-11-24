import { describe, expect, it } from 'vitest'
import { CANVAS, type SlideContent, type SlideElement } from '@prompttoppt/validation'
import { SAMPLES, THEMES, composeSlide } from '../index'

/** On the vertical 9:16 canvas what a landscape slide puts side by side is stacked, and lists run in one column so they fill the height. */
const sample = (layout: string) => SAMPLES.find((s: { layout: string }) => s.layout === layout) as SlideContent
const compose = (layout: string, aspect: '16:9' | '9:16') => { let n = 0; return composeSlide(sample(layout), THEMES[0]!, aspect, () => `e${n++}`) }
const of = (els: SlideElement[], type: SlideElement['type']) => els.filter((e) => e.type === type && !e.decorative)
const W = CANVAS['9:16'].width

describe('portrait (9:16) arrangements', () => {
  it('chart: the chart is as wide as the slide and its takeaway sits under it', () => {
    const tall = compose('chart', '9:16').elements
    const ch = of(tall, 'chart')[0]!
    expect(ch.width).toBeGreaterThan(W * 0.8)
    const take = of(tall, 'text').find((t) => (t as { role: string }).role === 'body')!
    expect(take.y).toBeGreaterThanOrEqual(ch.y + ch.height)
    const wide = compose('chart', '16:9').elements // landscape is unchanged: the takeaway is beside the chart
    const wch = of(wide, 'chart')[0]!, wtake = of(wide, 'text').find((t) => (t as { role: string }).role === 'body')!
    expect(wtake.x).toBeGreaterThanOrEqual(wch.x + wch.width)
  })

  it('picture with text: the picture is across the top, the words below it', () => {
    const els = compose('split-image-text', '9:16').elements
    const pic = of(els, 'image')[0]!, body = of(els, 'text').find((t) => (t as { role: string }).role === 'body')!
    expect(pic.width).toBeGreaterThan(W * 0.8)
    expect(body.y).toBeGreaterThanOrEqual(pic.y + pic.height)
  })

  it('comparison and case study: the blocks are one above the other, each as wide as the slide', () => {
    for (const layout of ['comparison', 'case-study']) {
      const els = compose(layout, '9:16').elements
      const blocks = els.filter((e) => e.type === 'shape' && !e.decorative && e.width > W * 0.8 && e.height > 150).sort((a, b) => a.y - b.y)
      expect(blocks.length, layout).toBeGreaterThanOrEqual(2)
      for (let i = 1; i < blocks.length; i++) expect(blocks[i]!.y, layout).toBeGreaterThanOrEqual(blocks[i - 1]!.y + blocks[i - 1]!.height - 1)
    }
  })

  it('metrics, process and timeline: one column of cards, filling the height', () => {
    for (const layout of ['metrics', 'process', 'timeline']) {
      const els = compose(layout, '9:16').elements
      const cards = els.filter((e) => e.type === 'shape' && !e.decorative && e.width > W * 0.8 && e.height > 120)
      expect(cards.length, layout).toBeGreaterThanOrEqual(3)
      expect(new Set(cards.map((c) => c.x)).size, `${layout} is one column`).toBe(1)
    }
  })

  it('architecture: each layer is a band across the slide with its items inside it, nothing off the page', () => {
    const els = compose('architecture', '9:16').elements
    const H = CANVAS['9:16'].height
    for (const e of els) { expect(e.x).toBeGreaterThanOrEqual(0); expect(e.x + e.width).toBeLessThanOrEqual(W + 1); expect(e.y + e.height).toBeLessThanOrEqual(H + 1) }
    const bands = els.filter((e) => e.type === 'shape' && !e.decorative && e.width > W * 0.8 && e.height > 200).sort((a, b) => a.y - b.y)
    expect(bands.length).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < bands.length; i++) expect(bands[i]!.y).toBeGreaterThanOrEqual(bands[i - 1]!.y + bands[i - 1]!.height - 1)
  })

  it('table: the text is larger than on a landscape slide and the table stays on the page', () => {
    const t = of(compose('table', '9:16').elements, 'table')[0] as Extract<SlideElement, { type: 'table' }>
    expect(t.fontSize ?? 30).toBeGreaterThan(30)
    expect(t.y + t.height).toBeLessThanOrEqual(CANVAS['9:16'].height)
    expect((of(compose('table', '16:9').elements, 'table')[0] as Extract<SlideElement, { type: 'table' }>).fontSize).toBeUndefined()
  })

  it('a long figure stays on one line (its size follows the width)', () => {
    const big = { ...(sample('big-number') as Extract<SlideContent, { layout: 'big-number' }>), value: '$12,400,000' }
    const t = composeSlide(big, THEMES[0]!, '9:16', () => 'x').elements.find((e) => e.type === 'text' && (e as { role: string }).role === 'metric') as Extract<SlideElement, { type: 'text' }>
    expect(t.fontSize * big.value.length * 0.62).toBeLessThanOrEqual(W)
  })
})
