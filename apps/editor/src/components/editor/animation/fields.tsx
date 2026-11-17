import { useId, useState } from 'react'

/** The look every ribbon field shares. */
export const fieldBox = 'h-8 rounded-md border border-border bg-white px-2 text-sm disabled:opacity-40 disabled:bg-slate-50'
export const groupLabel = 'text-[11px] text-slate-500 text-center mt-1 select-none'

/**
 * A number in a unit (seconds, degrees, canvas units) typed or stepped with the arrow keys. What is typed is kept as text while it is being typed, so "0." or an empty
 * field is not forced to a number; a valid number is committed at once, and the field shows the stored value again when it loses focus.
 */
export function NumberField({ label, value, onCommit, min, max, step, unit, testId, disabled, width = 'w-[64px]' }: { label: string; value: number; onCommit: (v: number) => void; min: number; max: number; step: number; unit?: string; testId?: string; disabled?: boolean; width?: string }) {
  const id = useId()
  // what is being typed, with the stored value it was typed against: when the stored value moves on (undo, another control) the field shows the stored value again
  const [typed, setTyped] = useState<{ text: string; base: number } | null>(null)
  const draft = typed && typed.base === value ? typed.text : null
  return (
    <label htmlFor={id} className="flex items-center gap-1.5 text-xs text-slate-600">
      <span className="w-[54px] shrink-0">{label}</span>
      <input id={id} type="number" data-testid={testId} disabled={disabled} min={min} max={max} step={step} value={draft ?? String(value)} className={`${fieldBox} ${width}`}
        onChange={(e) => { setTyped({ text: e.target.value, base: value }); const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v) && v >= min && v <= max) onCommit(v) }}
        onBlur={() => setTyped(null)} />
      {unit && <span aria-hidden className="text-slate-400">{unit}</span>}
    </label>
  )
}

export function SelectField<T extends string>({ label, value, options, onChange, testId, disabled, width = 'w-[132px]' }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; testId?: string; disabled?: boolean; width?: string }) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex items-center gap-1.5 text-xs text-slate-600">
      <span className="w-[54px] shrink-0">{label}</span>
      <select id={id} data-testid={testId} disabled={disabled} value={value} className={`${fieldBox} ${width}`} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}
