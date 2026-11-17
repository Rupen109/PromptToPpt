import { memo, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, Lock, Pencil, X } from '@prompttoppt/ui/icons'
import type { Slide, SlideElement } from '@prompttoppt/validation'
import { stackOrder, renameElement, moveLayer, setHidden } from '@/editor/selection-commands'
import { useDoc } from '@/editor/store'
import { useUi } from '@/editor/ui'
import { elementLabel } from './labels'

const iconBtn = 'w-7 h-7 grid place-items-center rounded-md hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent'
const KIND: Record<string, string> = { text: 'Text', image: 'Picture', shape: 'Shape', icon: 'Icon', chart: 'Chart', table: 'Table' }

const Item = memo(function Item({ el, position, count, selected, slideLocked, onSelect, onRename, onMove, onHide }: { el: SlideElement; position: number; count: number; selected: boolean; slideLocked: boolean; onSelect: (id: string, additive: boolean) => void; onRename: (id: string, name: string) => void; onMove: (id: string, to: 'up' | 'down') => void; onHide: (id: string, hidden: boolean) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const locked = slideLocked || el.locked
  const start = () => { if (!locked) { setDraft(el.label ?? ''); setEditing(true) } }
  const done = (save: boolean) => { setEditing(false); if (save) onRename(el.id, draft) }
  return (
    <li data-testid="sel-row" data-element-id={el.id} aria-current={selected ? 'true' : undefined} className={`flex items-center gap-1 rounded-lg border pl-1 pr-1 py-1 ${selected ? 'border-primary bg-primary/5' : 'border-border bg-white'} ${el.hidden ? 'opacity-60' : ''}`}>
      <button type="button" className={iconBtn} data-testid="sel-eye" aria-pressed={!el.hidden} aria-label={`${el.hidden ? 'Show' : 'Hide'} ${elementLabel(el)}`} title={el.hidden ? 'Show on the slide' : 'Hide from the slide'} disabled={locked} onClick={() => onHide(el.id, !el.hidden)}>{el.hidden ? <EyeOff aria-hidden size={15} /> : <Eye aria-hidden size={15} />}</button>
      {editing ? (
        <>
          <input autoFocus data-testid="sel-name-input" aria-label={`Name of ${elementLabel(el)}`} value={draft} maxLength={80} placeholder={KIND[el.type]} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false) }} onBlur={() => done(true)} className="flex-1 min-w-0 h-8 rounded-md border border-primary px-2 text-sm" />
          <button type="button" className={iconBtn} aria-label="Save name" onMouseDown={(e) => e.preventDefault()} onClick={() => done(true)}><Check aria-hidden size={14} /></button>
        </>
      ) : (
        <>
          <button type="button" data-testid="sel-select" onClick={(e) => onSelect(el.id, e.shiftKey || e.metaKey || e.ctrlKey)} onDoubleClick={start} onKeyDown={(e) => { if (e.key === 'F2') { e.preventDefault(); start() } }} className="flex-1 min-w-0 text-left py-1 rounded-md focus-visible:outline-2 focus-visible:outline-primary" aria-label={`${elementLabel(el)}, ${KIND[el.type] ?? el.type}, layer ${count - position} of ${count}${el.locked ? ', locked' : ''}${el.hidden ? ', hidden' : ''}`}>
            <span className="block text-sm font-medium truncate">{elementLabel(el)}</span>
            <span className="block text-[11px] text-slate-500">{KIND[el.type] ?? el.type}</span>
          </button>
          {el.locked && <span className="text-slate-400" title="Locked" aria-hidden><Lock size={13} /></span>}
          <button type="button" className={iconBtn} data-testid="sel-rename" aria-label={`Rename ${elementLabel(el)}`} title="Rename (F2)" disabled={locked} onClick={start}><Pencil aria-hidden size={13} /></button>
          <button type="button" className={iconBtn} data-testid="sel-up" aria-label={`Bring ${elementLabel(el)} forward`} disabled={locked || position === 0} onClick={() => onMove(el.id, 'up')}><ArrowUp aria-hidden size={14} /></button>
          <button type="button" className={iconBtn} data-testid="sel-down" aria-label={`Send ${elementLabel(el)} backward`} disabled={locked || position === count - 1} onClick={() => onMove(el.id, 'down')}><ArrowDown aria-hidden size={14} /></button>
        </>
      )}
    </li>
  )
})

/** The Selection pane: the slide's objects from the front to the back, each with a name you can change (the Animation pane and the Morph check show it), selection that follows the canvas, and Forward / Backward buttons. */
export function SelectionPane({ slide, onClose }: { slide: Slide; onClose: () => void }) {
  const apply = useDoc((s) => s.apply)
  const selection = useUi((s) => s.selection)
  const select = useUi((s) => s.select)
  const list = useRef<HTMLUListElement>(null)
  const items = useMemo(() => stackOrder(slide).filter((e) => !e.decorative), [slide.elements]) // eslint-disable-line react-hooks/exhaustive-deps
  const sid = slide.id
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const rows = [...(list.current?.querySelectorAll<HTMLElement>('[data-testid=sel-select]') ?? [])]
    const i = rows.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    e.preventDefault()
    rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
  }
  return (
    <aside aria-label="Selection pane" data-testid="selection-pane" className="w-[300px] max-lg:fixed max-lg:z-40 max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-auto max-lg:h-[48vh] max-lg:w-auto max-lg:shadow-2xl max-lg:rounded-t-2xl max-lg:border-t max-lg:max-w-full shrink-0 bg-white border-l border-border flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="font-semibold">Selection pane</h2>
        <button type="button" onClick={onClose} aria-label="Close selection pane" className="text-slate-500 hover:text-slate-800"><X aria-hidden size={20} /></button>
      </div>
      <p className="px-4 pt-3 text-xs text-slate-500">Front to back. Double-click a name (or press F2) to rename; the eye hides an object from the slide, Present mode and exports. Objects with the same id on two slides are the same object for Morph.</p>
      <ul ref={list} data-own-keys="" onKeyDown={onKey} aria-label="Objects on this slide, front to back" className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {items.map((el, i) => (
          <Item key={el.id} el={el} position={i} count={items.length} selected={selection.includes(el.id)} slideLocked={!!slide.locked}
            onSelect={(id, add) => select([id], add)}
            onRename={(id, name) => apply('Rename object', (d) => { renameElement(d, sid, id, name) })}
            onMove={(id, to) => apply('Reorder layer', (d) => { moveLayer(d, sid, id, to) })}
            onHide={(id, hidden) => { apply(hidden ? 'Hide object' : 'Show object', (d) => { setHidden(d, sid, id, hidden) }); if (hidden) select(selection.filter((x) => x !== id)) }} />
        ))}
        {items.length === 0 && <li className="text-sm text-slate-500">This slide has no objects.</li>}
      </ul>
    </aside>
  )
}
