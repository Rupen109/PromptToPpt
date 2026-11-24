import { describe, expect, it } from 'vitest'
import { alignCells, alignOf, cellSpans, describeArea, insertColumn, insertRow, mergeCells, removeColumn, removeRow, reorderRows, unmergeCells, validMerges, type TableGrid } from '@prompttoppt/validation'

/** the one rule for merged table cells (packages/validation table-merge.ts): editor, screen, PowerPoint file, import and assistant all use it */
const table = (o: Partial<TableGrid> = {}): TableGrid => ({
  header: ['Plan', 'Q1', 'Q2', 'Q3'],
  rows: [['Basic', '10', '12', '14'], ['Pro', '20', '22', '24'], ['Team', '30', '32', '34']],
  ...o,
})

describe('merging', () => {
  it('keeps every word in the top-left cell, empties the rest, and draws one cell over the area', () => {
    const r = mergeCells(table(), { row: -1, column: 1, rows: 1, columns: 3 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.parts.header).toEqual(['Plan', 'Q1 Q2 Q3', '', ''])
    const span = cellSpans(r.parts)
    expect(span(-1, 1)).toEqual({ covered: false, rows: 1, columns: 3 })
    expect(span(-1, 2)).toEqual({ covered: true })
    expect(span(0, 1)).toEqual({ covered: false, rows: 1, columns: 1 })
  })

  it('a block over rows and columns; words repeated in the cells are kept once', () => {
    const r = mergeCells(table({ rows: [['Basic', 'Yes', 'Yes', '1'], ['Pro', 'Yes', 'Yes', '2'], ['Team', 'No', 'No', '3']] }), { row: 0, column: 1, rows: 2, columns: 2 })
    expect(r.ok && r.parts.rows.map((x) => x.slice(1, 3))).toEqual([['Yes', ''], ['', ''], ['No', 'No']])
  })

  it('refuses what cannot be merged, with the reason', () => {
    const t = table()
    expect(mergeCells(t, { row: -1, column: 0, rows: 2, columns: 1 })).toMatchObject({ ok: false, why: expect.stringMatching(/header row only merges across/) })
    expect(mergeCells(t, { row: 0, column: 0, rows: 1, columns: 1 })).toMatchObject({ ok: false, why: expect.stringMatching(/single cell/) })
    expect(mergeCells(t, { row: 0, column: 2, rows: 1, columns: 3 })).toMatchObject({ ok: false, why: expect.stringMatching(/4 columns/) })
    expect(mergeCells(t, { row: 2, column: 0, rows: 2, columns: 1 })).toMatchObject({ ok: false, why: expect.stringMatching(/3 rows/) })
    const merged = { ...t, merges: [{ row: 0, column: 1, rows: 1, columns: 2 }] }
    expect(mergeCells(merged, { row: 0, column: 2, rows: 1, columns: 2 })).toMatchObject({ ok: false, why: expect.stringMatching(/cut the cells already merged at row 1, columns 2 to 3/) })
    expect(mergeCells(merged, { row: 0, column: 1, rows: 1, columns: 2 })).toMatchObject({ ok: false, why: expect.stringMatching(/already merged/) })
  })

  it('a bigger merge takes in the merged areas inside it', () => {
    const r = mergeCells({ ...table(), merges: [{ row: 0, column: 1, rows: 1, columns: 2 }] }, { row: 0, column: 1, rows: 2, columns: 3 })
    expect(r.ok && r.parts.merges).toEqual([{ row: 0, column: 1, rows: 2, columns: 3 }])
  })

  it('a highlight on a covered cell goes (it could never show); the top-left one stays', () => {
    const r = mergeCells({ ...table(), highlights: [{ row: 0, column: 1, fill: '#FF0000' }, { row: 0, column: 2, fill: '#00FF00' }] }, { row: 0, column: 1, rows: 1, columns: 2 })
    expect(r.ok && r.parts.highlights).toEqual([{ row: 0, column: 1, fill: '#FF0000' }])
  })

  it('a stored list is never trusted: areas outside the grid, single cells and overlaps are not drawn', () => {
    expect(validMerges({ ...table(), merges: [{ row: 0, column: 0, rows: 1, columns: 2 }, { row: 0, column: 1, rows: 2, columns: 1 }, { row: 5, column: 0, rows: 1, columns: 2 }, { row: 1, column: 1, rows: 1, columns: 1 }] }))
      .toEqual([{ row: 0, column: 0, rows: 1, columns: 2 }])
  })
})

describe('unmerging', () => {
  it('the area touching the cells, or every area; the words stay in the top-left cell', () => {
    const t = { ...table(), merges: [{ row: -1, column: 1, rows: 1, columns: 2 }, { row: 1, column: 0, rows: 2, columns: 1 }] }
    const one = unmergeCells(t, { row: 2, column: 0, rows: 1, columns: 1 })
    expect(one.ok && one.parts.merges).toEqual([{ row: -1, column: 1, rows: 1, columns: 2 }])
    const all = unmergeCells(t)
    expect(all.ok && all.parts.merges).toBeUndefined()
    expect(all.ok && all.count).toBe(2)
    expect(unmergeCells(table())).toMatchObject({ ok: false, why: 'the table has no merged cells' })
  })
})

describe('merges follow their cells when the grid changes', () => {
  const t = { ...table(), merges: [{ row: 0, column: 1, rows: 2, columns: 1 }, { row: -1, column: 2, rows: 1, columns: 2 }], highlights: [{ row: 2, column: 3, fill: '#FF0000' }] }

  it('a row added inside an area makes it taller; below it, moves it down', () => {
    expect(insertRow(t, 1).merges).toEqual([{ row: 0, column: 1, rows: 3, columns: 1 }, { row: -1, column: 2, rows: 1, columns: 2 }])
    expect(insertRow(t, 0).merges![0]).toEqual({ row: 1, column: 1, rows: 2, columns: 1 })
    expect(insertRow(t, 0).highlights).toEqual([{ row: 3, column: 3, fill: '#FF0000' }])
  })

  it('the top row of an area removed: the words move down to the new top cell; one cell left = no merge', () => {
    const g = { ...t, rows: [['Basic', 'Same', '12', '14'], ['Pro', '', '22', '24'], ['Team', '30', '32', '34']] }
    const r = removeRow(g, 0)
    expect(r.rows[0]![1]).toBe('Same')
    expect(r.merges).toEqual([{ row: -1, column: 2, rows: 1, columns: 2 }])
    expect(r.highlights).toEqual([{ row: 1, column: 3, fill: '#FF0000' }])
  })

  it('columns: added inside an area widens it; the left column of an area removed keeps its words', () => {
    expect(insertColumn(t, 3, 'Q4').merges).toEqual([{ row: 0, column: 1, rows: 2, columns: 1 }, { row: -1, column: 2, rows: 1, columns: 3 }])
    const g = { ...t, header: ['Plan', 'Q1', 'Half', ''] }
    const r = removeColumn(g, 2)
    expect(r.header).toEqual(['Plan', 'Q1', 'Half'])
    expect(r.merges).toEqual([{ row: 0, column: 1, rows: 2, columns: 1 }])
    expect(r.highlights).toEqual([{ row: 2, column: 2, fill: '#FF0000' }])
  })

  it('sorting: a merge across one row travels with its row; a merge over several rows refuses the sort', () => {
    expect(reorderRows(t, [2, 1, 0])).toMatchObject({ ok: false, why: expect.stringMatching(/merged across rows \(rows 1 to 2, column 2\)/) })
    const flat = { ...table(), merges: [{ row: 0, column: 1, rows: 1, columns: 2 }], highlights: [{ row: 0, column: 0, fill: '#FF0000' }] }
    const r = reorderRows(flat, [2, 1, 0])
    expect(r.ok && r.parts.merges).toEqual([{ row: 2, column: 1, rows: 1, columns: 2 }])
    expect(r.ok && r.parts.highlights).toEqual([{ row: 2, column: 0, fill: '#FF0000' }])
    expect(r.ok && r.parts.rows[2]![0]).toBe('Basic')
  })

  it('areas are named the way people count', () => {
    expect(describeArea({ row: -1, column: 0, rows: 1, columns: 2 })).toBe('the header, columns 1 to 2')
    expect(describeArea({ row: 2, column: 3, rows: 2, columns: 1 })).toBe('rows 3 to 4, column 4')
    expect(describeArea({ row: -1, column: 0, rows: 2, columns: 1 })).toBe('the header and row 1, column 1')
  })
})

describe('where the words sit in a cell', () => {
  it('defaults: left and middle; a header merged across columns centred; a setting of the cell itself wins; a merged area through its top-left cell', () => {
    expect(alignOf(table(), 0, 1)).toEqual({ h: 'left', v: 'middle' })
    expect(alignOf({ ...table(), merges: [{ row: -1, column: 1, rows: 1, columns: 3 }] }, -1, 1)).toEqual({ h: 'center', v: 'middle' })
    const g = alignCells({ ...table(), merges: [{ row: 0, column: 1, rows: 1, columns: 2 }] }, { row: 0, column: 0, rows: 2, columns: 4 }, { h: 'right' })
    expect(alignOf({ ...table(), ...g }, 1, 3)).toEqual({ h: 'right', v: 'middle' })
    expect(g.aligns!.some((a) => a.row === 0 && a.column === 2)).toBe(false) // a covered cell keeps nothing
    const v = alignCells({ ...table(), ...g }, { row: 1, column: 3, rows: 1, columns: 1 }, { v: 'bottom' })
    expect(alignOf({ ...table(), ...v }, 1, 3)).toEqual({ h: 'right', v: 'bottom' }) // the other part stays
  })
  it('alignment follows its cell when rows and columns change or the rows are sorted', () => {
    const t = { ...table(), aligns: [{ row: 1, column: 2, h: 'right' as const }] }
    expect(insertRow(t, 0).aligns).toEqual([{ row: 2, column: 2, h: 'right' }])
    expect(removeColumn(t, 0).aligns).toEqual([{ row: 1, column: 1, h: 'right' }])
    expect(removeRow(t, 1).aligns).toBeUndefined()
    const r = reorderRows(t, [2, 1, 0]); expect(r.ok && r.parts.aligns).toEqual([{ row: 1, column: 2, h: 'right' }])
  })
})
