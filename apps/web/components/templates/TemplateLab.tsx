'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { LAB_TEMPLATES } from '@prompttoppt/theme'
import { FitSlide, transitionStyle } from '@prompttoppt/ui'
import { SITE_URL } from '@/lib/env'
import { Button } from '@/components/ui/Button'

/** Review page for the art-directed template prototypes: play each deck with its real transitions and entrance/ambient motion. */
export function TemplateLab() {
  const [tid, setTid] = useState(LAB_TEMPLATES[0]!.id)
  const t = LAB_TEMPLATES.find((x) => x.id === tid)!
  const slides = useMemo(() => t.slides((n) => `${SITE_URL}/template-lab/${n}.jpg`), [t])
  const [i, setI] = useState(0)
  const [replay, setReplay] = useState(0)
  const [auto, setAuto] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (timer.current) clearInterval(timer.current)
    if (!auto) return
    timer.current = setInterval(() => setI((x) => (x + 1) % slides.length), 6500)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [auto, slides.length])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((x) => Math.min(slides.length - 1, x + 1))
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [slides.length])

  const slide = slides[i]!
  const swatches = [t.theme.colors.background, t.theme.colors.surface, t.theme.colors.primary, t.theme.colors.secondary, t.theme.colors.accent, t.theme.colors.textPrimary]
  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-8" role="tablist" aria-label="Prototype templates">
        {LAB_TEMPLATES.map((x) => (
          <Button key={x.id} role="tab" aria-selected={tid === x.id} variant={tid === x.id ? 'ink' : 'white'} size="md" onClick={() => { setTid(x.id); setI(0); setReplay((r) => r + 1) }}>{x.name} · {x.category}</Button>
        ))}
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_320px] gap-10 items-start">
        <div>
          <div className="rounded-3xl overflow-hidden border-2 border-foreground shadow-[7px_9px_0_0_#181b25] bg-black">
            <div key={`${t.id}-${i}-${replay}`} style={transitionStyle(slide, t.theme.motion?.transition)}>
              <FitSlide slide={slide} theme={t.theme} aspect="16:9" play />
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
            <Button size="sm" variant="white" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}>← Prev</Button>
            <span className="font-heading font-extrabold text-sm tabular-nums">{i + 1} / {slides.length}</span>
            <Button size="sm" variant="white" onClick={() => setI((x) => Math.min(slides.length - 1, x + 1))} disabled={i === slides.length - 1}>Next →</Button>
            <Button size="sm" variant="yellow" onClick={() => setReplay((r) => r + 1)}>▶ Replay slide</Button>
            <Button size="sm" variant={auto ? 'accent' : 'primary'} onClick={() => setAuto((a) => !a)}>{auto ? '■ Stop autoplay' : '▶ Autoplay deck'}</Button>
          </div>
          <div className="flex gap-3 overflow-x-auto py-5" role="tablist" aria-label="Slides">
            {slides.map((s, k) => (
              <button key={s.id} role="tab" aria-selected={k === i} aria-label={`Slide ${k + 1}`} onClick={() => setI(k)} className={`shrink-0 w-44 rounded-lg overflow-hidden border-2 ${k === i ? 'border-primary' : 'border-foreground/20'}`}>
                <FitSlide slide={s} theme={t.theme} aspect="16:9" />
              </button>
            ))}
          </div>
        </div>

        <aside className="bg-white border-2 border-foreground rounded-2xl p-6 shadow-[4px_5px_0_0_#181b25]">
          <div className="font-heading font-extrabold text-xs uppercase tracking-wide text-primary">{t.category}</div>
          <h2 className="font-heading font-extrabold text-3xl mt-1">{t.name}</h2>
          <p className="text-slate-600 mt-2">{t.tagline}</p>
          <div className="flex gap-2 mt-5" aria-label="Palette">{swatches.map((c, k) => <span key={k} title={c} className="w-9 h-9 rounded-full border-2 border-foreground" style={{ background: c }} />)}</div>
          <dl className="mt-5 text-sm space-y-2 text-slate-700">
            <div><dt className="inline font-bold">Fonts: </dt><dd className="inline">{t.theme.fonts.heading} + {t.theme.fonts.body}</dd></div>
            <div><dt className="inline font-bold">Slides: </dt><dd className="inline">{slides.length}</dd></div>
            <div><dt className="inline font-bold">Motion: </dt><dd className="inline">staggered entrances, count-up numbers, floating shapes, slow Ken Burns on photos, {t.theme.motion?.transition} transitions</dd></div>
          </dl>
          <p className="text-xs text-slate-500 mt-5">Prototype for review. Images are AI-generated originals; text and numbers are placeholders. Arrow keys change slides.</p>
        </aside>
      </div>
    </div>
  )
}
