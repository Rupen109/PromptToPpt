import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { elementSchema, type Presentation } from '@prompttoppt/validation'
import { buildPptx } from './pptx.ts'
import { makeDeck, signUp } from '../test-utils.ts'

const chartXml = async (o: object, slideBg?: string) => {
  const u = await signUp('cs'); const { doc } = await makeDeck(u.id, 1)
  const chart = elementSchema.parse({ type: 'chart', id: 'c', x: 100, y: 100, width: 900, height: 500, chartType: 'bar', labels: ['A', 'B', 'C'], series: [{ name: 'Sales', values: [10, 20, 30] }], ...o })
  const deck: Presentation = { ...doc, slides: [{ ...doc.slides[0]!, elements: [chart], ...(slideBg ? { background: { type: 'color', value: slideBg } } : {}) }] }
  const files = unzipSync(new Uint8Array(await buildPptx(deck, async () => null)))
  const name = Object.keys(files).find((f) => /^ppt\/charts\/chart\d*\.xml$/.test(f))!
  return strFromU8(files[name]!)
}

describe('PowerPoint export of a chart\'s style choices', () => {
  it('chosen colours are the colours in the file, not the deck\'s', async () => {
    const x = await chartXml({ colors: ['#FF0000'] })
    expect(x.toUpperCase()).toContain('FF0000')
  })
  it('the legend: none by default for one series, a right legend when chosen, switched off for a pie when chosen', async () => {
    expect(await chartXml({})).not.toContain('<c:legend>')
    expect(await chartXml({ legend: 'right' })).toMatch(/<c:legendPos val="r"/)
    expect(await chartXml({ chartType: 'pie', labels: ['A', 'B'], series: [{ name: 'S', values: [1, 2] }], legend: 'none' })).not.toContain('<c:legend>')
  })
  it('a trend line is a dashed line series fitted to the figures, on a bar chart and on a line chart', async () => {
    for (const chartType of ['bar', 'line']) {
      const x = await chartXml({ chartType, trendline: true })
      expect(x).toContain('Sales trend')
      expect(x).toMatch(/<c:lineChart>/)
      expect(x).toMatch(/prstDash val="dash"/)
    }
    expect(await chartXml({})).not.toContain('Sales trend')
  })
  it('stacked bars use PowerPoint\'s own grouping (100% stacked with a percent axis); one series or a trend line does not stack', async () => {
    const two = { series: [{ name: 'Sales', values: [10, 20, 30] }, { name: 'Costs', values: [5, 5, 5] }] }
    const st = await chartXml({ ...two, stack: 'stacked', trendline: true })
    expect(st).toContain('<c:grouping val="stacked"/>'); expect(st).toContain('<c:overlap val="100"/>'); expect(st).toContain('<c:dLblPos val="ctr"/>')
    expect(st).not.toContain('Sales trend') // (no trend line over stacked bars)
    const pc = await chartXml({ ...two, stack: 'percent' })
    expect(pc).toContain('<c:grouping val="percentStacked"/>'); expect(pc).toMatch(/formatCode="0%"/)
    expect(await chartXml({ stack: 'stacked' })).toContain('<c:grouping val="clustered"/>')
  })
  it('the figures in stacked bars read on each series: white on a dark series, near-black on a light one (per series, as on the screen)', async () => {
    const x = await chartXml({ series: [{ name: 'Dark', values: [1, 2, 3] }, { name: 'Light', values: [3, 2, 1] }], colors: ['#102040', '#FFE000'], stack: 'stacked' })
    const sers = x.match(/<c:ser>[\s\S]*?<\/c:ser>/g) ?? []
    const ink = (s: string) => /<c:dLbls>[\s\S]*?<a:defRPr[^>]*>\s*<a:solidFill>\s*<a:srgbClr val="([0-9A-F]{6})"/i.exec(s)?.[1]
    expect(sers.map(ink)).toEqual(['FFFFFF', '111111'])
  })
})

describe('PowerPoint export of a chart on its slide', () => {
  it('on a slide the colour of a series, that series takes another deck colour, and the axis words read (the same rule as the screen)', async () => {
    const u = await signUp('cb'); const { doc } = await makeDeck(u.id, 1)
    const primary = doc.theme.colors.primary.replace('#', '').toUpperCase()
    const x = (await chartXml({}, doc.theme.colors.primary)).toUpperCase()
    const ser = /<C:SER>[\s\S]*?<\/C:SER>/.exec(x)?.[0] ?? ''
    expect(ser).not.toContain(`<A:SRGBCLR VAL="${primary}"/>`)
    expect(x).toContain('<A:SRGBCLR VAL="FFFFFF"/>')
  })
})

describe('PowerPoint export of table highlights', () => {
  it('a highlighted cell has its own fill in the file and the other cells do not', async () => {
    const u = await signUp('th'); const { doc } = await makeDeck(u.id, 1)
    const table = elementSchema.parse({ type: 'table', id: 't', x: 100, y: 100, width: 900, height: 300, header: ['Plan', 'Price'], rows: [['Basic', '10'], ['Pro', '30']], highlights: [{ row: 1, column: 1, fill: '#FF00AA' }] })
    const deck: Presentation = { ...doc, slides: [{ ...doc.slides[0]!, elements: [table] }] }
    const files = unzipSync(new Uint8Array(await buildPptx(deck, async () => null)))
    const xml = strFromU8(files['ppt/slides/slide1.xml']!)
    expect(xml.toUpperCase()).toContain('FF00AA')
    expect((xml.toUpperCase().match(/FF00AA/g) ?? []).length).toBe(1)
  })
})
