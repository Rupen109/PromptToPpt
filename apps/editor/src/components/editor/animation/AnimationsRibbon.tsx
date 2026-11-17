import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Layers, ListTree, Paintbrush, Play, Plus, Square, X } from '@prompttoppt/ui/icons'
import { EFFECT_INFO } from '@prompttoppt/ui'
import type { Effect, Presentation, Slide } from '@prompttoppt/validation'
import * as E from '@/editor/effect-commands'
import { activeEffect } from '@/editor/animation-model'
import { useDoc } from '@/editor/store'
import { useUi } from '@/editor/ui'
import { EffectGallery } from './EffectGallery'
import { EffectOptions } from './EffectOptions'
import { TimingFields } from './TimingFields'
import { SelectField, groupLabel } from './fields'
import { elementLabel } from './labels'
import { newId } from './ids'

const Group = ({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) => (
  <section aria-label={label} className={`flex flex-col px-3 py-1.5 border-r border-border last:border-r-0 ${className}`}>
    <div className="flex-1">{children}</div>
    <div className={groupLabel}>{label}</div>
  </section>
)
const tool = 'h-8 px-2.5 rounded-md border border-border bg-white text-sm hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white inline-flex items-center gap-1.5 whitespace-nowrap [&>svg]:shrink-0'

/**
 * The Animations tab (a strip under the toolbar, like PowerPoint's): Preview | the effect gallery | Effect Options | Add Animation, Animation Pane, Animation Painter, Trigger | Timing.
 * A gallery click applies the effect to every selected object (one undo step) and plays it in place; the Timing group and Effect Options edit the active effect, the one the
 * Animation Pane or the canvas has selected. Open to every plan (only Morph is Gold).
 */
export function AnimationsRibbon({ slide }: { doc: Presentation; slide: Slide }) {
  const apply = useDoc((s) => s.apply)
  const selection = useUi((s) => s.selection)
  const activeId = useUi((s) => s.activeEffectId)
  const painterFrom = useUi((s) => s.painterFrom)
  const preview = useUi((s) => s.preview)
  const pathEditId = useUi((s) => s.pathEditId)
  const drawer = useUi((s) => s.drawer)
  const ui = useUi.getState
  const sid = slide.id
  const [addOpen, setAddOpen] = useState(false)
  const targets = useMemo(() => selection.map((id) => slide.elements.find((e) => e.id === id)).filter((e): e is NonNullable<typeof e> => !!e && !e.decorative), [selection, slide.elements])
  const active = activeEffect(slide, activeId, selection)
  const activeEl = active ? slide.elements.find((e) => e.id === active.elementId) : undefined
  const locked = !!slide.locked
  const idx = active ? (slide.effects ?? []).findIndex((e) => e.id === active.id) : -1
  const total = slide.effects?.length ?? 0

  const change = (patch: Partial<Effect>) => { if (active) apply('Edit effect', (d) => { E.updateEffect(d, sid, active.id, patch) }, { mergeKey: `fx:${active.id}` }) }

  function pick(type: Effect['type']) {
    if (targets.length === 0) return
    let made: string[] = []
    apply('Apply effect', (d) => { made = E.applyEffect(d, sid, targets.map((t) => t.id), type, newId) })
    if (made.length) {
      ui().setActiveEffect(made[0]!)
      if (type === 'path-custom') ui().setPathEdit(made[0]!, true)
      else ui().startPreview(targets.map((t) => t.id))
    }
  }
  function add(type: Effect['type']) {
    const el = targets[0]
    if (!el) return
    let id: string | null = null
    apply('Add animation', (d) => { id = E.addAnimation(d, sid, el.id, type, newId) })
    setAddOpen(false)
    if (id) { ui().setActiveEffect(id); if (type === 'path-custom') ui().setPathEdit(id, true); else ui().startPreview([el.id]) }
  }

  // Animation Painter: while it is armed, selecting another object paints the animations of the source onto it
  useEffect(() => {
    if (!painterFrom) return
    const others = selection.filter((id) => id !== painterFrom)
    if (others.length === 0) return
    let made = 0
    useDoc.getState().apply('Animation painter', (d) => { made = E.paintAnimation(d, sid, painterFrom, others, newId) })
    ui().setPainter(null)
    if (made) ui().startPreview(others)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, painterFrom])
  useEffect(() => { if (painterFrom && !slide.elements.some((e) => e.id === painterFrom)) ui().setPainter(null) }, [slide.elements, painterFrom]) // eslint-disable-line react-hooks/exhaustive-deps

  const sourceHasFx = targets.length === 1 && (slide.effects ?? []).some((e) => e.elementId === targets[0]!.id)
  const triggerOptions = [{ value: '', label: 'On click (in sequence)' }, ...slide.elements.filter((e) => !e.decorative && e.id !== active?.elementId).map((e) => ({ value: e.id, label: `On click of ${elementLabel(e)}` }))]

  return (
    <div role="region" aria-label="Animations tab" data-testid="ribbon-animations" className="border-b border-border bg-slate-50/80 flex flex-wrap items-stretch max-h-[36vh] xl:max-h-[46vh] overflow-y-auto">
      <Group label="Preview" className="shrink-0 border-b">
        {preview ? (
          <button type="button" data-testid="fx-stop" className={tool} onClick={() => ui().stopPreview()}><Square aria-hidden size={14} />Stop</button>
        ) : (
          <button type="button" data-testid="fx-preview" className={tool} disabled={total === 0} onClick={() => ui().startPreview()}><Play aria-hidden size={14} />Preview</button>
        )}
      </Group>
      <Group label="Animation" className="min-w-0 basis-[calc(100%-125px)] flex-1 border-b">
        <div className="overflow-x-auto max-w-full pb-0.5">
          <EffectGallery targets={targets} disabled={locked} current={active && targets.some((t) => t.id === active.elementId) ? active.type : undefined} onPick={pick} onNone={() => { apply('Remove animation', (d) => { E.clearEffects(d, sid, targets.map((t) => t.id)) }) }} />
        </div>
        {targets.length === 0 && <p className="text-[11px] text-slate-500 px-1" data-testid="fx-hint">Select an object on the slide, then choose an effect.</p>}
      </Group>
      <Group label="Effect options" className="flex-1 basis-[300px] min-w-[260px]">
        {active ? <div><EffectOptions effect={active} target={activeEl} disabled={locked} onChange={change} onPath={(shape) => { apply('Edit path', (d) => { E.setPathShape(d, sid, active.id, shape) }, { mergeKey: `fx:${active.id}` }) }} onEditPath={() => ui().setPathEdit(pathEditId === active.id ? null : active.id, active.type === 'path-custom')} /></div>
          : <p className="text-xs text-slate-500">Select an animated object to change how its effect plays.</p>}
      </Group>
      <Group label="Advanced animation" className="shrink-0">
        <div className="grid grid-cols-2 gap-1.5 relative w-[270px]">
          <button type="button" data-testid="fx-add-animation" aria-expanded={addOpen} className={tool} disabled={locked || targets.length !== 1} onClick={() => setAddOpen((v) => !v)}><Plus aria-hidden size={14} />Add animation</button>
          <button type="button" data-testid="fx-open-pane" aria-pressed={drawer === 'animations'} className={`${tool} ${drawer === 'animations' ? 'bg-primary/10 border-primary/40' : ''}`} onClick={() => ui().setDrawer('animations')}><ListTree aria-hidden size={14} />Animation pane</button>
          <button type="button" data-testid="fx-painter" aria-pressed={!!painterFrom} className={`${tool} ${painterFrom ? 'bg-primary/10 border-primary/40' : ''}`} disabled={locked || (!painterFrom && !sourceHasFx)} onClick={() => ui().setPainter(painterFrom ? null : targets[0]!.id)}><Paintbrush aria-hidden size={14} />Painter</button>
          <button type="button" data-testid="fx-open-selection" aria-pressed={drawer === 'selection'} className={`${tool} ${drawer === 'selection' ? 'bg-primary/10 border-primary/40' : ''}`} onClick={() => ui().setDrawer('selection')}><Layers aria-hidden size={14} />Selection pane</button>
          {painterFrom && <p role="status" data-testid="fx-painter-hint" className="col-span-2 text-[11px] text-primary">Click the object to copy the animation onto.</p>}
          {addOpen && (
            <div role="dialog" aria-label="Add animation" data-testid="fx-add-popover" className="absolute z-50 top-9 left-0 bg-white border border-border rounded-xl shadow-xl p-2 max-w-[calc(100vw-24px)] overflow-x-auto" style={{ width: 'min(1200px, 90vw)' }}>
              <div className="flex items-start gap-2"><EffectGallery testPrefix="fx-add" compact targets={targets} onPick={add} /><button type="button" aria-label="Close" onClick={() => setAddOpen(false)} className="ml-auto text-slate-500 hover:text-slate-800"><X aria-hidden size={16} /></button></div>
            </div>
          )}
        </div>
      </Group>
      <Group label="Timing" className="flex-[3] basis-[460px]">
        <TimingFields effect={active} disabled={locked} onChange={change}>
          <SelectField label="Trigger" testId="fx-trigger" width="w-[104px]" disabled={locked || !active} value={active?.trigger ?? ''} options={triggerOptions} onChange={(v) => { if (active) apply('Set trigger', (d) => { E.setTrigger(d, sid, active.id, v || null) }) }} />
          <div className="flex gap-1.5" role="group" aria-label="Reorder animation">
            <button type="button" data-testid="fx-earlier" className={tool} disabled={locked || idx <= 0} onClick={() => active && apply('Reorder effect', (d) => { E.nudgeEffect(d, sid, active.id, -1) })}><ArrowUp aria-hidden size={14} />Earlier</button>
            <button type="button" data-testid="fx-later" className={tool} disabled={locked || idx < 0 || idx >= total - 1} onClick={() => active && apply('Reorder effect', (d) => { E.nudgeEffect(d, sid, active.id, 1) })}><ArrowDown aria-hidden size={14} />Later</button>
          </div>
        </TimingFields>
      </Group>
      {slide.locked && <p className="self-center px-3 text-xs text-amber-700 shrink-0">This slide is locked. Unlock it to change its animation.</p>}
      {pathEditId && <p className="hidden" data-testid="fx-path-editing">{EFFECT_INFO[active?.type ?? 'path-line'].label}</p>}
    </div>
  )
}
