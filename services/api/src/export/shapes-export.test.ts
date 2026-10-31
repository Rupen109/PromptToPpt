import { describe, expect, it } from 'vitest'
import { SHAPE_LIBRARY, flattenShape, shapeElementSchema, tableElementSchema } from '@prompttoppt/validation'

describe('shape library', () => {
  it('every outline flattens to points inside the 0-100 box, and the schema accepts its id', () => {
    for (const s of SHAPE_LIBRARY) {
      const contours = flattenShape(s.path)
      expect(contours.length, s.id).toBeGreaterThan(0)
      for (const c of contours) {
        expect(c.length, s.id).toBeGreaterThanOrEqual(3)
        for (const [x, y] of c) { expect(Number.isFinite(x) && Number.isFinite(y), s.id).toBe(true); expect(x, s.id).toBeGreaterThan(-10); expect(x, s.id).toBeLessThan(110); expect(y, s.id).toBeGreaterThan(-10); expect(y, s.id).toBeLessThan(110) }
      }
      expect(shapeElementSchema.shape.shape.safeParse(s.id).success, s.id).toBe(true)
    }
    expect(new Set(SHAPE_LIBRARY.map((s) => s.id)).size).toBe(SHAPE_LIBRARY.length)
  })
})

import { strFromU8, unzipSync } from 'fflate'
import type { Presentation } from '@prompttoppt/validation'
import { buildPptx } from './pptx.ts'
import { makeDeck, signUp } from '../test-utils.ts'

describe('PowerPoint export of library shapes', () => {
  it('draws every library shape as a free-form PowerPoint shape (frames and signs keep their holes) and opens as a valid file', async () => {
    const u = await signUp('shp'); const { doc } = await makeDeck(u.id, 3)
    const shapes = SHAPE_LIBRARY.map((s, i) => shapeElementSchema.parse({ type: 'shape', id: `sh${i}`, shape: s.id, x: 100 + (i % 8) * 200, y: 100 + Math.floor(i / 8) * 200, width: 160, height: 160, fill: 'accent' }))
    const deck: Presentation = { ...doc, slides: [{ ...doc.slides[0]!, elements: shapes }] }
    const buf = await buildPptx(deck, async () => null)
    const files = unzipSync(new Uint8Array(buf))
    const xml = strFromU8(files['ppt/slides/slide1.xml']!)
    expect((xml.match(/<a:custGeom>/g) ?? []).length).toBe(SHAPE_LIBRARY.length)
    // the frame has two contours: the outline and the hole
    expect((xml.match(/<a:moveTo>/g) ?? []).length).toBeGreaterThan(SHAPE_LIBRARY.length)
  })
})

describe('PowerPoint export of table colours', () => {
  it('uses the colours chosen in the editor', async () => {
    const u = await signUp('tblc'); const { doc } = await makeDeck(u.id, 3)
    const table = { type: 'table', id: 't1', x: 100, y: 100, width: 900, height: 300, header: ['A', 'B'], rows: [['1', '2'], ['3', '4']], headerFill: '#7C3AED', headerColor: '#FFFFFF', rowFill: '#FEF3C7', altRowFill: '#DBEAFE', textColor: '#111827', borderColor: '#0EA5E9' }
    const deck: Presentation = { ...doc, slides: [{ ...doc.slides[0]!, elements: [tableElementSchema.parse(table)] }] }
    const xml = strFromU8(unzipSync(new Uint8Array(await buildPptx(deck, async () => null)))['ppt/slides/slide1.xml']!)
    for (const c of ['7C3AED', 'FEF3C7', 'DBEAFE', '111827', '0EA5E9']) expect(xml, c).toContain(c)
  })
})
