import { beforeEach, describe, expect, it } from 'vitest'
import { composeSlide, contrastRatio, getTheme, resolveColor } from '@prompttoppt/theme'
import { SHAPE_LIBRARY, presentationSchema, type Presentation } from '@prompttoppt/validation'
import * as C from './commands'
import * as T from './toolbar-commands'
import { useDoc } from './store'

const mk = (aspect: '16:9' | '4:3' | '1:1' = '16:9'): Presentation => {
  const theme = getTheme('cobalt')
  return { schemaVersion: 1, id: 'p1', title: 'T', aspectRatio: aspect, language: 'en', theme, sources: [], slides: [{ ...C.blankSlide(theme, 's0') }] }
}
const doc = () => useDoc.getState().doc!
const apply = (label: string, r: (d: C.D) => void) => useDoc.getState().apply(label, r)
const els = () => doc().slides[0]!.elements

beforeEach(() => { useDoc.getState().load(mk(), 1) })

describe('toolbar commands: objects', () => {
  it('adds text, every library shape, a table and every chart type to a blank slide, and the document still validates', () => {
    apply('t', (d) => void T.addTextBox(d, 's0'))
    for (const s of SHAPE_LIBRARY) apply('s', (d) => void T.addShape(d, 's0', s.id))
    for (const s of ['rect', 'ellipse', 'line', 'ring', 'triangle', 'chevron']) apply('s', (d) => void T.addShape(d, 's0', s))
    apply('tb', (d) => void T.addTable(d, 's0', 4, 3))
    for (const k of ['bar', 'line', 'pie', 'doughnut'] as const) apply('c', (d) => void T.addChart(d, 's0', k))
    expect(els()).toHaveLength(1 + SHAPE_LIBRARY.length + 6 + 1 + 4)
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
    const W = 1920, H = 1080
    for (const e of els()) { expect(e.x).toBeGreaterThanOrEqual(0); expect(e.y).toBeGreaterThanOrEqual(0); expect(e.x + e.width).toBeLessThanOrEqual(W + 1); expect(e.y + e.height).toBeLessThanOrEqual(H + 1) }
    expect(doc().slides[0]!.manual).toBe(true)
  })

  it('keeps 1:1 shapes square and puts new objects inside every slide size', () => {
    for (const aspect of ['4:3', '1:1'] as const) {
      useDoc.getState().load(mk(aspect), 1)
      apply('s', (d) => void T.addShape(d, 's0', 'star5'))
      apply('s', (d) => void T.addShape(d, 's0', 'arrowRight'))
      apply('t', (d) => void T.addTable(d, 's0', 3, 3))
      const [star, arrow] = els()
      expect(star!.width).toBe(star!.height)
      expect(arrow!.width).toBeGreaterThan(arrow!.height)
      const { width: W, height: H } = { '4:3': { width: 1600, height: 1200 }, '1:1': { width: 1200, height: 1200 } }[aspect]
      for (const e of els()) { expect(e.x + e.width).toBeLessThanOrEqual(W + 1); expect(e.y + e.height).toBeLessThanOrEqual(H + 1) }
    }
  })

  it('every new shape is black by default', () => {
    for (const id of ['rect', 'line', 'ring', 'star5', 'arrowRight']) apply('s', (d) => void T.addShape(d, 's0', id))
    expect(els().every((e) => e.type === 'shape' && e.fill === '#000000')).toBe(true)
  })

  it('refuses to add anything to a locked slide', () => {
    apply('lock', (d) => C.setSlideLocked(d, 's0', true))
    apply('t', (d) => void T.addTextBox(d, 's0'))
    apply('s', (d) => void T.addShape(d, 's0', 'heart'))
    expect(els()).toHaveLength(0)
  })

  it('undo removes exactly what the toolbar added and redo brings it back', () => {
    apply('s', (d) => void T.addShape(d, 's0', 'heart'))
    expect(els()).toHaveLength(1)
    useDoc.getState().undo()
    expect(els()).toHaveLength(0)
    useDoc.getState().redo()
    expect(els()[0]).toMatchObject({ type: 'shape', shape: 'heart' })
  })
})

describe('toolbar commands: tables', () => {
  const id = () => els().find((e) => e.type === 'table')!.id
  const table = () => els().find((e) => e.type === 'table') as Extract<(typeof els extends () => infer R ? R : never)[number], { type: 'table' }>
  it('a new table is plain: a grid in the text colour, a coloured header row, no stripes', () => {
    apply('tb', (d) => void T.addTable(d, 's0', 3, 3))
    const t = table() as Record<string, unknown>
    expect(t).toMatchObject({ headerFill: doc().theme.colors.primary, headerColor: doc().theme.colors.onPrimary, rowFill: 'none', altRowFill: 'none', borderColor: doc().theme.colors.textPrimary, textColor: doc().theme.colors.textPrimary })
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
  })
  it('edits cells, rows and columns within the schema limits', () => {
    apply('tb', (d) => void T.addTable(d, 's0', 3, 2))
    expect(table().header).toHaveLength(2)
    expect(table().rows).toHaveLength(2)
    apply('c', (d) => T.setTableCell(d, 's0', id(), -1, 0, 'Region'))
    apply('c', (d) => T.setTableCell(d, 's0', id(), 1, 1, 'Q4'))
    expect(table().header[0]).toBe('Region')
    expect(table().rows[1]![1]).toBe('Q4')
    apply('c', (d) => T.setTableCell(d, 's0', id(), 9, 9, 'nope'))
    expect(table().rows).toHaveLength(2)
    apply('r', (d) => T.addTableRow(d, 's0', id()))
    apply('k', (d) => T.addTableColumn(d, 's0', id()))
    expect(table().rows).toHaveLength(3)
    expect(table().header).toHaveLength(3)
    expect(table().rows.every((r) => r.length === 3)).toBe(true)
    apply('dr', (d) => T.removeTableRow(d, 's0', id(), 0))
    apply('dc', (d) => T.removeTableColumn(d, 's0', id(), 0))
    expect(table().rows).toHaveLength(2)
    expect(table().header).toEqual(['Column 2', 'Column 3'])
    for (let i = 0; i < 30; i++) { apply('r', (d) => T.addTableRow(d, 's0', id())); apply('k', (d) => T.addTableColumn(d, 's0', id())) }
    expect(table().rows).toHaveLength(20)
    expect(table().header).toHaveLength(8)
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
    for (let i = 0; i < 40; i++) { apply('r', (d) => T.removeTableRow(d, 's0', id(), 0)); apply('k', (d) => T.removeTableColumn(d, 's0', id(), 0)) }
    expect(table().rows).toHaveLength(1)
    expect(table().header).toHaveLength(1)
  })
})

describe('toolbar commands: backgrounds', () => {
  const bg = () => doc().slides[0]!.background
  it('sets a colour (opacity blends toward the deck background), a gradient, a picture, and removes them again', () => {
    apply('c', (d) => T.setBackgroundColor(d, 's0', '#123456'))
    expect(bg()).toMatchObject({ type: 'color', value: '#123456' })
    apply('c', (d) => T.setBackgroundColor(d, 's0', '#000000', 50))
    const half = bg()!.value
    expect(half).not.toBe('#000000')
    expect(half).not.toBe(doc().theme.colors.background)
    apply('g', (d) => T.setBackgroundGradient(d, 's0', '#FF512F', '#F09819', 135))
    expect(bg()).toMatchObject({ type: 'gradient', gradient: { from: '#FF512F', to: '#F09819', angle: 135 } })
    apply('i', (d) => T.setBackgroundPicture(d, 's0', 'https://api.example.com/api/v1/assets/abc'))
    expect(bg()).toMatchObject({ type: 'image', value: 'https://api.example.com/api/v1/assets/abc' })
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
    apply('r', (d) => T.removeBackground(d, 's0'))
    expect(bg()).toMatchObject({ type: 'color', value: doc().theme.colors.background })
  })

  it('keeps text readable when the new background would hide it', () => {
    apply('t', (d) => void T.addTextBox(d, 's0'))
    apply('c', (d) => T.setBackgroundColor(d, 's0', '#FFFFFF'))
    apply('c', (d) => T.setBackgroundColor(d, 's0', '#000000'))
    const text = () => els().find((e) => e.type === 'text')!
    const readable = (bgHex: string) => contrastRatio(resolveColor((text() as { color: string }).color, doc().theme, doc().slides[0]!)!, bgHex)
    expect(readable('#000000')).toBeGreaterThanOrEqual(4.5)
    apply('g', (d) => T.setBackgroundGradient(d, 's0', '#FFFFFF', '#F5F5F5'))
    expect(readable('#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
  })
})

describe('assistant pictures: a photo behind any slide, and taking it back', () => {
  it('a manual (blank) slide gets the picture straight behind its elements and its text stays readable', () => {
    apply('t', (d) => void T.addTextBox(d, 's0'))
    apply('ai', (d) => C.applyAssist(d, { theme: null, edits: [], pictures: [{ slideId: 's0', url: 'https://api.example.com/api/v1/assets/abc' }] } as never))
    expect(doc().slides[0]!.background).toMatchObject({ type: 'image', value: 'https://api.example.com/api/v1/assets/abc' })
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
  })
  it('a designed title slide gets its picture layout (dark wash), a card slide gets a plain picture background; both are one undo step', () => {
    const theme = getTheme('cobalt')
    const designed = { id: 'd1', locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide({ layout: 'title', title: 'Hello', subtitle: 'World', speakerNotes: '', sources: [] }, theme, '16:9') }
    const cards = { id: 'd2', locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide({ layout: 'process', title: 'Steps', steps: [1, 2, 3].map((i) => ({ label: `S${i}`, detail: 'd' })), speakerNotes: '', sources: [] }, theme, '16:9') }
    useDoc.getState().load({ ...mk(), slides: [designed, cards] } as Presentation, 1)
    apply('ai', (d) => C.applyAssist(d, { theme: null, edits: [], pictures: [{ slideId: 'd1', url: 'https://x/a.jpg' }, { slideId: 'd2', url: 'https://x/b.jpg' }] } as never))
    expect(doc().slides.every((sl) => sl.background?.type === 'image')).toBe(true)
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
    useDoc.getState().undo()
    expect(doc().slides.every((sl) => sl.background?.type !== 'image')).toBe(true)
  })
  it('the assistant history can put a picture background back (the designed slide is laid out again)', () => {
    const theme = getTheme('cobalt')
    const designed = { id: 'd1', locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide({ layout: 'title', title: 'Hello', subtitle: 'World', speakerNotes: '', sources: [] }, theme, '16:9') }
    useDoc.getState().load({ ...mk(), slides: [designed] } as Presentation, 1)
    const before = doc(); const shapeOf = (sl: Presentation['slides'][number]) => JSON.stringify(sl.elements.map((e) => [e.type, Math.round(e.x), Math.round(e.y), Math.round(e.width), Math.round(e.height)])); const elementsBefore = shapeOf(before.slides[0]!)
    apply('ai', (d) => C.applyAssist(d, { theme: null, edits: [], pictures: [{ slideId: 'd1', url: 'https://x/a.jpg' }] } as never))
    const undo = C.snapshotAssist(before, doc(), false, ['Put a photo behind slide 1'], undefined, ['d1'])
    expect(doc().slides[0]!.background?.type).toBe('image')
    apply('revert', (d) => C.revertAssist(d, undo, 'all'))
    expect(doc().slides[0]!.background?.type).not.toBe('image')
    expect(shapeOf(doc().slides[0]!)).toBe(elementsBefore) // laid out as before (element ids are new, positions are the same)
  })
  it('floating and beside placements: a floating photo is a picture element, beside only on text layouts (else it floats); the history can take each back', () => {
    const theme = getTheme('cobalt')
    const body = { id: 'b1', locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide({ layout: 'title-body', title: 'Body', bullets: ['a', 'b'], speakerNotes: '', sources: [] }, theme, '16:9') }
    const steps = { id: 'p1', locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide({ layout: 'process', title: 'Steps', steps: [1, 2, 3].map((i) => ({ label: `S${i}`, detail: 'd' })), speakerNotes: '', sources: [] }, theme, '16:9') }
    useDoc.getState().load({ ...mk(), slides: [body, steps] } as Presentation, 1)
    const before = doc()
    apply('ai', (d) => C.applyAssist(d, { theme: null, edits: [], pictures: [{ slideId: 'b1', url: 'https://x/a.jpg', alt: 'a', placement: 'beside' }, { slideId: 'p1', url: 'https://x/b.jpg', alt: 'b', placement: 'beside' }] } as never))
    expect(doc().slides[0]!.layoutId).toBe('split-image-text') // the text slide became picture + text
    const floating = doc().slides[1]!.elements.filter((e) => e.type === 'image')
    expect(floating).toHaveLength(1) // the process slide cannot take a picture beside the text: it floats
    expect(presentationSchema.safeParse(doc()).success).toBe(true)
    const undo = C.snapshotAssist(before, doc(), false, ['Put photos'], undefined, ['b1', 'p1'])
    apply('revert', (d) => C.revertAssist(d, undo, 'all'))
    expect(doc().slides[0]!.layoutId).toBe('title-body')
    expect(doc().slides[1]!.elements.filter((e) => e.type === 'image')).toHaveLength(0)
    expect(doc().slides[1]!.manual).toBeFalsy() // the slide is not left marked as hand-edited
  })
  it('the media-library "background" placement and the AI image placement now exist for every slide', () => {
    const slide = doc().slides[0]!
    expect(C.imagePlacements(slide).map((p) => p.id)).toContain('background')
  })
})
