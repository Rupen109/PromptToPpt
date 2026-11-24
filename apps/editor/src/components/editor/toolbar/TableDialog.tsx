import { useEffect, useRef, useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, Plus, TableCellsMerge, TableCellsSplit, Trash2, X } from '@prompttoppt/ui/icons'
import { alignOf, areaProblem, cellSpans, mergeAt, type CellArea, type SlideElement } from '@prompttoppt/validation'
import { Portal } from '@/components/Portal'
import * as T from '@/editor/toolbar-commands'
import { useDoc } from '@/editor/store'
import { useDialog } from '@/lib/useDialog'

type TableEl = Extract<SlideElement, { type: 'table' }>

/** One cell: keeps what is being typed (a change elsewhere, like undo or a collaborator, shows up as soon as the cell is not focused) and saves when you leave it. */
function Cell({ label, value, header, selected, onSave, onPick }: { label: string; value: string; header: boolean; selected: boolean; onSave: (v: string) => void; onPick: (e: { shiftKey: boolean; altKey: boolean; key?: string }) => void }) {
  const [text, setText] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (document.activeElement !== ref.current) setText(value) }, [value])
  return <input ref={ref} aria-label={label} aria-selected={selected} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} onBlur={() => { if (text !== value) onSave(text) }}
    onMouseDown={(e) => { if (e.shiftKey) { e.preventDefault(); onPick({ shiftKey: true, altKey: false }) } }} onFocus={() => onPick({ shiftKey: false, altKey: false })}
    onKeyDown={(e) => { if (e.key === 'Enter') ref.current?.blur(); else if (e.shiftKey && e.altKey && e.key.startsWith('Arrow')) { e.preventDefault(); onPick({ shiftKey: true, altKey: true, key: e.key }) } }}
    className={`w-full h-full min-w-[110px] min-h-9 px-2 border rounded-md text-sm ${selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-border'} ${header ? 'font-semibold bg-slate-50' : 'bg-white'}`} />
}

type Pick = { r0: number; c0: number; r1: number; c1: number }
/** the selected block as an area, grown to take in every merged area it touches (as PowerPoint selects): a merge can then never be cut in two */
function areaOf(el: TableEl, p: Pick): CellArea {
  let a = { row: Math.min(p.r0, p.r1), column: Math.min(p.c0, p.c1), rows: Math.abs(p.r1 - p.r0) + 1, columns: Math.abs(p.c1 - p.c0) + 1 }
  for (let grew = true; grew;) {
    grew = false
    for (let r = a.row; r < a.row + a.rows; r++) for (let c = a.column; c < a.column + a.columns; c++) {
      const m = mergeAt(el, r, c)
      if (!m) continue
      const row = Math.min(a.row, m.row), column = Math.min(a.column, m.column)
      const next = { row, column, rows: Math.max(a.row + a.rows, m.row + m.rows) - row, columns: Math.max(a.column + a.columns, m.column + m.columns) - column }
      if (next.row !== a.row || next.column !== a.column || next.rows !== a.rows || next.columns !== a.columns) { a = next; grew = true }
    }
  }
  return a
}

/** Edit a table's words, rows and columns (double-click a table, or Table → Edit table). Every change is one undo step. */
export function TableDialog({ slideId, elementId, onClose }: { slideId: string; elementId: string; onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(true, onClose)
  const el = useDoc((s) => s.doc?.slides.find((x) => x.id === slideId)?.elements.find((e) => e.id === elementId)) as TableEl | undefined
  const apply = useDoc((s) => s.apply)
  const [pick, setPick] = useState<Pick | null>(null)
  const [note, setNote] = useState('')
  if (!el || el.type !== 'table') return null
  const cols = el.header.length
  const span = cellSpans(el)
  const area = pick ? areaOf(el, pick) : null
  const isSel = (r: number, c: number) => !!area && r >= area.row && r < area.row + area.rows && c >= area.column && c < area.column + area.columns
  const cells = area ? area.rows * area.columns : 0
  const mergeWhy = !area || cells < 2 ? 'Select two cells or more: click a cell, then Shift+click another' : areaProblem(el, area)
  const touched = !!area && [...Array(area.rows)].some((_, i) => [...Array(area.columns)].some((__, j) => !!mergeAt(el, area.row + i, area.column + j)))
  const onPick = (r: number, c: number) => (e: { shiftKey: boolean; altKey: boolean; key?: string }) => {
    setNote('')
    if (!e.shiftKey || !pick) { setPick({ r0: r, c0: c, r1: r, c1: c }); return }
    if (e.key) { // Shift+Alt+arrow: grow the selection from the keyboard
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key as 'ArrowUp'] ?? [0, 0]
      setPick({ ...pick, r1: Math.max(-1, Math.min(el.rows.length - 1, pick.r1 + d[0]!)), c1: Math.max(0, Math.min(cols - 1, pick.c1 + d[1]!)) })
      return
    }
    setPick({ ...pick, r1: r, c1: c })
  }
  const merge = () => { if (!area) return; let why: string | null = null; apply('Merge cells', (d) => { why = T.mergeTableCells(d, slideId, elementId, area) }); setNote(why ? `Cannot merge: ${why}.` : 'Merged. The words of the cells are kept in one cell.'); if (!why) setPick({ r0: area.row, c0: area.column, r1: area.row, c1: area.column }) }
  // where the words sit in the selected cells (a merged area through its top-left cell); the buttons show what the first selected cell has now
  const now = area ? alignOf(el, area.row, area.column) : null
  const align = (set: { h?: 'left' | 'center' | 'right'; v?: 'top' | 'middle' | 'bottom' }) => { if (!area) return; apply('Align cells', (d) => void T.alignTableCells(d, slideId, elementId, area, set)) }
  const AL = [['left', 'Align left', AlignLeft], ['center', 'Centre', AlignCenter], ['right', 'Align right', AlignRight]] as const
  const VA = [['top', 'Top', AlignVerticalJustifyStart], ['middle', 'Middle', AlignVerticalJustifyCenter], ['bottom', 'Bottom', AlignVerticalJustifyEnd]] as const
  const unmerge = () => { if (!area) return; let why: string | null = null; apply('Unmerge cells', (d) => { why = T.unmergeTableCells(d, slideId, elementId, area) }); setNote(why ? `Cannot unmerge: ${why}.` : 'Unmerged.') }
  const cell = (row: number, col: number, value: string, header = false) => {
    const sp = span(row, col)
    if (sp.covered) return null
    const merged = sp.rows > 1 || sp.columns > 1
    const Tag = header ? 'th' : 'td'
    return (
      <Tag key={`${row}:${col}`} className="p-0 align-top" {...(sp.rows > 1 ? { rowSpan: sp.rows } : {})} {...(sp.columns > 1 ? { colSpan: sp.columns } : {})}>
        <Cell header={header} value={value} selected={isSel(row, col)} label={`${header ? `Header ${col + 1}` : `Row ${row + 1} column ${col + 1}`}${merged ? ` (merged ${sp.rows > 1 ? `${sp.rows} rows` : ''}${sp.rows > 1 && sp.columns > 1 ? ' by ' : ''}${sp.columns > 1 ? `${sp.columns} columns` : ''})` : ''}`}
          onPick={onPick(row, col)} onSave={(v) => apply('Edit table', (d) => T.setTableCell(d, slideId, elementId, row, col, v))} />
      </Tag>
    )
  }
  return (
    <Portal><div className="fixed inset-0 z-[70] bg-black/40 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Edit table" className="bg-white rounded-2xl w-full max-w-3xl max-h-[86vh] overflow-auto p-5 shadow-xl outline-none">
        <div className="flex items-center justify-between mb-3"><h2 className="font-heading font-bold text-xl">Edit table</h2><button onClick={onClose} aria-label="Close" className="text-slate-500"><X aria-hidden size={20} /></button></div>
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1">
            <thead>
              <tr>{el.header.map((h, c) => cell(-1, c, h, true))}<th /></tr>
              <tr>{el.header.map((_, c) => <th key={c} className="p-0 text-center"><button aria-label={`Delete column ${c + 1}`} disabled={cols <= 1} onClick={() => { setPick(null); apply('Delete column', (d) => T.removeTableColumn(d, slideId, elementId, c)) }} className="text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash2 aria-hidden size={14} /></button></th>)}<th /></tr>
            </thead>
            <tbody>
              {el.rows.map((r, ri) => (
                <tr key={ri}>{r.map((v, c) => cell(ri, c, v))}
                  <td className="pl-1"><button aria-label={`Delete row ${ri + 1}`} disabled={el.rows.length <= 1} onClick={() => { setPick(null); apply('Delete row', (d) => T.removeTableRow(d, slideId, elementId, ri)) }} className="text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash2 aria-hidden size={14} /></button></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500" aria-live="polite">{note || 'Click a cell (Shift+click for more, or Shift+Alt+arrow keys), then align or merge them.'}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={() => apply('Add row', (d) => T.addTableRow(d, slideId, elementId))} disabled={el.rows.length >= 20} className="h-9 px-3 rounded-lg border border-border text-sm inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-40"><Plus aria-hidden size={14} />Add row</button>
          <button onClick={() => apply('Add column', (d) => T.addTableColumn(d, slideId, elementId))} disabled={cols >= 8} className="h-9 px-3 rounded-lg border border-border text-sm inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-40"><Plus aria-hidden size={14} />Add column</button>
          <div role="group" aria-label="Align the selected cells" className="inline-flex rounded-lg border border-border overflow-hidden">
            {AL.map(([v, label, Icon]) => <button key={v} type="button" aria-label={label} title={area ? label : 'Select cells first'} aria-pressed={now?.h === v} disabled={!area} onClick={() => align({ h: v })} className={`h-9 w-9 grid place-items-center hover:bg-slate-50 disabled:opacity-40 ${now?.h === v ? 'bg-slate-100' : ''}`}><Icon aria-hidden size={15} /></button>)}
            {VA.map(([v, label, Icon]) => <button key={v} type="button" aria-label={`${label} of the cell`} title={area ? `${label} of the cell` : 'Select cells first'} aria-pressed={now?.v === v} disabled={!area} onClick={() => align({ v })} className={`h-9 w-9 grid place-items-center border-l border-border hover:bg-slate-50 disabled:opacity-40 ${now?.v === v ? 'bg-slate-100' : ''}`}><Icon aria-hidden size={15} /></button>)}
          </div>
          <button onClick={merge} disabled={!!mergeWhy} title={mergeWhy ?? 'Merge the selected cells into one'} className="h-9 px-3 rounded-lg border border-border text-sm inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-40"><TableCellsMerge aria-hidden size={14} />Merge cells</button>
          <button onClick={unmerge} disabled={!touched} title={touched ? 'Split the merged cells back into single cells' : 'Select a merged cell first'} className="h-9 px-3 rounded-lg border border-border text-sm inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-40"><TableCellsSplit aria-hidden size={14} />Unmerge</button>
          <button onClick={onClose} className="ml-auto h-9 px-5 rounded-lg bg-foreground text-white text-sm font-semibold">Done</button>
        </div>
      </div>
    </div></Portal>
  )
}
