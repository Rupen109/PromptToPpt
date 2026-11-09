import { EFFECTS, EFFECT_DIRECTIONS, EFFECT_EASINGS, EFFECT_START, type Effect } from '@prompttoppt/validation'
import { EFFECT_INFO, type EffectOption } from '@prompttoppt/ui'
import { START_LABEL, easingLabel } from './labels'

const field = 'mt-1 w-full h-9 rounded-lg border border-border bg-white px-2 text-sm'
const lab = 'block text-xs font-semibold text-slate-500'

const OPTION_RANGE: Record<Exclude<EffectOption, 'direction' | 'color' | 'reverse'>, { label: string; min: number; max: number; step: number }> = {
  distance: { label: 'Distance', min: 0, max: 2000, step: 10 },
  scale: { label: 'Size (1 = same)', min: 0, max: 5, step: 0.05 },
  rotation: { label: 'Degrees', min: -1080, max: 1080, step: 5 },
  opacity: { label: 'Opacity (0 to 1)', min: 0, max: 1, step: 0.05 },
}

/** The controls for one effect: type, start, timing, easing, and only the options its type understands (from the catalogue). */
export function EffectEditor({ effect, onChange }: { effect: Effect; onChange: (patch: Partial<Effect>) => void }) {
  const info = EFFECT_INFO[effect.type]
  const id = effect.id
  const num = (key: 'duration' | 'delay' | 'repeat', label: string, min: number, max: number, step: number, scale = 1) => (
    <label className={lab}>{label}
      <input type="number" data-testid={`fx-${key}`} className={field} min={min / scale} max={max / scale} step={step} value={effect[key] / scale} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange({ [key]: key === 'repeat' ? Math.round(v) : Math.round(v * scale) } as Partial<Effect>) }} />
    </label>
  )
  return (
    <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-lg" data-testid={`fx-editor-${id}`}>
      <label className={`${lab} col-span-2`}>Effect
        <select data-testid="fx-type" className={field} value={effect.type} onChange={(e) => onChange({ type: e.target.value as Effect['type'], ...EFFECT_INFO[e.target.value as Effect['type']].defaults })}>
          {EFFECTS[effect.category].map((t) => <option key={t} value={t}>{EFFECT_INFO[t].label}</option>)}
        </select>
      </label>
      <label className={`${lab} col-span-2`}>Start
        <select data-testid="fx-start" className={field} value={effect.start} onChange={(e) => onChange({ start: e.target.value as Effect['start'] })}>
          {EFFECT_START.map((s) => <option key={s} value={s}>{START_LABEL[s]}</option>)}
        </select>
      </label>
      {num('duration', 'Duration (s)', 50, 20000, 0.1, 1000)}
      {num('delay', 'Delay (s)', 0, 20000, 0.1, 1000)}
      <label className={`${lab} col-span-2`}>Easing
        <select data-testid="fx-easing" className={field} value={effect.easing} onChange={(e) => onChange({ easing: e.target.value as Effect['easing'] })}>
          {EFFECT_EASINGS.map((x) => <option key={x} value={x}>{easingLabel(x)}</option>)}
        </select>
      </label>
      {info.options.includes('direction') && (
        <label className={lab}>Direction
          <select data-testid="fx-direction" className={field} value={effect.direction ?? info.defaults.direction} onChange={(e) => onChange({ direction: e.target.value as Effect['direction'] })}>
            {EFFECT_DIRECTIONS.map((x) => <option key={x} value={x}>{easingLabel(x)}</option>)}
          </select>
        </label>
      )}
      {(['distance', 'scale', 'rotation', 'opacity'] as const).filter((o) => info.options.includes(o)).map((o) => (
        <label key={o} className={lab}>{OPTION_RANGE[o].label}
          <input type="number" data-testid={`fx-${o}`} className={field} {...OPTION_RANGE[o]} value={effect[o] ?? info.defaults[o] ?? 0} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange({ [o]: v } as Partial<Effect>) }} />
        </label>
      ))}
      {info.options.includes('color') && (
        <label className={lab}>Colour
          <input type="color" data-testid="fx-color" aria-label="Effect colour" className={`${field} p-1`} value={effect.color ?? info.defaults.color ?? '#e11d48'} onChange={(e) => onChange({ color: e.target.value })} />
        </label>
      )}
      {num('repeat', 'Repeat', 1, 20, 1)}
      {info.options.includes('reverse') && (
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" data-testid="fx-reverse" checked={effect.reverse} onChange={(e) => onChange({ reverse: e.target.checked })} />Play back to the start</label>
      )}
    </div>
  )
}
