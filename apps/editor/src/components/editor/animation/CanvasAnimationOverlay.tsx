import { useRef, useState, type PointerEvent as RPE } from 'react'
import { pathToSvg, simplifyStroke } from '@prompttoppt/ui'
import type { Slide } from '@prompttoppt/validation'
import * as E from '@/editor/effect-commands'
import { activeEffect, badgesByElement, timelineModel } from '@/editor/animation-model'
import { useDoc } from '@/editor/store'
import { useUi } from '@/editor/ui'

type Pt = [number, number]

/**
 * What the animation tools draw on the canvas, in slide coordinates (the stage scales them): a numbered tag on every animated object while the Animation pane or tab is open, and
 * the motion path of the active effect. A path being edited has a handle on each point (drag to move, double-click a handle to remove it, double-click the line to add one);
 * a path being DRAWN takes the next stroke made with the mouse (it starts at the object: the stroke's own start is the object's place).
 */
export function CanvasAnimationOverlay({ slide, scale, W, H }: { slide: Slide; scale: number; W: number; H: number }) {
  const apply = useDoc((s) => s.apply)
  const drawer = useUi((s) => s.drawer)
  const ribbon = useUi((s) => s.ribbon)
  const selection = useUi((s) => s.selection)
  const activeId = useUi((s) => s.activeEffectId)
  const pathEditId = useUi((s) => s.pathEditId)
  const drawing = useUi((s) => s.pathDrawing)
  const [live, setLive] = useState<{ pts: Pt[]; index: number } | null>(null)
  const [stroke, setStroke] = useState<Pt[] | null>(null)
  const drag = useRef<{ index: number } | null>(null)
  const sid = slide.id
  const effects = slide.effects
  const showBadges = (drawer === 'animations' || ribbon === 'animations') && !!effects?.length
  const active = activeEffect(slide, activeId, selection)
  const pathFx = active && active.category === 'path' ? active : undefined
  const editing = pathFx && pathEditId === pathFx.id && !slide.locked
  const owner = pathFx ? slide.elements.find((e) => e.id === pathFx.elementId) : undefined

  const model = showBadges ? timelineModel(slide) : null
  const badges = model ? badgesByElement(model) : null
  const px = (n: number) => n / scale
  const toCanvas = (e: RPE): Pt => { const r = (e.currentTarget as Element).closest('[data-fx-layer]')!.getBoundingClientRect(); return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale] }

  const origin: Pt = owner ? [owner.x + owner.width / 2, owner.y + owner.height / 2] : [0, 0]
  const stored = (pathFx?.path ?? []) as Pt[]
  const pts = live?.pts ?? stored
  const commit = (next: Pt[]) => { if (pathFx) apply('Edit path', (d) => { E.setCustomPath(d, sid, pathFx.id, next) }) }

  function downHandle(e: RPE, index: number) {
    e.stopPropagation(); e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    drag.current = { index }
    setLive({ pts: stored.map((p) => [...p] as Pt), index })
  }
  function moveHandle(e: RPE) {
    if (!drag.current || !live) return
    const [x, y] = toCanvas(e)
    const next = live.pts.map((p, i) => (i === drag.current!.index ? ([Math.round(x - origin[0]), Math.round(y - origin[1])] as Pt) : p))
    setLive({ pts: next, index: drag.current.index })
  }
  function upHandle() {
    const l = live
    drag.current = null; setLive(null)
    if (l && JSON.stringify(l.pts) !== JSON.stringify(stored)) commit(l.pts)
  }
  function removePoint(index: number) { if (stored.length > 2 && index > 0) commit(stored.filter((_, i) => i !== index)) }
  function addPoint(e: RPE | React.MouseEvent) {
    if (stored.length >= 100) return
    const r = (e.currentTarget as Element).closest('[data-fx-layer]')!.getBoundingClientRect()
    const x = ((e as React.MouseEvent).clientX - r.left) / scale - origin[0], y = ((e as React.MouseEvent).clientY - r.top) / scale - origin[1]
    let best = 0, bestD = Infinity
    for (let i = 0; i < stored.length - 1; i++) {
      const a = stored[i]!, b = stored[i + 1]!
      const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy || 1
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2))
      const d = Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y)
      if (d < bestD) { bestD = d; best = i }
    }
    const next = [...stored]; next.splice(best + 1, 0, [Math.round(x), Math.round(y)])
    commit(next)
  }

  const w = Math.max(2, px(2.5))
  return (
    <div data-fx-layer="" style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, pointerEvents: 'none', zIndex: 9400 }}>
      {badges && [...badges.entries()].map(([id, list]) => {
        const el = slide.elements.find((x) => x.id === id)
        if (!el) return null
        const label = [...new Set(list.map((b) => (b.click === null ? 'T' : String(b.click))))].join(',')
        return (
          <button key={id} type="button" data-testid="fx-badge" data-element-id={id} aria-label={`Animation ${label} on this object`} onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); useUi.getState().select([id]); useUi.getState().setActiveEffect(list[0]!.effectId) }}
            style={{ position: 'absolute', left: el.x - px(4), top: el.y - px(4), minWidth: px(22), height: px(22), padding: `0 ${px(5)}px`, borderRadius: px(5), background: '#f59e0b', color: '#fff', fontSize: px(13), fontWeight: 700, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: `${px(22)}px`, border: `${px(1.5)}px solid #fff`, boxShadow: `0 ${px(1)}px ${px(3)}px rgba(0,0,0,.35)`, pointerEvents: 'auto', cursor: 'pointer', zIndex: 5 }}>{label}</button>
        )
      })}
      {pathFx && owner && pts.length >= 2 && (
        <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} data-testid="fx-path-svg" aria-hidden>
          <path d={pathToSvg(pts, origin)} fill="none" stroke="#0ea5e9" strokeWidth={w} strokeDasharray={`${px(8)} ${px(6)}`} style={{ pointerEvents: editing ? 'stroke' : 'none', cursor: editing ? 'copy' : undefined }} onDoubleClick={editing ? addPoint : undefined} data-testid="fx-path-line" />
          <circle cx={origin[0]} cy={origin[1]} r={px(6)} fill="#22c55e" stroke="#fff" strokeWidth={px(1.5)} />
          <rect x={origin[0] + pts[pts.length - 1]![0] - owner.width / 2} y={origin[1] + pts[pts.length - 1]![1] - owner.height / 2} width={owner.width} height={owner.height} fill="none" stroke="#0ea5e9" strokeWidth={w} strokeDasharray={`${px(4)} ${px(4)}`} opacity={0.55} />
          {editing && !drawing && pts.slice(1).map((p, k) => (
            <circle key={k} data-testid="fx-path-handle" cx={origin[0] + p[0]} cy={origin[1] + p[1]} r={px(7)} fill={k === pts.length - 2 ? '#ef4444' : '#fff'} stroke="#0ea5e9" strokeWidth={px(2)} style={{ pointerEvents: 'auto', cursor: 'grab', touchAction: 'none' }}
              onPointerDown={(e) => downHandle(e, k + 1)} onPointerMove={moveHandle} onPointerUp={upHandle} onDoubleClick={() => removePoint(k + 1)} />
          ))}
        </svg>
      )}
      {editing && drawing && (
        <div data-testid="fx-path-draw" role="application" aria-label="Draw the motion path: press, drag and release" style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, cursor: 'crosshair', pointerEvents: 'auto', touchAction: 'none', background: 'rgba(14,165,233,.06)', outline: `${px(3)}px dashed #0ea5e9`, outlineOffset: -px(3) }}
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); (e.currentTarget as Element).setPointerCapture(e.pointerId); setStroke([toCanvas(e)]) }}
          onPointerMove={(e) => { if (stroke) setStroke([...stroke, toCanvas(e)]) }}
          onPointerUp={() => {
            const s = stroke; setStroke(null)
            if (!s) return
            const pts2 = simplifyStroke(s)
            if (pts2.length >= 2) { commit(pts2); useUi.getState().setPathDrawing(false) }
          }}>
          {stroke && stroke.length > 1 && <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}><path d={pathToSvg(stroke)} fill="none" stroke="#0ea5e9" strokeWidth={w} /></svg>}
        </div>
      )}
    </div>
  )
}

/** The small bar over the canvas while a path is being drawn or edited. */
export function PathBar({ slide }: { slide: Slide }) {
  const pathEditId = useUi((s) => s.pathEditId)
  const drawing = useUi((s) => s.pathDrawing)
  const fx = slide.effects?.find((e) => e.id === pathEditId)
  if (!fx) return null
  const btn = 'h-8 px-3 rounded-md text-sm border border-border bg-white hover:bg-slate-50'
  return (
    <div role="toolbar" aria-label="Motion path" data-testid="fx-path-bar" className="absolute z-[60] left-1/2 -translate-x-1/2 -top-11 flex items-center gap-2 bg-white border border-border rounded-lg shadow-lg px-2 py-1.5 text-sm">
      <span className="text-slate-600">{drawing ? 'Draw the path with the mouse' : 'Drag the points; double-click the line to add one, a point to remove it'}</span>
      <button type="button" data-testid="fx-path-redraw" className={btn} onClick={() => useUi.getState().setPathDrawing(!drawing)}>{drawing ? 'Edit points' : 'Draw again'}</button>
      <button type="button" data-testid="fx-path-done" className={`${btn} bg-primary text-white border-primary`} onClick={() => { useUi.getState().setPathEdit(null); useUi.getState().startPreview([fx.elementId]) }}>Done</button>
    </div>
  )
}
