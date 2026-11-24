import { describe, expect, it } from 'vitest'
import { CANVAS, type ElementChange, type Presentation, type SlideElement, type TextElement } from '@prompttoppt/validation'
import { DESIGNS, SAMPLES, composeDeck } from '../index'
import { estimateTextHeight, metricOptsFor } from '../text-metrics'
import { alreadyAsked, layerAlready, planLayer, planCrop, planCopyLook, planShapeRow, isShapeKind, shapeWord, columnIndex, effectAlready, numericColumn, planChartFromTable, planCopy, newOverlaps, newContacts, planShapeAdd, compose, describeElement, isBold, edgeMargin, evaluate, evaluateAll, expectationsFromChanges, planElementChange, type ElementOp } from './index'

let n = 0
const id = () => `i${++n}`
const mk = (): Presentation => {
  const slides = composeDeck(SAMPLES.slice(0, 3), DESIGNS[0]!, '16:9', id).map((s) => ({ locked: false, validation: { status: 'passed' as const, issues: [] }, ...s, id: `s${++n}` }))
  const d = { schemaVersion: 1, id: 'x', title: 'Deck', aspectRatio: '16:9', language: 'en', theme: DESIGNS[0]!.theme, sources: [], slides } as unknown as Presentation
  d.slides[0]!.elements.push({ id: 'pic', type: 'image', src: 'https://x.test/a.png', alt: 'cup', x: 600, y: 300, width: 400, height: 300, rotation: 0, locked: false, zIndex: 9, opacity: 1, fit: 'cover', clip: 'none' } as never)
  return d
}
const W = CANVAS['16:9'].width, H = CANVAS['16:9'].height
const plan = (d: Presentation, slide = 0, elId = 'pic', o: ElementOp) => planElementChange(d, d.slides[slide]!, d.slides[slide]!.elements.find((e) => e.id === elId)!, o)
const change = (r: ReturnType<typeof plan>): ElementChange => { if (!r.ok) throw new Error(r.why); return r.change }
const apply = (d: Presentation, c: ElementChange, slide = 0): Presentation => {
  const out = structuredClone(d); const el = out.slides[slide]!.elements.find((e) => e.id === c.elementId) as unknown as Record<string, unknown> & SlideElement
  if (c.remove) { out.slides[slide]!.elements = out.slides[slide]!.elements.filter((e) => e.id !== c.elementId); return out }
  Object.assign(el, c.patch ?? {})
  if (el.type === 'text' && c.bold !== undefined) for (const p of (el as TextElement).paragraphs) for (const r of p.runs) r.bold = c.bold
  return out
}

describe('planElementChange: typed operations become absolute values', () => {
  const d = mk()
  it('move to an edge keeps the edge margin and the element inside the slide; centre centres', () => {
    const m = edgeMargin(d)
    const plan = (dd: Presentation, slide: number, elId: string, o: ElementOp) => planElementChange(dd, dd.slides[slide]!, dd.slides[slide]!.elements.find((e) => e.id === elId)!, { ...o, overlap: true } as ElementOp) // (geometry only: "anyway")
    expect(change(plan(d, 0, 'pic', { op: 'move', to: 'right' })).patch).toEqual({ x: W - m - 400, y: 300 })
    expect(change(plan(d, 0, 'pic', { op: 'move', to: 'left' })).patch).toEqual({ x: m, y: 300 })
    expect(change(plan(d, 0, 'pic', { op: 'move', to: 'top' })).patch).toEqual({ x: 600, y: m })
    expect(change(plan(d, 0, 'pic', { op: 'move', to: 'bottom' })).patch).toEqual({ x: 600, y: H - m - 300 })
    expect(change(plan(d, 0, 'pic', { op: 'move', to: 'center' })).patch).toEqual({ x: (W - 400) / 2, y: (H - 300) / 2 })
    expect(change(plan(d, 0, 'pic', { op: 'move', dx: 5000, dy: -5000 })).patch).toEqual({ x: W - 400, y: 0 }) // a nudge never leaves the slide
    expect(plan(d, 0, 'pic', { op: 'move' })).toMatchObject({ ok: false })
    expect(change(plan(d, 0, 'pic', { op: 'move', to: 'right' })).verb).toBe('Moved {} to the right')
  })
  it('resize by a factor keeps the shape around the centre, never beyond the slide; a text box grows with its text', () => {
    const plan = (dd: Presentation, slide: number, elId: string, o: ElementOp) => planElementChange(dd, dd.slides[slide]!, dd.slides[slide]!.elements.find((e) => e.id === elId)!, { ...o, overlap: true } as ElementOp)
    const c = change(plan(d, 0, 'pic', { op: 'resize', scale: 1.5 }))
    expect(c.patch).toMatchObject({ width: 600, height: 450 }); expect(c.verb).toBe('Made {} bigger')
    expect(c.patch!.x! + 600 / 2).toBeCloseTo(600 + 200, -1)
    const huge = change(plan(d, 0, 'pic', { op: 'resize', scale: 20 })).patch!
    expect(huge.width! <= W && huge.height! <= H).toBe(true); expect(huge.width! / huge.height!).toBeCloseTo(4 / 3, 1)
    expect(change(plan(d, 0, 'pic', { op: 'resize', scale: 0.5 })).patch).toMatchObject({ width: 200, height: 150 })
    expect(change(plan(d, 0, 'pic', { op: 'resize', width: 800 })).patch).toMatchObject({ width: 800, height: 600 })
    const title = d.slides[0]!.elements.find((e) => e.type === 'text' && e.role === 'title') as TextElement
    const t = change(plan(d, 0, title.id, { op: 'resize', scale: 1.25 }))
    expect(t.patch!.fontSize).toBe(Math.round(title.fontSize * 1.25)); expect(t.patch!.x).toBeUndefined() // the text grows in its own place
    expect(t.verb).toBe('Made the text of {} bigger')
  })
  it('text size, style, alignment, delete; and operations that do not fit are refused with the reason', () => {
    const title = d.slides[0]!.elements.find((e) => e.type === 'text' && e.role === 'title') as TextElement
    expect(change(plan(d, 0, title.id, { op: 'font_size', size: 32 })).patch).toEqual({ fontSize: 32 })
    expect(change(plan(d, 0, title.id, { op: 'font_size', delta: 4 })).patch!.fontSize).toBe(title.fontSize + 4)
    expect(change(plan(d, 0, title.id, { op: 'font_size', size: 9999 })).patch!.fontSize).toBe(400)
    expect(change(plan(d, 0, title.id, { op: 'text_style', bold: true, color: '#FF0000' }))).toMatchObject({ bold: true, patch: { color: '#FF0000' } })
    expect(change(plan(d, 0, 'pic', { op: 'align', to: 'left' })).patch).toEqual({ x: edgeMargin(d), y: 300 })
    expect(change(plan(d, 0, 'pic', { op: 'delete' })).remove).toBe(true)
    expect(plan(d, 0, 'pic', { op: 'font_size', size: 20 })).toEqual({ ok: false, why: 'the picture has no text size' })
    expect(plan(d, 0, 'pic', { op: 'text_style', bold: true })).toMatchObject({ ok: false })
    expect(plan(d, 0, title.id, { op: 'text_style' })).toMatchObject({ ok: false })
    expect(describeElement(title)).toBe('the title')
  })
  it('a locked slide, a locked element, and template artwork are refused', () => {
    const l = mk(); l.slides[0]!.locked = true
    expect(plan(l, 0, 'pic', { op: 'move', to: 'left' })).toEqual({ ok: false, why: 'its slide is locked' })
    const e = mk(); (e.slides[0]!.elements.find((x) => x.id === 'pic') as { locked: boolean }).locked = true
    expect(plan(e, 0, 'pic', { op: 'delete' })).toEqual({ ok: false, why: 'the picture is locked' })
    expect(planElementChange(d, d.slides[0]!, d.slides[0]!.elements.find((x) => x.id === 'pic')!, { op: 'move', to: 'left' }, true)).toMatchObject({ ok: false })
    const title = d.slides[0]!.elements.find((x) => x.type === 'text')!
    expect(planElementChange(d, d.slides[0]!, title, { op: 'font_size', size: 40 }, true).ok).toBe(true) // text style is allowed on template text
  })
})

describe('the check looks at the deck', () => {
  it('done, already so, locked, missing, not applied, and a delete', () => {
    const d = mk()
    const c = change(plan(d, 0, 'pic', { op: 'move', to: 'right' }))
    const [e] = expectationsFromChanges(d, { theme: null, edits: [], elementChanges: [c] })
    expect(e).toMatchObject({ kind: 'element', already: false })
    expect(evaluate(e!, apply(d, c)).status).toBe('done')
    expect(evaluate(e!, d)).toMatchObject({ status: 'failed', reason: 'not_applied' })
    const locked = apply(d, c); (locked.slides[0]!.elements.find((x) => x.id === 'pic') as { x: number }).x = 0; locked.slides[0]!.locked = true
    expect(evaluate(e!, locked)).toMatchObject({ status: 'skipped', reason: 'locked', evidence: ['the slide is locked'] })
    const gone = structuredClone(d); gone.slides[0]!.elements = gone.slides[0]!.elements.filter((x) => x.id !== 'pic')
    expect(evaluate(e!, gone)).toMatchObject({ status: 'failed', reason: 'missing_element' })
    const [again] = expectationsFromChanges(apply(d, c), { theme: null, edits: [], elementChanges: [c] })
    expect(again).toMatchObject({ already: true }); expect(evaluate(again!, apply(d, c)).status).toBe('unchanged')
    const del = change(plan(d, 0, 'pic', { op: 'delete' })); const [de] = expectationsFromChanges(d, { theme: null, edits: [], elementChanges: [del] })
    expect(evaluate(de!, apply(d, del)).status).toBe('done'); expect(evaluate(de!, d)).toMatchObject({ status: 'failed' })
    expect(alreadyAsked(d.slides[0]!.elements.find((x) => x.id === 'pic')!, c)).toBe(false)
  })
  it('bold is checked on every run of the text', () => {
    const d = mk(); const title = d.slides.flatMap((s) => s.elements).find((x) => x.type === 'text' && !x.locked && !isBold(x))! // (a title is already bold: asking for it is "already so")
    const si = d.slides.findIndex((s) => s.elements.includes(title))
    const c = change(plan(d, si, title.id, { op: 'text_style', bold: true }))
    const [e] = expectationsFromChanges(d, { theme: null, edits: [], elementChanges: [c] })
    const half = apply(d, c, si); (half.slides[si]!.elements.find((x) => x.id === title.id) as TextElement).paragraphs[0]!.runs[0]!.bold = false
    expect(evaluate(e!, half).status).toBe('failed'); expect(evaluate(e!, apply(d, c, si)).status).toBe('done')
    const alreadyBold = d.slides[0]!.elements.find((x) => x.type === 'text' && x.role === 'title')!
    expect(isBold(alreadyBold)).toBe(true)
  })
  it('the message names what was changed and where, and why a part was not', () => {
    const d = mk(); d.slides[1]!.locked = true
    const title0 = d.slides[0]!.elements.find((x) => x.type === 'text' && x.role === 'title')!
    const cs: ElementChange[] = [change(plan(d, 0, 'pic', { op: 'resize', scale: 1.5, overlap: true })), change(plan(d, 0, title0.id, { op: 'font_size', size: 40 }))]
    // a change aimed at an element of a slide that got locked meanwhile
    const other = d.slides[1]!.elements[0]!; const locked = structuredClone(d); locked.slides[1]!.locked = false
    const movable = locked.slides[1]!.elements.find((x) => x.type === 'text' && !x.locked)!
    cs.push(change(planElementChange(locked, locked.slides[1]!, movable, { op: 'move', to: 'bottom', overlap: true })))
    const exps = expectationsFromChanges(d, { theme: null, edits: [], elementChanges: cs })
    const after = apply(apply(d, cs[0]!), cs[1]!) // the third was not applied (its slide is locked in the deck)
    const r = compose(exps, evaluateAll(exps, after), after)
    expect(r.outcome).toBe('partial')
    expect(r.applied).toEqual(expect.arrayContaining(['Made the picture on slide 1 bigger', 'Set the text size of the title on slide 1 to 40 pt']))
    expect(r.notes.join(' ')).toMatch(/Slide 2 is locked, so I left it/)
    void other
  })
})

describe('newOverlaps', () => {
  const box = (id: string, x: number, y: number, w: number, h: number, type: 'image' | 'text' = 'image') => ({ id, type, x, y, width: w, height: h, ...(type === 'text' ? { role: 'body', paragraphs: [] } : {}) }) as never
  const doc = { aspectRatio: '16:9' } as never
  it('reports only what the change causes, and ignores backdrops', () => {
    const pic = box('p', 100, 100, 400, 300), text = box('t', 1200, 100, 500, 300, 'text'), bg = box('bg', 0, 0, 1920, 1080)
    const slide = { elements: [bg, pic, text] } as never
    expect(newOverlaps(doc, slide, pic, { x: 1300 }).map((e) => e.id)).toEqual(['t'])
    expect(newOverlaps(doc, slide, pic, { x: 600 })).toEqual([])
    expect(newOverlaps(doc, { elements: [bg, box('p', 1250, 100, 400, 300), text] } as never, box('p', 1250, 100, 400, 300), { x: 1300 })).toEqual([]) // already overlapped: not caused by this change
  })
})

describe('planShapeAdd / shape_style', () => {
  const doc = { aspectRatio: '16:9' } as never
  const slide = (o: object = {}) => ({ id: 's', layoutId: 'title-body', locked: false, elements: [], ...o }) as never
  const title = { id: 't', type: 'text', x: 200, y: 100, width: 800, height: 120, zIndex: 5 } as never
  it('around an object: padded box, BEHIND it (its stacking place minus one), colour a theme word by default', () => {
    const r = planShapeAdd(doc, slide(), { op: 'add_shape', shape: 'rect', around: true }, 'new1', title)
    expect(r).toMatchObject({ ok: true, change: { elementId: 'new1', desc: 'a rectangle', verb: 'Added {}', add: { shape: 'rect', x: 176, y: 76, width: 848, height: 168, fill: 'primary', zIndex: 4 } } })
  })
  it('on the slide: a named size and place, never a number from a model; stays inside the slide', () => {
    const r = planShapeAdd(doc, slide(), { op: 'add_shape', shape: 'ellipse', at: 'right', size: 'large', fill: '#112233' }, 'n2')
    expect(r.ok && r.change.add && r.change.add.x + r.change.add.width <= 1920 && r.change.add.fill).toBe('#112233')
  })
  it('refuses on a locked slide and on an animated-template slide, with the reason', () => {
    expect(planShapeAdd(doc, slide({ locked: true }), { op: 'add_shape', shape: 'rect' }, 'n')).toMatchObject({ ok: false, why: expect.stringMatching(/locked/) })
    expect(planShapeAdd(doc, slide({ layoutId: 'morph-template' }), { op: 'add_shape', shape: 'rect' }, 'n')).toMatchObject({ ok: false, why: expect.stringMatching(/template animation/) })
  })
  it('a fill or outline on something that is not a shape is refused; see-through works on any object', () => {
    const pic = { id: 'p', type: 'image', x: 0, y: 0, width: 100, height: 100, opacity: 1, locked: false } as never
    expect(planElementChange(doc, slide(), pic, { op: 'shape_style', fill: '#fff' })).toMatchObject({ ok: false, why: expect.stringMatching(/not a shape/) })
    expect(planElementChange(doc, slide(), pic, { op: 'shape_style', opacity: 0.5 })).toMatchObject({ ok: true, change: { patch: { opacity: 0.5 } } })
  })
  it('a shape that is not on the slide is a failed check, never a "done"', () => {
    const plan = planShapeAdd(doc, slide(), { op: 'add_shape', shape: 'rect', at: 'center' }, 'ghost')
    if (!plan.ok) throw new Error('plan')
    const d = { aspectRatio: '16:9', slides: [{ id: 's', locked: false, elements: [] }] } as never
    expect(evaluate({ key: 'k', kind: 'element', change: { ...plan.change, slideId: 's' }, already: false }, d)).toMatchObject({ status: 'failed' })
  })
})

describe('tables and charts: only the deck\'s own data, moved or removed, never invented', () => {
  const doc = { aspectRatio: '16:9' } as never
  const slide = { id: 's', layoutId: 'title-body', locked: false, elements: [] } as never
  const table = { id: 't', type: 'table', x: 0, y: 0, width: 800, height: 300, opacity: 1, locked: false, header: ['Plan', 'Price'], rows: [['A', '$9'], ['B', '$100'], ['C', '$25']] } as never
  const chart = { id: 'c', type: 'chart', x: 0, y: 0, width: 800, height: 400, opacity: 1, locked: false, chartType: 'bar', labels: ['x', 'y', 'z'], series: [{ name: 's', values: [2, 9, 5] }, { name: 'u', values: [1, 1, 1] }] } as never
  const plan = (el: never, op: ElementOp) => planElementChange(doc, slide, el, op)
  it('a numeric column sorts as numbers ($100 above $25 above $9), text as text; rows are only reordered', () => {
    const r = plan(table, { op: 'table_order', column: 2, order: 'desc' })
    expect(r.ok && r.change.patch?.rows).toEqual([['B', '$100'], ['C', '$25'], ['A', '$9']])
    const t = plan(table, { op: 'table_order', column: 1, order: 'desc' })
    expect(t.ok && t.change.patch?.rows?.map((x) => x[0])).toEqual(['C', 'B', 'A'])
  })
  it('a column is found by its NAME (any case, a unique part of it) or its number, never guessed', () => {
    const byName = plan(table, { op: 'table_order', column: 'price', order: 'desc' })
    expect(byName.ok && byName.change.patch?.rows?.[0]).toEqual(['B', '$100'])
    expect(plan(table, { op: 'table_order', column: 'cost', order: 'asc' })).toMatchObject({ ok: false, why: expect.stringMatching(/no column "cost"/) })
    expect(columnIndex(['Unit price', 'Unit cost'], 'unit')).toBeNull()
    expect(columnIndex(['Plan', 'Price'], 2)).toBe(1)
  })
  it('merging: the block the person named, its words kept in the top-left cell (and said), refusals with the reason, unmerge; sort/rows/columns carry merges and highlights', () => {
    const t3 = { ...(table as object), header: ['Plan', 'Q1', 'Q2'], rows: [['A', '1', '2'], ['B', '3', '4'], ['C', '5', '6']], highlights: [{ row: 0, column: 1, fill: '#ff0000' }] } as never
    const head = plan(t3, { op: 'table_merge', action: 'merge', row: 'header', column: 'Q1', toColumn: 'Q2' })
    expect(head.ok && head.change.patch?.merges).toEqual([{ row: -1, column: 1, rows: 1, columns: 2 }])
    expect(head.ok && head.change.patch?.header).toEqual(['Plan', 'Q1 Q2', ''])
    expect(head.ok && head.note).toMatch(/"Q1 Q2"/)
    const block = plan(t3, { op: 'table_merge', action: 'merge', row: 'A', toRow: 'B', column: 2, toColumn: 3 })
    expect(block.ok && block.change.patch?.merges).toEqual([{ row: 0, column: 1, rows: 2, columns: 2 }])
    expect(block.ok && block.change.patch?.highlights).toEqual([{ row: 0, column: 1, fill: '#ff0000' }])
    expect(plan(t3, { op: 'table_merge', action: 'merge', row: 'header', toRow: 1, column: 1 })).toMatchObject({ ok: false, why: expect.stringMatching(/header row only merges across/) })
    expect(plan(t3, { op: 'table_merge', action: 'merge' })).toMatchObject({ ok: false, why: 'I was not told which cells to merge' })
    expect(plan(t3, { op: 'table_merge', action: 'unmerge' })).toMatchObject({ ok: false, why: expect.stringMatching(/has no merged cells/) })
    const merged = { ...(t3 as object), merges: [{ row: 0, column: 1, rows: 1, columns: 2 }] } as never
    const all = plan(merged, { op: 'table_merge', action: 'unmerge' })
    expect(all.ok && all.change.patch?.merges).toBeNull()
    // a sort moves the merge (one row high) and the highlight with their row
    const sorted = plan(merged, { op: 'table_order', column: 'Plan', order: 'desc' })
    expect(sorted.ok && sorted.change.patch?.merges).toEqual([{ row: 2, column: 1, rows: 1, columns: 2 }])
    expect(sorted.ok && sorted.change.patch?.highlights).toEqual([{ row: 2, column: 1, fill: '#ff0000' }])
    // a row removed below, a column added inside: the merge follows
    expect((() => { const r = plan(merged, { op: 'table_rows', action: 'remove', row: 3 }); return r.ok && r.change.patch?.merges })()).toEqual([{ row: 0, column: 1, rows: 1, columns: 2 }])
    expect((() => { const r = plan(merged, { op: 'table_columns', action: 'remove', column: 'Q2' }); return r.ok && r.change.patch?.merges })()).toBeNull()
    // a cell hidden inside a merge: the words go to the merged cell the person sees
    const cellIn = plan(merged, { op: 'table_cell', row: 'A', column: 'Q2', text: 'Both' })
    expect(cellIn.ok && cellIn.change.patch?.rows?.[0]).toEqual(['A', 'Both', '2'])
    expect(cellIn.ok && cellIn.change.verb).toMatch(/merged cell at row 1, columns 2 to 3/)
    // already merged: the change is a no-op the honesty check sees
    const again = plan(merged, { op: 'table_merge', action: 'merge', row: 'A', column: 'Q1', toColumn: 'Q2' })
    expect(again).toMatchObject({ ok: false, why: expect.stringMatching(/already merged/) })
  })
  it('aligning cells: a column (header included), the whole table, refused without a direction; the words never change', () => {
    const t3 = { ...(table as object), header: ['Plan', 'Q1', 'Q2'], rows: [['A', '1', '2'], ['B', '3', '4']] } as never
    const col = plan(t3, { op: 'table_align', column: 'Q1', align: 'right' })
    expect(col.ok && col.change.patch?.aligns).toEqual([{ row: -1, column: 1, h: 'right' }, { row: 0, column: 1, h: 'right' }, { row: 1, column: 1, h: 'right' }])
    expect(col.ok && col.change.patch?.rows).toEqual([['A', '1', '2'], ['B', '3', '4']])
    expect(col.ok && col.change.verb).toMatch(/aligned right/)
    const all = plan(t3, { op: 'table_align', valign: 'top' })
    expect(all.ok && all.change.patch?.aligns).toHaveLength(9)
    expect(all.ok && all.change.verb).toMatch(/every cell .* at the top/)
    expect(plan(t3, { op: 'table_align', column: 'Q1' })).toMatchObject({ ok: false, why: 'I was not told how to align the words' })
  })
  it('new rows and columns are empty; removal never empties the table; limits are said', () => {
    const add = plan(table, { op: 'table_rows', action: 'add', count: 2 })
    expect(add.ok && add.change.patch?.rows?.slice(3)).toEqual([['', ''], ['', '']])
    expect(add.ok && add.change.patch?.height).toBe(300 + 172)
    expect(plan({ ...(table as object), rows: [['only', 'row']] } as never, { op: 'table_rows', action: 'remove' })).toMatchObject({ ok: false, why: expect.stringMatching(/at least one row/) })
    expect(plan(table, { op: 'table_columns', action: 'remove', column: 5 })).toMatchObject({ ok: false, why: expect.stringMatching(/no column "5"/) })
  })
  it('a chart sort moves labels and EVERY series together; the figures are the same multiset', () => {
    const r = plan(chart, { op: 'chart_order', order: 'high_to_low' })
    expect(r.ok && r.change.patch?.labels).toEqual(['y', 'z', 'x'])
    expect(r.ok && r.change.patch?.series).toEqual([{ name: 's', values: [9, 5, 2] }, { name: 'u', values: [1, 1, 1] }])
  })
  it('pie needs one series; the wrong object type is refused', () => {
    expect(plan(chart, { op: 'chart_type', to: 'pie' })).toMatchObject({ ok: false, why: expect.stringMatching(/shows one series, and this chart has/) })
    expect(plan(table, { op: 'chart_type', to: 'line' })).toMatchObject({ ok: false, why: expect.stringMatching(/not a chart/) })
    expect(plan(chart, { op: 'table_style', headerFill: '#000000' })).toMatchObject({ ok: false, why: expect.stringMatching(/not a table/) })
  })
  it('alreadyAsked sees data that is already so', () => {
    const r = plan(chart, { op: 'chart_order', order: 'low_to_high' })
    expect(r.ok && alreadyAsked({ ...(chart as object), labels: ['x', 'z', 'y'], series: [{ name: 's', values: [2, 5, 9] }, { name: 'u', values: [1, 1, 1] }] } as never, r.change)).toBe(true)
    expect(r.ok && alreadyAsked(chart, r.change)).toBe(false)
  })
})

describe('animations: judged by the slide\'s own effect list', () => {
  const fx = (o: object) => ({ id: 'f', elementId: 't', category: 'entrance', type: 'fly-in', start: 'click', duration: 600, delay: 0, easing: 'ease-out', repeat: 1, reverse: false, ...o })
  const slide = (effects: object[]) => ({ id: 's', locked: false, elements: [{ id: 't', type: 'text', locked: false }], effects }) as never
  const change = (effect: object) => ({ slideId: 's', elementId: 't', desc: 'the title', verb: 'x', effect }) as never
  it('the effect and each option asked for must be on the object; options not asked for are not compared', () => {
    expect(effectAlready(slide([fx({})]), change({ type: 'fly-in' }))).toBe(true)
    expect(effectAlready(slide([fx({})]), change({ type: 'fly-in', direction: 'left' }))).toBe(false)
    expect(effectAlready(slide([fx({ direction: 'left', duration: 1200 })]), change({ type: 'fly-in', direction: 'left', duration: 1200 }))).toBe(true)
    expect(effectAlready(slide([fx({})]), change({ type: 'zoom-in' }))).toBe(false)
    expect(effectAlready(slide([]), change({ type: 'fly-in' }))).toBe(false)
  })
  it('a clear is done only when NO animation is left on that object (others are not its business)', () => {
    expect(effectAlready(slide([]), change({ clear: true }))).toBe(true)
    expect(effectAlready(slide([fx({})]), change({ clear: true }))).toBe(false)
    expect(effectAlready(slide([fx({ elementId: 'other' })]), change({ clear: true }))).toBe(true)
  })
  it('evaluate: an animation that is not on the object is a failed check, never a "done"', () => {
    const doc = (effects: object[]) => ({ aspectRatio: '16:9', slides: [slide(effects)] }) as never
    const e = { key: 'k', kind: 'element', change: change({ type: 'fly-in', direction: 'left' }), already: false } as never
    expect(evaluate(e, doc([]))).toMatchObject({ status: 'failed' })
    expect(evaluate(e, doc([fx({ direction: 'left' })]))).toMatchObject({ status: 'done' })
  })
})

describe('editing data and charts from tables, with only the data\'s own numbers', () => {
  const doc = { aspectRatio: '16:9' } as never
  const slide = (o: object = {}) => ({ id: 's', layoutId: 'title-body', locked: false, elements: [], ...o }) as never
  const table = { id: 't', type: 'table', x: 100, y: 150, width: 700, height: 260, opacity: 1, locked: false, header: ['Plan', 'Price', 'Seats', 'Notes'], rows: [['Basic', '$1,150', '5', 'cheap'], ['Pro', '$2,340', '20', 'fast']] } as never
  it('a column is numbers only if every row has one; the unit is kept only when it is the same everywhere', () => {
    expect(numericColumn([['a', '$1,150'], ['b', '$2,340']], 1)).toEqual({ values: [1150, 2340], unit: '$' })
    expect(numericColumn([['a', '12%'], ['b', '3']], 1)).toEqual({ values: [12, 3], unit: '' })
    expect(numericColumn([['a', 'n/a'], ['b', '3']], 1)).toBeNull()
  })
  it('a chart from a table reads the labels from the first column and a series from each numeric column (text columns are skipped); pie takes one series', () => {
    const r = planChartFromTable(doc, slide(), table, { op: 'chart_from_table' }, 'c1')
    expect(r.ok && r.change.addChart).toMatchObject({ chartType: 'bar', labels: ['Basic', 'Pro'], series: [{ name: 'Price', values: [1150, 2340] }, { name: 'Seats', values: [5, 20] }], fromTableId: 't' })
    const pie = planChartFromTable(doc, slide(), table, { op: 'chart_from_table', chartType: 'pie' }, 'c2')
    expect(pie.ok && pie.change.addChart!.series).toEqual([{ name: 'Price', values: [1150, 2340] }])
  })
  it('refused with the reason: no numbers, a locked slide, a table that fills the slide', () => {
    const words = { ...(table as object), header: ['Plan', 'Notes'], rows: [['a', 'x']] } as never
    expect(planChartFromTable(doc, slide(), words, { op: 'chart_from_table' }, 'c')).toMatchObject({ ok: false, why: expect.stringMatching(/no column of numbers/) })
    expect(planChartFromTable(doc, slide({ locked: true }), table, { op: 'chart_from_table' }, 'c')).toMatchObject({ ok: false, why: expect.stringMatching(/locked/) })
    const big = { ...(table as object), x: 0, y: 0, width: 1920, height: 1000 } as never
    // a table that spans the slide is made half as wide and the chart goes beside it (that is planned as two changes, the narrowing first)
    const made = planChartFromTable(doc, slide(), big, { op: 'chart_from_table' }, 'c')
    expect(made.ok && made.also?.patch?.width).toBeLessThan(1000)
    expect(made.ok && made.change.addChart?.x).toBeGreaterThan(made.ok ? made.also!.patch!.width! : 0)
    // a table that is already narrow with no room anywhere is still refused
    const tall = { ...(table as object), x: 0, y: 0, width: 600, height: 1000 } as never
    const crowded = slide({ elements: [{ id: 'bar', type: 'shape', shape: 'rect', fill: '#000000', x: 600, y: 0, width: 1300, height: 700, rotation: 0, locked: false, zIndex: 1, opacity: 1 } as never, { id: 'low', type: 'shape', shape: 'rect', fill: '#000000', x: 600, y: 700, width: 1300, height: 380, rotation: 0, locked: false, zIndex: 1, opacity: 1 } as never] })
    expect(planChartFromTable(doc, crowded, tall, { op: 'chart_from_table' }, 'c')).toMatchObject({ ok: false, why: expect.stringMatching(/no free room/) })
  })
  it('a cell and a chart figure change only that value; unknown columns, rows and items are refused with what exists', () => {
    const cell = planElementChange(doc, slide(), table, { op: 'table_cell', row: 2, column: 'price', text: '$2,500' })
    expect(cell.ok && cell.change.patch?.rows).toEqual([['Basic', '$1,150', '5', 'cheap'], ['Pro', '$2,500', '20', 'fast']])
    const byName = planElementChange(doc, slide(), table, { op: 'table_cell', row: 'pro', column: 'Price', text: '$2,500' })
    expect(byName.ok && byName.change.patch?.rows?.[1]).toEqual(['Pro', '$2,500', '20', 'fast'])
    expect(planElementChange(doc, slide(), table, { op: 'table_cell', row: 'Gold', column: 'Price', text: 'x' })).toMatchObject({ ok: false, why: expect.stringMatching(/no row "Gold" \(its rows are "Basic", "Pro"\)/) })
    const head = planElementChange(doc, slide(), table, { op: 'table_cell', column: 'Price', text: 'Cost' })
    expect(head.ok && head.change.patch?.header).toEqual(['Plan', 'Cost', 'Seats', 'Notes'])
    expect(planElementChange(doc, slide(), table, { op: 'table_cell', row: 0, column: 'Price', text: 'Cost' })).toMatchObject({ ok: true })
    expect(planElementChange(doc, slide(), table, { op: 'table_cell', row: 9, column: 'Price', text: 'x' })).toMatchObject({ ok: false, why: expect.stringMatching(/2 rows/) })
    const chart = { id: 'c', type: 'chart', x: 0, y: 0, width: 800, height: 400, opacity: 1, locked: false, chartType: 'bar', labels: ['North', 'South'], series: [{ name: 'S', values: [1, 2] }] } as never
    const v = planElementChange(doc, slide(), chart, { op: 'chart_value', label: 'south', value: 7 })
    expect(v.ok && v.change.patch?.series).toEqual([{ name: 'S', values: [1, 7] }])
    expect(planElementChange(doc, slide(), chart, { op: 'chart_value', label: 'East', value: 7 })).toMatchObject({ ok: false, why: expect.stringMatching(/no item "East".*"North", "South"/) })
  })
  it('a copy goes to ANOTHER, open slide only', () => {
    const from = slide({ id: 'a' }), to = slide({ id: 'b' })
    expect(planCopy(doc, from, table, to, 'n')).toMatchObject({ ok: true, change: { slideId: 'b', elementId: 'n', copy: { fromSlideId: 'a', fromElementId: 't' } } })
    expect(planCopy(doc, from, table, from, 'n')).toMatchObject({ ok: false })
    expect(planCopy(doc, from, table, slide({ id: 'b', locked: true }), 'n')).toMatchObject({ ok: false, why: expect.stringMatching(/locked/) })
  })
})

describe('slice 4: objects are changed the way the person meant, in the room the slide has', () => {
  // a picture-and-text slide: title + body on the left, the picture on the right
  const txt = (id: string, role: TextElement['role'], x: number, y: number, w: number, h: number, size: number, runs: TextElement['paragraphs'][number]['runs'] = [{ text: 'Words here' }]) =>
    ({ id, type: 'text', role, x, y, width: w, height: h, rotation: 0, locked: false, zIndex: 1, opacity: 1, fontSize: size, color: 'textPrimary', align: 'left', valign: 'top', paragraphs: [{ runs }] }) as unknown as SlideElement
  const split = (): Presentation => {
    const d = mk()
    d.slides[0]!.elements = [
      txt('t', 'title', 96, 96, 820, 140, 60, [{ text: 'Growth in ' }, { text: 'India', italic: true, color: 'accent' }]),
      txt('b', 'body', 96, 280, 820, 700, 32),
      { id: 'pic', type: 'image', src: 'https://x.test/a.png', alt: 'cup', x: 1004, y: 96, width: 820, height: 888, rotation: 0, locked: false, zIndex: 2, opacity: 1, fit: 'cover', clip: 'none' } as never,
    ]
    return d
  }
  const at = (d: Presentation, id: string) => d.slides[0]!.elements.find((e) => e.id === id)!

  it('"center the title" centres its TEXT (it does not say "already like that" because the box is wide)', () => {
    const d = split()
    const c = change(plan(d, 0, 't', { op: 'align', to: 'center' }))
    expect(c.patch).toEqual({ align: 'center' }); expect(c.verb).toBe('Centred the text of {}')
    expect(alreadyAsked(at(d, 't'), c)).toBe(false)
    expect(alreadyAsked(at(apply(d, c), 't'), c)).toBe(true)
    // a picture aligned left is still a move (with the same room rules)
    expect(change(plan(d, 0, 'pic', { op: 'align', to: 'top' })).verb).toBe('Aligned {} to the top')
  })

  it('"increase the font size" always makes it bigger, even when the model wrote a smaller number; "smaller" always smaller', () => {
    const d = split()
    const up = change(plan(d, 0, 'b', { op: 'font_size', change: 'bigger', size: 24 })) // the C30 answer: "increase" planned as 24 on 32 pt text
    expect(up.patch!.fontSize).toBeGreaterThan(32); expect(up.verb).toBe('Made the text of {} bigger')
    expect(change(plan(d, 0, 'b', { op: 'font_size', change: 'bigger' })).patch!.fontSize).toBe(40)
    const down = change(plan(d, 0, 'b', { op: 'font_size', change: 'smaller', size: 50 }))
    expect(down.patch!.fontSize).toBeLessThan(32); expect(down.verb).toBe('Made the text of {} smaller')
    // a number the person gave that agrees with the direction is used as given
    expect(change(plan(d, 0, 'b', { op: 'font_size', change: 'bigger', size: 36 })).patch!.fontSize).toBe(36)
  })

  it('bigger text grows in its own place, only into free room; with no room it is refused with the reason', () => {
    const d = split()
    // the title sits right above the body: a much bigger title has no room to grow down
    const long = structuredClone(d); (at(long, 't') as TextElement).paragraphs = [{ runs: [{ text: 'A long title that already takes two full lines of this column' }] }]
    const r = plan(long, 0, 't', { op: 'resize', scale: 1.6 })
    if (r.ok) { expect(r.note).toMatch(/as big as fits/); expect(newContacts(long, long.slides[0]!, at(long, 't'), r.change.patch!)).toEqual([]) }
    else expect(r.why).toMatch(/no room to grow: bigger text would cover the body text/)
    // a short title in a tall box: bigger text, no geometry change
    const c = change(plan(d, 0, 't', { op: 'resize', scale: 1.2 }))
    expect(c.patch).toEqual({ fontSize: 72 })
  })

  it('"make this image bigger" grows away from the text, or as far as fits; never over it', () => {
    const d = split()
    const pic = at(d, 'pic')
    const r = plan(d, 0, 'pic', { op: 'resize', scale: 1.3 })
    if (r.ok) { let after = d; for (const o of r.others ?? []) after = apply(after, o); expect(newContacts(after, after.slides[0]!, pic, r.change.patch!)).toEqual([]); const b = { ...pic, ...r.change.patch } as SlideElement; const m = Math.round(W * 0.04); expect(b.x >= m - 1 && b.y >= 0 && b.x + b.width <= W - m + 1 && b.y + b.height <= Math.max(H - m, pic.y + pic.height) + 1).toBe(true) } // (C04: not one pixel on the text, and inside the margins)
    else expect(r.why).toMatch(/no free room around it: bigger, it would cover/)
    // a small picture in an empty corner grows into the room it has
    const e = split(); Object.assign(at(e, 'pic'), { x: 1400, y: 600, width: 300, height: 200 })
    const g = change(plan(e, 0, 'pic', { op: 'resize', scale: 1.3 }))
    expect(g.patch).toMatchObject({ width: 390, height: 260 }); expect(newOverlaps(e, e.slides[0]!, at(e, 'pic'), g.patch!)).toEqual([])
    // "anyway": as asked, over the text
    expect(change(plan(d, 0, 'pic', { op: 'resize', scale: 1.3, overlap: true })).patch!.width).toBeGreaterThan(900)
  })

  it('"move the picture to the left" swaps sides with the text instead of covering it', () => {
    const d = split()
    const r = plan(d, 0, 'pic', { op: 'move', to: 'left' })
    if (!r.ok) throw new Error(r.why)
    expect(r.change.patch).toEqual({ x: edgeMargin(d), y: 96 })
    expect(r.others?.map((o) => o.elementId).sort()).toEqual(['b', 't'])
    let after = apply(d, r.change); for (const o of r.others!) after = apply(after, o)
    const els = after.slides[0]!.elements
    for (const a of els) for (const b of els) if (a.id < b.id) expect(newOverlaps(after, after.slides[0]!, a, {}).map((x) => x.id)).not.toContain(b.id)
    expect(at(after, 't').x).toBeGreaterThan(900) // the text column is on the right now
    // a locked title is never pushed: nothing moves, and the reason is said
    const l = split(); (at(l, 't') as { locked: boolean }).locked = true
    expect(plan(l, 0, 'pic', { op: 'move', to: 'left' })).toMatchObject({ ok: false, why: expect.stringMatching(/is locked/) })
    // no room to swap: refused, never silently on top
    const full = split(); full.slides[0]!.elements.push(txt('n', 'caption', 1100, 120, 200, 100, 20)) // (a caption where the title would go)
    expect(plan(full, 0, 'pic', { op: 'move', to: 'left' })).toMatchObject({ ok: false })
  })

  it('C04: a picture that fills its column gets wider and the text beside it narrower, while that text still fits at its own size', () => {
    const d = split()
    const r = plan(d, 0, 'pic', { op: 'resize', scale: 1.3 })
    if (!r.ok) throw new Error(r.why)
    expect(r.change.patch).toMatchObject({ width: 997, height: 888, y: 96 }) // (1.3x kept in proportion up to the slide's height = 997 wide; as tall as it was: it already filled its column's height)
    expect(r.change.patch!.x! + r.change.patch!.width!).toBe(1004 + 820) // (it grows towards the text, its outer edge stays)
    expect(r.others?.map((o) => [o.elementId, o.verb]).sort()).toEqual([['b', 'Made {} narrower to make room'], ['t', 'Made {} narrower to make room']])
    let after = apply(d, r.change); for (const o of r.others!) after = apply(after, o)
    const els = after.slides[0]!.elements
    for (const e of els) expect(newContacts(after, { elements: els.filter((x) => x.id !== e.id) }, e, {})).toEqual([]) // nothing touches anything
    for (const id of ['t', 'b']) expect(at(after, id).width).toBeGreaterThanOrEqual(820 * 0.6)
    // text that would not fit any narrower: nothing changes, the reason is said
    const full = split(); (at(full, 'b') as TextElement).paragraphs = Array.from({ length: 9 }, (_, i) => ({ runs: [{ text: `Point ${i} with a long sentence that fills most of the line in this column and then goes on for a while longer` }] }))
    const f = plan(full, 0, 'pic', { op: 'resize', scale: 1.3 })
    if (f.ok) for (const o of f.others ?? []) { const h = at(full, o.elementId) as TextElement; const m = metricOptsFor(h, full.theme); const over = Math.max(0, estimateTextHeight(h.paragraphs, h.fontSize, h.width, m) - h.height); expect(estimateTextHeight(h.paragraphs, h.fontSize, o.patch!.width!, m) - over).toBeLessThanOrEqual(h.height) } // (narrowed only while its text still fits at its own size)
    else expect(f.why).toMatch(/no free room around it/)
    // a locked text box is never narrowed
    const l = split(); (at(l, 'b') as { locked: boolean }).locked = true
    expect(plan(l, 0, 'pic', { op: 'resize', scale: 1.3 }).ok).toBe(false)
  })

  it('a text colour is only "done" when the coloured words took it too', () => {
    const d = split()
    const c = change(plan(d, 0, 't', { op: 'text_style', color: '#FF0000' }))
    const box = apply(d, c) // the box colour only: the accent word "India" keeps its own colour
    expect(alreadyAsked(at(box, 't'), c)).toBe(false)
    const [e] = expectationsFromChanges(d, { theme: null, edits: [], elementChanges: [c] })
    expect(evaluate(e!, box).status).toBe('failed')
    const all = structuredClone(box); for (const p of (at(all, 't') as TextElement).paragraphs) for (const r of p.runs) delete r.color
    expect(evaluate(e!, all).status).toBe('done')
  })
})

describe('W1: text formatting from words (the model picks words, code picks numbers; the words of the text never come from a model)', () => {
  const tx = (o: Partial<TextElement> = {}) => ({ id: 't', type: 'text', role: 'body', x: 100, y: 100, width: 800, height: 400, rotation: 0, locked: false, zIndex: 1, opacity: 1, fontSize: 32, color: 'textPrimary', align: 'left', valign: 'top', paragraphs: [{ runs: [{ text: 'our AI plan for 2025. next steps for NASA' }] }, { runs: [{ text: 'the team and the ' }, { text: 'roadmap', color: 'accent' }] }], ...o }) as unknown as SlideElement
  const deckWith = (el: SlideElement): Presentation => { const d = mk(); d.slides[0]!.elements = [el]; return d }
  const p = (el: SlideElement, o: ElementOp) => { const d = deckWith(el); return planElementChange(d, d.slides[0]!, d.slides[0]!.elements[0]!, o) }
  it('spacing, place in the box and weight: words become numbers relative to NOW, the person\'s number is used as given', () => {
    expect(change(p(tx(), { op: 'text_style', lineSpacing: 'looser' })).patch).toEqual({ lineHeight: 1.5 })
    expect(change(p(tx({ lineHeight: 1.5 }), { op: 'text_style', lineSpacing: 'tighter' })).patch).toEqual({ lineHeight: 1.35 })
    expect(change(p(tx(), { op: 'text_style', lineSpacing: 1.8 })).patch).toEqual({ lineHeight: 1.8 })
    expect(change(p(tx(), { op: 'text_style', paragraphSpacing: 'more' })).patch).toEqual({ paraGap: 0.8 })
    expect(change(p(tx(), { op: 'text_style', letterSpacing: 'wider' })).patch!.letterSpacing).toBeGreaterThan(0)
    expect(change(p(tx({ letterSpacing: 3 }), { op: 'text_style', letterSpacing: 'normal' })).patch).toEqual({ letterSpacing: 0 })
    expect(change(p(tx(), { op: 'text_style', valign: 'middle' }))).toMatchObject({ patch: { valign: 'middle' }, verb: 'Placed the text of {} at the middle of its box' })
    expect(change(p(tx(), { op: 'text_style', weight: 'bolder' })).patch).toEqual({ weight: 600 })
    expect(p(tx({ weight: 900 }), { op: 'text_style', weight: 'bolder' })).toMatchObject({ ok: false, why: expect.stringMatching(/already as heavy as it can be/) })
  })
  it('case: capitals are a display setting; lower, sentence and title case change only the letters, keep acronyms and every run\'s own look', () => {
    expect(change(p(tx(), { op: 'text_style', textCase: 'upper' })).patch).toEqual({ uppercase: true })
    const sentence = change(p(tx(), { op: 'text_style', textCase: 'sentence' })).patch!.paragraphs!
    expect(sentence.map((q) => q.runs.map((r) => r.text).join(''))).toEqual(['Our AI plan for 2025. Next steps for NASA', 'The team and the roadmap'])
    expect(sentence[1]!.runs[1]).toEqual({ text: 'roadmap', color: 'accent' }) // (the accent word keeps its colour)
    const title = change(p(tx(), { op: 'text_style', textCase: 'title' })).patch!.paragraphs!
    expect(title.map((q) => q.runs.map((r) => r.text).join(''))).toEqual(['Our AI Plan for 2025. Next Steps for NASA', 'The Team and the Roadmap'])
    const lower = change(p(tx(), { op: 'text_style', textCase: 'lower' })).patch!
    expect(lower.paragraphs![0]!.runs[0]!.text).toBe('our ai plan for 2025. next steps for nasa'); expect(lower.uppercase).toBe(false)
  })
  it('lists, underline, and "already so"', () => {
    const numbered = change(p(tx(), { op: 'text_style', list: 'number' }))
    expect(numbered.patch!.paragraphs!.every((q) => q.list === 'number')).toBe(true)
    expect(alreadyAsked(tx({ paragraphs: numbered.patch!.paragraphs! } as never), numbered)).toBe(true)
    const u = change(p(tx(), { op: 'text_style', underline: true }))
    expect(u.underline).toBe(true); expect(alreadyAsked(tx(), u)).toBe(false)
    expect(alreadyAsked(tx({ paragraphs: [{ runs: [{ text: 'x', underline: true }] }] } as never), u)).toBe(true)
  })
  it('fit: "make it fit" shrinks the size until the text fits; "box to its text" sizes the box (only into free room); already fitting is said', () => {
    const long = { paragraphs: Array.from({ length: 7 }, (_, i) => ({ runs: [{ text: `Line ${i} of a long body text that wraps over the width of this box` }] })) }
    const shrink = change(p(tx(long as never), { op: 'text_style', fit: 'shrink' }))
    expect(shrink.patch!.fontSize).toBeLessThan(32); expect(shrink.verb).toMatch(/so it fits its box \(32 → \d+ pt\)/)
    expect(p(tx({ paragraphs: [{ runs: [{ text: 'short' }] }] } as never), { op: 'text_style', fit: 'shrink' })).toMatchObject({ ok: false, why: expect.stringMatching(/already fits its box/) })
    const box = change(p(tx({ paragraphs: [{ runs: [{ text: 'short' }] }] } as never), { op: 'text_style', fit: 'box' }))
    expect(box.patch!.height).toBeLessThan(400); expect(box.verb).toBe('Made the box of {} fit its text')
  })
})

describe('W1: layers, lock, hide, name', () => {
  const el = (id: string, z: number, o: object = {}) => ({ id, type: 'shape', shape: 'rect', fill: '#123456', x: 0, y: 0, width: 100, height: 100, rotation: 0, locked: false, zIndex: z, opacity: 1, ...o }) as unknown as SlideElement
  const deckOf = (...els: SlideElement[]) => { const d = mk(); d.slides[0]!.elements = els; return d }
  const order = (d: Presentation) => [...d.slides[0]!.elements].sort((a, b) => b.zIndex - a.zIndex).map((e) => e.id)
  it('one layer forward/back is "in front of / behind the object next to it": one fact the check reads from the deck; at the end it is the front/back change', () => {
    const d = deckOf(el('a', 3), el('b', 2), el('c', 1))
    const s = d.slides[0]!
    const fwd = planLayer(d, s, s.elements[2]!, 'forward')
    expect(fwd).toMatchObject({ ok: true, change: { layer: 'above', layerOf: 'b', verb: 'Brought {} one layer forward' } })
    expect(planLayer(d, s, s.elements[0]!, 'forward')).toMatchObject({ ok: true, change: { layer: 'front' } })
    expect(layerAlready(s, (planLayer(d, s, s.elements[0]!, 'forward') as { change: ElementChange }).change)).toBe(true)
    const behind = planLayer(d, s, s.elements[0]!, 'behind', s.elements[2]!)
    if (!behind.ok) throw new Error(behind.why)
    expect(layerAlready(s, behind.change)).toBe(false)
    const after = structuredClone(d); after.slides[0]!.elements.find((e) => e.id === 'a')!.zIndex = 0
    expect(order(after)).toEqual(['b', 'c', 'a']); expect(layerAlready(after.slides[0]!, behind.change)).toBe(true)
    expect(planLayer(d, s, s.elements[0]!, 'behind', s.elements[0]!)).toMatchObject({ ok: false })
    expect(planLayer(d, s, s.elements[0]!, 'behind', undefined, true)).toMatchObject({ ok: false, why: expect.stringMatching(/break the Morph/) })
  })
  it('lock / unlock (a locked object is what unlocking is about), hide / show, name; each "already so" when it is', () => {
    const d = deckOf(el('a', 1, { locked: true }), el('b', 2, { hidden: true, label: 'Logo' }))
    const s = d.slides[0]!
    const un = change(planElementChange(d, s, s.elements[0]!, { op: 'unlock' }))
    expect(un).toMatchObject({ patch: { locked: false }, verb: 'Unlocked {}' })
    expect(planElementChange(d, s, s.elements[0]!, { op: 'hide' })).toMatchObject({ ok: false, why: 'the shape is locked' })
    expect(alreadyAsked(s.elements[0]!, change(planElementChange(d, s, s.elements[0]!, { op: 'lock' })))).toBe(true)
    expect(alreadyAsked(s.elements[1]!, change(planElementChange(d, s, s.elements[1]!, { op: 'hide' })))).toBe(true)
    expect(alreadyAsked(s.elements[1]!, change(planElementChange(d, s, s.elements[1]!, { op: 'show' })))).toBe(false)
    expect(change(planElementChange(d, s, s.elements[1]!, { op: 'rename', name: '  Product   Image ' }))).toMatchObject({ patch: { label: 'Product Image' }, verb: 'Named {} "Product Image"' })
    expect(alreadyAsked(s.elements[1]!, change(planElementChange(d, s, s.elements[1]!, { op: 'rename', name: 'Logo' })))).toBe(true)
    expect(planElementChange(d, s, s.elements[1]!, { op: 'hide' }, true)).toMatchObject({ ok: false, why: expect.stringMatching(/break the Morph/) })
  })
})

describe('W2: pictures cut to a shape, a side or their subject; a look copied; the colour wash over a photo', () => {
  const pic = (o: object = {}) => ({ id: 'p', type: 'image', src: 'https://x.test/a.jpg', alt: 'a', x: 1000, y: 100, width: 800, height: 600, rotation: 0, locked: false, zIndex: 1, opacity: 1, fit: 'cover', clip: 'none', ...o }) as unknown as SlideElement
  const deckWith = (...els: SlideElement[]) => { const d = mk(); d.slides[0]!.elements = els; return d }
  it('a ratio: the biggest cut-out of that shape, centred or on the side asked; the frame takes that shape (kept on the slide)', () => {
    const d = deckWith(pic()); const s = d.slides[0]!
    const sq = planCrop(d, s, s.elements[0]!, { op: 'crop', ratio: '1:1' }, 1.5)
    if (!sq.ok) throw new Error(sq.why)
    expect(sq.change.crop).toEqual({ rect: { x: 0.1667, y: 0, w: 0.6667, h: 1 }, sourceAspect: 1.5 }); expect(sq.change.verb).toBe('Cropped {} to a square')
    const left = planCrop(d, s, s.elements[0]!, { op: 'crop', ratio: '1:1', focus: 'left' }, 1.5)
    expect(left.ok && left.change.crop!.rect).toEqual({ x: 0, y: 0, w: 0.6667, h: 1 })
    expect(planCrop(d, s, s.elements[0]!, { op: 'crop', ratio: 'original' }, 1.5)).toMatchObject({ ok: true, change: { crop: { rect: null } } })
  })
  it('a subject: the frame keeps its shape, the cut-out holds the subject with room around it; not found or already filling is said', () => {
    const d = deckWith(pic()); const s = d.slides[0]!
    const box = { x: 0.55, y: 0.2, w: 0.3, h: 0.45 }
    const r = planCrop(d, s, s.elements[0]!, { op: 'crop', subject: 'the cup' }, 1.5, box)
    if (!r.ok) throw new Error(r.why)
    const c = r.change.crop!.rect!
    expect(c.x).toBeLessThanOrEqual(box.x); expect(c.y).toBeLessThanOrEqual(box.y); expect(c.x + c.w).toBeGreaterThanOrEqual(box.x + box.w); expect(c.y + c.h).toBeGreaterThanOrEqual(box.y + box.h)
    expect((c.w * 1.5) / c.h).toBeCloseTo(800 / 600, 2) // the frame's own shape: the layout does not change
    expect(r.change.verb).toBe('Cropped {} to the cup')
    expect(planCrop(d, s, s.elements[0]!, { op: 'crop', subject: 'a unicorn' }, 1.5, null)).toMatchObject({ ok: false, why: 'I could not find a unicorn in the picture' })
    expect(planCrop(d, s, s.elements[0]!, { op: 'crop', subject: 'the room' }, 1.5, { x: 0, y: 0, w: 1, h: 1 })).toMatchObject({ ok: false, why: 'the room already fills the picture' })
  })
  it('a taller frame that would cover text is refused with the reason; a template picture is never cropped', () => {
    const d = deckWith(pic({ y: 300, height: 300 }), { id: 't', type: 'text', role: 'body', x: 1000, y: 700, width: 800, height: 200, rotation: 0, locked: false, zIndex: 2, opacity: 1, fontSize: 30, color: 'textPrimary', align: 'left', valign: 'top', paragraphs: [{ runs: [{ text: 'Words' }] }] } as never)
    const s = d.slides[0]!
    expect(planCrop(d, s, s.elements[0]!, { op: 'crop', ratio: '1:1' }, 1.5)).toMatchObject({ ok: false, why: expect.stringMatching(/gets taller and would cover the body text/) })
    expect(planCrop(d, s, s.elements[0]!, { op: 'crop', ratio: '16:9' }, 1.5, undefined, true)).toMatchObject({ ok: false, why: expect.stringMatching(/template animation/) })
  })
  it('already cropped like that = already so (the check reads the stored crop)', () => {
    const d = deckWith(pic({ crop: { x: 0.1667, y: 0, w: 0.6667, h: 1 } })); const s = d.slides[0]!
    const r = planCrop(d, s, s.elements[0]!, { op: 'crop', ratio: '1:1' }, 1.5)
    expect(r.ok && alreadyAsked(s.elements[0]!, r.change)).toBe(true)
  })
  it('copy look: only how it looks, never words, place or size; only between objects of the same kind', () => {
    const d = deckWith(pic({ id: 'a', clip: 'circle', shadow: 'soft', filter: { brightness: 1.2, contrast: 1, grayscale: 1 } }), pic({ id: 'b', x: 100 }))
    const s = d.slides[0]!
    const r = planCopyLook(s, s.elements[1]!, s.elements[0]!)
    expect(r).toMatchObject({ ok: true, change: { patch: { clip: 'circle', shadow: 'soft', filter: { brightness: 1.2, contrast: 1, grayscale: 1 }, overlay: null }, verb: 'Gave {} the look of the picture' } })
    expect(r.ok && Object.keys(r.change.patch!)).not.toContain('x')
    const t = { id: 't', type: 'text', role: 'body', x: 0, y: 0, width: 10, height: 10, rotation: 0, locked: false, zIndex: 1, opacity: 1, fontSize: 30, color: 'textPrimary', align: 'left', valign: 'top', paragraphs: [{ runs: [{ text: 'x' }] }] } as unknown as SlideElement
    expect(planCopyLook(s, t, s.elements[0]!)).toMatchObject({ ok: false, why: expect.stringMatching(/is not a text box/) })
  })
  it('the colour wash over a photo: lighter, darker, off; a photo without one cannot be made lighter', () => {
    const ov = { from: '#000000', to: '#000000', angle: 180, opacity: 0.6 }
    const d = deckWith(pic({ overlay: ov }), pic({ id: 'q' })); const s = d.slides[0]!
    expect(change(planElementChange(d, s, s.elements[0]!, { op: 'picture_style', overlay: 'lighter' })).patch).toEqual({ overlay: { ...ov, opacity: 0.35 } })
    expect(change(planElementChange(d, s, s.elements[0]!, { op: 'picture_style', overlay: 'none' })).patch).toEqual({ overlay: null })
    expect(planElementChange(d, s, s.elements[1]!, { op: 'picture_style', overlay: 'lighter' })).toMatchObject({ ok: false, why: 'the picture has no colour wash over it' })
    const none = change(planElementChange(d, s, s.elements[0]!, { op: 'picture_style', overlay: 'none' }))
    expect(alreadyAsked(s.elements[1]!, none)).toBe(true); expect(alreadyAsked(s.elements[0]!, none)).toBe(false)
  })
})

describe('W2: shapes — every shape of the editor, kind, rotation, rows of equal shapes', () => {
  const sh = (o: object = {}) => ({ id: 's', type: 'shape', shape: 'rect', fill: 'primary', x: 200, y: 200, width: 400, height: 200, rotation: 0, locked: false, zIndex: 1, opacity: 1, radius: 0, ...o }) as unknown as SlideElement
  const deckWith = (...els: SlideElement[]) => { const d = mk(); d.slides[0]!.elements = els; return d }
  it('the shape list is the editor\'s own library; words come from its labels', () => {
    expect(isShapeKind('heart')).toBe(true); expect(isShapeKind('rect')).toBe(true); expect(isShapeKind('dragon')).toBe(false)
    expect(shapeWord('heart')).toBe('a heart'); expect(shapeWord('ellipse')).toBe('a circle')
  })
  it('kind: "make it a circle"; a PERFECT circle has equal sides around the same centre; already that kind is already so', () => {
    const d = deckWith(sh()); const s = d.slides[0]!
    expect(change(planElementChange(d, s, s.elements[0]!, { op: 'shape_kind', to: 'ellipse' }))).toMatchObject({ patch: { shape: 'ellipse' }, verb: 'Made {} a circle' })
    const perfect = change(planElementChange(d, s, s.elements[0]!, { op: 'shape_kind', to: 'ellipse', equalSides: true }))
    expect(perfect.patch).toEqual({ shape: 'ellipse', x: 300, y: 200, width: 200, height: 200 }); expect(perfect.verb).toBe('Made {} a perfect circle')
    expect(alreadyAsked(s.elements[0]!, change(planElementChange(d, s, s.elements[0]!, { op: 'shape_kind', to: 'rect' })))).toBe(true)
    expect(planElementChange(d, s, s.elements[0]!, { op: 'shape_kind', to: 'dragon' })).toMatchObject({ ok: false })
  })
  it('rotate TO an angle or BY an angle (kept within -180..180); a template object is never turned', () => {
    const d = deckWith(sh({ rotation: 30 })); const s = d.slides[0]!
    expect(change(planElementChange(d, s, s.elements[0]!, { op: 'rotate', degrees: 45 })).patch).toEqual({ rotation: 45 })
    expect(change(planElementChange(d, s, s.elements[0]!, { op: 'rotate', degrees: 45, by: true })).patch).toEqual({ rotation: 75 })
    expect(change(planElementChange(d, s, s.elements[0]!, { op: 'rotate', degrees: 270 })).patch).toEqual({ rotation: -90 })
    expect(change(planElementChange(d, s, s.elements[0]!, { op: 'rotate', degrees: 0 })).verb).toBe('Turned {} straight')
    expect(planElementChange(d, s, s.elements[0]!, { op: 'rotate', degrees: 45 }, true)).toMatchObject({ ok: false })
  })
  it('a radial gradient: from the middle out (kind radial), the same colours rule as a linear one', () => {
    const d = deckWith(sh()); const s = d.slides[0]!
    expect(change(planElementChange(d, s, s.elements[0]!, { op: 'shape_style', gradient: { from: '#FF0000', to: 'accent', radial: true } })).patch!.gradient).toMatchObject({ from: '#ff0000', kind: 'radial' })
    expect(change(planElementChange(d, s, s.elements[0]!, { op: 'shape_style', gradient: { from: '#FF0000', to: '#0000FF' } })).patch!.gradient!.kind).toBeUndefined()
  })
  it('shape shadow: soft / strong / none, the pictures\' presets; "already" knows a shape\'s shadow (it said "not done" before)', () => {
    const d = deckWith(sh()); const s = d.slides[0]!
    const c = change(planElementChange(d, s, s.elements[0]!, { op: 'shape_style', shadow: 'soft' }))
    expect(c).toMatchObject({ patch: { shadow: 'soft' }, verb: 'Gave {} a soft shadow' })
    expect(alreadyAsked({ ...(s.elements[0] as object), shadow: 'soft' } as never, c)).toBe(true)
    expect(alreadyAsked(s.elements[0]!, c)).toBe(false)
  })
  it('justify: both edges straight (the editor\'s fourth alignment); said as "Justified"', () => {
    const t = { id: 't', type: 'text', role: 'body', x: 0, y: 0, width: 900, height: 200, rotation: 0, locked: false, zIndex: 1, opacity: 1, fontSize: 30, align: 'left', valign: 'top', color: 'textPrimary', bullet: '•', paragraphs: [{ runs: [{ text: 'A long paragraph' }] }] } as never
    const d = deckWith(t); const s = d.slides[0]!
    const c = change(planElementChange(d, s, s.elements[0]!, { op: 'text_style', align: 'justify' }))
    expect(c.patch).toEqual({ align: 'justify' }); expect(c.verb).toBe('Justified {}')
    expect(alreadyAsked({ ...(s.elements[0] as object), align: 'justify' } as never, c)).toBe(true)
  })
  it('text effects: a soft shadow and an accent outline for the box; one word highlighted yellow (the typing bar\'s marker); "none" takes them off; already knows them', () => {
    const t = { id: 't', type: 'text', role: 'body', x: 0, y: 0, width: 900, height: 200, rotation: 0, locked: false, zIndex: 1, opacity: 1, fontSize: 60, align: 'left', valign: 'top', color: 'textPrimary', bullet: '•', paragraphs: [{ runs: [{ text: 'Grow revenue fast' }] }] } as never
    const d = deckWith(t); const s = d.slides[0]!
    const fx = change(planElementChange(d, s, s.elements[0]!, { op: 'text_style', shadow: 'soft', outline: 'accent' }))
    expect(fx.patch).toMatchObject({ textShadow: 'soft', textOutline: { color: 'accent', width: 2 } })
    expect(fx.verb).toMatch(/^Gave \{\} a soft shadow and gave \{\} a accent|^Gave \{\} a soft shadow and gave \{\} an? /)
    const hl = change(planElementChange(d, s, s.elements[0]!, { op: 'text_style', words: 'revenue', highlight: 'yellow' }))
    expect(hl.patch!.paragraphs![0]!.runs).toEqual([{ text: 'Grow ' }, { text: 'revenue', highlight: '#FFF176' }, { text: ' fast' }])
    expect(hl.verb).toBe('Made "revenue" highlighted in yellow in {}')
    const off = change(planElementChange(d, s, s.elements[0]!, { op: 'text_style', shadow: 'none' }))
    expect(off.patch).toMatchObject({ textShadow: null })
    expect(alreadyAsked({ ...(s.elements[0] as object), textShadow: 'soft', textOutline: { color: 'accent', width: 2 } } as never, fx)).toBe(true)
    expect(alreadyAsked(s.elements[0]!, fx)).toBe(false)
  })
  it('picture blur and border: soft / strong blur, none = sharp; a coloured border inside the frame (width 6 by default), none takes it off; already knows them', () => {
    const pic = { id: 'p', type: 'image', x: 0, y: 0, width: 400, height: 300, rotation: 0, locked: false, zIndex: 1, opacity: 1, src: 'https://x/y.jpg', alt: 'a', fit: 'cover', clip: 'none' } as never
    const d = deckWith(pic); const s = d.slides[0]!
    const c = change(planElementChange(d, s, s.elements[0]!, { op: 'picture_style', blur: 'soft', border: '#FFFFFF' }))
    expect(c.patch!.filter).toMatchObject({ blur: 3 }); expect(c.patch!.border).toEqual({ color: '#FFFFFF', width: 6 })
    expect(c.verb).toMatch(/softly blurred and with a white/)
    expect(change(planElementChange(d, s, s.elements[0]!, { op: 'picture_style', border: 'none' })).patch!.border).toBeNull()
    expect(alreadyAsked({ ...(s.elements[0] as object), filter: { brightness: 1, contrast: 1, grayscale: 0, blur: 3 }, border: { color: '#FFFFFF', width: 6 } } as never, c)).toBe(true)
  })
  it('picture colour: warmer / cooler / more vivid / muted by steps, "normal" back to neutral; the same fields as the editor sliders; "already" knows them', () => {
    const pic = { id: 'p', type: 'image', x: 0, y: 0, width: 400, height: 300, rotation: 0, locked: false, zIndex: 1, opacity: 1, src: 'https://x/y.jpg', alt: 'a', fit: 'cover', clip: 'none' } as never
    const d = deckWith(pic); const s = d.slides[0]!
    const warm = change(planElementChange(d, s, s.elements[0]!, { op: 'picture_style', warmth: 'warmer' }))
    expect(warm.patch!.filter).toMatchObject({ warmth: 0.35 }); expect(warm.patch!.filter!.saturation ?? 1).toBe(1)
    const vivid = change(planElementChange(d, s, s.elements[0]!, { op: 'picture_style', saturation: 'more', warmth: 'cooler' }))
    expect(vivid.patch!.filter).toMatchObject({ saturation: 1.3, warmth: -0.35 })
    const back = { ...(s.elements[0] as object), filter: { brightness: 1, contrast: 1, grayscale: 0, warmth: 0.7 } } as never
    const db = deckWith(back); const sb = db.slides[0]!
    expect(change(planElementChange(db, sb, sb.elements[0]!, { op: 'picture_style', warmth: 'normal' })).patch!.filter).toMatchObject({ warmth: 0 })
    expect(alreadyAsked({ ...(s.elements[0] as object), filter: { brightness: 1, contrast: 1, grayscale: 0, warmth: 0.35 } } as never, warm)).toBe(true)
  })
  it('dash: a bordered shape gets a dashed / dotted border, "solid" takes it off; no border = refused (never made up); a line is its own border', () => {
    const d = deckWith(sh({ stroke: '#111111', strokeWidth: 4 })); const s = d.slides[0]!
    expect(change(planElementChange(d, s, s.elements[0]!, { op: 'shape_style', dash: 'dashed' }))).toMatchObject({ patch: { strokeDash: 'dash' }, verb: 'Made the border of {} dashed' })
    expect(change(planElementChange(d, s, s.elements[0]!, { op: 'shape_style', dash: 'solid' })).patch).toEqual({ strokeDash: null })
    const bare = deckWith(sh()); const sb = bare.slides[0]!
    expect(planElementChange(bare, sb, sb.elements[0]!, { op: 'shape_style', dash: 'dotted' })).toMatchObject({ ok: false, why: expect.stringMatching(/has no border to make dotted/) })
    expect(change(planElementChange(bare, sb, sb.elements[0]!, { op: 'shape_style', dash: 'dotted', stroke: '#DC2626' })).patch).toMatchObject({ stroke: '#DC2626', strokeDash: 'dot' })
    const ln = deckWith(sh({ shape: 'line' })); const sl = ln.slides[0]!
    expect(change(planElementChange(ln, sl, sl.elements[0]!, { op: 'shape_style', dash: 'dotted' })).verb).toBe('Made {} dotted')
    expect(alreadyAsked({ ...s.elements[0]!, strokeDash: 'dash' } as never, change(planElementChange(d, s, s.elements[0]!, { op: 'shape_style', dash: 'dashed' })))).toBe(true)
  })
  it('flip: pictures and shapes mirror (a turned one reverses its angle); a text box is refused with the reason; "already" knows the flip', () => {
    const d = deckWith(sh({ rotation: 30 })); const s = d.slides[0]!
    const c = change(planElementChange(d, s, s.elements[0]!, { op: 'flip', axis: 'horizontal' }))
    expect(c.patch).toEqual({ flipH: true, rotation: -30 }); expect(c.verb).toBe('Flipped {} left to right')
    expect(alreadyAsked(s.elements[0]!, c)).toBe(false)
    expect(alreadyAsked({ ...s.elements[0]!, flipH: true, rotation: -30 } as never, c)).toBe(true)
    const t = { id: 't', type: 'text', role: 'body', x: 0, y: 0, width: 400, height: 100, rotation: 0, locked: false, zIndex: 1, opacity: 1, fontSize: 30, align: 'left', valign: 'top', color: 'textPrimary', bullet: '•', paragraphs: [{ runs: [{ text: 'Hi' }] }] } as never
    const dt = deckWith(t); const st = dt.slides[0]!
    expect(planElementChange(dt, st, st.elements[0]!, { op: 'flip', axis: 'vertical' })).toMatchObject({ ok: false, why: expect.stringMatching(/words would read backwards/) })
  })
  it('rotate: the editor rule: charts and tables never turn; 360 is straight; a tenth of a degree is kept', () => {
    const d = deckWith(sh()); const s = d.slides[0]!
    expect(change(planElementChange(d, s, s.elements[0]!, { op: 'rotate', degrees: 360 })).patch).toEqual({ rotation: 0 })
    expect(change(planElementChange(d, s, s.elements[0]!, { op: 'rotate', degrees: 12.34 })).patch).toEqual({ rotation: 12.3 })
    const chart = { id: 'c', type: 'chart', x: 0, y: 0, width: 400, height: 300, rotation: 0, locked: false, zIndex: 1, opacity: 1, chartType: 'bar', labels: ['A'], series: [{ name: 'S', values: [1] }] } as never
    const dc = deckWith(chart); const sc = dc.slides[0]!
    expect(planElementChange(dc, sc, sc.elements[0]!, { op: 'rotate', degrees: 45 })).toMatchObject({ ok: false, why: expect.stringMatching(/stay upright/) })
  })
  it('a row of N equal shapes: one size, equal gaps, in FREE room; no room = refused', () => {
    const d = deckWith(); const s = d.slides[0]!
    let i = 0
    const r = planShapeRow(d, s, { op: 'add_shape', shape: 'roundRect', count: 3 }, () => `n${++i}`)
    if (!r.ok) throw new Error(r.why)
    expect(r.changes).toHaveLength(3)
    const boxes = r.changes.map((c) => c.add!)
    expect(new Set(boxes.map((b) => `${b.width}x${b.height}`)).size).toBe(1)
    expect(boxes[1]!.x - (boxes[0]!.x + boxes[0]!.width)).toBe(boxes[2]!.x - (boxes[1]!.x + boxes[1]!.width))
    const full = deckWith(sh({ x: 0, y: 0, width: 1920, height: 1080 * 0.59 }), sh({ id: 't', x: 0, y: 640, width: 1920, height: 440 })); 
    expect(planShapeRow(full, full.slides[0]!, { op: 'add_shape', shape: 'rect', count: 3 }, () => 'x')).toMatchObject({ ok: false, why: expect.stringMatching(/no free room/) })
  })
})

describe('W5: single words get their own style (one rule with the editor and the export)', () => {
  const withText = (role: TextElement['role'], runs: TextElement['paragraphs'][number]['runs']) => {
    const d = mk()
    d.slides[0]!.elements.push({ id: 'w', type: 'text', role, x: 100, y: 700, width: 1200, height: 120, zIndex: 20, rotation: 0, opacity: 1, locked: false, fontSize: 32, align: 'left', valign: 'top', color: 'textPrimary', bullet: '•', paragraphs: [{ runs }] } as never)
    return d
  }
  it('"make revenue bold": only that word, every place it appears, whole words only', () => {
    const d = withText('body', [{ text: 'Revenue grew; revenue matters. Prerevenue stays.' }])
    const c = change(plan(d, 0, 'w', { op: 'text_style', words: 'revenue', bold: true }))
    expect(c.patch!.paragraphs).toEqual([{ runs: [{ text: 'Revenue', bold: true }, { text: ' grew; ' }, { text: 'revenue', bold: true }, { text: ' matters. Prerevenue stays.' }] }])
    expect(c.bold).toBeUndefined() // never the whole box
    expect(c.verb).toBe('Made "revenue" bold in {}')
  })
  it('keeps the other words styles and adds to the word own (colour + underline on an already bold word)', () => {
    const d = withText('body', [{ text: 'Grow ' }, { text: 'revenue', bold: true }, { text: ' fast', italic: true }])
    const c = change(plan(d, 0, 'w', { op: 'text_style', words: 'revenue', color: 'accent', underline: true }))
    expect(c.patch!.paragraphs).toEqual([{ runs: [{ text: 'Grow ' }, { text: 'revenue', bold: true, underline: true, color: 'accent' }, { text: ' fast', italic: true }] }])
    expect(c.verb).toBe('Made "revenue" underlined and the accent colour in {}')
  })
  it('a title word made not bold is written as bold off (a title is bold by its role); "bold" on a title word changes nothing (already)', () => {
    const d = withText('title', [{ text: 'Northwind logistics' }])
    const off = change(plan(d, 0, 'w', { op: 'text_style', words: 'Northwind', bold: false }))
    expect(off.patch!.paragraphs![0]!.runs[0]).toEqual({ text: 'Northwind', bold: false })
    const on = change(plan(d, 0, 'w', { op: 'text_style', words: 'Northwind', bold: true }))
    expect(alreadyAsked(d.slides[0]!.elements.find((e) => e.id === 'w')!, on)).toBe(true)
  })
  it('words that are not in the text are refused with the reason; box-only styles are refused for words', () => {
    const d = withText('body', [{ text: 'Grow revenue' }])
    expect(plan(d, 0, 'w', { op: 'text_style', words: 'profit', bold: true })).toMatchObject({ ok: false, why: '"profit" is not in the text of the body text' })
    expect(plan(d, 0, 'w', { op: 'text_style', words: 'revenue', lineSpacing: 'looser' })).toMatchObject({ ok: false, why: 'only bold, italic, underline, colour and a highlight can be given to single words' })
  })
  it('a hex colour is named in the reply', () => {
    const d = withText('body', [{ text: 'Grow revenue' }])
    expect(change(plan(d, 0, 'w', { op: 'text_style', words: 'revenue', color: '#DC2626' })).verb).toBe('Made "revenue" red (#DC2626) in {}')
  })
})
