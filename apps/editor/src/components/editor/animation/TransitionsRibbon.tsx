import { Ban, Blend, Film, Layers, ListTree, Lock, MoveRight, Play, Square, Trash2, Waves, ZoomIn, type LucideIcon } from '@prompttoppt/ui/icons'
import { EFFECT_DIRECTIONS, EFFECT_EASINGS, MORPH_BY, MORPH_DEFAULTS, TRANSITION_TYPES, type Presentation, type Slide } from '@prompttoppt/validation'
import * as TC from '@/editor/transition-commands'
import { useDoc } from '@/editor/store'
import { useUi } from '@/editor/ui'
import { useEntitlements } from '@/lib/entitlements'
import { NumberField, SelectField, groupLabel } from './fields'
import { DIRECTION_LABEL, DIRECTION_TRANSITIONS, MORPH_LOCKED_REASON, TRANSITION_LABEL, easingLabel } from './labels'

const ICON: Record<string, LucideIcon> = { none: Ban, fade: Blend, slide: MoveRight, zoom: ZoomIn, push: Layers, wipe: Waves, morph: Film }
const tool = 'h-8 px-2.5 rounded-md border border-border bg-white text-sm hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white inline-flex items-center gap-1.5 whitespace-nowrap [&>svg]:shrink-0'
const Group = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <section aria-label={label} className="flex flex-col px-3 py-1.5 border-r border-border last:border-r-0 shrink-0"><div className="flex-1">{children}</div><div className={groupLabel}>{label}</div></section>
)

/**
 * The Transitions tab: how the selected slide arrives. The basic transitions are open to every plan. Morph is Gold and Premium: other plans see the same control locked (a click
 * opens the upgrade window); a slide that already has Morph keeps it, plays it, and can have it removed, but its settings are locked (the server refuses to save a changed Morph).
 */
export function TransitionsRibbon({ doc, slide }: { doc: Presentation; slide: Slide }) {
  const apply = useDoc((s) => s.apply)
  const tp = useUi((s) => s.transitionPreview)
  const { ent, upgrade } = useEntitlements()
  const canMorph = !!ent?.features.morph
  const t = slide.transition
  const type = t?.type ?? 'fade'
  const isMorph = type === 'morph'
  const sid = slide.id
  const index = doc.slides.findIndex((s) => s.id === sid)
  const frozen = !!slide.locked || (isMorph && !canMorph) // a Morph on a plan without Morph can be removed, not changed
  const setT = (patch: TC.TransitionPatch, merge = false) => apply('Slide transition', (d) => { TC.setTransition(d, sid, patch) }, merge ? { mergeKey: `tr:${sid}` } : undefined)
  const pick = (k: (typeof TRANSITION_TYPES)[number] | 'morph') => {
    if (slide.locked) return
    if (k === 'morph') { if (!canMorph) { upgrade.show(MORPH_LOCKED_REASON); return } if (index === 0) return }
    setT({ type: k })
    useUi.getState().startTransitionPreview()
  }
  const morphCount = doc.slides.filter((s) => s.transition?.type === 'morph').length
  const after = t?.advanceAfter
  const patchKeep = (extra: Partial<NonNullable<Slide['transition']>>) => ({ type: type as TC.TransitionPatch['type'], ...extra })
  const all = TRANSITION_TYPES.map((k) => k as string).concat(['morph'])
  return (
    <div role="region" aria-label="Transitions tab" data-testid="ribbon-transitions" className="border-b border-border bg-slate-50/80 flex flex-wrap items-stretch max-h-[36vh] xl:max-h-[46vh] overflow-y-auto">
      <Group label="Preview">
        {tp ? <button type="button" className={tool} data-testid="tr-stop" onClick={() => useUi.getState().stopTransitionPreview()}><Square aria-hidden size={14} />Stop</button>
          : <button type="button" className={tool} data-testid="tr-preview" onClick={() => useUi.getState().startTransitionPreview()}><Play aria-hidden size={14} />Preview</button>}
      </Group>
      <Group label="Transition to this slide">
        <div role="group" aria-label="Transition" className="flex gap-1">
          {all.map((k) => {
            const Icon = ICON[k]!
            const lockedMorph = k === 'morph' && !canMorph
            const disabled = !!slide.locked || (k === 'morph' && index === 0 && canMorph)
            const on = type === k
            return (
              <button key={k} type="button" data-testid={`tr-${k}`} aria-pressed={on} disabled={disabled} title={k === 'morph' && index === 0 ? 'The first slide has no slide before it to morph from' : lockedMorph ? `${TRANSITION_LABEL[k as keyof typeof TRANSITION_LABEL]} (Gold plan)` : TRANSITION_LABEL[k as keyof typeof TRANSITION_LABEL]}
                aria-label={`${TRANSITION_LABEL[k as keyof typeof TRANSITION_LABEL]}${lockedMorph ? ' (locked, Gold plan)' : ''}`} onClick={() => pick(k as never)}
                className={`w-[64px] h-[56px] rounded-md border flex flex-col items-center justify-center gap-0.5 text-[11px] disabled:opacity-35 ${on ? 'border-primary/50 bg-primary/10 font-semibold' : 'border-transparent hover:bg-slate-100 hover:border-border'} ${lockedMorph ? 'text-slate-500' : ''}`}>
                {lockedMorph ? <Lock aria-hidden size={19} /> : <Icon aria-hidden size={20} />}{TRANSITION_LABEL[k as keyof typeof TRANSITION_LABEL]}
              </button>
            )
          })}
        </div>
      </Group>
      <Group label="Effect options">
        <div className="w-[180px] flex flex-col gap-1.5">
          {(DIRECTION_TRANSITIONS as readonly string[]).includes(type) ? (
            <SelectField label="From" testId="tr-direction" disabled={frozen} value={t?.direction ?? (type === 'wipe' ? 'left' : 'right')} options={EFFECT_DIRECTIONS.map((d) => ({ value: d, label: DIRECTION_LABEL[d]! }))} onChange={(d) => setT(patchKeep({ direction: d }))} />
          ) : isMorph ? (
            <>
              <SelectField label="Morph" testId="tr-morph-by" disabled={frozen} value={t?.by ?? 'object'} options={MORPH_BY.map((v) => ({ value: v, label: { object: 'By object', word: 'By word', character: 'By character' }[v] }))} onChange={(v) => setT(patchKeep({ by: v === 'object' ? undefined : v } as Partial<TC.TransitionPatch>))} />
              <SelectField label="Blend" testId="tr-morph-blend" disabled={frozen} value={t?.blend ?? 'through'} options={[{ value: 'through', label: 'One after the other' }, { value: 'cross', label: 'Both at once' }]} onChange={(v) => setT(patchKeep({ blend: v as 'through' | 'cross' }))} />
              <p className="text-xs text-slate-500">Text that is too different or too long still moves as one object.</p>
            </>
          ) : <p className="text-xs text-slate-500">This transition has no options.</p>}
          {isMorph && !canMorph && <p className="text-xs text-amber-700" data-testid="tr-morph-locked-note">Morph is a Gold feature. You can play and remove it, not change it.</p>}
        </div>
      </Group>
      <Group label="Timing">
        <div className="flex flex-col gap-1.5">
          <NumberField label="Duration" testId="tr-duration" disabled={frozen || type === 'none'} min={0.1} max={4} step={0.1} unit="s" value={(t?.duration ?? (isMorph ? MORPH_DEFAULTS.duration : 500)) / 1000} onCommit={(v) => setT(patchKeep({ duration: Math.round(v * 1000) }), true)} />
          {/* the speed curve: played by SlidesDone's slideshow and share pages (PowerPoint plays its own curve for its transitions) */}
          <SelectField label="Easing" testId="tr-easing" disabled={frozen || type === 'none'} value={t?.easing ?? (isMorph ? MORPH_DEFAULTS.easing : 'ease-out')} options={EFFECT_EASINGS.map((x) => ({ value: x, label: easingLabel(x) }))} onChange={(v) => setT(patchKeep({ easing: v as (typeof EFFECT_EASINGS)[number] }))} />
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" data-testid="tr-on-click" disabled={frozen || type === 'none' && !t} checked={t?.advanceOnClick !== false} onChange={(e) => setT(patchKeep({ advanceOnClick: e.target.checked ? undefined as unknown as boolean : false }))} />On mouse click</label>
        </div>
      </Group>
      <Group label="Advance slide">
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" data-testid="tr-after-on" disabled={frozen} checked={after !== undefined} onChange={(e) => setT(patchKeep({ advanceAfter: e.target.checked ? 5000 : undefined as unknown as number }))} />After</label>
          <NumberField label="Seconds" testId="tr-after" disabled={frozen || after === undefined} min={0} max={3600} step={1} unit="s" value={(after ?? 5000) / 1000} onCommit={(v) => setT(patchKeep({ advanceAfter: Math.round(v * 1000) }), true)} />
        </div>
      </Group>
      <Group label="Apply">
        <div className="flex flex-col gap-1.5">
          <button type="button" data-testid="tr-apply-all" className={tool} disabled={!!slide.locked || (isMorph && !canMorph)} onClick={() => { const patch = { type, ...(t?.duration !== undefined ? { duration: t.duration } : {}), ...(t?.direction ? { direction: t.direction } : {}), ...(t?.easing ? { easing: t.easing } : {}), ...(t?.advanceAfter !== undefined ? { advanceAfter: t.advanceAfter } : {}), ...(t?.advanceOnClick === false ? { advanceOnClick: false } : {}), ...(t?.by ? { by: t.by } : {}) } as TC.TransitionPatch; apply('Apply transition to all slides', (d) => { TC.setTransitionAll(d, patch) }) }}>Apply to all slides</button>
          <div className="flex gap-1.5">
            <button type="button" data-testid="morph-remove" className={tool} disabled={morphCount === 0} onClick={() => { apply('Remove Morph', (d) => { TC.removeMorphAll(d) }) }}><Trash2 aria-hidden size={14} />Remove Morph{morphCount ? ` (${morphCount})` : ''}</button>
            <button type="button" data-testid="open-morph-panel" className={tool} onClick={() => useUi.getState().setDrawer('morph')}><ListTree aria-hidden size={14} />Morph check</button>
          </div>
        </div>
      </Group>
    </div>
  )
}
