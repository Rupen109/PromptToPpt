import { useState } from 'react'
import { describeSlides, parseSlideRange, type ExportFormat } from '@prompttoppt/validation'

const FORMATS: { f: ExportFormat; label: string; note: string }[] = [
  { f: 'pptx', label: 'PPTX', note: 'PowerPoint, editable' },
  { f: 'pdf', label: 'PDF', note: 'one page per slide' },
  { f: 'png', label: 'PNG', note: 'pictures' },
  { f: 'jpg', label: 'JPG', note: 'pictures, smaller' },
  { f: 'html', label: 'HTML', note: 'web page' },
]
type Scope = 'all' | 'current' | 'range'

/**
 * The Export menu: WHICH slides (all, the slide on screen, or a range typed like "1-3, 5"), then the format. A range is read by the same reader as the API and the assistant
 * (packages/validation slide-range.ts) and is checked while it is typed, so a format is never pressed with slides that do not exist.
 */
export function ExportMenu({ total, current, initial, allowed, onExport }: {
  total: number
  /** the number of the slide on screen (1-based) */
  current: number
  initial: 'all' | 'current'
  /** the formats the plan includes (the others show PRO and open the upgrade from the API) */
  allowed: readonly string[] | null
  onExport: (format: ExportFormat, numbers: number[] | null) => void
}) {
  const [scope, setScope] = useState<Scope>(total === 1 ? 'all' : initial)
  const [range, setRange] = useState('')
  const parsed = scope === 'range' ? parseSlideRange(range, total) : null
  const numbers = scope === 'all' ? null : scope === 'current' ? [current] : parsed?.ok ? parsed.numbers : null
  const blocked = scope === 'range' && !parsed?.ok
  const what = numbers ? describeSlides(numbers, total) : describeSlides([], total)
  const radio = 'flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm'

  return (
    <div role="dialog" aria-label="Export" data-testid="export-menu" className="absolute right-0 mt-2 w-72 bg-white border border-border rounded-xl shadow-lg p-2 z-30">
      {total > 1 && (
        <fieldset className="pb-2 mb-2 border-b border-border">
          <legend className="px-2 pb-1 text-xs font-semibold text-slate-500">Slides</legend>
          <label className={radio}><input type="radio" name="export-scope" checked={scope === 'all'} onChange={() => setScope('all')} />All slides <span className="text-slate-500">({total})</span></label>
          <label className={radio}><input type="radio" name="export-scope" checked={scope === 'current'} onChange={() => setScope('current')} />This slide <span className="text-slate-500">({current})</span></label>
          <label className={radio}>
            <input type="radio" name="export-scope" checked={scope === 'range'} onChange={() => setScope('range')} />Slides
            <input aria-label="Slides to export" data-testid="export-range" placeholder="e.g. 1-3, 5" value={range} onFocus={() => setScope('range')} onChange={(e) => setRange(e.target.value)}
              className={`ml-1 flex-1 min-w-0 h-7 border rounded-md px-2 text-sm ${scope === 'range' && range && !parsed?.ok ? 'border-red-400' : 'border-border'}`} />
          </label>
          {scope === 'range' && range && parsed && !parsed.ok && <p role="alert" className="px-2 pt-1 text-xs text-red-700">{parsed.why}</p>}
        </fieldset>
      )}
      <div role="menu" aria-label={`Download ${what} as`}>
        {FORMATS.map(({ f, label, note }) => (
          <button key={f} role="menuitem" disabled={blocked} title={blocked ? 'Type the slides first' : `Download ${what} as ${label}`} onClick={() => onExport(f, numbers)}
            className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent">
            <span className="font-semibold w-10">{label}</span><span className="text-xs text-slate-500">{note}</span>
            {allowed && !allowed.includes(f) && <span className="ml-auto text-[10px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">PRO</span>}
          </button>
        ))}
      </div>
      {numbers && numbers.length > 0 && numbers.length < total && <p className="px-3 pt-1 text-xs text-slate-500" data-testid="export-what">Downloads {what}, numbered as in the deck.</p>}
    </div>
  )
}
