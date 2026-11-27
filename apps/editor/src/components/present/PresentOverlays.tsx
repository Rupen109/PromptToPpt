import { useEffect, useRef, useState } from 'react'
import type { Presentation } from '@prompttoppt/validation'
import { SlideCanvas } from '@prompttoppt/ui'
import { ChevronLeft, ChevronRight, Eraser, X } from '@prompttoppt/ui/icons'

/**
 * Drawing on the slide while presenting: the pen follows the pointer (mouse, pen or finger) in one ink colour; nothing is saved to the deck, and the ink is wiped
 * when the slide changes (`key` it on the slide). Clicks while drawing never move to the next slide.
 */
export function DrawLayer({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const c = ref.current!
    const fit = () => { const r = window.devicePixelRatio || 1; c.width = window.innerWidth * r; c.height = window.innerHeight * r; const g = c.getContext('2d')!; g.scale(r, r); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = '#ef4444' }
    fit(); window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  const line = (x: number, y: number) => { const g = ref.current!.getContext('2d')!; const a = last.current ?? { x, y }; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(x, y); g.stroke(); last.current = { x, y } }
  const clear = () => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height) }
  return (
    <>
      <canvas ref={ref} data-testid="present-draw" className="fixed inset-0 z-20 h-full w-full touch-none" style={{ cursor: 'crosshair' }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); last.current = null; line(e.clientX, e.clientY) }}
        onPointerMove={(e) => { if (e.buttons) line(e.clientX, e.clientY) }}
        onPointerUp={() => { last.current = null }} />
      <div onClick={(e) => e.stopPropagation()} className="fixed top-4 left-1/2 z-30 -translate-x-1/2 flex items-center gap-1 rounded-xl bg-neutral-800/85 p-1 text-[13px] text-white shadow-lg">
        <span className="px-3">Drawing</span>
        <button type="button" onClick={clear} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-white/10"><Eraser size={14} aria-hidden />Clear</button>
        <button type="button" onClick={onDone} className="rounded-lg bg-white px-3 py-1.5 font-semibold text-neutral-900 hover:bg-white/90">Done</button>
      </div>
    </>
  )
}

/** Every slide as a small picture; picking one jumps to it. Esc or the close button returns to the slideshow. */
export function ThumbnailGrid({ doc, current, watermark, onPick, onClose }: { doc: Presentation; current: number; watermark: boolean; onPick: (i: number) => void; onClose: () => void }) {
  const here = useRef<HTMLButtonElement>(null)
  useEffect(() => { here.current?.scrollIntoView({ block: 'center' }); here.current?.focus() }, [])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [onClose])
  return (
    <div role="dialog" aria-modal="true" aria-label="Slide thumbnails" onClick={(e) => e.stopPropagation()} className="fixed inset-0 z-40 overflow-y-auto bg-neutral-950/95 p-6 sm:p-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between pb-6 text-white">
        <h2 className="font-heading text-lg font-semibold">All slides</h2>
        <button type="button" onClick={onClose} aria-label="Close thumbnails" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10"><X size={18} /></button>
      </div>
      <ol className="mx-auto grid max-w-6xl grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {doc.slides.map((s, i) => (
          <li key={s.id}>
            <button type="button" ref={i === current ? here : undefined} onClick={() => onPick(i)} aria-label={`Go to slide ${i + 1}`} aria-current={i === current ? 'true' : undefined}
              className={`block w-full overflow-hidden rounded-lg ring-2 ${i === current ? 'ring-primary' : 'ring-transparent hover:ring-white/40'}`}>
              <ThumbFit>{(w) => <SlideCanvas slide={s} theme={doc.theme} aspect={doc.aspectRatio} width={w} watermark={watermark} footer={{ index: i, total: doc.slides.length, title: doc.title }} />}</ThumbFit>
            </button>
            <p className="mt-1.5 text-center text-xs text-white/60 tabular-nums">{i + 1}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** renders its child at the width of its box (so a thumbnail fills its grid cell at any screen size) */
function ThumbFit({ children }: { children: (width: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current!
    const ro = new ResizeObserver(() => setW(Math.floor(el.clientWidth)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return <div ref={ref}>{w > 0 && children(w)}</div>
}

/**
 * Speaker view, in its own window: the current slide, the next one, the notes and a clock. It follows the slideshow and can move it: both windows talk over a
 * BroadcastChannel named after the deck (same browser only; nothing goes through the server).
 */
export function SpeakerView({ doc, channel, onExit }: { doc: Presentation; channel: string; /** where to go when this tab cannot close itself (it was opened by hand, not by the slideshow) */ onExit: () => void }) {
  const [i, setI] = useState(0)
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const bc = useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    const c = new BroadcastChannel(channel); bc.current = c
    c.onmessage = (e: MessageEvent<{ at?: number }>) => { if (typeof e.data?.at === 'number') setI(e.data.at) }
    c.postMessage({ hello: true }) // the slideshow answers with where it is
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => { c.close(); clearInterval(t) }
  }, [channel])
  const go = (to: number) => { const at = Math.max(0, Math.min(doc.slides.length - 1, to)); setI(at); bc.current?.postMessage({ go: at }) }
  /** End show: the slideshow tab goes back to the editor, and this tab closes (or, opened by hand, goes to the editor itself) */
  const end = () => { bc.current?.postMessage({ end: true }); window.close(); setTimeout(onExit, 150) }
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(i + 1) } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); go(i - 1) } else if (e.key === 'Escape') { e.preventDefault(); end() } }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  const s = doc.slides[i]!, next = doc.slides[i + 1]
  const secs = Math.floor((now - start) / 1000)
  const clock = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
  return (
    <div className="min-h-screen bg-neutral-900 text-white p-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]" data-testid="speaker-view">
      <section aria-label="Current slide">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm text-white/70">
          <span>Slide {i + 1} of {doc.slides.length}</span>
          <span className="flex items-center gap-3"><span className="tabular-nums" aria-label="Time presenting">{clock}</span>
            <button type="button" onClick={end} title="End the show (Esc)" className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-white hover:bg-red-600"><X size={15} aria-hidden />End show</button></span>
        </div>
        <ThumbFit>{(w) => <SlideCanvas slide={s} theme={doc.theme} aspect={doc.aspectRatio} width={w} footer={{ index: i, total: doc.slides.length, title: doc.title }} />}</ThumbFit>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => go(i - 1)} disabled={i === 0} className="flex items-center gap-1 rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15 disabled:opacity-40"><ChevronLeft size={16} aria-hidden />Previous</button>
          <button type="button" onClick={() => go(i + 1)} disabled={!next} className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">Next<ChevronRight size={16} aria-hidden /></button>
        </div>
      </section>
      <section className="flex min-h-0 flex-col gap-5">
        <div aria-label="Next slide">
          <p className="mb-2 text-sm text-white/70">{next ? 'Next' : 'End of the presentation'}</p>
          {next && <ThumbFit>{(w) => <SlideCanvas slide={next} theme={doc.theme} aspect={doc.aspectRatio} width={w} footer={{ index: i + 1, total: doc.slides.length, title: doc.title }} />}</ThumbFit>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-white/5 p-4" aria-label="Speaker notes">
          <p className="mb-2 text-sm text-white/70">Notes</p>
          <p className="whitespace-pre-wrap text-lg leading-relaxed">{s.speakerNotes || <span className="text-white/40">No notes for this slide.</span>}</p>
        </div>
      </section>
    </div>
  )
}

/** "Highlight in slides": a soft red laser dot follows the pointer over the slide, so the presenter can point at a part of it */
export function LaserPointer() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const move = (e: PointerEvent) => { const d = ref.current; if (d) { d.style.transform = `translate(${e.clientX - 9}px, ${e.clientY - 9}px)`; d.style.opacity = '1' } }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [])
  return <div ref={ref} aria-hidden data-testid="laser" className="pointer-events-none fixed left-0 top-0 z-20 h-[18px] w-[18px] rounded-full bg-red-500 opacity-0 shadow-[0_0_14px_6px_rgba(239,68,68,0.55)] ring-2 ring-white/70" />
}
