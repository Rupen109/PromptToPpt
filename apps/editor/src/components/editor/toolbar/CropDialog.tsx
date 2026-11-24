import { useEffect, useRef, useState } from 'react'
import { X } from '@prompttoppt/ui/icons'
import type { SlideElement } from '@prompttoppt/validation'
import { Portal } from '@/components/Portal'
import * as C from '@/editor/commands'
import { fitShape, fractionRatio, moveCrop, resizeCrop, type Handle, type Rect } from '@/editor/crop-geometry'
import { useDoc } from '@/editor/store'
import { useDialog } from '@/lib/useDialog'

type ImageEl = Extract<SlideElement, { type: 'image' }>
const WHOLE: Rect = { x: 0, y: 0, w: 1, h: 1 }
const HANDLES: { h: Handle; style: React.CSSProperties; cursor: string; label: string }[] = [
  { h: 'nw', style: { left: 0, top: 0 }, cursor: 'nwse-resize', label: 'top left' }, { h: 'n', style: { left: '50%', top: 0 }, cursor: 'ns-resize', label: 'top' }, { h: 'ne', style: { left: '100%', top: 0 }, cursor: 'nesw-resize', label: 'top right' },
  { h: 'w', style: { left: 0, top: '50%' }, cursor: 'ew-resize', label: 'left' }, { h: 'e', style: { left: '100%', top: '50%' }, cursor: 'ew-resize', label: 'right' },
  { h: 'sw', style: { left: 0, top: '100%' }, cursor: 'nesw-resize', label: 'bottom left' }, { h: 's', style: { left: '50%', top: '100%' }, cursor: 'ns-resize', label: 'bottom' }, { h: 'se', style: { left: '100%', top: '100%' }, cursor: 'nwse-resize', label: 'bottom right' },
]
/** the shapes a crop can be locked to: width ÷ height in pixels */
const SHAPES: { key: string; label: string; ratio: number | null | 'original' }[] = [
  { key: 'free', label: 'Free', ratio: null }, { key: 'original', label: 'Original', ratio: 'original' }, { key: '1:1', label: '1:1', ratio: 1 }, { key: '4:3', label: '4:3', ratio: 4 / 3 }, { key: '16:9', label: '16:9', ratio: 16 / 9 }, { key: '3:4', label: '3:4', ratio: 3 / 4 }, { key: '9:16', label: '9:16', ratio: 9 / 16 },
]
const BOX_W = 640, BOX_H = 420

/** Crop a picture to any rectangle: drag the box or its handles (arrow keys too), or lock a shape. The frame then takes the cut-out's shape, so nothing is stretched. One undo step. */
export function CropDialog({ slideId, elementId, onClose }: { slideId: string; elementId: string; onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(true, onClose)
  const el = useDoc((s) => s.doc?.slides.find((x) => x.id === slideId)?.elements.find((e) => e.id === elementId)) as ImageEl | undefined
  const apply = useDoc((s) => s.apply)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [broken, setBroken] = useState(false)
  const [rect, setRect] = useState<Rect>(el?.crop ?? WHOLE)
  const [shape, setShape] = useState<string>('free')
  const drag = useRef<{ kind: 'move' | Handle; sx: number; sy: number; start: Rect } | null>(null)
  const src = el?.src
  useEffect(() => {
    if (!src) return
    const im = new Image()
    im.onload = () => setNat({ w: im.naturalWidth, h: im.naturalHeight })
    im.onerror = () => setBroken(true)
    im.src = src
  }, [src])
  if (!el || el.type !== 'image') return null
  const aspect = nat ? nat.w / nat.h : 1
  const scale = nat ? Math.min(BOX_W / nat.w, BOX_H / nat.h) : 1
  const dw = nat ? Math.round(nat.w * scale) : BOX_W, dh = nat ? Math.round(nat.h * scale) : BOX_H
  const ratio = (() => { const r = SHAPES.find((x) => x.key === shape)?.ratio; return r == null ? undefined : fractionRatio(r === 'original' ? aspect : r, aspect) })()
  const pick = (key: string) => {
    setShape(key)
    const r = SHAPES.find((x) => x.key === key)?.ratio
    if (r == null) return
    setRect(r === 'original' ? WHOLE : fitShape(fractionRatio(r, aspect)))
  }
  const begin = (kind: 'move' | Handle, e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { kind, sx: e.clientX, sy: e.clientY, start: rect } }
  const go = (e: React.PointerEvent) => {
    const g = drag.current
    if (!g) return
    const dx = (e.clientX - g.sx) / dw, dy = (e.clientY - g.sy) / dh
    setRect(g.kind === 'move' ? moveCrop(g.start, dx, dy) : resizeCrop(g.start, g.kind, dx, dy, ratio))
  }
  const end = () => { drag.current = null }
  const nudge = (kind: 'move' | Handle, e: React.KeyboardEvent) => {
    const step = (e.shiftKey ? 0.05 : 0.01), d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (!d) return
    e.preventDefault(); e.stopPropagation()
    setRect((r) => (kind === 'move' ? moveCrop(r, d[0]!, d[1]!) : resizeCrop(r, kind, d[0]!, d[1]!, ratio)))
  }
  const px = (v: number, total: number) => Math.round(v * total)
  return (
    <Portal><div className="fixed inset-0 z-[70] bg-black/40 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Crop picture" data-testid="crop-dialog" className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-auto p-5 shadow-xl outline-none">
        <div className="flex items-center justify-between mb-3"><h2 className="font-heading font-bold text-xl">Crop picture</h2><button onClick={onClose} aria-label="Close" className="text-slate-500"><X aria-hidden size={20} /></button></div>
        <div className="flex flex-wrap items-center gap-1.5 mb-3" role="group" aria-label="Crop shape">
          {SHAPES.map((s) => <button key={s.key} aria-pressed={shape === s.key} onClick={() => pick(s.key)} className={`h-8 px-3 rounded-md border text-sm ${shape === s.key ? 'bg-foreground text-white border-foreground' : 'border-border'}`}>{s.label}</button>)}
        </div>
        {broken ? <p className="text-sm text-red-700">This picture could not be opened, so it cannot be cropped here.</p> : !nat ? <p className="text-sm text-slate-500">Opening the picture…</p> : (
          <div className="grid place-items-center">
            <div data-testid="crop-stage" style={{ position: 'relative', width: dw, height: dh, touchAction: 'none', userSelect: 'none', background: '#e5e7eb' }} onPointerMove={go} onPointerUp={end} onPointerCancel={end}>
              <img src={el.src} alt="" draggable={false} style={{ width: dw, height: dh, display: 'block' }} />
              <div role="group" aria-label="Part of the picture that stays" tabIndex={0} onPointerDown={(e) => begin('move', e)} onKeyDown={(e) => nudge('move', e)} data-testid="crop-box"
                style={{ position: 'absolute', left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%`, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)', outline: '2px solid #fff', cursor: 'move' }}>
                {HANDLES.map((hd) => (
                  <div key={hd.h} role="slider" tabIndex={0} aria-label={`Crop edge: ${hd.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rect.w * 100)} data-handle={hd.h} onPointerDown={(e) => begin(hd.h, e)} onKeyDown={(e) => nudge(hd.h, e)}
                    style={{ position: 'absolute', ...hd.style, width: 22, height: 22, margin: '-11px 0 0 -11px', background: '#fff', border: '2px solid #111', borderRadius: 4, cursor: hd.cursor }} />
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2" data-testid="crop-size">Keeps {px(rect.w, nat.w)} × {px(rect.h, nat.h)} of {nat.w} × {nat.h} pixels. Drag the box or the squares; arrow keys nudge (Shift for more).</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button disabled={!el.crop} onClick={() => { if (nat) apply('Remove crop', (d) => { C.setPictureCrop(d, slideId, elementId, null, aspect) }); onClose() }} className="h-9 px-3 rounded-lg border border-border text-sm disabled:opacity-40">Remove crop</button>
          <button onClick={onClose} className="h-9 px-3 rounded-lg border border-border text-sm ml-auto">Cancel</button>
          <button data-testid="crop-apply" disabled={!nat} onClick={() => { apply('Crop picture', (d) => { C.setPictureCrop(d, slideId, elementId, rect, aspect) }); onClose() }} className="h-9 px-5 rounded-lg bg-foreground text-white text-sm font-semibold disabled:opacity-40">Apply</button>
        </div>
      </div>
    </div></Portal>
  )
}
