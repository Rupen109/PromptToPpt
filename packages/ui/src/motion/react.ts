import { useEffect, useRef, useState } from 'react'
import type { Slide } from '@prompttoppt/validation'
import { SlidePlayer } from './player'

/**
 * Plays a slide's object effects while it is on screen. Put `rootRef` on an element around the slide (drawn with `effects`), and use `playerRef.current` from the
 * page's navigation: `advance()` for next, `back()` for previous (both say when the slide has nothing more to do, and the page changes slide).
 * `arrival: 'back'` is for a slide you come back to from the next one: it is shown finished, the way you left it.
 * The page re-renders only when a step starts or finishes (`version` changes), never per frame.
 */
export function useSlidePlayer(slide: Pick<Slide, 'elements' | 'effects'>, arrival: 'forward' | 'back' = 'forward') {
  const rootRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<SlidePlayer | null>(null)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const root = rootRef.current
    if (!root || !slide.effects?.length) { playerRef.current = null; return }
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const p = new SlidePlayer(root, slide, { reducedMotion: reduced, onChange: () => setVersion((v) => v + 1) })
    playerRef.current = p
    if (arrival === 'back') p.showAll(); else p.start()
    return () => { p.destroy(); if (playerRef.current === p) playerRef.current = null }
  }, [slide, arrival])
  return { rootRef, playerRef, version }
}
