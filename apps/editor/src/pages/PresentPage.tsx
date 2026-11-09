import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CANVAS, MORPH_DEFAULTS } from '@prompttoppt/validation'
import type { LoadedPresentation } from '@prompttoppt/api-client'
import { MorphLayer, SlideCanvas, easingCss, transitionStyle, useSlidePlayer, type MorphHandle } from '@prompttoppt/ui'
import { api } from '@/lib/api'
import { PRESENT_LOCKED, useEntitlements } from '@/lib/entitlements'

const NO_SLIDE = { elements: [] } // a stable value while the deck is loading (a new one every render would restart the player)

/** Full-screen present mode: keyboard + click navigation, fade transition, speaker notes (N), fullscreen (F), Esc to exit. */
export function PresentPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { ent, upgrade } = useEntitlements()
  const [deck, setDeck] = useState<LoadedPresentation | null>(null)
  const [failed, setFailed] = useState(false)
  const [i, setI] = useState(0)
  const [arrival, setArrival] = useState<'forward' | 'back'>('forward') // a slide you come back to is shown finished, the way you left it
  const [notes, setNotes] = useState(false)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })

  // a Starter plan typing the address by hand lands back in the editor with the upgrade window
  const locked = !!ent && !ent.features.livePreview
  const bounced = useRef(false) // once: `upgrade` is a new object after every show(), so depending on it would loop
  useEffect(() => {
    if (!locked || bounced.current) return
    bounced.current = true
    upgrade.show(PRESENT_LOCKED)
    navigate(`/edit/${id}`, { replace: true })
  }, [locked, id, navigate, upgrade])
  useEffect(() => {
    api.getPresentation(id).then(setDeck).catch(() => setFailed(true))
  }, [id])
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const n = deck?.document.slides.length ?? 0
  const current = deck?.document.slides[i]
  const { rootRef, playerRef } = useSlidePlayer(current ?? NO_SLIDE, arrival)
  // next / previous: the slide's own effects go first (a click plays the next one, or finishes the one that is moving); only when it has nothing more does the slide change
  // A Morph in progress: the slide being left, where it goes, and which of its elements an exit effect had already removed
  const [morph, setMorph] = useState<{ to: number; dir: 1 | -1; hidden: ReadonlySet<string> } | null>(null)
  const [morphed, setMorphed] = useState(false) // the slide just arrived by a Morph, which was its entrance: it does not fade in again
  const morphHandle = useRef<MorphHandle | null>(null)
  const go = useCallback((dir: 1 | -1) => {
    if (morph) { morphHandle.current?.finish(); return } // a key pressed during a Morph completes it
    const p = playerRef.current
    if (dir === 1 ? p && p.advance() !== 'none' : p?.back()) return
    const target = Math.max(0, Math.min(n - 1, i + dir))
    if (target === i || !deck) return
    const slides = deck.document.slides
    // forwards the slide being arrived at brings its transition; backwards it is the slide being left that plays its transition in reverse
    if ((dir === 1 ? slides[target] : slides[i])?.transition?.type === 'morph') {
      const hidden = new Set([...(rootRef.current?.querySelectorAll<HTMLElement>('[data-pt-el]') ?? [])].filter((el) => getComputedStyle(el).visibility === 'hidden').map((el) => el.dataset['ptEl']!))
      setMorph({ to: target, dir, hidden })
      return
    }
    setMorphed(false)
    setArrival(dir === 1 ? 'forward' : 'back')
    setI(target)
  }, [n, i, deck, morph, playerRef, rootRef])
  const onMorphDone = useCallback(() => {
    if (!morph) return
    setArrival(morph.dir === 1 ? 'forward' : 'back'); setMorphed(true); setI(morph.to); setMorph(null)
  }, [morph])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(1) }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(-1) }
      else if (e.key === 'Home') { setMorph(null); setMorphed(false); setArrival('forward'); setI(0) }
      else if (e.key === 'End') { setMorph(null); setMorphed(false); setArrival('back'); setI(n - 1) }
      else if (e.key.toLowerCase() === 'n') setNotes((v) => !v)
      else if (e.key.toLowerCase() === 'f') void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())
      else if (e.key === 'Escape' && !document.fullscreenElement) navigate(`/edit/${id}`)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [n, id, navigate, go])

  if (locked) return null
  if (failed) return <div className="min-h-screen grid place-items-center bg-black text-white"><div className="text-center"><p className="mb-3">Could not load the presentation.</p><Link to="/" className="underline">Back to home</Link></div></div>
  if (!deck) return <div className="min-h-screen grid place-items-center bg-black text-white/60">Loading…</div>
  const doc = deck.document
  const slide = doc.slides[i]!
  const { width: W, height: H } = CANVAS[doc.aspectRatio]
  const width = Math.floor(Math.min(size.w, (size.h * W) / H))

  return (
    <div className="fixed inset-0 bg-black grid place-items-center select-none" data-testid="present" onClick={(e) => go(e.clientX < size.w / 3 ? -1 : 1)}>
      {morph ? (
        (() => {
          const t = (morph.dir === 1 ? doc.slides[morph.to] : slide)!.transition!
          return <MorphLayer from={slide} to={doc.slides[morph.to]!} theme={doc.theme} aspect={doc.aspectRatio} width={width} duration={t.duration ?? MORPH_DEFAULTS.duration} easing={easingCss(t.easing ?? MORPH_DEFAULTS.easing)} blend={t.blend ?? 'through'} watermark={ent?.features.watermark ?? false} hiddenFrom={morph.hidden} handleRef={morphHandle} onDone={onMorphDone} />
        })()
      ) : <div key={slide.id} ref={rootRef} style={morphed ? {} : Object.keys(transitionStyle(slide, doc.theme.motion?.transition)).length ? transitionStyle(slide, doc.theme.motion?.transition) : { animation: 'deckFade 300ms ease' }}><SlideCanvas slide={slide} theme={doc.theme} aspect={doc.aspectRatio} width={width} play effects watermark={ent?.features.watermark ?? false} /></div>}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/60" aria-live="polite">{i + 1} / {n} · ←/→ navigate · N notes · F fullscreen · Esc exit</div>
      {notes && <div className="fixed left-0 right-0 bottom-0 bg-black/85 text-white p-6 text-lg leading-relaxed max-h-[40vh] overflow-y-auto" role="region" aria-label="Speaker notes">{slide.speakerNotes || <span className="text-white/50">No notes for this slide.</span>}</div>}
    </div>
  )
}
