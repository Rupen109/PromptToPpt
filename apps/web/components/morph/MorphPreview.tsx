'use client'

import { ChevronLeft, ChevronRight, Maximize, Pause, Play } from '@prompttoppt/ui/icons'
import { MorphLayer, SlideCanvas, easingCss } from '@prompttoppt/ui'
import type { Presentation, Slide } from '@prompttoppt/validation'
import { useCallback, useEffect, useRef, useState } from 'react'

const HOLD_MS = 1400 // how long a scene rests before the next Morph starts

/**
 * A live preview of a Morph template: the real Morph engine, looping through a few scenes. It plays only while it is on screen, starts paused for visitors who asked their device for
 * less motion, and can always be stepped by hand. Scenes arrive already composed (the page does that on the server), so only what is shown is sent to the browser.
 */
export function MorphPreview({ name, slides, theme, titles }: { name: string; slides: Slide[]; theme: Presentation['theme']; titles: string[] }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [at, setAt] = useState(0)
  const [to, setTo] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [visible, setVisible] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [full, setFull] = useState(false)
  const [screen, setScreen] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const fs = document.fullscreenElement === el
      setFull(fs)
      if (fs) { setScreen({ w: innerWidth, h: innerHeight }); setWidth(Math.floor(Math.min(innerWidth, (innerHeight * 16) / 9))) } else setWidth(Math.floor(el.getBoundingClientRect().width))
    }
    document.addEventListener('fullscreenchange', measure)
    window.addEventListener('resize', measure)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.35 })
    io.observe(el)
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    setPlaying(!mq.matches)
    return () => { ro.disconnect(); io.disconnect(); document.removeEventListener('fullscreenchange', measure); window.removeEventListener('resize', measure) }
  }, [])

  const go = useCallback((n: number) => { if (n !== at) setTo(((n % slides.length) + slides.length) % slides.length) }, [at, slides.length])

  // while it is playing and on screen, rest on a scene, then Morph to the next
  useEffect(() => {
    if (!playing || !visible || to !== null || width === 0) return
    const t = setTimeout(() => setTo((at + 1) % slides.length), HOLD_MS)
    return () => clearTimeout(t)
  }, [playing, visible, to, at, slides.length, width])

  // in full screen the arrow keys step through the scenes (Esc leaves, the browser does that)
  useEffect(() => {
    if (!full) return
    const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(at + 1) } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1) } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [full, go, at])

  const toggleFull = () => { const el = box.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.() }

  const target = to !== null ? slides[to] : undefined
  const from = slides[at]!
  const tr = (target ?? from).transition
  const label = `${name} preview, scene ${at + 1} of ${slides.length}: ${titles[at] ?? ''}`

  return (
    <div className="min-w-0">
      <div ref={box} role="group" aria-roledescription="carousel" aria-label={`${name} Morph template preview`} className="relative w-full overflow-hidden rounded-2xl border-2 border-foreground shadow-solid bg-black" style={full ? { width: '100vw', height: '100vh', borderRadius: 0, border: 0 } : { aspectRatio: '16 / 9' }}>
        {width > 0 && <div className="absolute" style={full ? { left: (screen.w - width) / 2, top: (screen.h - (width * 9) / 16) / 2 } : { left: 0, top: 0 }}>{target
          ? <MorphLayer from={from} to={target} theme={theme} aspect="16:9" width={width} duration={tr?.duration ?? 1500} easing={easingCss(tr?.easing ?? 'power2-in-out')} blend={tr?.blend ?? 'cross'} onDone={() => { setAt(to!); setTo(null) }} />
          : <SlideCanvas slide={from} theme={theme} aspect="16:9" width={width} />}</div>}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? `Pause the ${name} preview` : `Play the ${name} preview`} className="grid place-items-center w-10 h-10 rounded-lg border-2 border-foreground bg-white hover:bg-secondary">
            {playing ? <Pause aria-hidden size={18} /> : <Play aria-hidden size={18} />}
          </button>
          <button type="button" onClick={() => go(at - 1)} aria-label="Previous scene" className="grid place-items-center w-10 h-10 rounded-lg border-2 border-foreground bg-white hover:bg-secondary"><ChevronLeft aria-hidden size={18} /></button>
          <button type="button" onClick={() => go(at + 1)} aria-label="Next scene" className="grid place-items-center w-10 h-10 rounded-lg border-2 border-foreground bg-white hover:bg-secondary"><ChevronRight aria-hidden size={18} /></button>
          <button type="button" onClick={toggleFull} aria-label={`Show the ${name} preview full screen`} className="inline-flex items-center gap-2 h-10 px-3 rounded-lg border-2 border-foreground bg-white hover:bg-secondary text-sm font-semibold"><Maximize aria-hidden size={18} />Full screen</button>
        </div>
        <p className="text-sm font-medium text-[#475569]" aria-live="polite">{reduced && !playing ? 'Motion is off on your device: use the arrows to step through. ' : ''}<span className="font-semibold text-foreground">{titles[to ?? at]}</span> · {(to ?? at) + 1} / {slides.length}</p>
      </div>
      <p className="sr-only">{label}</p>
    </div>
  )
}
