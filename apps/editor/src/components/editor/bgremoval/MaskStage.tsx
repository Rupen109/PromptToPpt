import { useEffect, useRef } from 'react'
import { GestureMachine, type Handlers, type Intent } from '@/lib/bgremoval/gestures'
import { spaceIsForStage, type KeyTarget } from '@/lib/bgremoval/keys'
import { union } from '@/lib/bgremoval/mask'
import type { Backdrop } from '@/lib/bgremoval/renderer'
import type { Rect } from '@/lib/bgremoval/types'
import type { Session } from '@/lib/bgremoval/useBackgroundRemoval'
import { canvasPoint, fitView, pinchView, toImage, wheelAction, wheelFactor, zoomAbout, type View } from '@/lib/bgremoval/view'

export type StageTool = 'erase' | 'restore' | 'pan'
export interface StageControls {
  fit(): void
  actual(): void
  zoomBy(factor: number): void
  /** The mask changed outside a stroke (undo, redo, reset, a computed edit): redraw it (only `rect` when known). */
  refresh(rect?: Rect | null): void
}
interface Props {
  session: Session
  tool: StageTool
  /** brush diameter in screen pixels */
  brush: number
  /** 0 to 100 */
  hardness: number
  backdrop: Backdrop
  compare: { on: boolean; at: number }
  /** a plain mouse wheel zooms (true) or pans (false); Ctrl/Cmd + wheel and a trackpad pinch always zoom */
  wheelZooms: boolean
  /** the picture is being changed by something else (a feather, an export): the stage ignores the pointer */
  frozen: boolean
  onCompareAt(at: number): void
  /** a stroke was finished or cancelled (so undo and redo can be updated) */
  onEdit(): void
  onZoom(percent: number): void
  /** hands the view commands to the dialog (and takes them back with null when the stage goes away) */
  onControls(c: StageControls | null): void
}

/**
 * The picture, the brush and the view. It owns no picture data: strokes go to the MaskEditor, the renderer draws, and the zoom and pan live in a ref (a drag never re-renders React).
 *
 * Pointers: every pointer is tracked by its id (gestures.ts). ONE pointer paints (or pans with the move tool, Space or the middle button); a SECOND pointer cancels the stroke without
 * keeping it and the two pinch-zoom and pan, so pinching never paints. Wheel: Ctrl/Cmd + wheel and a trackpad pinch zoom, a mouse wheel zooms or pans by the person's choice, a trackpad
 * scroll pans. Space (hold) pans, but only for the stage: it never takes Space from a focused button, radio button or slider (keys.ts). Positions are converted with the canvas's real
 * ratio of pixels to page size (view.ts), so the brush lands exactly under the pointer at every zoom and pixel ratio.
 */
export function MaskStage(p: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const cursor = useRef<HTMLDivElement>(null)
  const divider = useRef<HTMLDivElement>(null)
  const latest = useRef(p)
  useEffect(() => { latest.current = p })
  const view = useRef<View | null>(null)
  const frame = useRef(0)
  const size = useRef({ w: 0, h: 0 })
  const machine = useRef<GestureMachine | null>(null)

  useEffect(() => {
    const el = canvas.current, box = wrap.current
    if (!el || !box) return
    const { session } = latest.current
    const { editor, renderer } = session
    const W = editor.width, H = editor.height
    const st = { space: false, hover: false, dirty: null as Rect | null }

    /** canvas pixels per page (CSS) pixel: the canvas is drawn at the device's pixel ratio */
    const k = () => el.width / (el.getBoundingClientRect().width || 1)
    const lim = () => ({ min: fitView(W, H, el.width, el.height).scale * 0.25, max: 40 * k() })
    const place = () => {
      const v = view.current
      const c = latest.current
      if (v && divider.current) {
        divider.current.style.left = `${(v.ox + W * v.scale * c.compare.at) / k()}px`
        divider.current.style.display = c.compare.on ? 'block' : 'none'
      }
      if (v) c.onZoom(Math.round((v.scale / k()) * 100))
    }
    const draw = () => {
      frame.current = 0
      const v = view.current
      const ctx = el.getContext('2d')
      if (!v || !ctx || size.current.w === 0) return
      const c = latest.current
      renderer.draw(ctx, el.width, el.height, { view: v, backdrop: c.backdrop, compare: c.compare })
      place()
    }
    const schedule = () => { if (!frame.current) frame.current = requestAnimationFrame(draw) }
    const fit = () => { view.current = fitView(W, H, el.width, el.height); schedule() }
    const zoomAt = (factor: number, cx: number, cy: number) => { if (view.current) { view.current = zoomAbout(view.current, factor, cx, cy, lim()); schedule() } }
    const flush = () => { if (st.dirty) { renderer.syncMask(st.dirty); st.dirty = null; schedule() } }

    latest.current.onControls({
      fit,
      actual: () => { const v = view.current; if (v) zoomAt(k() / v.scale, el.width / 2, el.height / 2) },
      zoomBy: (f) => zoomAt(f, el.width / 2, el.height / 2),
      refresh: (rect) => { renderer.syncMask(rect ?? undefined); schedule() },
    })

    const resize = () => {
      const r = box.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr))
      const first = size.current.w === 0
      size.current = { w, h }
      el.width = w; el.height = h
      if (first || !view.current) fit(); else schedule()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(box)
    resize()
    // moving the window to another screen changes the pixel ratio without resizing anything
    let mq: MediaQueryList | null = null
    const watchRatio = () => {
      mq?.removeEventListener('change', onRatio)
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      mq.addEventListener('change', onRatio)
    }
    function onRatio() { resize(); watchRatio() }
    watchRatio()

    const radius = () => (latest.current.brush / 2 * k()) / view.current!.scale
    const handlers: Handlers = {
      beginStroke: (pt) => {
        const c = latest.current, i = toImage(view.current!, pt)
        const rect = editor.beginStroke(c.tool === 'restore' ? 'restore' : 'erase', radius(), c.hardness / 100, i.x, i.y)
        if (rect) st.dirty = union(st.dirty, rect)
      },
      strokeTo: (pt) => { const i = toImage(view.current!, pt); const r = editor.lineTo(i.x, i.y); if (r) st.dirty = union(st.dirty, r) },
      endStroke: () => { editor.endStroke(); flush(); latest.current.onEdit() },
      cancelStroke: () => { const r = editor.cancelStroke(); if (r) st.dirty = union(st.dirty, r); flush(); latest.current.onEdit() },
      panBy: (dx, dy) => { const v = view.current; if (v) { view.current = { ...v, ox: v.ox + dx, oy: v.oy + dy }; schedule() } },
      pinch: (a0, b0, a1, b1) => { const v = view.current; if (v) { view.current = pinchView(v, a0, b0, a1, b1, lim()); schedule() } },
    }
    const gestures = new GestureMachine(handlers)
    machine.current = gestures

    const pt = (e: { clientX: number; clientY: number }) => canvasPoint(el.getBoundingClientRect(), el.width, el.height, e.clientX, e.clientY)
    const moveCursor = (e: PointerEvent) => {
      const c = latest.current, cur = cursor.current
      if (!cur) return
      const show = e.pointerType !== 'touch' && c.tool !== 'pan' && !c.compare.on && !st.space && !c.frozen
      cur.style.display = show ? 'block' : 'none'
      const r = box.getBoundingClientRect()
      cur.style.width = cur.style.height = `${c.brush}px`
      cur.style.transform = `translate(${e.clientX - r.left - c.brush / 2}px, ${e.clientY - r.top - c.brush / 2}px)`
    }
    const down = (e: PointerEvent) => {
      const c = latest.current
      if (!view.current || c.frozen || (e.pointerType === 'mouse' && e.button > 1)) return
      el.setPointerCapture(e.pointerId)
      box.focus({ preventScroll: true }) // the stage has the keyboard now: Space moves the picture
      const intent: Intent = c.tool === 'pan' || e.button === 1 || st.space ? 'pan' : c.compare.on ? 'none' : 'paint'
      gestures.down(e.pointerId, pt(e), intent)
      flush()
      if (e.button === 1) e.preventDefault()
    }
    const move = (e: PointerEvent) => {
      moveCursor(e)
      const events = e.getCoalescedEvents?.() ?? []
      for (const ev of events.length ? events : [e]) gestures.move(e.pointerId, pt(ev))
      flush()
    }
    const up = (e: PointerEvent) => { gestures.up(e.pointerId, e.type === 'pointercancel'); flush() }
    const leave = () => { if (cursor.current) cursor.current.style.display = 'none' }
    const wheel = (e: WheelEvent) => {
      if (!view.current) return
      e.preventDefault()
      const p0 = pt(e)
      if (wheelAction(e, latest.current.wheelZooms) === 'zoom') zoomAt(wheelFactor(e), p0.x, p0.y)
      else {
        const v = view.current, line = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
        view.current = { ...v, ox: v.ox - e.deltaX * line * k(), oy: v.oy - e.deltaY * line * k() }
        schedule()
      }
    }

    // keys: only the stage's own, and never one aimed at a control
    const keydown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if (!spaceIsForStage({ target: e.target as KeyTarget | null, stageHasFocus: document.activeElement === box, pointerOverStage: st.hover })) return
      st.space = true
      el.style.cursor = 'grab'
      if (cursor.current) cursor.current.style.display = 'none'
      e.preventDefault()
    }
    const clearSpace = () => { if (st.space) { st.space = false; el.style.cursor = '' } }
    const keyup = (e: KeyboardEvent) => { if (e.code === 'Space') clearSpace() }
    const stageKey = (e: KeyboardEvent) => {
      if (e.target !== box || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '0') { fit(); e.preventDefault() } else if (e.key === '1') { const v = view.current; if (v) zoomAt(k() / v.scale, el.width / 2, el.height / 2); e.preventDefault() }
      else if (e.key === '+' || e.key === '=') { zoomAt(1.25, el.width / 2, el.height / 2); e.preventDefault() } else if (e.key === '-') { zoomAt(1 / 1.25, el.width / 2, el.height / 2); e.preventDefault() }
    }
    const enter = () => { st.hover = true }
    const exit = () => { st.hover = false }

    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', leave)
    el.addEventListener('wheel', wheel, { passive: false })
    box.addEventListener('pointerenter', enter); box.addEventListener('pointerleave', exit); box.addEventListener('keydown', stageKey)
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', clearSpace)
    return () => {
      ro.disconnect()
      mq?.removeEventListener('change', onRatio)
      cancelAnimationFrame(frame.current); frame.current = 0
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('pointerleave', leave)
      el.removeEventListener('wheel', wheel)
      box.removeEventListener('pointerenter', enter); box.removeEventListener('pointerleave', exit); box.removeEventListener('keydown', stageKey)
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', clearSpace)
      gestures.reset() // a stroke still in progress is thrown away, not kept half done
      machine.current = null
      latest.current.onControls(null)
      el.width = 0; el.height = 0 // lets go of the canvas memory
    }
    // the session never changes for one stage; the rest is read through `latest`
  }, [p.session])

  // something else took over the picture (a feather, an export): no gesture may be in progress
  useEffect(() => { if (p.frozen) machine.current?.reset() }, [p.frozen])

  // anything that changes what is drawn (not what is edited) asks for a new frame
  useEffect(() => { if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; const el = canvas.current, v = view.current; const ctx = el?.getContext('2d'); if (el && v && ctx && size.current.w) { p.session.renderer.draw(ctx, el.width, el.height, { view: v, backdrop: p.backdrop, compare: p.compare }); const W = p.session.editor.width; if (divider.current) { divider.current.style.left = `${(v.ox + W * v.scale * p.compare.at) / (el.width / (el.getBoundingClientRect().width || 1))}px`; divider.current.style.display = p.compare.on ? 'block' : 'none' } } }) }, [p.backdrop, p.compare, p.session])

  const dragDivider = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = canvas.current, v = view.current
    if (!el || !v) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const W = p.session.editor.width
    const set = (x: number) => { p.onCompareAt(Math.min(1, Math.max(0, (canvasPoint(el.getBoundingClientRect(), el.width, el.height, x, 0).x - v.ox) / (W * v.scale)))) }
    set(e.clientX)
    const mv = (ev: PointerEvent) => set(ev.clientX)
    const end = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', end) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', end)
  }

  return (
    <div ref={wrap} tabIndex={0} aria-label="Picture editing area. Hold Space and drag to move the picture; 0 fits it to the screen, 1 shows it at actual size." className="relative w-full h-full overflow-hidden bg-neutral-200 select-none outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset" data-testid="bg-stage">
      <canvas ref={canvas} className="absolute inset-0 w-full h-full touch-none" style={{ touchAction: 'none', cursor: p.frozen ? 'progress' : p.tool === 'pan' ? 'grab' : p.compare.on ? 'default' : 'none' }} aria-label="Picture preview" data-testid="bg-canvas" />
      <div ref={cursor} aria-hidden className="pointer-events-none absolute left-0 top-0 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]" style={{ display: 'none' }} />
      <div ref={divider} className="absolute top-0 bottom-0 w-0.5 bg-white shadow" style={{ display: 'none' }} data-testid="bg-divider">
        <div role="slider" aria-label="Before and after" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.compare.at * 100)} tabIndex={0} onPointerDown={dragDivider}
          onKeyDown={(e) => { if (e.key === 'ArrowLeft') p.onCompareAt(Math.max(0, p.compare.at - 0.05)); if (e.key === 'ArrowRight') p.onCompareAt(Math.min(1, p.compare.at + 0.05)) }}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-9 w-5 rounded-full bg-white shadow border border-slate-300 cursor-ew-resize" />
      </div>
    </div>
  )
}
