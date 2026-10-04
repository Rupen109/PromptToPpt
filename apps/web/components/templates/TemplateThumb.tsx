'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { designById, templateSlides } from '@prompttoppt/theme'
import { SITE_URL } from '@/lib/env'
import { FitSlide } from '@prompttoppt/ui'
import type { AspectRatio, Slide } from '@prompttoppt/validation'

/** Compose a design's starter slide on the client (pure + cheap), so the page ships design data, not images. */
export function slidesFor(designId: string, aspect: AspectRatio = '16:9', only?: number): Slide[] {
  const d = designById(designId)
  if (!d) return []
  let n = 0
  const built = templateSlides(d.id, aspect, () => `${d.id}-e${n++}`, `${SITE_URL}/template-assets`)!
  return built.slides.flatMap((s, i) => (only === undefined || only === i ? [{ id: `${d.id}-${i}`, locked: false, validation: { status: 'passed' as const, issues: [] }, ...s }] : []))
}

/** A live slide thumbnail that only renders once it nears the viewport (so 120 designs don't load every font up front). */
export function TemplateThumb({ designId, index = 0, className = '' }: { designId: string; index?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setSeen(true); io.disconnect() } }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  const design = designById(designId)
  const slide = useMemo(() => (seen ? slidesFor(designId, '16:9', index)[0] : undefined), [seen, designId, index])
  return (
    <div ref={ref} className={`aspect-video overflow-hidden bg-slate-100 ${className}`}>
      {slide && design && <FitSlide slide={slide} theme={design.theme} aspect="16:9" />}
    </div>
  )
}
