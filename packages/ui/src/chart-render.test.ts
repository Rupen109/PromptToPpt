import { describe, expect, it } from 'vitest'
import { Chart } from './charts'

const theme = { colors: { primary: '#111111', accent: '#222222', secondary: '#333333', textSecondary: '#555555', background: '#ffffff', onPrimary: '#ffffff', textPrimary: '#000000' }, fonts: { heading: 'H', body: 'B' } } as never
type N = { type?: unknown; props: Record<string, unknown> & { children?: unknown } }
const walk = (n: unknown, out: N[] = []): N[] => { if (n && typeof n === 'object' && 'props' in (n as object)) { out.push(n as N); walk((n as N).props.children, out) } else if (Array.isArray(n)) n.forEach((x) => walk(x, out)); return out }
const base = { labels: ['A', 'B', 'C'], series: [{ name: 'Sales', values: [10, 20, 30] }], width: 800, height: 500, theme }
const tree = (o: object) => walk(Chart({ chartType: 'bar', ...base, ...o } as never))
const texts = (o: object) => tree(o).filter((n) => n.type === 'text').map((n) => String(n.props.children))
const fills = (o: object) => tree(o).filter((n) => n.type === 'rect' || n.type === 'path').map((n) => n.props['fill'])

describe('a chart draws the person\'s style choices', () => {
  it('nothing chosen = the deck\'s own colours, no legend for one series, no trend line; figures as in the PowerPoint file (8 items or fewer)', () => {
    expect(fills({})).toContain('#111111')
    expect(texts({})).not.toContain('Sales')
    expect(tree({}).some((n) => 'data-trend' in n.props)).toBe(false)
    expect(texts({})).toContain('10')
    const nine = { labels: 'ABCDEFGHI'.split(''), series: [{ name: 'Sales', values: [11, 2, 3, 4, 5, 6, 7, 8, 9] }] }
    expect(texts(nine)).not.toContain('11')
    expect(texts({ dataLabels: false })).not.toContain('10')
  })
  it('stacked bars: one bar per item, segments on top of each other, a 0-100% axis for shares, no trend line', () => {
    const two = { legend: 'none', series: [{ name: 'Sales', values: [10, 20, 30] }, { name: 'Costs', values: [30, 20, 10] }] }
    const bars = (o: object) => tree(o).filter((n) => n.type === 'rect' && n.props['fill'] !== 'none' && Number(n.props['height']) > 0)
    const xs = (o: object) => new Set(bars(o).map((n) => n.props['x']))
    expect(xs({ ...two, stack: 'stacked' }).size).toBe(3) // the two series share each bar
    expect(xs(two).size).toBe(6)
    expect(texts({ ...two, stack: 'percent' })).toContain('100%')
    expect(tree({ ...two, stack: 'stacked', trendline: true }).some((n) => 'data-trend' in n.props)).toBe(false)
    expect(xs({ stack: 'stacked' }).size).toBe(3) // (one series: drawn as plain bars)
  })
  it('chosen colours replace the deck colours, one per series (bar) or per slice (pie)', () => {
    expect(fills({ colors: ['#ff0000'] })).toContain('#ff0000')
    expect(fills({ colors: ['#ff0000'] })).not.toContain('#111111')
    expect(fills({ chartType: 'pie', colors: ['#aa0000', '#00aa00', '#0000aa'] })).toEqual(expect.arrayContaining(['#aa0000', '#00aa00', '#0000aa']))
  })
  it('the legend goes where it is told, and can be switched off even for a pie', () => {
    expect(texts({ legend: 'right' })).toContain('Sales')
    expect(texts({ legend: 'bottom' })).toContain('Sales')
    expect(texts({ chartType: 'pie' }).some((t) => t.startsWith('A ('))).toBe(true)
    expect(texts({ chartType: 'pie', legend: 'none' }).some((t) => t.startsWith('A ('))).toBe(false)
  })
  it('a trend line is one dashed line per series, through the figures, only when asked', () => {
    const lines = tree({ trendline: true }).filter((n) => 'data-trend' in n.props)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.props['strokeDasharray']).toBeTruthy()
    expect(tree({ chartType: 'line', series: [...base.series, { name: 'Cost', values: [5, 4, 3] }], trendline: true }).filter((n) => 'data-trend' in n.props)).toHaveLength(2)
  })
  it('data labels put the figure (and its unit) on each bar', () => {
    expect(texts({ dataLabels: true, unit: '%' })).toEqual(expect.arrayContaining(['10%', '20%', '30%']))
  })
  it('on a backdrop the same colour as a series, that series takes another deck colour and the words turn readable', () => {
    const on = fills({ backdrop: ['#111111'] })
    expect(on).not.toContain('#111111')
    expect(on).toContain('#555555') // (#222222 and #333333 are nearly as dark as the backdrop too: skipped)
    const words = tree({ backdrop: ['#111111'] }).filter((n) => n.type === 'text').map((n) => n.props['fill'])
    expect(words.every((f) => f === '#FFFFFF')).toBe(true)
  })
})

describe('area and scatter charts on screen', () => {
  it('an area chart fills under each line; a scatter places points at their real x values, with a numeric x axis and a fitted trend line', () => {
    expect(tree({ chartType: 'area' }).some((n) => n.type === 'polygon' && 'data-area' in n.props)).toBe(true)
    const sc = tree({ chartType: 'scatter', labels: ['1', '2', '10'], trendline: true })
    const cx = sc.filter((n) => n.type === 'circle').map((n) => Number(n.props['cx']))
    expect(cx).toHaveLength(3)
    expect((cx[2]! - cx[1]!) / (cx[1]! - cx[0]!)).toBeCloseTo(8, 0) // 1 → 2 → 10: the gaps follow the numbers, not the order
    expect(sc.some((n) => n.type === 'line' && 'data-trend' in n.props)).toBe(true)
    // labels that are not numbers: drawn as a line chart (the file does the same)
    expect(tree({ chartType: 'scatter' }).some((n) => n.type === 'circle')).toBe(false)
  })
})
