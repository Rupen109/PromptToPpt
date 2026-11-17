import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { elementSchema, type Presentation } from '@prompttoppt/validation'
import { buildPptx } from './pptx.ts'
import { makeDeck, signUp } from '../test-utils.ts'

describe('PowerPoint export of a chart that still holds sample data', () => {
  it('writes a native chart (the placeholder flag is only an editor cue)', async () => {
    const u = await signUp('phc'); const { doc } = await makeDeck(u.id, 1)
    const chart = elementSchema.parse({ type: 'chart', id: 'c', x: 100, y: 100, width: 900, height: 500, chartType: 'bar', labels: ['Item 1', 'Item 2', 'Item 3'], series: [{ name: 'Series 1', values: [20, 30, 40] }], placeholder: true })
    const deck: Presentation = { ...doc, slides: [{ ...doc.slides[0]!, elements: [chart] }] }
    const files = unzipSync(new Uint8Array(await buildPptx(deck, async () => null)))
    expect(Object.keys(files).some((f) => /^ppt\/charts\/chart\d*\.xml$/.test(f))).toBe(true)
  })
})
