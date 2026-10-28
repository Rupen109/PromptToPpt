import { describe, expect, it } from 'vitest'
import { describeDeck } from './describe.ts'

const slide = (content: unknown, layoutId = 'title-body', extra = {}) => ({ id: 's', layoutId, content, elements: [], ...extra }) as never
const text = (y: number, x: number, role: string, ...paras: string[]) => ({ type: 'text', role, x, y, paragraphs: paras.map((t) => ({ runs: [{ text: t }], ...(t.startsWith('•') ? { list: 'bullet' } : {}) })) })
describe('describeDeck', () => {
  it('keeps every figure of charts, metrics and tables, in order, one part per slide', () => {
    const r = describeDeck({ slides: [
      slide({ layout: 'title-body', title: 'Q3 review', bullets: ['Revenue up 15%', 'Pipeline down'], speakerNotes: 'Say hello', sources: [{ sourceId: 'x', locator: 'p.1' }] }),
      slide({ layout: 'chart', title: 'Revenue', chartType: 'bar', labels: ['Q1', 'Q2', 'Q3'], series: [{ name: 'Revenue', values: [100, 120.5, 138] }], unit: 'k', takeaway: 'Up 15%' }, 'chart'),
      slide({ layout: 'metrics', title: 'Wins', metrics: [{ value: '40%', label: 'Enterprise growth', detail: 'year on year' }] }, 'metrics'),
    ] } as never)
    expect(r.parts.map((p) => p.locator)).toEqual(['slide 1', 'slide 2', 'slide 3'])
    expect(r.parts[0]!.text).toContain('Revenue up 15%'); expect(r.parts[0]!.text).toContain('notes: Say hello')
    expect(r.parts[0]!.text).not.toContain('sourceId')
    expect(r.parts[1]!.text).toMatch(/values: 100 \| 120\.5 \| 138/); expect(r.parts[1]!.text).toContain('labels: Q1 | Q2 | Q3')
    expect(r.parts[2]!.text).toContain('value: 40%'); expect(r.parts[2]!.text).toContain('label: Enterprise growth')
    expect(r.skipped).toBe(0)
  })
  it('hand-edited slides are read as they look NOW (not from their stale original), in reading order', () => {
    const edited = slide({ layout: 'title-body', title: 'Old title', bullets: ['Old bullet'], speakerNotes: '' }, 'title-body', {
      manual: true,
      elements: [text(400, 100, 'body', 'Second bullet we typed', 'Another typed line'), text(100, 100, 'title', 'Our NEW title'), { type: 'shape', x: 0, y: 0, decorative: true }, { type: 'chart', x: 900, y: 400, chartType: 'bar', unit: 'k', labels: ['A', 'B'], series: [{ name: 'Sales', values: [5, 9.5] }] }, { type: 'table', x: 100, y: 700, header: ['Name', 'Qty'], rows: [['Apples', '3']] }],
    })
    const r = describeDeck({ slides: [edited] } as never)
    const t = r.parts[0]!.text
    expect(t).toContain('title: Our NEW title'); expect(t).toContain('Second bullet we typed'); expect(t).toContain('Sales: 5 | 9.5'); expect(t).toContain('Apples | 3')
    expect(t).not.toContain('Old title'); expect(t).not.toContain('Old bullet')
    expect(t.indexOf('Our NEW title')).toBeLessThan(t.indexOf('Second bullet we typed')) // top before bottom
    expect(r.skipped).toBe(0)
  })
  it('the notes box wins over the notes stored with the original content', () => {
    const r = describeDeck({ slides: [slide({ layout: 'title', title: 'T', speakerNotes: 'old notes' }, 'title', { speakerNotes: 'notes I wrote in the editor' })] } as never)
    expect(r.parts[0]!.text).toContain('notes I wrote in the editor'); expect(r.parts[0]!.text).not.toContain('old notes')
  })
  it('a slide with nothing readable (only pictures or shapes) is skipped and counted; a content-less slide with text is still read', () => {
    const r = describeDeck({ slides: [slide({ layout: 'title', title: 'A', speakerNotes: '' }), slide(null, 'blank', { manual: true, elements: [{ type: 'image', x: 0, y: 0 }] }), slide(undefined, 'blank', { manual: true, elements: [text(10, 10, 'body', 'Typed on a blank slide')] })] } as never)
    expect(r.parts.map((p) => p.locator)).toEqual(['slide 1', 'slide 3']); expect(r.skipped).toBe(1)
    expect(r.parts[1]!.text).toContain('Typed on a blank slide')
  })
  it('a long deck shortens speaker notes first (then drops them) so it still fits, and never cuts a slide in half', () => {
    const slides = Array.from({ length: 40 }, (_, i) => slide({ layout: 'title-body', title: `Slide ${i}`, bullets: ['x'.repeat(300), 'y'.repeat(300)], speakerNotes: 'n'.repeat(900) }))
    const r = describeDeck({ slides } as never, 36_000)
    expect(r.chars).toBeLessThanOrEqual(36_000)
    expect(r.parts).toHaveLength(40)
    expect(r.parts.every((p) => p.text.includes('yyy'))).toBe(true)
    expect(/notes: n{1,120}$/.test(r.parts[0]!.text)).toBe(true) // notes were shortened to make room
    const huge = describeDeck({ slides: Array.from({ length: 40 }, () => slide({ layout: 'title-body', title: 't', bullets: ['x'.repeat(450), 'y'.repeat(450)], speakerNotes: 'n'.repeat(900) })) } as never, 36_000)
    expect(huge.parts[0]!.text).not.toContain('notes:') // still too big: notes dropped entirely
  })
})
