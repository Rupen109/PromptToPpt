'use client'

import { ArrowLeft, ArrowRight, Play } from '@prompttoppt/ui/icons'
import { useMemo, useState } from 'react'
import { designById } from '@prompttoppt/theme'
import { FitSlide } from '@prompttoppt/ui'
import { Button } from '@/components/ui/Button'
import { EDITOR_URL } from '@/lib/env'
import { slidesFor } from './TemplateThumb'

/** Big interactive preview: every slide of the starter deck in this design, with animations you can replay. */
export function TemplatePreview({ designId }: { designId: string }) {
  const design = designById(designId)!
  const slides = useMemo(() => slidesFor(designId), [designId])
  const [i, setI] = useState(0)
  const [play, setPlay] = useState(0)
  return (
    <div>
      <div className="border-2 border-foreground rounded-3xl overflow-hidden shadow-[7px_9px_0_0_#181b25] bg-white">
        <FitSlide key={`${i}-${play}`} slide={slides[i]!} theme={design.theme} aspect="16:9" play={play > 0} />
      </div>
      <div className="flex items-center justify-center gap-3 mt-5 flex-wrap">
        <Button size="sm" variant="white" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} aria-label="Previous slide"><ArrowLeft aria-hidden size={14} />Prev</Button>
        <span className="font-heading font-extrabold text-sm tabular-nums">{i + 1} / {slides.length}</span>
        <Button size="sm" variant="white" onClick={() => setI((x) => Math.min(slides.length - 1, x + 1))} disabled={i === slides.length - 1} aria-label="Next slide">Next<ArrowRight aria-hidden size={14} /></Button>
        <Button size="sm" variant="yellow" onClick={() => setPlay((p) => p + 1)}><Play aria-hidden size={14} fill="currentColor" />Play animation</Button>
      </div>
      <div className="flex gap-3 overflow-x-auto py-5" role="tablist" aria-label="Slides">
        {slides.map((s, k) => (
          <button key={s.id} role="tab" aria-selected={k === i} aria-label={`Slide ${k + 1}`} onClick={() => setI(k)} className={`shrink-0 w-40 rounded-lg overflow-hidden border-2 ${k === i ? 'border-primary' : 'border-foreground/20'}`}>
            <FitSlide slide={s} theme={design.theme} aspect="16:9" />
          </button>
        ))}
      </div>
    </div>
  )
}

export function UseTemplateButton({ designId, premium }: { designId: string; premium: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <Button href={`${EDITOR_URL}/templates?open=${encodeURIComponent(designId)}`} variant="accent" size="lg" arrow>Use this template</Button>
      <p className="text-xs text-slate-600">{premium ? 'A Pro template — included with Pro and Gold.' : 'Free on every plan.'} You’ll sign in (or sign up free) and it opens in the editor.</p>
    </div>
  )
}
