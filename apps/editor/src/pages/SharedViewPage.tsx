import { ArrowLeft, ArrowRight, Lock, Maximize } from '@prompttoppt/ui/icons'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CANVAS } from '@prompttoppt/validation'
import { ApiError, type PublicDeck } from '@prompttoppt/api-client'
import { SlideCanvas, transitionStyle, useSlidePlayer } from '@prompttoppt/ui'
import { useParams } from 'react-router'
import { api } from '@/lib/api'
import { WEB_URL } from '@/lib/env'
import { useShareTracking } from '@/lib/shareTracking'
import { SlideLoader } from '../components/SlideLoader'

/** Public, view-only deck (a share link). No login, no editing, no speaker notes. Keyboard, swipe-free big buttons, responsive. */
const NO_SLIDE = { elements: [] } // a stable value while the deck is loading (a new one every render would restart the player)

export function SharedViewPage() {
  const { token = '' } = useParams()
  const [deck, setDeck] = useState<PublicDeck | null>(null)
  const [failed, setFailed] = useState<'gone' | 'expired' | 'password' | null>(null)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [i, setI] = useState(0)
  const [arrival, setArrival] = useState<'forward' | 'back'>('forward')
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })

  // the proof that the password was entered lives only for this browser tab
  const proofKey = `prompttoppt:share:${token}`
  const load = (access?: string) => api.getPublicDeck(token, access).then((d) => { setDeck(d); setFailed(null) }).catch((e) => {
    if (e instanceof ApiError && e.code === 'PASSWORD_REQUIRED') { try { sessionStorage.removeItem(proofKey) } catch { /* ignore */ } setFailed('password') }
    else setFailed(e instanceof ApiError && e.code === 'LINK_EXPIRED' ? 'expired' : 'gone')
  })
  useEffect(() => {
    let access: string | undefined
    try { access = sessionStorage.getItem(proofKey) ?? undefined } catch { /* private mode */ }
    void load(access)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
  async function unlock(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setPwError(null)
    try {
      const r = await api.unlockPublicDeck(token, pw)
      if (r.access) { try { sessionStorage.setItem(proofKey, r.access) } catch { /* ignore */ } }
      await load(r.access ?? undefined)
    } catch (err) { setPwError(err instanceof ApiError ? err.message : 'Could not check the password.') } finally { setBusy(false) }
  }
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const n = deck?.document.slides.length ?? 0
  const current = deck?.document.slides[i]
  const { rootRef, playerRef } = useSlidePlayer(current ?? NO_SLIDE, arrival)
  // the slide's own effects go first (like Present mode); only when it has nothing more does the slide change
  const go = useCallback((dir: 1 | -1, skipEffects = false) => {
    const p = playerRef.current
    if (!skipEffects && (dir === 1 ? p && p.advance() !== 'none' : p?.back())) return
    setArrival(dir === 1 ? 'forward' : 'back')
    setI((x) => Math.max(0, Math.min(n - 1, x + dir)))
  }, [n, playerRef])
  const after = current?.transition?.advanceAfter
  useEffect(() => {
    if (after === undefined || i >= n - 1) return
    const t = setTimeout(() => go(1, true), after)
    return () => clearTimeout(t)
  }, [after, i, n, go])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(1) }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(-1) }
      else if (e.key === 'Home') { setArrival('forward'); setI(0) }
      else if (e.key === 'End') { setArrival('back'); setI(n - 1) }
      else if (e.key.toLowerCase() === 'f') void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [n, go])
  useEffect(() => { if (deck) document.title = `${deck.title} — SlidesDone` }, [deck])
  // analytics for the owner (see lib/shareTracking.ts): nothing personal, off with Do Not Track, never visible and never in the way
  const access = (() => { try { return sessionStorage.getItem(proofKey) ?? undefined } catch { return undefined } })()
  useShareTracking(token, !!deck, deck?.document.slides.map((s) => s.id) ?? [], i, access)

  if (failed === 'password') return (
    <div className="min-h-screen grid place-items-center bg-[#111] text-white p-6">
      <form onSubmit={unlock} className="w-full max-w-sm text-center">
        <div className="mb-3 flex justify-center" aria-hidden><Lock size={32} /></div>
        <h1 className="text-xl font-semibold mb-1">This presentation is password-protected</h1>
        <p className="text-white/70 text-sm mb-5">Enter the password the owner gave you.</p>
        <input type="password" autoFocus autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Password" className="w-full rounded-lg px-4 py-3 text-black text-base" placeholder="Password" maxLength={200} />
        {pwError && <p role="alert" className="text-red-300 text-sm mt-2">{pwError}</p>}
        <button disabled={busy || !pw} className="mt-4 w-full rounded-lg bg-white text-black font-semibold py-3 disabled:opacity-50">{busy ? 'Checking…' : 'Open presentation'}</button>
      </form>
    </div>
  )
  if (failed) return (
    <div className="min-h-screen grid place-items-center bg-[#111] text-white p-6 text-center">
      <div>
        <p className="text-xl font-semibold mb-2">{failed === 'expired' ? 'This link has expired' : "This link isn't available"}</p>
        <p className="text-white/70 mb-5">{failed === 'expired' ? 'Ask the owner to send you a new link.' : 'It may have been turned off by its owner, or the address is wrong.'}</p>
        <a href={WEB_URL} className="underline">Go to SlidesDone</a>
      </div>
    </div>
  )
  if (!deck) return <SlideLoader fullScreen size="lg" tone="dark" label="Opening the presentation" />
  const doc = deck.document
  const slide = doc.slides[i]!
  const { width: W, height: H } = CANVAS[doc.aspectRatio]
  const chrome = 152 // title bar (48) + controls (84) + the padding around the slide (16) + a little air: a taller slide would sit on top of the Previous / Next buttons
  const width = Math.floor(Math.max(200, Math.min(size.w - 16, ((size.h - chrome) * W) / H)))
  const btn = 'w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 text-xl grid place-items-center'

  return (
    <div className="fixed inset-0 bg-[#111] text-white flex flex-col select-none">
      <header className="h-12 shrink-0 flex items-center justify-between gap-3 px-4 border-b border-white/10">
        <h1 className="font-semibold truncate text-sm sm:text-base">{deck.title}</h1>
        <a href={WEB_URL} className="text-xs text-white/70 hover:text-white whitespace-nowrap">Made with SlidesDone</a>
      </header>
      <main className="flex-1 min-h-0 grid place-items-center p-2" aria-label="Slide">
        <div key={slide.id} ref={rootRef} onClick={(e) => { const trig = (e.target as HTMLElement).closest?.('[data-pt-el]')?.getAttribute('data-pt-el'); if (trig) playerRef.current?.trigger(trig) }} style={Object.keys(transitionStyle(slide, doc.theme.motion?.transition)).length ? transitionStyle(slide, doc.theme.motion?.transition) : { animation: 'deckFade 300ms ease' }}>
          <SlideCanvas slide={slide} theme={doc.theme} aspect={doc.aspectRatio} width={width} play effects watermark={deck.watermark} footer={{ index: doc.slides.indexOf(slide), total: doc.slides.length, title: doc.title }} />
        </div>
      </main>
      <footer className="h-[84px] shrink-0 flex items-center justify-center gap-4">
        <button type="button" className={btn} aria-label="Previous slide" disabled={i === 0} onClick={() => go(-1)}><ArrowLeft aria-hidden size={18} /></button>
        <span className="text-sm tabular-nums text-white/70 min-w-16 text-center" aria-live="polite">{i + 1} / {n}</span>
        <button type="button" className={btn} aria-label="Next slide" disabled={i === n - 1 && !current?.effects?.length} onClick={() => go(1)}><ArrowRight aria-hidden size={18} /></button>
        <details className="absolute right-3 bottom-2 text-[11px] text-white/60 max-w-[60vw] max-sm:max-w-[80vw]">
          <summary className="cursor-pointer hover:text-white/90 list-none text-right">Privacy</summary>
          <p className="mt-1 rounded-lg bg-black/80 border border-white/10 p-2.5 text-white/80 leading-snug" data-testid="view-notice">The owner of this link can see that it was opened, how long each slide was on screen and roughly where from (device type, website, country). No name, e-mail address, IP address or cookie is recorded. Browsers with “Do Not Track” turned on are not measured.</p>
        </details>
        <button type="button" className={`${btn} text-base max-sm:hidden`} aria-label="Full screen" onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}><Maximize aria-hidden size={18} /></button>
      </footer>
    </div>
  )
}
