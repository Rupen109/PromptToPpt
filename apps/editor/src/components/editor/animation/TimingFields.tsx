import { EFFECT_EASINGS, EFFECT_START, type Effect } from '@prompttoppt/validation'
import { NumberField, SelectField } from './fields'
import { START_LABEL, easingLabel } from './labels'
import { fromSeconds, toSeconds } from '@/editor/animation-model'

const REPEATS = [{ value: '1', label: 'None' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '5', label: '5' }, { value: '10', label: '10' }, { value: 'end', label: 'Until end of slide' }] as const

/** The Timing group: Start, Duration, Delay, Repeat, Rewind and Easing of the active effect (PowerPoint's names). Every change applies at once through `onChange`. */
export function TimingFields({ effect, onChange, disabled, children }: { effect: Effect | undefined; onChange: (patch: Partial<Effect>) => void; disabled?: boolean; children?: React.ReactNode }) {
  const off = disabled || !effect
  const e = effect
  return (
    <div className="grid grid-cols-3 max-xl:grid-cols-2 gap-x-3 gap-y-1.5 items-center" role="group" aria-label="Timing" data-testid="fx-timing">
      <SelectField label="Start" width="w-[118px]" testId="fx-start" disabled={off} value={e?.start ?? 'click'} options={EFFECT_START.map((s) => ({ value: s, label: START_LABEL[s] }))} onChange={(v) => onChange({ start: v })} />
      <NumberField label="Duration" testId="fx-duration" disabled={off} min={0.05} max={20} step={0.1} unit="s" value={toSeconds(e?.duration ?? 600)} onCommit={(v) => { const ms = fromSeconds(String(v)); if (ms !== null) onChange({ duration: ms }) }} />
      <SelectField label="Easing" width="w-[118px]" testId="fx-easing" disabled={off} value={e?.easing ?? 'ease-out'} options={EFFECT_EASINGS.map((x) => ({ value: x, label: easingLabel(x) }))} onChange={(v) => onChange({ easing: v })} />
      <NumberField label="Delay" testId="fx-delay" disabled={off} min={0} max={20} step={0.1} unit="s" value={toSeconds(e?.delay ?? 0)} onCommit={(v) => { const ms = fromSeconds(String(v)); if (ms !== null) onChange({ delay: ms }) }} />
      <SelectField label="Repeat" width="w-[118px]" testId="fx-repeat" disabled={off} value={e?.loop ? 'end' : String(e?.repeat ?? 1)} options={REPEATS} onChange={(v) => onChange(v === 'end' ? { loop: true } : { repeat: Number(v), loop: undefined })} />
      <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" data-testid="fx-reverse" disabled={off} checked={e?.reverse ?? false} onChange={(ev) => onChange({ reverse: ev.target.checked })} />Rewind when done</label>
      {children}
    </div>
  )
}
