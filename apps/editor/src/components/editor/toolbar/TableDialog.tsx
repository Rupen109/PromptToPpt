import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, X } from '@prompttoppt/ui/icons'
import type { SlideElement } from '@prompttoppt/validation'
import { Portal } from '@/components/Portal'
import * as T from '@/editor/toolbar-commands'
import { useDoc } from '@/editor/store'
import { useDialog } from '@/lib/useDialog'

type TableEl = Extract<SlideElement, { type: 'table' }>

/** One cell: keeps what is being typed (a change elsewhere, like undo or a collaborator, shows up as soon as the cell is not focused) and saves when you leave it. */
function Cell({ label, value, header, onSave }: { label: string; value: string; header: boolean; onSave: (v: string) => void }) {
  const [text, setText] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (document.activeElement !== ref.current) setText(value) }, [value])
  return <input ref={ref} aria-label={label} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} onBlur={() => { if (text !== value) onSave(text) }} onKeyDown={(e) => e.key === 'Enter' && ref.current?.blur()}
    className={`w-full min-w-[110px] h-9 px-2 border border-border rounded-md text-sm ${header ? 'font-semibold bg-slate-50' : 'bg-white'}`} />
}

/** Edit a table's words, rows and columns (double-click a table, or Table → Edit table). Every change is one undo step. */
export function TableDialog({ slideId, elementId, onClose }: { slideId: string; elementId: string; onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(true, onClose)
  const el = useDoc((s) => s.doc?.slides.find((x) => x.id === slideId)?.elements.find((e) => e.id === elementId)) as TableEl | undefined
  const apply = useDoc((s) => s.apply)
  if (!el || el.type !== 'table') return null
  const cols = el.header.length
  const cell = (row: number, col: number, value: string, header = false) => (
    <Cell key={`${row}:${col}`} header={header} value={value} label={header ? `Header ${col + 1}` : `Row ${row + 1} column ${col + 1}`}
      onSave={(v) => apply('Edit table', (d) => T.setTableCell(d, slideId, elementId, row, col, v))} />
  )
  return (
    <Portal><div className="fixed inset-0 z-[70] bg-black/40 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Edit table" className="bg-white rounded-2xl w-full max-w-3xl max-h-[86vh] overflow-auto p-5 shadow-xl outline-none">
        <div className="flex items-center justify-between mb-3"><h2 className="font-heading font-bold text-xl">Edit table</h2><button onClick={onClose} aria-label="Close" className="text-slate-500"><X aria-hidden size={20} /></button></div>
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1">
            <thead>
              <tr>{el.header.map((h, c) => <th key={c} className="p-0 align-top">{cell(-1, c, h, true)}</th>)}<th /></tr>
              <tr>{el.header.map((_, c) => <th key={c} className="p-0 text-center"><button aria-label={`Delete column ${c + 1}`} disabled={cols <= 1} onClick={() => apply('Delete column', (d) => T.removeTableColumn(d, slideId, elementId, c))} className="text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash2 aria-hidden size={14} /></button></th>)}<th /></tr>
            </thead>
            <tbody>
              {el.rows.map((r, ri) => (
                <tr key={ri}>{r.map((v, c) => <td key={c} className="p-0">{cell(ri, c, v)}</td>)}
                  <td className="pl-1"><button aria-label={`Delete row ${ri + 1}`} disabled={el.rows.length <= 1} onClick={() => apply('Delete row', (d) => T.removeTableRow(d, slideId, elementId, ri))} className="text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash2 aria-hidden size={14} /></button></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={() => apply('Add row', (d) => T.addTableRow(d, slideId, elementId))} disabled={el.rows.length >= 20} className="h-9 px-3 rounded-lg border border-border text-sm inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-40"><Plus aria-hidden size={14} />Add row</button>
          <button onClick={() => apply('Add column', (d) => T.addTableColumn(d, slideId, elementId))} disabled={cols >= 8} className="h-9 px-3 rounded-lg border border-border text-sm inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-40"><Plus aria-hidden size={14} />Add column</button>
          <button onClick={onClose} className="ml-auto h-9 px-5 rounded-lg bg-foreground text-white text-sm font-semibold">Done</button>
        </div>
      </div>
    </div></Portal>
  )
}
