import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CANVAS } from '@prompttoppt/validation'
import type { LoadedPresentation } from '@prompttoppt/api-client'
import { SlideCanvas, transitionStyle } from '@prompttoppt/ui'
import { api } from '@/lib/api'
import { PRESENT_LOCKED, useEntitlements } from '@/lib/entitlements'

/** Full-screen present mode: keyboard + click navigation, fade transition, speaker notes (N), fullscreen (F), Esc to exit. */
export function PresentPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { ent, upgrade } = useEntitlements()
  const [deck, setDeck] = useState<LoadedPresentation | null>(null)
  const [failed, setFailed] = useState(false)
  const [i, setI] = useState(0)
  const [notes, setNotes] = useState(false)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })

  // a Starter plan typing the address by hand lands back in the editor with the upgrade window
  const locked = !!ent && ent.features.exportFormats.length === 0
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
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); setI((x) => Math.min(n - 1, x + 1)) }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); setI((x) => Math.max(0, x - 1)) }
      else if (e.key === 'Home') setI(0)
      else if (e.key === 'End') setI(n - 1)
      else if (e.key.toLowerCase() === 'n') setNotes((v) => !v)
      else if (e.key.toLowerCase() === 'f') void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())
      else if (e.key === 'Escape' && !document.fullscreenElement) navigate(`/edit/${id}`)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [n, id, navigate])

  if (locked) return null
  if (failed) return <div className="min-h-screen grid place-items-center bg-black text-white"><div className="text-center"><p className="mb-3">Could not load the presentation.</p><Link to="/" className="underline">Back to home</Link></div></div>
  if (!deck) return <div className="min-h-screen grid place-items-center bg-black text-white/60">Loading…</div>
  const doc = deck.document
  const slide = doc.slides[i]!
  const { width: W, height: H } = CANVAS[doc.aspectRatio]
  const width = Math.floor(Math.min(size.w, (size.h * W) / H))

  return (
    <div className="fixed inset-0 bg-black grid place-items-center select-none" data-testid="present" onClick={(e) => setI((x) => (e.clientX < size.w / 3 ? Math.max(0, x - 1) : Math.min(n - 1, x + 1)))}>
      <div key={slide.id} style={Object.keys(transitionStyle(slide, doc.theme.motion?.transition)).length ? transitionStyle(slide, doc.theme.motion?.transition) : { animation: 'deckFade 300ms ease' }}><SlideCanvas slide={slide} theme={doc.theme} aspect={doc.aspectRatio} width={width} play watermark={ent?.features.watermark ?? false} /></div>
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/60" aria-live="polite">{i + 1} / {n} · ←/→ navigate · N notes · F fullscreen · Esc exit</div>
      {notes && <div className="fixed left-0 right-0 bottom-0 bg-black/85 text-white p-6 text-lg leading-relaxed max-h-[40vh] overflow-y-auto" role="region" aria-label="Speaker notes">{slide.speakerNotes || <span className="text-white/50">No notes for this slide.</span>}</div>}
    </div>
  )
}
