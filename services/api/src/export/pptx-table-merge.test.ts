import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { elementSchema, type Presentation } from '@prompttoppt/validation'
import { buildPptx } from './pptx.ts'
import { makeDeck, signUp } from '../test-utils.ts'

/** merged table cells in the .pptx are PowerPoint's own merges (gridSpan/rowSpan on the top-left cell, hMerge/vMerge on the cells it covers), from the same rule as the screen */
const slideXml = async (o: object) => {
  const u = await signUp('tm'); const { doc } = await makeDeck(u.id, 1)
  const table = elementSchema.parse({ type: 'table', id: 't', x: 100, y: 100, width: 1400, height: 500, header: ['Plan', 'Q1', 'Q2', 'Q3'], rows: [['Basic', '10', '12', '14'], ['Pro', '20', '22', '24'], ['Team', '30', '32', '34']], ...o })
  const deck: Presentation = { ...doc, slides: [{ ...doc.slides[0]!, elements: [table] }] }
  const files = unzipSync(new Uint8Array(await buildPptx(deck, async () => null)))
  return strFromU8(files['ppt/slides/slide1.xml']!)
}
const rowsOf = (x: string) => [...x.matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)].map((m) => [...m[0].matchAll(/<a:tc\b([^>]*)>/g)].map((c) => c[1]!.trim()))

describe('PowerPoint export of merged table cells', () => {
  it('a header area across columns and a block over rows: spans on the top-left cell, merge marks on the covered ones, every row still has every column', async () => {
    const x = await slideXml({ merges: [{ row: -1, column: 1, rows: 1, columns: 3 }, { row: 0, column: 0, rows: 2, columns: 1 }] })
    const rows = rowsOf(x)
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.length === 4)).toBe(true) // PowerPoint needs every grid cell present
    expect(rows[0]![1]).toMatch(/gridSpan="3"/)
    expect(rows[0]![2]).toMatch(/hMerge="1"/); expect(rows[0]![3]).toMatch(/hMerge="1"/)
    expect(rows[1]![0]).toMatch(/rowSpan="2"/)
    expect(rows[2]![0]).toMatch(/vMerge="1"/)
    expect(rows[3]![0]).toBe('') // the row after the block is a plain cell again
    // the merged header is centred, as on screen
    const header = x.match(/<a:tr\b[\s\S]*?<\/a:tr>/)![0]
    expect(header).toMatch(/gridSpan="3"[\s\S]*?algn="ctr"/)
  })

  it('a table without merges is written as before (no merge marks)', async () => {
    const x = await slideXml({})
    expect(x).not.toMatch(/gridSpan|rowSpan|hMerge|vMerge/)
  })

  it('a cell\'s own alignment is written as PowerPoint\'s (algn on the paragraph, anchor on the cell); the defaults stay left and middle', async () => {
    const x = await slideXml({ aligns: [{ row: 0, column: 1, h: 'right', v: 'bottom' }] })
    const rows = [...x.matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)].map((m) => [...m[0].matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/g)].map((c) => c[0]))
    expect(rows[1]![1]).toMatch(/algn="r"/); expect(rows[1]![1]).toMatch(/anchor="b"/)
    expect(rows[1]![0]).toMatch(/anchor="ctr"/); expect(rows[1]![0]).not.toMatch(/algn="r"/)
  })
})
