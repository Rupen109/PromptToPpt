import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CANVAS, MORPH_DEFAULTS } from '@prompttoppt/validation'
import type { LoadedPresentation } from '@prompttoppt/api-client'
import { MorphLayer, SlideCanvas, easingCss, transitionStyle, useSlidePlayer, type MorphHandle } from '@prompttoppt/ui'
import { api } from '@/lib/api'
import { PRESENT_LOCKED, useEntitlements } from '@/lib/entitlements'
import { SlideLoader } from '../components/SlideLoader'
import { PresentControls, type PresentSettings } from '@/components/present/PresentControls'
import { DrawLayer, LaserPointer, SpeakerView, ThumbnailGrid } from '@/components/present/PresentOverlays'

const NO_SLIDE = { elements: [] } // a stable value while the deck is loading (a new one every render would restart the player)

/**
 * Full-screen present mode: keyboard + click navigation, transitions, speaker notes (N), full screen (F), drawing (D), thumbnails (G), Esc to close what is open or exit.
 * The controls (components/present) show on any activity and fade away when the mouse is still. `?view=speaker` is the speaker view window of a slideshow.
 */
export function PresentPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { ent, upgrade } = useEntitlements()
  const [deck, setDeck] = useState<LoadedPresentation | null>(null)
  const [failed, setFailed] = useState(false)
  // ?slide=N: present from slide N (the assistant's "present from this slide"); clamped to the deck once it is loaded
  const [i, setI] = useState(() => Math.max(0, (Number(new URLSearchParams(window.location.search).get('slide')) || 1) - 1))
  const [arrival, setArrival] = useState<'forward' | 'back'>('forward') // a slide you come back to is shown finished, the way you left it
  const [notes, setNotes] = useState(false)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const speaker = new URLSearchParams(window.location.search).get('view') === 'speaker'
  const [settings, setSettingsState] = useState<PresentSettings>({ autoplay: null, loop: false, animation: true, highlight: false })
  const setSettings = useCallback((s: Partial<PresentSettings>) => setSettingsState((o) => ({ ...o, ...s })), [])
  const [drawing, setDrawing] = useState(false)
  const [thumbs, setThumbs] = useState(false)
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement)
  useEffect(() => { const on = () => setFullscreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange', on); return () => document.removeEventListener('fullscreenchange', on) }, [])
  const toggleFullscreen = useCallback(() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()), [])

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
    api.getPresentation(id).then((p) => { setI((x) => Math.min(x, Math.max(0, p.document.slides.length - 1))); setDeck(p) }).catch(() => setFailed(true)) // (a start slide past the end: the last slide)
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
  const go = useCallback((dir: 1 | -1, skipEffects = false) => {
    if (morph) { morphHandle.current?.finish(); return } // a key pressed during a Morph completes it
    const p = playerRef.current
    if (!skipEffects && (dir === 1 ? p && p.advance() !== 'none' : p?.back())) return
    const wrap = settings.loop && n > 1 ? (i + dir + n) % n : null // Loop: past the last slide is the first again (and back from the first, the last)
    const target = wrap ?? Math.max(0, Math.min(n - 1, i + dir))
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
  }, [n, i, deck, morph, playerRef, rootRef, settings.loop])
  // "Advance after N seconds" (the slide's transition): the slide moves on by itself that long after it appeared, effects or not; the timer restarts on every slide
  const after = current?.transition?.advanceAfter
  useEffect(() => {
    if (after === undefined || morph || !deck || i >= n - 1) return
    const t = setTimeout(() => go(1, true), after)
    return () => clearTimeout(t)
  }, [after, i, morph, deck, n, go])
  // Autoplay: the next step every N seconds (effects first, like a click); at the end it stops, unless Loop is on
  useEffect(() => {
    if (!settings.autoplay || morph || !deck || drawing || thumbs) return
    const t = setTimeout(() => (i >= n - 1 && !settings.loop ? setSettings({ autoplay: null }) : go(1)), settings.autoplay)
    return () => clearTimeout(t)
  }, [settings.autoplay, settings.loop, i, morph, deck, n, go, drawing, thumbs, setSettings])
  /** straight to a slide (thumbnails, Restart, Go to end, the speaker view), shown from its start going forwards or finished going back */
  const jump = useCallback((to: number) => { setMorph(null); setMorphed(false); setArrival(to >= i ? 'forward' : 'back'); setI(Math.max(0, Math.min(n - 1, to))) }, [i, n])
  // the speaker view window follows this one and can move it (same browser, a channel named after the deck)
  const channel = `pt-present-${id}`
  const bc = useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    if (speaker) return
    const c = new BroadcastChannel(channel); bc.current = c
    return () => { c.close(); bc.current = null }
  }, [channel, speaker])
  useEffect(() => { if (bc.current) bc.current.onmessage = (e: MessageEvent<{ go?: number; hello?: boolean; end?: boolean }>) => { if (e.data?.end) { if (document.fullscreenElement) void document.exitFullscreen(); navigate(`/edit/${id}`) } else if (typeof e.data?.go === 'number') jump(e.data.go); else if (e.data?.hello) bc.current?.postMessage({ at: i }) } }, [jump, i, navigate, id])
  useEffect(() => { bc.current?.postMessage({ at: i }) }, [i])
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
      else if (e.key.toLowerCase() === 'f') toggleFullscreen()
      else if (e.key.toLowerCase() === 'd') setDrawing((v) => !v)
      else if (e.key.toLowerCase() === 'g') setThumbs(true)
      else if (e.key === 'Escape' && drawing) setDrawing(false)
      else if (e.key === 'Escape' && !document.fullscreenElement) navigate(`/edit/${id}`)
    }
    if (speaker || thumbs) return
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [n, id, navigate, go, toggleFullscreen, drawing, speaker, thumbs])

  if (locked) return null
  if (failed) return <div className="min-h-screen grid place-items-center bg-black text-white"><div className="text-center"><p className="mb-3">Could not load the presentation.</p><Link to="/" className="underline">Back to home</Link></div></div>
  if (!deck) return <SlideLoader fullScreen size="lg" tone="dark" label="Getting your slideshow ready" />
  const doc = deck.document
  const slide = doc.slides[i]!
  if (speaker) return <SpeakerView doc={doc} channel={channel} onExit={() => navigate(`/edit/${id}`)} />
  const { width: W, height: H } = CANVAS[doc.aspectRatio]
  const width = Math.floor(Math.min(size.w, (size.h * W) / H))

  return (
    <div className={`fixed inset-0 bg-black grid place-items-center select-none`} data-testid="present" onClick={(e) => {
      // an object that other effects wait for (a trigger) plays them when it is clicked, and the click is used up
      const trig = (e.target as HTMLElement).closest?.('[data-pt-el]')?.getAttribute('data-pt-el')
      if (trig && !morph && playerRef.current?.trigger(trig)) return
      if (slide.transition?.advanceOnClick === false) return
      go(e.clientX < size.w / 3 ? -1 : 1)
    }}>
      {morph ? (
        (() => {
          const t = (morph.dir === 1 ? doc.slides[morph.to] : slide)!.transition!
          return <MorphLayer from={slide} to={doc.slides[morph.to]!} theme={doc.theme} aspect={doc.aspectRatio} width={width} duration={t.duration ?? MORPH_DEFAULTS.duration} easing={easingCss(t.easing ?? MORPH_DEFAULTS.easing)} blend={t.blend ?? 'through'} by={t.by ?? 'object'} watermark={ent?.features.watermark ?? false} hiddenFrom={morph.hidden} handleRef={morphHandle} onDone={onMorphDone} />
        })()
      ) : <div key={slide.id} ref={rootRef} style={morphed || !settings.animation ? {} : Object.keys(transitionStyle(slide, doc.theme.motion?.transition)).length ? transitionStyle(slide, doc.theme.motion?.transition) : { animation: 'deckFade 300ms ease' }}><SlideCanvas slide={slide} theme={doc.theme} aspect={doc.aspectRatio} width={width} play={settings.animation} effects={settings.animation} watermark={ent?.features.watermark ?? false} footer={{ index: i, total: doc.slides.length, title: doc.title }} /></div>}
      {drawing && <DrawLayer key={`draw-${slide.id}`} onDone={() => setDrawing(false)} />}
      {settings.highlight && !drawing && <LaserPointer />}
      {notes && <div onClick={(e) => e.stopPropagation()} className="fixed left-0 right-0 bottom-0 z-10 bg-black/85 text-white p-6 pb-20 text-lg leading-relaxed max-h-[40vh] overflow-y-auto" role="region" aria-label="Speaker notes">{slide.speakerNotes || <span className="text-white/50">No notes for this slide.</span>}</div>}
      {thumbs && <ThumbnailGrid doc={doc} current={i} watermark={ent?.features.watermark ?? false} onPick={(to) => { setThumbs(false); jump(to) }} onClose={() => setThumbs(false)} />}
      <PresentControls i={i} n={n} settings={settings} fullscreen={fullscreen} drawing={drawing} notes={notes} canShare={(deck.role ?? 'owner') === 'owner'}
        onPrev={() => go(-1)} onNext={() => go(1)} onFirst={() => jump(0)} onLast={() => jump(n - 1)}
        onSettings={setSettings} onFullscreen={toggleFullscreen}
        onDraw={() => setDrawing((v) => !v)} onThumbnails={() => setThumbs(true)} onNotes={() => setNotes((v) => !v)}
        onSpeakerView={() => window.open(`/present/${encodeURIComponent(id)}?view=speaker`, `speaker-${id}`, 'popup,width=1200,height=760')}
        onEditor={() => navigate(`/edit/${id}`)} onShare={() => navigate(`/edit/${id}?open=share`)} onDownload={() => navigate(`/edit/${id}?open=export`)} />
    </div>
  )
}
