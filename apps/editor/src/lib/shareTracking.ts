import { useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { TimeAccumulator } from './timeAccumulator'

/**
 * Viewer-side half of share-link analytics. Reports (1) that the link was opened and (2) how long each slide was on screen, in small batches.
 * What it is careful about: it only counts while the page is visible and the person is active (no events for 2 minutes = away); it never records anything
 * when "Do Not Track" / Global Privacy Control is on; it never shows an error or slows the presentation (every failure is swallowed); it keeps no cookie —
 * the visitor id is a random string kept in this browser's local storage.
 */
const TICK_MS = 500
const FLUSH_MS = 10_000
const VID_KEY = 'prompttoppt:vid'
let memoryVid: string | null = null

const doNotTrack = () => {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string }
  return n.doNotTrack === '1' || n.msDoNotTrack === '1' || (window as unknown as { doNotTrack?: string }).doNotTrack === '1' || n.globalPrivacyControl === true
}
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24)
export function visitorId(): string {
  try {
    const have = localStorage.getItem(VID_KEY)
    if (have && /^[A-Za-z0-9_-]{16,64}$/.test(have)) return have
    const id = randomId(); localStorage.setItem(VID_KEY, id); return id
  } catch { return (memoryVid ??= randomId()) } // private mode: counts as one visitor for this page load
}

export function useShareTracking(token: string, ready: boolean, slideIds: string[], index: number, access: string | undefined) {
  const slide = slideIds[index]
  const live = useRef({ slide, access })
  live.current = { slide, access }
  const flushRef = useRef<(final?: boolean) => void>(() => {})

  // a slide change is reported at once (and counts as "reached" even with 0 ms)
  useEffect(() => { if (slide) flushRef.current() }, [slide])

  useEffect(() => {
    if (!ready || !token || typeof window === 'undefined' || doNotTrack()) return
    const vid = visitorId()
    let viewId: string | null = null
    let off = false
    let stopped = false
    const clock = new TimeAccumulator(Date.now())

    const flush = (final = false) => {
      if (stopped || off || !viewId) return
      clock.enter(live.current.slide)
      const slides = clock.take()
      if (slides.length === 0) return
      // the last report goes by beacon (it survives the tab closing); if the browser will not queue one, or this is an ordinary report, a normal request is used
      if (final && api.shareViewBeacon(token, { viewId, vid, slides, ...(live.current.access ? { access: live.current.access } : {}) })) return
      void api.shareViewPing(token, { viewId, vid, slides }, live.current.access).catch((e: unknown) => { if ((e as { status?: number })?.status === 404 || (e as { code?: string })?.code === 'NOT_FOUND') off = true /* the link was turned off or expired: stop quietly */ })
    }
    flushRef.current = () => flush()

    const touch = () => clock.touch(Date.now())
    const events = ['keydown', 'pointermove', 'pointerdown', 'touchstart', 'wheel', 'click'] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))

    void api.shareViewStart(token, { vid, ...(document.referrer ? { referrer: document.referrer } : {}), vw: window.innerWidth }, live.current.access)
      .then((r) => { if (!stopped) { viewId = r.viewId; if (!viewId) off = true; else flush() } })
      .catch(() => { off = true })

    const tick = setInterval(() => { if (!off && viewId) clock.tick(Date.now(), live.current.slide, document.visibilityState === 'visible') }, TICK_MS)
    const batch = setInterval(() => flush(), FLUSH_MS)
    const onHide = () => { if (document.visibilityState === 'hidden') flush(true) }
    const onPageHide = () => flush(true)
    document.addEventListener('visibilitychange', onHide); window.addEventListener('pagehide', onPageHide)
    return () => {
      flush(true); stopped = true
      clearInterval(tick); clearInterval(batch)
      events.forEach((e) => window.removeEventListener(e, touch)); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onPageHide)
      flushRef.current = () => {}
    }
    // slide ids are read through `live`, so a changing deck never restarts the visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ready])
}
