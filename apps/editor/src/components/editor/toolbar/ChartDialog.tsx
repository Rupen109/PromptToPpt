import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, X } from '@prompttoppt/ui/icons'
import type { SlideElement } from '@prompttoppt/validation'
import { Portal } from '@/components/Portal'
import * as T from '@/editor/toolbar-commands'
import { useDoc } from '@/editor/store'
import { useDialog } from '@/lib/useDialog'

type ChartEl = Extract<SlideElement, { type: 'chart' }>

/** One text or number box: keeps what is being typed and saves when you leave it (a change elsewhere, like undo, shows up once it is not focused). */
function Field({ label, value, onSave, number, narrow, max = 80 }: { label: string; value: string; onSave: (v: string) => void; number?: boolean; narrow?: boolean; max?: number }) {
  const [text, setText] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (document.activeElement !== ref.current) setText(value) }, [value])
  return <input ref={ref} aria-label={label} value={text} maxLength={max} inputMode={number ? 'decimal' : undefined} onChange={(e) => setText(e.target.value)} onBlur={() => { if (text !== value) onSave(text) }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    className={`h-9 px-2 border border-border rounded-md text-sm bg-white ${narrow ? 'w-24' : 'w-full min-w-[110px]'}`} />
}

/** Edit a chart's categories, series and figures (double-click a chart, "Edit data", or the "Sample data" tag). Every change is one undo step; "Done" says these are the person's own figures. */
export function ChartDialog({ slideId, elementId, onClose }: { slideId: string; elementId: string; onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(true, onClose)
  const el = useDoc((s) => s.doc?.slides.find((x) => x.id === slideId)?.elements.find((e) => e.id === elementId)) as ChartEl | undefined
  const apply = useDoc((s) => s.apply)
  if (!el || el.type !== 'chart') return null
  const circular = el.chartType === 'pie' || el.chartType === 'doughnut'
  return (
    <Portal><div className="fixed inset-0 z-[70] bg-black/40 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Edit chart data" data-testid="chart-dialog" className="bg-white rounded-2xl w-full max-w-3xl max-h-[86vh] overflow-auto p-5 shadow-xl outline-none">
        <div className="flex items-center justify-between mb-3"><h2 className="font-heading font-bold text-xl">Edit chart data</h2><button onClick={onClose} aria-label="Close" className="text-slate-500"><X aria-hidden size={20} /></button></div>
        {el.placeholder && <p data-testid="chart-dialog-sample" className="mb-3 text-sm rounded-lg bg-amber-50 text-amber-900 border border-amber-200 px-3 py-2">These are sample figures, not real ones. Type your own, then press Done.</p>}
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="p-0 text-left text-xs text-slate-500 font-medium pr-2">Category</th>
                {el.series.map((s, si) => (
                  <th key={si} className="p-0 align-top"><div className="flex items-center gap-1">
                    <Field label={`Series ${si + 1} name`} value={s.name} onSave={(v) => apply('Edit chart', (d) => T.setChartSeriesName(d, slideId, elementId, si, v))} />
                    {!circular && <button aria-label={`Delete series ${si + 1}`} disabled={el.series.length <= 1} onClick={() => apply('Delete series', (d) => T.removeChartSeries(d, slideId, elementId, si))} className="text-slate-500 disabled:opacity-30"><Trash2 aria-hidden size={14} /></button>}
                  </div></th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {el.labels.map((l, i) => (
                <tr key={i}>
                  <td className="p-0"><Field label={`Category ${i + 1}`} value={l} onSave={(v) => apply('Edit chart', (d) => T.setChartLabel(d, slideId, elementId, i, v))} /></td>
                  {el.series.map((s, si) => (
                    <td key={si} className="p-0"><Field number max={20} label={`Series ${si + 1} value ${i + 1}`} value={String(s.values[i] ?? 0)} onSave={(v) => { const n = Number(v.replace(/,/g, '').trim()); if (v.trim() !== '' && Number.isFinite(n)) apply('Edit chart', (d) => T.setChartValue(d, slideId, elementId, si, i, n)) }} /></td>
                  ))}
                  <td className="pl-1"><button aria-label={`Delete category ${i + 1}`} disabled={el.labels.length <= 1} onClick={() => apply('Delete category', (d) => T.removeChartRow(d, slideId, elementId, i))} className="text-slate-500 disabled:opacity-30"><Trash2 aria-hidden size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button onClick={() => apply('Add category', (d) => T.addChartRow(d, slideId, elementId))} disabled={el.labels.length >= T.CHART_MAX_LABELS} className="h-9 px-3 rounded-lg border border-border text-sm inline-flex items-center gap-1.5 disabled:opacity-40"><Plus aria-hidden size={14} />Category</button>
          {!circular && <button onClick={() => apply('Add series', (d) => T.addChartSeries(d, slideId, elementId))} disabled={el.series.length >= T.CHART_MAX_SERIES} className="h-9 px-3 rounded-lg border border-border text-sm inline-flex items-center gap-1.5 disabled:opacity-40"><Plus aria-hidden size={14} />Series</button>}
          <label className="text-sm text-slate-600 inline-flex items-center gap-2 ml-2">Unit <Field narrow max={16} label="Unit" value={el.unit ?? ''} onSave={(v) => apply('Edit chart', (d) => T.setChartUnit(d, slideId, elementId, v))} /></label>
          <button data-testid="chart-dialog-done" onClick={() => { apply('Edit chart', (d) => T.confirmChartData(d, slideId, elementId)); onClose() }} className="ml-auto h-9 px-5 rounded-lg bg-foreground text-white text-sm font-semibold">Done</button>
        </div>
      </div>
    </div></Portal>
  )
}
