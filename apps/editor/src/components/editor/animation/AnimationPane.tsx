import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Play, Plus, Trash2, X } from '@prompttoppt/ui/icons'
import { EFFECTS, EFFECT_CATEGORIES, type EffectCategory, type Effect, type Presentation, type Slide } from '@prompttoppt/validation'
import { EFFECT_INFO, effectApplies } from '@prompttoppt/ui'
import * as E from '@/editor/effect-commands'
import { useDoc } from '@/editor/store'
import { useUi } from '@/editor/ui'
import { EffectEditor } from './EffectEditor'
import { EffectPreview } from './EffectPreview'
import { START_LABEL, elementLabel } from './labels'

let counter = 0
const newId = () => `fx${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`
const CATEGORY_LABEL: Record<EffectCategory, string> = { entrance: 'Entrance', emphasis: 'Emphasis', exit: 'Exit' }
const iconBtn = 'w-8 h-8 grid place-items-center rounded-md hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent'

/** Right-hand Animation pane: the selected slide's effects in play order, with controls to add to the selected object, edit, reorder, duplicate, delete and preview. Open to every plan. */
export function AnimationPane({ doc, slide, onClose }: { doc: Presentation; slide: Slide; onClose: () => void }) {
  const apply = useDoc((s) => s.apply)
  const selection = useUi((s) => s.selection)
  const select = useUi((s) => s.select)
  const [category, setCategory] = useState<EffectCategory>('entrance')
  const [type, setType] = useState<Effect['type']>('fade-in')
  const [openId, setOpenId] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const sid = slide.id
  const effects = slide.effects ?? []
  const target = selection.length === 1 ? slide.elements.find((e) => e.id === selection[0]) : undefined
  const canAdd = !!target && !slide.locked && !target.locked && effectApplies(type, target)
  const byId = useMemo(() => new Map(slide.elements.map((e) => [e.id, e])), [slide.elements])

  const pickCategory = (c: EffectCategory) => { setCategory(c); setType(EFFECTS[c][0]) }
  function add() {
    if (!target) return
    let id: string | null = null
    apply('Add effect', (d) => { id = E.addEffect(d, sid, target.id, category, type, newId, EFFECT_INFO[type].defaults) })
    if (id) setOpenId(id)
  }
  const change = (id: string, patch: Partial<Effect>) => apply('Edit effect', (d) => { E.updateEffect(d, sid, id, patch) }, { mergeKey: `fx:${id}` })

  return (
    <aside aria-label="Animation pane" data-testid="animation-pane" className="w-[340px] max-lg:fixed max-lg:z-40 max-lg:right-0 max-lg:top-14 max-lg:bottom-0 max-lg:shadow-2xl max-md:left-0 max-md:top-auto max-md:h-[60vh] max-md:rounded-t-2xl max-md:border-t max-lg:max-w-full shrink-0 bg-white border-l border-border flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="font-semibold">Animation</h2>
        <button type="button" onClick={onClose} aria-label="Close animation pane" className="text-slate-500 hover:text-slate-800"><X aria-hidden size={20} /></button>
      </div>
      <div className="p-4 border-b border-border space-y-2">
        <div className="text-xs font-semibold text-slate-500">{target ? `Add to: ${elementLabel(target)}` : 'Select one object on the slide to animate it'}</div>
        <div role="group" aria-label="Effect kind" className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg text-sm font-semibold">
          {EFFECT_CATEGORIES.map((c) => <button key={c} type="button" data-testid={`fx-cat-${c}`} aria-pressed={category === c} onClick={() => pickCategory(c)} className={`py-1 rounded-md ${category === c ? 'bg-white shadow-sm' : 'text-slate-500'}`}>{CATEGORY_LABEL[c]}</button>)}
        </div>
        <label className="block text-xs font-semibold text-slate-500">Effect
          <select data-testid="fx-add-type" className="mt-1 w-full h-9 rounded-lg border border-border bg-white px-2 text-sm font-normal text-foreground" value={type} onChange={(e) => setType(e.target.value as Effect['type'])}>
            {EFFECTS[category].map((t) => <option key={t} value={t} disabled={!!target && !effectApplies(t, target)}>{EFFECT_INFO[t].label}</option>)}
          </select>
        </label>
        <button type="button" data-testid="fx-add" disabled={!canAdd} onClick={add} className="w-full h-9 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40 inline-flex items-center justify-center gap-1.5"><Plus aria-hidden size={15} />Add effect</button>
        {slide.locked && <p className="text-xs text-amber-700">This slide is locked. Unlock it to change its animation.</p>}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {effects.length === 0 ? (
          <p className="text-sm text-slate-500 p-1" data-testid="fx-empty">No effects on this slide yet. Select an object, choose an effect and press Add effect.</p>
        ) : (
          <ol className="space-y-1.5" aria-label="Effects in play order">
            {effects.map((fx, i) => {
              const open = openId === fx.id
              return (
                <li key={fx.id} data-testid="fx-row" className={`rounded-lg border ${open ? 'border-primary' : 'border-border'}`}>
                  <div className="flex items-center gap-1 pr-1">
                    <button type="button" aria-expanded={open} onClick={() => { setOpenId(open ? null : fx.id); if (byId.has(fx.elementId)) select([fx.elementId]) }} className="flex-1 min-w-0 text-left px-2.5 py-2 text-sm">
                      <span className="font-semibold mr-1.5">{i + 1}.</span>{EFFECT_INFO[fx.type].label}
                      <span className="block text-xs text-slate-500 truncate">{elementLabel(byId.get(fx.elementId))} · {START_LABEL[fx.start]} · {fx.duration / 1000}s</span>
                    </button>
                    <button type="button" className={iconBtn} aria-label={`Move effect ${i + 1} up`} disabled={i === 0 || slide.locked} onClick={() => apply('Reorder effect', (d) => E.moveEffect(d, sid, i, i - 1))}><ArrowUp aria-hidden size={15} /></button>
                    <button type="button" className={iconBtn} aria-label={`Move effect ${i + 1} down`} disabled={i === effects.length - 1 || slide.locked} onClick={() => apply('Reorder effect', (d) => E.moveEffect(d, sid, i, i + 1))}><ArrowDown aria-hidden size={15} /></button>
                    <button type="button" className={iconBtn} aria-label={`Duplicate effect ${i + 1}`} disabled={slide.locked} onClick={() => apply('Duplicate effect', (d) => { E.duplicateEffect(d, sid, fx.id, newId) })}><Copy aria-hidden size={15} /></button>
                    <button type="button" data-testid="fx-delete" className={iconBtn} aria-label={`Delete effect ${i + 1}`} disabled={slide.locked} onClick={() => apply('Delete effect', (d) => E.removeEffect(d, sid, fx.id))}><Trash2 aria-hidden size={15} /></button>
                  </div>
                  {open && <div className="px-2 pb-2"><EffectEditor effect={fx} onChange={(p) => change(fx.id, p)} /></div>}
                </li>
              )
            })}
          </ol>
        )}
      </div>
      <div className="p-3 border-t border-border">
        <button type="button" data-testid="fx-preview" disabled={effects.length === 0} onClick={() => setPreview(true)} className="w-full h-9 rounded-lg border border-border text-sm font-medium hover:bg-slate-50 disabled:opacity-40 inline-flex items-center justify-center gap-1.5"><Play aria-hidden size={14} />Preview</button>
      </div>
      {preview && <EffectPreview doc={doc} slide={slide} onClose={() => setPreview(false)} />}
    </aside>
  )
}
