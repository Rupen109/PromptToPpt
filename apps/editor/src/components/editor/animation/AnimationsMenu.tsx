import { Film, Lock, Trash2, Wand2 } from '@prompttoppt/ui/icons'
import { MORPH_DEFAULTS, TRANSITION_TYPES, EFFECT_DIRECTIONS, type Presentation, type Slide } from '@prompttoppt/validation'
import * as TC from '@/editor/transition-commands'
import { useDoc } from '@/editor/store'
import { useUi } from '@/editor/ui'
import { useEntitlements } from '@/lib/entitlements'
import { DIRECTION_TRANSITIONS, MORPH_LOCKED_REASON, TRANSITION_LABEL, easingLabel } from './labels'

const chip = (on: boolean) => `px-2.5 py-1.5 rounded-lg text-sm border ${on ? 'border-primary bg-primary/10 font-semibold' : 'border-border hover:bg-slate-50'}`
const row = 'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-slate-100 rounded-lg disabled:opacity-40 disabled:hover:bg-transparent'
type Basic = (typeof TRANSITION_TYPES)[number]

/**
 * The content of the ribbon's Animations dropdown. Everyone gets the Animation pane and the basic transitions. Morph is Gold and Premium: other plans see the same
 * controls locked, and a click opens the upgrade window. (The server refuses a Morph from any other plan too; this is only the friendly front.)
 */
export function AnimationsMenu({ doc, slide, onDone }: { doc: Presentation; slide: Slide; onDone: () => void }) {
  const apply = useDoc((s) => s.apply)
  const setDrawer = useUi((s) => s.setDrawer)
  const { ent, upgrade } = useEntitlements()
  const canMorph = !!ent?.features.morph
  const t = slide.transition
  const type = t?.type ?? 'fade'
  const isMorph = type === 'morph'
  const sid = slide.id
  const setT = (patch: TC.TransitionPatch) => apply('Slide transition', (d) => { TC.setTransition(d, sid, patch) }, { mergeKey: `tr:${sid}` })
  const lockedMorph = () => { onDone(); upgrade.show(MORPH_LOCKED_REASON) }
  const morphAll = doc.slides.filter((s) => s.transition?.type === 'morph').length

  return (
    <div className="p-1.5">
      <button type="button" data-testid="open-animation-pane" className={row} onClick={() => { onDone(); if (useUi.getState().drawer !== 'animations') setDrawer('animations') }}><Wand2 aria-hidden size={16} />Animation pane…</button>
      <div className="h-px bg-border my-1.5" />
      <div className="px-3 pb-1 text-xs font-semibold text-slate-500">Slide transition</div>
      <div className="px-3 pb-2 flex flex-wrap gap-1.5" role="group" aria-label="Slide transition">
        {TRANSITION_TYPES.map((k: Basic) => <button key={k} type="button" data-testid={`tr-${k}`} aria-pressed={type === k} className={chip(type === k)} onClick={() => setT({ type: k })}>{TRANSITION_LABEL[k]}</button>)}
      </div>
      {!isMorph && type !== 'none' && (
        <div className="px-3 pb-2 grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-slate-500">Duration (s)
            <input type="number" data-testid="tr-duration" min={0.1} max={4} step={0.1} value={(t?.duration ?? 500) / 1000} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setT({ type: type as Basic, duration: Math.round(v * 1000) }) }} className="mt-1 w-full h-9 rounded-lg border border-border px-2 text-sm font-normal" />
          </label>
          {(DIRECTION_TRANSITIONS as readonly string[]).includes(type) && (
            <label className="text-xs font-semibold text-slate-500">From
              <select data-testid="tr-direction" value={t?.direction ?? 'left'} onChange={(e) => setT({ type: type as Basic, direction: e.target.value as (typeof EFFECT_DIRECTIONS)[number] })} className="mt-1 w-full h-9 rounded-lg border border-border px-2 text-sm font-normal">
                {EFFECT_DIRECTIONS.map((d) => <option key={d} value={d}>{easingLabel(d)}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      <div className="h-px bg-border my-1.5" />
      <div className="px-3 pb-1 text-xs font-semibold text-slate-500 flex items-center gap-1">Morph{!canMorph && <Lock aria-hidden size={12} />}</div>
      {canMorph ? (
        <>
          <button type="button" data-testid="morph-set" className={row} aria-pressed={isMorph} onClick={() => { setT({ type: 'morph' }) }}><Film aria-hidden size={16} />{isMorph ? 'Morph is on for this slide' : 'Use Morph on this slide'}</button>
          {isMorph && (
            <div className="px-3 pb-2">
              <label className="text-xs font-semibold text-slate-500">Morph duration (s)
                <input type="number" data-testid="morph-duration" min={0.1} max={4} step={0.1} value={(t?.duration ?? MORPH_DEFAULTS.duration) / 1000} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setT({ type: 'morph', duration: Math.round(v * 1000) }) }} className="mt-1 w-full h-9 rounded-lg border border-border px-2 text-sm font-normal" />
              </label>
            </div>
          )}
          <button type="button" data-testid="morph-all" className={row} onClick={() => { apply('Apply Morph to all slides', (d) => { TC.setTransitionAll(d, { type: 'morph' }) }); onDone() }}><Film aria-hidden size={16} />Apply Morph to all slides</button>
          <button type="button" data-testid="morph-remove" className={row} disabled={morphAll === 0} onClick={() => { apply('Remove Morph', (d) => { TC.removeMorphAll(d) }); onDone() }}><Trash2 aria-hidden size={16} />Remove Morph from all slides</button>
        </>
      ) : (
        <>
          <button type="button" data-testid="morph-set" className={`${row} text-slate-500`} onClick={lockedMorph}><Lock aria-hidden size={16} />Use Morph on this slide<span className="sr-only"> (locked, Gold plan)</span></button>
          <button type="button" data-testid="morph-all" className={`${row} text-slate-500`} onClick={lockedMorph}><Lock aria-hidden size={16} />Apply Morph to all slides<span className="sr-only"> (locked, Gold plan)</span></button>
        </>
      )}
    </div>
  )
}
