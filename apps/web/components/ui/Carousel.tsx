'use client'

import { ChevronLeft, ChevronRight } from '@prompttoppt/ui/icons'
import { Children, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from './cn'

/**
 * Cards in a row on wide screens, a swipeable carousel on narrow ones. Written once, used by every card group on the landing page.
 *
 *  - Below the `from` breakpoint the cards sit in a scroll-snap track (touch swipe, trackpad, keyboard arrows, or the buttons below it). The track
 *    works with CSS alone; JavaScript only adds the buttons, the dots and the "which card" state, so the cards are in the page for search engines and
 *    visible without scripts.
 *  - From `from` upward the track becomes a normal grid: pass its columns in `gridClassName` (written out in full so Tailwind can see every class).
 *    The wrappers around each card use `display: contents` there, so the cards themselves are the grid items (this lets cards share row heights with
 *    CSS subgrid, see ModalitiesSection). `from="never"` keeps the carousel at every width (reviews: the number of cards keeps growing).
 *  - `slideClassName` sets how wide a card is (cards per view at each width); `centered` centres the cards while they all fit, and lets the row
 *    scroll from its start once they do not (auto margins on the first and last card, which collapse when there is no room).
 *  - No auto-play. Every button has a name, the dots say which card they show, and reduced-motion visitors get jumps instead of smooth scrolling.
 */
const FROM = {
  lg: { track: 'lg:mx-0 lg:overflow-visible lg:p-0 lg:snap-none', slide: 'lg:contents', controls: 'lg:hidden' },
  xl: { track: 'xl:mx-0 xl:overflow-visible xl:p-0 xl:snap-none', slide: 'xl:contents', controls: 'xl:hidden' },
  // a carousel at every width; from lg the track hugs the content (a small inset keeps the card shadows) so no sliver of the next card shows beside the last whole one
  never: { track: 'lg:-mx-2 lg:px-2 lg:scroll-px-2', slide: '', controls: '' },
} as const
const DEFAULT_SLIDE = 'basis-[84%] sm:basis-[44%]'

const MAX_DOTS = 6

export function CardCarousel({ children, label, from, gridClassName = '', className, slideClassName = DEFAULT_SLIDE, centered = false }: {
  children: ReactNode
  /** names the group for screen readers, e.g. "Pricing plans" */
  label: string
  /** the breakpoint from which the cards are a grid again */
  from: keyof typeof FROM
  /** grid classes for `from` and up, each with its breakpoint prefix, e.g. "lg:grid lg:grid-cols-3 lg:gap-8" */
  gridClassName?: string
  /** spacing around the whole carousel (the track has its own inner padding so shadows and lifted cards are not clipped) */
  className?: string
  /** the width of one card at each screen width, e.g. "basis-[88%] lg:basis-[calc(33.333%-16px)]" */
  slideClassName?: string
  /** centre the cards while they all fit in view */
  centered?: boolean
}) {
  const items = Children.toArray(children)
  const track = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)
  const [scrollable, setScrollable] = useState(true) // optimistic for the server render, corrected as soon as the track is measured

  const update = useCallback(() => {
    const el = track.current
    if (!el) return
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0
    const max = el.scrollWidth - el.clientWidth
    const end = el.scrollLeft >= max - 2
    setScrollable(max > 4)
    setAtStart(el.scrollLeft <= 2)
    setAtEnd(end)
    let best = 0
    let bestDistance = Infinity
    Array.from(el.children).forEach((s, i) => {
      const d = Math.abs((s as HTMLElement).offsetLeft - pad - el.scrollLeft)
      if (d < bestDistance) { bestDistance = d; best = i }
    })
    setActive(end ? items.length - 1 : best)
  }, [items.length])

  useEffect(() => {
    const el = track.current
    if (!el) return
    let raf = 0
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update) }
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(onScroll)
    ro.observe(el)
    update()
    return () => { cancelAnimationFrame(raf); el.removeEventListener('scroll', onScroll); ro.disconnect() }
  }, [update])

  const go = (i: number) => {
    const el = track.current
    const slide = el?.children[Math.max(0, Math.min(items.length - 1, i))] as HTMLElement | undefined
    if (!el || !slide) return
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: slide.offsetLeft - pad, behavior: calm ? 'auto' : 'smooth' })
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!scrollable) return
    const next = e.key === 'ArrowRight' ? active + 1 : e.key === 'ArrowLeft' ? active - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : null
    if (next === null) return
    e.preventDefault()
    go(next)
  }

  const f = FROM[from]
  return (
    <div role="region" aria-roledescription="carousel" aria-label={label} className={className}>
      <div
        ref={track}
        tabIndex={scrollable ? 0 : undefined}
        onKeyDown={onKeyDown}
        className={cn(
          // the track bleeds to the screen edges (it cancels the section's side padding) so cards slide in from the edge, and its padding keeps the first card on the page grid
          'relative flex gap-4 sm:gap-6 overflow-x-auto overscroll-x-contain snap-x snap-mandatory -mx-5 px-5 md:-mx-10 md:px-10 scroll-px-5 md:scroll-px-10 pt-8 pb-6',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-primary',
          centered && '[&>:first-child]:ml-auto [&>:last-child]:mr-auto',
          f.track, gridClassName,
        )}
      >
        {items.map((item, i) => (
          <div key={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${items.length}`} className={cn('snap-start shrink-0', slideClassName, f.slide)}>{item}</div>
        ))}
      </div>

      {scrollable && items.length > 1 && (
        <div className={cn('mt-2 flex items-center justify-center gap-4', f.controls)}>
          <ArrowButton direction="prev" disabled={atStart} onClick={() => go(active - 1)} />
          {items.length <= MAX_DOTS ? (
            <div role="group" aria-label="Choose a card" className="flex items-center">
              {items.map((_, i) => (
                <button key={i} type="button" aria-label={`Show card ${i + 1} of ${items.length}`} aria-current={i === active ? 'true' : undefined} onClick={() => go(i)} className="grid h-6 place-items-center rounded-full px-[3px] focus-visible:outline-2 focus-visible:outline-primary">
                  <span className={cn('block h-2 rounded-full border border-foreground transition-all duration-300', i === active ? 'w-6 bg-foreground' : 'w-2 bg-white')} />
                </button>
              ))}
            </div>
          ) : (
            <span className="min-w-12 text-center font-heading text-xs font-extrabold text-foreground" aria-live="off">{active + 1} / {items.length}</span>
          )}
          <ArrowButton direction="next" disabled={atEnd} onClick={() => go(active + 1)} />
        </div>
      )}
    </div>
  )
}

function ArrowButton({ direction, disabled, onClick }: { direction: 'prev' | 'next'; disabled: boolean; onClick: () => void }) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      aria-label={direction === 'prev' ? 'Previous card' : 'Next card'}
      disabled={disabled}
      onClick={onClick}
      className="grid h-10 w-10 place-items-center rounded-full border-2 border-foreground bg-white text-foreground shadow-[2px_3px_0_0_#181b25] transition-[transform,box-shadow] motion-safe:active:translate-x-0.5 motion-safe:active:translate-y-[3px] active:shadow-none disabled:opacity-35 disabled:shadow-none disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Icon aria-hidden size={18} strokeWidth={3} />
    </button>
  )
}
