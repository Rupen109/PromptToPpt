'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { canvasToCroppedPng, type Loaded } from '@/lib/pdf-editor/images'

const W = 560, H = 220
const COLORS = [['#111827', 'Black'], ['#1d4ed8', 'Blue']] as const

/** Draw a signature; it becomes a transparent PNG item. Escape closes, Tab stays inside, focus returns to where it came from. */
export function SignDialog({ onDone, onClose }: { onDone: (img: Loaded) => void; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const drawing = useRef<{ x: number; y: number } | null>(null)
  const [ink, setInk] = useState<string>(COLORS[0][0])
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLElement>('canvas')?.focus()
    return () => back?.focus()
  }, [])

  const pos = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W * 2, y: ((e.clientY - r.top) / r.height) * H * 2 } }
  const down = (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = pos(e); line(drawing.current, drawing.current) }
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const p = pos(e); line(drawing.current, p); drawing.current = p }
  const line = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const c = canvas.current!.getContext('2d')!
    c.strokeStyle = ink; c.lineWidth = 5; c.lineCap = 'round'; c.lineJoin = 'round'
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x + 0.01, b.y); c.stroke(); setEmpty(false)
  }
  const clear = () => { canvas.current!.getContext('2d')!.clearRect(0, 0, W * 2, H * 2); setEmpty(true) }
  const use = async () => { const img = await canvasToCroppedPng(canvas.current!); if (img) onDone(img) }

  function key(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    if (e.key === 'Tab') {
      const f = [...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), canvas, input')]
      const i = f.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1)!.focus() } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0]!.focus() }
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/50 p-4" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="sign-title" onKeyDown={key} className="w-full max-w-[600px] rounded-2xl border-2 border-foreground bg-white p-5 shadow-[6px_8px_0_0_#181b25]">
        <h2 id="sign-title" className="font-heading font-extrabold text-xl text-foreground">Draw your signature</h2>
        <p className="mt-1 text-sm font-medium text-[#475569]">Use your mouse, finger or pen. It stays on your device and is added to the page as a picture with a see-through background.</p>
        <canvas ref={canvas} width={W * 2} height={H * 2} tabIndex={0} role="img" aria-label="Signature drawing area"
          onPointerDown={down} onPointerMove={move} onPointerUp={() => { drawing.current = null }} onPointerCancel={() => { drawing.current = null }}
          className="mt-4 w-full rounded-xl border-2 border-dashed border-foreground bg-[#f8f9fc] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" style={{ aspectRatio: `${W} / ${H}`, touchAction: 'none', cursor: 'crosshair' }} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-heading font-extrabold uppercase text-foreground">Ink</span>
          {COLORS.map(([c, n]) => <button key={c} type="button" aria-label={`${n} ink`} aria-pressed={ink === c} onClick={() => setInk(c)} className={`h-8 w-8 rounded-full border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${ink === c ? 'border-foreground ring-2 ring-secondary' : 'border-[#cbd5e1]'}`} style={{ background: c }} />)}
          <button type="button" onClick={clear} className="ml-auto text-sm font-bold underline hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">Clear</button>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="white" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="lime" size="md" disabled={empty} onClick={() => void use()}>Add signature</Button>
        </div>
      </div>
    </div>
  )
}
