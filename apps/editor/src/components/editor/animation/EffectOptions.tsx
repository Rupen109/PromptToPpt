import { EFFECT_DIRECTIONS_8, EFFECT_TEXT_BY, type Effect, type SlideElement } from '@prompttoppt/validation'
import { EFFECT_INFO, type EffectOption } from '@prompttoppt/ui'
import { DIRECTION_LABEL, TEXT_BY_LABEL } from './labels'
import { NumberField, SelectField, fieldBox } from './fields'

const RANGE: Record<Exclude<EffectOption, 'direction' | 'color' | 'reverse' | 'textBy'>, { label: string; min: number; max: number; step: number; unit?: string }> = {
  distance: { label: 'Distance', min: 0, max: 2000, step: 10 },
  scale: { label: 'Size', min: 0, max: 5, step: 0.05, unit: 'x' },
  rotation: { label: 'Degrees', min: -1080, max: 1080, step: 5, unit: '°' },
  opacity: { label: 'Opacity', min: 0, max: 1, step: 0.05 },
}

/** Which corners / sides an effect may come from: wipe and split read best from the four sides; the rest also take corners. */
const SIDES_ONLY = new Set<Effect['type']>(['wipe-in', 'wipe-out', 'split-in'])

/**
 * Effect Options: only the options the chosen effect understands (read from the catalogue). Each change applies at once through `onChange`; `onPath` is for a preset motion path,
 * whose direction and size redraw its points. `target` decides whether By paragraph / word / letter is offered (text only).
 */
export function EffectOptions({ effect, target, onChange, onPath, onEditPath, disabled }: { effect: Effect; target: SlideElement | undefined; onChange: (patch: Partial<Effect>) => void; onPath: (shape: { direction?: NonNullable<Effect['direction']>; distance?: number }) => void; onEditPath: () => void; disabled?: boolean }) {
  const info = EFFECT_INFO[effect.type]
  const isPath = !!info.path
  const word = effect.category === 'exit' ? 'To' : 'From'
  const dirs = SIDES_ONLY.has(effect.type) ? EFFECT_DIRECTIONS_8.slice(0, 4) : EFFECT_DIRECTIONS_8
  const direction = effect.direction ?? info.defaults.direction ?? 'left'
  const setPath = (patch: { direction?: NonNullable<Effect['direction']>; distance?: number }) => (isPath ? onPath(patch) : onChange(patch))
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5" data-testid="fx-options" role="group" aria-label={`${info.label} options`}>
      {info.options.includes('direction') && (
        <SelectField label={isPath ? 'Heading' : word} testId="fx-direction" disabled={disabled ?? false} value={direction} options={dirs.map((d) => ({ value: d, label: `${isPath ? '' : word + ' '}${DIRECTION_LABEL[d]}`.trim() }))} onChange={(d) => setPath({ direction: d })} />
      )}
      {info.options.includes('distance') && (
        <NumberField testId="fx-distance" disabled={disabled ?? false} {...RANGE.distance} label={isPath ? 'Size' : RANGE.distance.label} value={effect.distance ?? info.defaults.distance ?? 0} onCommit={(v) => setPath({ distance: v })} />
      )}
      {(['scale', 'rotation', 'opacity'] as const).filter((o) => info.options.includes(o)).map((o) => (
        <NumberField key={o} testId={`fx-${o}`} disabled={disabled ?? false} {...RANGE[o]} value={effect[o] ?? info.defaults[o] ?? 0} onCommit={(v) => onChange({ [o]: v } as Partial<Effect>)} />
      ))}
      {info.options.includes('color') && (
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><span className="w-[54px]">Colour</span>
          <input type="color" data-testid="fx-color" aria-label="Effect colour" disabled={disabled} className={`${fieldBox} w-[72px] p-0.5`} value={effect.color ?? info.defaults.color ?? '#e11d48'} onChange={(e) => onChange({ color: e.target.value })} />
        </label>
      )}
      {info.options.includes('textBy') && target?.type === 'text' && (
        <>
          <SelectField label="Text" testId="fx-textby" disabled={disabled ?? false} value={effect.textBy ?? 'object'} options={EFFECT_TEXT_BY.map((v) => ({ value: v, label: TEXT_BY_LABEL[v] }))} onChange={(v) => onChange({ textBy: v === 'object' ? undefined : v } as Partial<Effect>)} />
          {effect.textBy && effect.textBy !== 'object' && <NumberField label="Gap" testId="fx-stagger" disabled={disabled ?? false} min={0} max={2000} step={10} unit="ms" value={effect.stagger ?? (effect.textBy === 'letter' ? 40 : effect.textBy === 'word' ? 120 : 250)} onCommit={(v) => onChange({ stagger: v })} />}
        </>
      )}
      {isPath && (
        <button type="button" data-testid="fx-edit-path" disabled={disabled} onClick={onEditPath} className="h-8 px-3 rounded-md border border-border text-sm hover:bg-slate-50 disabled:opacity-40">{effect.type === 'path-custom' ? 'Redraw or edit the path' : 'Edit the path points'}</button>
      )}
      {info.options.length === 0 && <p className="text-xs text-slate-500">This effect has no options.</p>}
    </div>
  )
}
