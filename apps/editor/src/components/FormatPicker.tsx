import { ASPECT_RATIOS, type AspectRatio } from '@prompttoppt/validation'

/** The four shapes a presentation can have. One list for every screen that asks (Create from scratch, Remix, Remix a PowerPoint). */
export const FORMATS: Record<AspectRatio, { name: string; hint: string; box: string }> = {
  '16:9': { name: 'Widescreen', hint: 'Screens and projectors', box: 'w-9 h-5' },
  '4:3': { name: 'Standard', hint: 'Classic slides and print', box: 'w-8 h-6' },
  '1:1': { name: 'Square', hint: 'Social posts', box: 'w-6 h-6' },
  '9:16': { name: 'Vertical', hint: 'Stories, reels and phones', box: 'w-[18px] h-8' },
}

/** A row of the four shapes. `current` marks the shape the thing already has ("now"), for a remix. */
export function FormatPicker({ value, onChange, label = 'Format', current, cols = 4 }: { value: AspectRatio; onChange: (a: AspectRatio) => void; label?: string; current?: AspectRatio; /** 2 in a narrow dialog */ cols?: 2 | 4 }) {
  return (
    <div className="mt-4">
      <div className="text-sm" id="format-label">{label}</div>
      <div role="radiogroup" aria-labelledby="format-label" className={`mt-1.5 grid grid-cols-2 gap-2 ${cols === 4 ? 'sm:grid-cols-4' : ''}`}>
        {ASPECT_RATIOS.map((a) => {
          const on = value === a
          return (
            <button key={a} type="button" role="radio" aria-checked={on} data-testid={`format-${a}`} onClick={() => onChange(a)} className={`flex items-center gap-2.5 rounded-xl border bg-white px-3 py-2 text-left transition ${on ? 'border-primary ring-2 ring-primary/25' : 'border-border hover:border-slate-400'}`}>
              <span className="w-6 grid place-items-center shrink-0"><span className={`${FORMATS[a].box} rounded-[3px] border-2 ${on ? 'border-primary bg-primary/10' : 'border-slate-300 bg-slate-50'}`} /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">{FORMATS[a].name}</span>
                <span className="block text-[11px] text-slate-500">{a}{current === a ? ' · now' : ''}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
