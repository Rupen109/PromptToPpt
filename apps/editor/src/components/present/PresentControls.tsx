import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Download, Ellipsis, Grid2x2, Maximize, Minimize, Pause, PencilLine, Play, Presentation, Repeat, Rewind, FastForward, Share2, SquarePen, StickyNote, Check } from '@prompttoppt/ui/icons'

export type Autoplay = null | 1000 | 3000 | 5000

export interface PresentSettings {
  autoplay: Autoplay
  loop: boolean
  animation: boolean
  highlight: boolean
}

/**
 * The slideshow's controls: a bar at the bottom left (previous, slide number, next, play, full screen, more) and one at the bottom right (editor, share, download).
 * They show on any mouse move, touch or key and fade away after a few seconds of stillness (never while a menu is open or the pointer is on them); the
 * pointer hides with them. Clicks on them never reach the slide (which would move to the next slide).
 */
export function PresentControls(p: {
  i: number; n: number; settings: PresentSettings; fullscreen: boolean; drawing: boolean; notes: boolean; canShare: boolean
  onPrev: () => void; onNext: () => void; onFirst: () => void; onLast: () => void
  onSettings: (s: Partial<PresentSettings>) => void; onFullscreen: () => void
  onDraw: () => void; onThumbnails: () => void; onSpeakerView: () => void; onNotes: () => void
  onEditor: () => void; onShare: () => void; onDownload: () => void
}) {
  const visible = useActivity(3000)
  const [menu, setMenu] = useState(false)
  const [over, setOver] = useState(false)
  const shown = visible || menu || over
  // the pointer hides with the controls (a still pointer over the slide is distracting)
  useEffect(() => { document.body.style.cursor = shown ? '' : 'none'; return () => { document.body.style.cursor = '' } }, [shown])

  const keep = { onClick: (e: React.MouseEvent) => e.stopPropagation(), onMouseEnter: () => setOver(true), onMouseLeave: () => setOver(false) }
  const fade = `transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0 pointer-events-none'}`
  const playing = p.settings.autoplay !== null
  return (
    <>
      <div {...keep} className={`fixed bottom-4 left-4 z-30 ${fade}`} data-testid="present-controls" aria-hidden={!shown}>
        <div className="relative flex items-center gap-0.5 rounded-xl bg-neutral-800/85 backdrop-blur px-1.5 py-1 text-white shadow-lg">
          <Btn label="Previous slide" onClick={p.onPrev} disabled={p.i === 0 && !p.settings.loop}><ChevronLeft size={18} /></Btn>
          <span className="px-2 text-[13px] tabular-nums text-white/90" aria-live="polite">{p.i + 1} / {p.n}</span>
          <Btn label="Next slide" onClick={p.onNext} disabled={p.i === p.n - 1 && !p.settings.loop}><ChevronRight size={18} /></Btn>
          <span aria-hidden className="mx-1 h-5 w-px bg-white/20" />
          <Btn label={playing ? 'Stop autoplay' : 'Autoplay'} onClick={() => p.onSettings({ autoplay: playing ? null : 5000 })} pressed={playing}>{playing ? <Pause size={17} /> : <Play size={17} />}</Btn>
          <Btn label={p.fullscreen ? 'Exit full screen' : 'Full screen'} onClick={p.onFullscreen}>{p.fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}</Btn>
          <Btn label="More options" onClick={() => setMenu((m) => !m)} pressed={menu}><Ellipsis size={18} /></Btn>
          {menu && <Menu {...p} close={() => setMenu(false)} />}
        </div>
      </div>
      <div {...keep} className={`fixed bottom-4 right-4 z-30 ${fade}`} aria-hidden={!shown}>
        <div className="flex items-center gap-0.5 rounded-xl bg-neutral-800/85 backdrop-blur p-1 text-white shadow-lg text-[13px] font-medium">
          <button type="button" onClick={p.onEditor} className="flex items-center gap-1.5 rounded-lg px-3 py-2 hover:bg-white/10"><SquarePen size={15} aria-hidden />Go to editor</button>
          {p.canShare && <button type="button" onClick={p.onShare} className="flex items-center gap-1.5 rounded-lg px-3 py-2 hover:bg-white/10"><Share2 size={15} aria-hidden />Share</button>}
          {p.canShare && <button type="button" onClick={p.onDownload} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 hover:bg-primary/90"><Download size={15} aria-hidden />Download</button>}
        </div>
      </div>
    </>
  )
}

function Btn({ label, onClick, children, disabled, pressed }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean; pressed?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} aria-pressed={pressed}
      className={`grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10 disabled:opacity-35 disabled:hover:bg-transparent ${pressed ? 'bg-white/15' : ''}`}>{children}</button>
  )
}

function Menu(p: Parameters<typeof PresentControls>[0] & { close: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('[aria-label="More options"]')) p.close() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); p.close() } }
    window.addEventListener('pointerdown', away); window.addEventListener('keydown', esc, true)
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc, true) }
  }, [p])
  const item = (icon: ReactNode, label: string, run: () => void, checked?: boolean) => (
    <button type="button" role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={checked} onClick={() => { run(); if (checked === undefined) p.close() }}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13.5px] text-slate-800 hover:bg-slate-100">
      <span aria-hidden className="grid w-4 place-items-center text-slate-500">{icon}</span><span className="flex-1">{label}</span>
      {checked && <Check size={15} aria-hidden className="text-primary" />}
    </button>
  )
  const every = (ms: Exclude<Autoplay, null>, label: string) => item(null, label, () => p.onSettings({ autoplay: p.settings.autoplay === ms ? null : ms }), p.settings.autoplay === ms)
  const toggle = (label: string, on: boolean, flip: () => void) => (
    <label className="flex items-center justify-between gap-6 px-3 py-2 text-[13.5px] text-slate-800 cursor-pointer">
      {label}
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={flip} className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  )
  return (
    <div ref={ref} role="menu" aria-label="Slideshow options" className="absolute bottom-full left-0 mb-2 w-64 max-h-[70vh] overflow-y-auto rounded-xl bg-white p-1.5 shadow-2xl ring-1 ring-black/5">
      {item(<Rewind size={15} />, 'Restart', p.onFirst)}
      {item(<FastForward size={15} />, 'Go to end', p.onLast)}
      <hr className="my-1 border-slate-100" />
      {item(<PencilLine size={15} />, p.drawing ? 'Stop drawing' : 'Draw', p.onDraw)}
      {item(<Grid2x2 size={15} />, 'View slide thumbnails', p.onThumbnails)}
      {item(<Presentation size={15} />, 'Speaker view', p.onSpeakerView)}
      {item(<StickyNote size={15} />, p.notes ? 'Hide speaker notes' : 'Speaker notes', p.onNotes)}
      <hr className="my-1 border-slate-100" />
      <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Autoplay</p>
      {every(1000, 'Every second')}
      {every(3000, 'Every 3 seconds')}
      {every(5000, 'Every 5 seconds')}
      {item(<Repeat size={15} />, 'Loop', () => p.onSettings({ loop: !p.settings.loop }), p.settings.loop)}
      <hr className="my-1 border-slate-100" />
      {toggle('Enable animation', p.settings.animation, () => p.onSettings({ animation: !p.settings.animation }))}
      {toggle('Enable highlight in slides', p.settings.highlight, () => p.onSettings({ highlight: !p.settings.highlight }))}
    </div>
  )
}

/** true while the person has moved the mouse, touched or pressed a key in the last `ms` milliseconds */
function useActivity(ms: number) {
  const [active, setActive] = useState(true)
  useEffect(() => {
    let t = setTimeout(() => setActive(false), ms)
    const wake = () => { setActive(true); clearTimeout(t); t = setTimeout(() => setActive(false), ms) }
    const evs = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'] as const
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }))
    return () => { clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, wake)) }
  }, [ms])
  return active
}
