'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'

// the template engine and the slide renderer are large: they are fetched only once a thumbnail nears the screen, never with the page
const ThumbSlide = dynamic(() => import('./ThumbSlide'), { ssr: false })

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
  return (
    <div ref={ref} className={`aspect-video overflow-hidden bg-slate-100 ${className}`}>
      {seen && <ThumbSlide designId={designId} index={index} />}
    </div>
  )
}
