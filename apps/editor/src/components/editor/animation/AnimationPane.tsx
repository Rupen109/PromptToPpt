import { memo, useCallback, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent as RPE } from 'react'
import { ArrowDown, ArrowUp, Clock, Copy, Layers, MousePointerClick, Play, Trash2, X } from '@prompttoppt/ui/icons'
import { EFFECT_INFO } from '@prompttoppt/ui'
import type { Presentation, Slide, SlideElement } from '@prompttoppt/validation'
import * as E from '@/editor/effect-commands'
import { activeEffect, timelineModel, toSeconds, type TimelineRow } from '@/editor/animation-model'
import { useDoc } from '@/editor/store'
import { useUi } from '@/editor/ui'
import { EFFECT_ICON } from './effectIcons'
import { START_LABEL, elementLabel } from './labels'
import { newId } from './ids'

const START_ICON = { click: MousePointerClick, with: Layers, after: Clock } as const
const SNAP = 100 // ms: the timeline bars move in tenths of a second
const iconBtn = 'w-7 h-7 grid place-items-center rounded-md hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent'

interface RowProps { row: TimelineRow; element: SlideElement | undefined; span: number; active: boolean; locked: boolean; last: boolean; dragOver: boolean; handlers: Handlers }
interface Handlers {
  pick: (id: string, elementId: string) => void
  move: (id: string, by: -1 | 1) => void
  remove: (id: string) => void
  duplicate: (id: string) => void
  timing: (id: string, patch: { delay?: number; duration?: number }) => void
  playFrom: (id: string) => void
  dnd: { start: (e: DragEvent, index: number) => void; over: (e: DragEvent, index: number) => void; drop: (e: DragEvent, index: number) => void; end: () => void }
}

/**
 * One row of the Animation pane: the number and start icon, the effect and its object, and the effect's bar on the timeline. The bar is dragged to change the delay (the body)
 * or the duration (the right edge); with the keyboard, Left / Right change the delay and Shift+Left / Right the duration by a tenth of a second. Memoised: a slide with a hundred
 * effects redraws only the rows that changed.
 */
const sameRow = (a: RowProps, b: RowProps) => a.row.effect === b.row.effect && a.row.index === b.row.index && a.row.begin === b.row.begin && a.row.end === b.row.end && a.element === b.element && a.span === b.span && a.active === b.active && a.locked === b.locked && a.last === b.last && a.dragOver === b.dragOver && a.handlers === b.handlers
const Row = memo(function Row({ row, element, span, active, locked, last, dragOver, handlers }: RowProps) {
  const fx = row.effect
  const Start = START_ICON[fx.start]
  const Icon = EFFECT_ICON[fx.type]
  const track = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState<{ delay: number; duration: number } | null>(null)
  const drag = useRef<{ mode: 'move' | 'resize'; x0: number; delay: number; duration: number } | null>(null)
  const perPx = () => span / Math.max(1, track.current?.getBoundingClientRect().width ?? 1)
  const snap = (ms: number) => Math.round(ms / SNAP) * SNAP
  const own = (row.end - row.begin)
  const delay = live?.delay ?? fx.delay, duration = live?.duration ?? fx.duration
  const barStart = row.begin - fx.delay + delay
  const left = Math.min(100, (barStart / span) * 100)
  const width = Math.max(1.5, Math.min(100 - left, (((live ? duration * (own / Math.max(1, fx.duration)) : own)) / span) * 100))

  function down(e: RPE, mode: 'move' | 'resize') {
    if (locked) return
    e.stopPropagation(); e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { mode, x0: e.clientX, delay: fx.delay, duration: fx.duration }
    handlers.pick(fx.id, fx.elementId)
  }
  function moveP(e: RPE) {
    const d = drag.current
    if (!d) return
    const dms = (e.clientX - d.x0) * perPx()
    setLive(d.mode === 'move' ? { delay: Math.max(0, Math.min(20000, snap(d.delay + dms))), duration: d.duration } : { delay: d.delay, duration: Math.max(100, Math.min(20000, snap(d.duration + dms))) })
  }
  function up() {
    const d = drag.current, v = live
    drag.current = null; setLive(null)
    if (d && v && (v.delay !== d.delay || v.duration !== d.duration)) handlers.timing(fx.id, { delay: v.delay, duration: v.duration })
  }
  function key(e: KeyboardEvent) {
    if (locked || e.target !== e.currentTarget || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return
    e.preventDefault(); e.stopPropagation()
    const s = e.key === 'ArrowRight' ? SNAP : -SNAP
    handlers.timing(fx.id, e.shiftKey ? { duration: Math.max(100, fx.duration + s) } : { delay: Math.max(0, fx.delay + s) })
  }

  return (
    <li
      data-testid="fx-row" data-effect-id={fx.id} data-element-id={fx.elementId} aria-current={active ? 'true' : undefined} draggable={!locked}
      onDragStart={(e) => handlers.dnd.start(e, row.index)} onDragOver={(e) => handlers.dnd.over(e, row.index)} onDrop={(e) => handlers.dnd.drop(e, row.index)} onDragEnd={handlers.dnd.end}
      className={`rounded-lg border ${active ? 'border-primary bg-primary/5' : 'border-border bg-white'} ${dragOver ? 'ring-2 ring-primary/50' : ''}`}
    >
      <div className="flex items-center gap-1 pl-1.5 pr-1 pt-1">
        <button type="button" data-testid="fx-row-select" onClick={() => handlers.pick(fx.id, fx.elementId)} onDoubleClick={() => handlers.playFrom(fx.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left py-1 rounded-md focus-visible:outline-2 focus-visible:outline-primary" aria-label={`Effect ${row.index + 1}: ${EFFECT_INFO[fx.type].label} on ${elementLabel(element)}, ${START_LABEL[fx.start]}`}>
          <span className="w-5 text-xs font-semibold text-slate-500 tabular-nums text-right shrink-0" aria-hidden>{row.index + 1}</span>
          <span title={START_LABEL[fx.start]} className="text-slate-500 shrink-0" aria-hidden><Start size={14} /></span>
          <span className="text-primary shrink-0" aria-hidden><Icon size={16} /></span>
          <span className="min-w-0"><span className="block text-sm font-medium truncate">{elementLabel(element)}</span><span className="block text-[11px] text-slate-500 truncate">{EFFECT_INFO[fx.type].label}{fx.trigger ? ' · on click of another object' : ''}</span></span>
        </button>
        <button type="button" className={iconBtn} aria-label={`Play from effect ${row.index + 1}`} title="Play from here" onClick={() => handlers.playFrom(fx.id)}><Play aria-hidden size={13} /></button>
        <button type="button" className={iconBtn} aria-label={`Move effect ${row.index + 1} earlier`} data-testid="fx-up" disabled={row.index === 0 || locked} onClick={() => handlers.move(fx.id, -1)}><ArrowUp aria-hidden size={14} /></button>
        <button type="button" className={iconBtn} aria-label={`Move effect ${row.index + 1} later`} data-testid="fx-down" disabled={last || locked} onClick={() => handlers.move(fx.id, 1)}><ArrowDown aria-hidden size={14} /></button>
        <button type="button" className={iconBtn} aria-label={`Duplicate effect ${row.index + 1}`} disabled={locked} onClick={() => handlers.duplicate(fx.id)}><Copy aria-hidden size={14} /></button>
        <button type="button" data-testid="fx-delete" className={iconBtn} aria-label={`Delete effect ${row.index + 1}`} disabled={locked} onClick={() => handlers.remove(fx.id)}><Trash2 aria-hidden size={14} /></button>
      </div>
      <div ref={track} data-testid="fx-track" className="relative h-6 mx-2 mb-1.5 mt-0.5 rounded bg-slate-100">
        <div
          role="slider" tabIndex={0} aria-label={`Timing of effect ${row.index + 1}: starts ${toSeconds(delay)} s after its start, lasts ${toSeconds(duration)} s. Left and Right change the delay, Shift with them the duration`}
          aria-valuemin={0} aria-valuemax={20} aria-valuenow={toSeconds(delay)} aria-valuetext={`delay ${toSeconds(delay)} s, duration ${toSeconds(duration)} s`}
          data-testid="fx-bar" data-delay={delay} data-duration={duration}
          onPointerDown={(e) => down(e, 'move')} onPointerMove={moveP} onPointerUp={up} onKeyDown={key}
          className={`absolute top-0.5 bottom-0.5 rounded ${fx.category === 'entrance' ? 'bg-emerald-500' : fx.category === 'exit' ? 'bg-rose-500' : fx.category === 'path' ? 'bg-sky-500' : 'bg-amber-500'} ${locked ? '' : 'cursor-grab'} touch-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-900`}
          style={{ left: `${left}%`, width: `${width}%` }}
        >
          {!locked && <span data-testid="fx-bar-resize" onPointerDown={(e) => down(e, 'resize')} onPointerMove={moveP} onPointerUp={up} aria-hidden className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/20 rounded-r" />}
        </div>
      </div>
    </li>
  )
}, sameRow)

/**
 * The Animation Pane (PowerPoint's): every effect of the slide in play order, each with its number, start type, object and a bar on a timeline; click to select (the object is
 * selected on the canvas too, and the other way round); drag a row to reorder, or use the Earlier / Later buttons or Alt+Up / Alt+Down; drag a bar to change the delay and
 * duration; Play All / Play From run the slide's animations on the canvas. Open to every plan.
 */
export function AnimationPane({ slide, onClose }: { doc: Presentation; slide: Slide; onClose: () => void }) {
  const apply = useDoc((s) => s.apply)
  const selection = useUi((s) => s.selection)
  const activeId = useUi((s) => s.activeEffectId)
  const preview = useUi((s) => s.preview)
  const sid = slide.id
  const locked = !!slide.locked
  const model = useMemo(() => timelineModel(slide), [slide.effects, slide.elements]) // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map(slide.elements.map((e) => [e.id, e])), [slide.elements])
  const active = activeEffect(slide, activeId, selection)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const list = useRef<HTMLOListElement>(null)

  const handlers = useMemo<Handlers>(() => ({
    pick: (id, elementId) => { useUi.getState().setActiveEffect(id); useUi.getState().select([elementId]) },
    move: (id, by) => apply('Reorder effect', (d) => { E.nudgeEffect(d, sid, id, by) }),
    remove: (id) => apply('Delete effect', (d) => { E.removeEffect(d, sid, id) }),
    duplicate: (id) => { apply('Duplicate effect', (d) => { E.duplicateEffect(d, sid, id, newId) }) },
    timing: (id, patch) => apply('Edit effect timing', (d) => { E.updateEffect(d, sid, id, patch) }, { mergeKey: `fx:${id}` }),
    playFrom: (id) => useUi.getState().startPreview(null, id),
    dnd: {
      start: (e, i) => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)) },
      over: (e, i) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(i) },
      drop: (e, i) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); setDragFrom(null); setDragOver(null); if (Number.isInteger(from)) apply('Reorder effect', (d) => { E.moveEffect(d, sid, from, i) }) },
      end: () => { setDragFrom(null); setDragOver(null) },
    },
  }), [apply, sid])

  const onKey = useCallback((e: KeyboardEvent) => {
    const rows = [...(list.current?.querySelectorAll<HTMLElement>('[data-testid=fx-row-select]') ?? [])]
    const i = rows.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    const id = (rows[i]!.closest('li') as HTMLElement).dataset['effectId']!
    if (['ArrowDown', 'ArrowUp', 'Delete', 'Backspace', 'Enter'].includes(e.key)) e.stopPropagation() // the row may be gone before the page's own key handler looks at where the key came from: it must never see this key (Delete would remove the object too)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const by = e.key === 'ArrowDown' ? 1 : -1
      if (e.altKey) { if (!locked) { handlers.move(id, by); requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-effect-id="${CSS.escape(id)}"] [data-testid=fx-row-select]`)?.focus()) } }
      else rows[Math.max(0, Math.min(rows.length - 1, i + by))]?.focus()
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !locked) {
      e.preventDefault(); handlers.remove(id)
      requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[data-testid=fx-row-select]')?.focus())
    } else if (e.key === 'Enter') { e.preventDefault(); handlers.pick(id, (rows[i]!.closest('li') as HTMLElement).dataset['elementId']!) }
  }, [handlers, locked])

  const effects = slide.effects ?? []
  const ticks = Math.min(10, Math.max(2, Math.ceil(model.span / 1000)))
  return (
    <aside aria-label="Animation pane" data-testid="animation-pane" className="w-[360px] max-lg:fixed max-lg:z-40 max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-auto max-lg:h-[48vh] max-lg:w-auto max-lg:shadow-2xl max-lg:rounded-t-2xl max-lg:border-t max-lg:max-w-full shrink-0 bg-white border-l border-border flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="font-semibold">Animation pane</h2>
        <button type="button" onClick={onClose} aria-label="Close animation pane" className="text-slate-500 hover:text-slate-800"><X aria-hidden size={20} /></button>
      </div>
      <div className="flex gap-2 px-3 py-2 border-b border-border">
        <button type="button" data-testid="fx-play-all" disabled={effects.length === 0 || !!preview} onClick={() => useUi.getState().startPreview()} className="h-8 px-3 rounded-md bg-primary text-white text-sm font-medium disabled:opacity-40 inline-flex items-center gap-1.5"><Play aria-hidden size={13} />Play all</button>
        <button type="button" data-testid="fx-play-from" disabled={!active || !!preview} onClick={() => active && useUi.getState().startPreview(null, active.id)} className="h-8 px-3 rounded-md border border-border text-sm hover:bg-slate-50 disabled:opacity-40">Play from selected</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {effects.length === 0 ? (
          <p className="text-sm text-slate-500 p-1" data-testid="fx-empty">No animations on this slide yet. Select an object and choose an effect on the Animations tab.</p>
        ) : (
          <>
            <div aria-hidden className="relative h-4 mx-2 mb-1 text-[10px] text-slate-400 select-none">
              {Array.from({ length: ticks + 1 }, (_, i) => <span key={i} className="absolute -translate-x-1/2" style={{ left: `${(i / ticks) * 100}%` }}>{Math.round((i / ticks) * model.span / 100) / 10}s</span>)}
            </div>
            <ol ref={list} data-own-keys="" onKeyDown={onKey} aria-label="Animations in play order" className="space-y-1.5">
              {model.rows.map((row) => (
                <Row key={row.effect.id} row={row} element={byId.get(row.effect.elementId)} span={model.span} active={active?.id === row.effect.id} locked={locked} last={row.index === effects.length - 1} dragOver={dragOver === row.index && dragFrom !== null && dragFrom !== row.index} handlers={handlers} />
              ))}
            </ol>
            <p className="text-[11px] text-slate-500 mt-3 px-1">Drag a row to reorder it. Drag a bar to change its delay, its right edge to change its length. Keys: Up and Down to move, Alt with them to reorder, Delete to remove.</p>
          </>
        )}
      </div>
    </aside>
  )
}
