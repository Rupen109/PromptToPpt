import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { elementSchema, type Presentation } from '@prompttoppt/validation'
import { buildPptx } from './pptx.ts'
import { makeDeck, signUp } from '../test-utils.ts'

/** area and scatter charts in the .pptx are PowerPoint's own (areaChart, scatterChart with the labels as x values); a scatter's trend line is PowerPoint's own linear trendline */
const chartsOf = async (els: object[]) => {
  const u = await signUp('as'); const { doc } = await makeDeck(u.id, 1)
  const elements = els.map((o, i) => elementSchema.parse({ type: 'chart', id: `c${i}`, x: 100, y: 100 + i * 300, width: 900, height: 280, labels: ['1', '2', '4'], series: [{ name: 'Sales', values: [10, 20, 30] }], ...o }))
  const deck: Presentation = { ...doc, slides: [{ ...doc.slides[0]!, elements }] }
  const files = unzipSync(new Uint8Array(await buildPptx(deck, async () => null)))
  return Object.keys(files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f)).sort((a, b) => Number(/(\d+)/.exec(a)![1]) - Number(/(\d+)/.exec(b)![1])).map((f) => strFromU8(files[f]!))
}

describe('PowerPoint export of area and scatter charts', () => {
  it('an area chart is PowerPoint\'s area chart', async () => {
    const [x] = await chartsOf([{ chartType: 'area' }])
    expect(x).toContain('<c:areaChart>')
  })
  it('a scatter is an XY chart with the labels as numeric x values; its trend line is PowerPoint\'s own, on the right chart even after another chart', async () => {
    const [bar, sc] = await chartsOf([{ chartType: 'bar', trendline: true }, { chartType: 'scatter', trendline: true, labels: ['1.5', '3', '7'] }])
    expect(bar).toContain('<c:barChart>'); expect(bar).not.toContain('<c:trendline>')
    expect(sc).toContain('<c:scatterChart>')
    expect(sc).toMatch(/<c:xVal>[\s\S]*<c:v>1\.5<\/c:v>[\s\S]*<c:v>7<\/c:v>/)
    expect(sc).toMatch(/<c:trendline>[\s\S]*<c:trendlineType val="linear"\/>[\s\S]*<\/c:trendline><c:xVal>/)
  })
  it('a scatter without a trend line has none; a scatter whose labels are not numbers is drawn as a line chart (as on screen)', async () => {
    const [plain, text] = await chartsOf([{ chartType: 'scatter' }, { chartType: 'scatter', labels: ['A', 'B', 'C'] }])
    expect(plain).toContain('<c:scatterChart>'); expect(plain).not.toContain('<c:trendline>')
    expect(text).toContain('<c:lineChart>')
  })
})
