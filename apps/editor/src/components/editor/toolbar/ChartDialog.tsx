import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, X } from '@prompttoppt/ui/icons'
import { CHART_TYPES, canStack, chartLookOn, chartShowsFigures, chartTypeProblem, type SlideElement, type Theme } from '@prompttoppt/validation'
import { Chart } from '@prompttoppt/ui'
import { slideBase } from '@prompttoppt/theme'
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
  const slide = useDoc((s) => s.doc?.slides.find((x) => x.id === slideId))
  const el = slide?.elements.find((e) => e.id === elementId) as ChartEl | undefined
  const apply = useDoc((s) => s.apply)
  const theme = useDoc((s) => s.doc?.theme)
  if (!el || el.type !== 'chart' || !theme || !slide) return null
  const circular = el.chartType === 'pie' || el.chartType === 'doughnut'
  // what the chart shows now for each series or slice (the deck's own colours on this slide, chart-style.ts, unless the person chose)
  const deckLook = chartLookOn(slideBase(theme, slide).colors, slide) // (the slide's own brand, then its own look)
  const deck = deckLook.palette
  // the preview is the chart AT ITS REAL SIZE, scaled down: every label sits exactly where the slide puts it (a chart re-drawn at preview size would crowd its labels differently)
  const previewW = 340
  const previewScale = previewW / el.width
  const marks = circular ? el.labels : el.series.map((s, i) => s.name || `Series ${i + 1}`)
  const shown = marks.map((_, i) => el.colors?.[i] ?? deck[i % deck.length]!)
  return (
    <Portal><div className="fixed inset-0 z-[70] bg-black/40 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Edit chart data" data-testid="chart-dialog" className="bg-white rounded-2xl w-full max-w-3xl max-h-[86vh] overflow-auto p-5 shadow-xl outline-none">
        <div className="flex items-center justify-between mb-3"><h2 className="font-heading font-bold text-xl">Edit chart data</h2><button onClick={onClose} aria-label="Close" className="text-slate-500"><X aria-hidden size={20} /></button></div>
        <p className="mb-3 text-sm text-slate-600">{circular ? 'Each row is one slice of the circle.' : 'Each row is a category (what you compare), each column a series (what you compare it across).'} The chart on the right updates as you type.</p>
        {el.placeholder && <p data-testid="chart-dialog-sample" className="mb-3 text-sm rounded-lg bg-amber-50 text-amber-900 border border-amber-200 px-3 py-2">These are sample figures, not real ones. Type your own, then press Done.</p>}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="overflow-x-auto lg:flex-1">
          <table className="border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="p-0 pr-2 text-left align-bottom">
                  <div className="flex items-center gap-1.5 pb-1">
                    <span className="text-xs font-medium text-slate-500">{circular ? 'Slice' : 'Category'}</span>
                    {/* adding a category belongs where the categories are, not at the far bottom of the window */}
                    <button onClick={() => apply('Add category', (d) => T.addChartRow(d, slideId, elementId))} disabled={el.labels.length >= T.CHART_MAX_LABELS} aria-label={circular ? 'Add slice' : 'Add category'} title={circular ? 'Add a slice' : 'Add a category'} className="grid h-6 w-6 place-items-center rounded-md border border-border text-slate-600 hover:border-primary hover:text-primary disabled:opacity-40"><Plus aria-hidden size={13} /></button>
                  </div>
                </th>
                {el.series.map((s, si) => (
                  <th key={si} className="p-0 align-top"><div className="flex items-center gap-1">
                    <Field label={`Series ${si + 1} name`} value={s.name} onSave={(v) => apply('Edit chart', (d) => T.setChartSeriesName(d, slideId, elementId, si, v))} />
                    {!circular && <button aria-label={`Delete series ${si + 1}`} disabled={el.series.length <= 1} onClick={() => apply('Delete series', (d) => T.removeChartSeries(d, slideId, elementId, si))} className="text-slate-500 disabled:opacity-30"><Trash2 aria-hidden size={14} /></button>}
                  </div></th>
                ))}
                <th className="p-0 align-bottom">
                  {!circular && <button onClick={() => apply('Add series', (d) => T.addChartSeries(d, slideId, elementId))} disabled={el.series.length >= T.CHART_MAX_SERIES} aria-label="Add series" title="Add a series (another column)" className="mb-1 ml-1 grid h-6 w-6 place-items-center rounded-md border border-border text-slate-600 hover:border-primary hover:text-primary disabled:opacity-40"><Plus aria-hidden size={13} /></button>}
                </th>
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
              <tr>
                <td className="p-0 pt-1">
                  <button onClick={() => apply('Add category', (d) => T.addChartRow(d, slideId, elementId))} disabled={el.labels.length >= T.CHART_MAX_LABELS} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40"><Plus aria-hidden size={14} />{circular ? 'Add slice' : 'Add category'}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {/* the chart exactly as the slide draws it (same renderer, same colours): what the figures mean is easier to see than to imagine */}
        <figure data-testid="chart-preview" className="shrink-0 overflow-hidden rounded-xl border border-border p-2" style={{ background: deckLook.backdrop[0] ?? '#fff' }}>
          <div style={{ width: previewW, height: Math.round(el.height * previewScale) }}>
            <div style={{ width: el.width, height: el.height, transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
              <Chart chartType={el.chartType} labels={el.labels} series={el.series} unit={el.unit} width={el.width} height={el.height} theme={{ ...theme, colors: deckLook.colors as Theme['colors'] }} backdrop={deckLook.backdrop} colors={el.colors} legend={el.legend} trendline={el.trendline} dataLabels={el.dataLabels} stack={el.stack} />
            </div>
          </div>
          <figcaption className="sr-only">This chart as the slide draws it</figcaption>
        </figure>
        </div>
        <section aria-label="Chart style" data-testid="chart-style" className="mt-5 border-t border-border pt-4">
          <h3 className="font-heading font-bold text-base mb-2">Style</h3>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-600">{circular ? 'Slice colours' : 'Series colours'}</span>
              {marks.map((m, i) => (
                <label key={i} className="inline-flex items-center gap-1.5">
                  <input type="color" aria-label={`Colour of ${m}`} value={shown[i]} onChange={(e) => apply('Chart colour', (d) => T.setChartColor(d, slideId, elementId, i, e.target.value, deck), { mergeKey: `chart-colour:${elementId}:${i}` })} className="h-8 w-10 p-0.5 border border-border rounded-md bg-white" />
                  <span className="max-w-[110px] truncate">{m}</span>
                </label>
              ))}
              {el.colors && <button onClick={() => apply('Chart colours', (d) => T.resetChartColors(d, slideId, elementId))} className="h-8 px-2 rounded-md border border-border">Use deck colours</button>}
            </div>
            <label className="inline-flex items-center gap-2">Legend
              <select aria-label="Legend" value={el.legend ?? 'auto'} onChange={(e) => apply('Chart legend', (d) => T.setChartLegend(d, slideId, elementId, e.target.value === 'auto' ? null : (e.target.value as 'none' | 'bottom' | 'right')))} className="h-9 px-2 border border-border rounded-md bg-white">
                <option value="auto">Automatic</option><option value="bottom">Bottom</option><option value="right">Right</option><option value="none">None</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-2">Type
              <select aria-label="Chart type" value={el.chartType} onChange={(e) => { let why: string | null = null; apply('Chart type', (d) => { why = T.setChartType(d, slideId, elementId, e.target.value as (typeof CHART_TYPES)[number]) }); if (why) window.alert(`This chart cannot be shown that way: ${why}.`) }} className="border border-border rounded-md px-2 py-1">
                {CHART_TYPES.map((t) => { const why = chartTypeProblem(el, t); return <option key={t} value={t} disabled={!!why} title={why ?? undefined}>{({ bar: 'Bar', line: 'Line', area: 'Area', scatter: 'Scatter (X, Y)', pie: 'Pie', doughnut: 'Doughnut' } as const)[t]}{why ? ' (not for this data)' : ''}</option> })}
              </select>
            </label>
            {el.chartType === 'scatter' && <span className="text-xs text-slate-500">The first column holds the X values (numbers).</span>}
            {el.chartType === 'bar' && <label className="inline-flex items-center gap-2" title={canStack(el) ? undefined : 'Add a second series to stack the bars'}>Bars
              <select aria-label="Bars" value={canStack(el) ? (el.stack ?? 'side') : 'side'} disabled={!canStack(el)} onChange={(e) => apply('Chart bars', (d) => T.setChartStack(d, slideId, elementId, e.target.value === 'side' ? null : (e.target.value as 'stacked' | 'percent')))} className="h-9 px-2 border border-border rounded-md bg-white disabled:opacity-50">
                <option value="side">Side by side</option><option value="stacked">Stacked</option><option value="percent">100% stacked</option>
              </select>
            </label>}
            {!circular && !(el.stack && canStack(el)) && <label className="inline-flex items-center gap-2"><input type="checkbox" aria-label="Trend line" checked={!!el.trendline} onChange={(e) => apply('Chart trend line', (d) => T.setChartTrendline(d, slideId, elementId, e.target.checked))} />Trend line</label>}
            <label className="inline-flex items-center gap-2"><input type="checkbox" aria-label="Show figures" checked={chartShowsFigures(el)} onChange={(e) => apply('Chart figures', (d) => T.setChartDataLabels(d, slideId, elementId, e.target.checked))} />Show the figures</label>
          </div>
        </section>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <label className="text-sm text-slate-600 inline-flex items-center gap-2">Unit <Field narrow max={16} label="Unit" value={el.unit ?? ''} onSave={(v) => apply('Edit chart', (d) => T.setChartUnit(d, slideId, elementId, v))} /></label>
          <button data-testid="chart-dialog-done" onClick={() => { apply('Edit chart', (d) => T.confirmChartData(d, slideId, elementId)); onClose() }} className="ml-auto h-9 px-5 rounded-lg bg-foreground text-white text-sm font-semibold">Done</button>
        </div>
      </div>
    </div></Portal>
  )
}
