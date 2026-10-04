'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/**
 * Scroll-reveal: fades and lifts its children in the first time they scroll into view. Written once, used by Card and
 * SectionHeader (so every section animates the same way). `index` staggers siblings (80 ms apart).
 * Without JavaScript, and for people who prefer reduced motion, content is simply visible (see globals.css).
 */
export function Reveal({ as = 'div', index = 0, delay, className, style, children }: { as?: 'div' | 'li' | 'article' | 'section' | 'header'; index?: number; delay?: number; className?: string; style?: CSSProperties; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    if (typeof IntersectionObserver === 'undefined') {
      const raf = requestAnimationFrame(() => setVisible(true)) // very old browsers: just show it
      return () => cancelAnimationFrame(raf)
    }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect() } }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visible])
  const Tag = as as 'div' // the tags we allow are all plain block elements
  return (
    <Tag ref={ref} className={className} data-reveal="" {...(visible ? { 'data-visible': '' } : {})} style={{ ...style, ['--reveal-delay' as string]: `${delay ?? Math.min(index, 6) * 80}ms` }}>
      {children}
    </Tag>
  )
}
