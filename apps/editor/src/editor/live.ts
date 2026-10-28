import { useEffect } from 'react'
import { create } from 'zustand'
import type { LivePeer } from '@prompttoppt/api-client'
import { api } from '@/lib/api'
import { useComments } from './comments'
import { useDoc } from './store'
import { useUi } from './ui'

/**
 * Live editing: who else is in this deck and where (presence), and a nudge to merge when someone saves. The deck itself still travels through the normal
 * save path (revisions + three-way merge in autosave), so a dropped connection can never lose or corrupt anything — it only makes updates slower.
 */
interface LiveState {
  connected: boolean
  clientId: string
  you: { userId: string; name: string; color: string } | null
  peers: Record<string, LivePeer> // `${userId}:${clientId}`
  /** why this person was disconnected from the deck (access ended) */
  ended: boolean
  /** a short message to flash ("Maya is editing this text") */
  notice: string | null
}
const newClientId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20)

export const useLive = create<LiveState>(() => ({ connected: false, clientId: newClientId(), you: null, peers: {}, ended: false, notice: null }))
export const peerKey = (p: { userId: string; clientId: string }) => `${p.userId}:${p.clientId}`
/** Everyone else (other people, not my own other tabs), one entry per tab. */
export const othersOf = (peers: Record<string, LivePeer>, me: string | undefined) => Object.values(peers).filter((p) => p.userId !== me)
export const editorOf = (elementId: string) => { const { peers, you } = useLive.getState(); return othersOf(peers, you?.userId).find((p) => p.editing === elementId) ?? null }

/** Pointer position in slide coordinates, written by the canvas and read by the presence sender. */
export const pointer: { current: { x: number; y: number } | null; poke: () => void } = { current: null, poke: () => {} }

const THROTTLE_MS = 120
const KEEPALIVE_MS = 15_000

export function useLiveSync(deckId: string, enabled: boolean, pull: () => void) {
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return
    const clientId = useLive.getState().clientId
    useLive.setState({ connected: false, peers: {}, ended: false, you: null })
    const es = new EventSource(api.liveUrl(deckId, clientId), { withCredentials: true })
    let timer: ReturnType<typeof setTimeout> | null = null
    let last = 0
    let lastSent = ''
    let lastAt = 0
    let stopped = false

    const upsert = (p: LivePeer) => useLive.setState((s) => ({ peers: { ...s.peers, [peerKey(p)]: p } }))
    const remove = (clientId: string) => useLive.setState((s) => ({ peers: Object.fromEntries(Object.entries(s.peers).filter(([, p]) => p.clientId !== clientId)) }))

    es.addEventListener('hello', (ev) => {
      const h = JSON.parse((ev as MessageEvent).data) as { you: { userId: string; name: string; color: string }; revision: number; peers: LivePeer[] }
      useLive.setState({ connected: true, you: h.you, peers: Object.fromEntries(h.peers.map((p) => [peerKey(p), p])) })
      if (h.revision > useDoc.getState().revision) pull() // we were offline / the stream reconnected: catch up
      useComments.getState().refresh() // …and so for comments
      lastSent = '' // announce ourselves again
      send(true)
    })
    es.addEventListener('rev', (ev) => { const e = JSON.parse((ev as MessageEvent).data) as { rev: number }; if (e.rev > useDoc.getState().revision) pull() })
    es.addEventListener('comments', () => useComments.getState().refresh())
    es.addEventListener('presence', (ev) => upsert((JSON.parse((ev as MessageEvent).data) as { peer: LivePeer }).peer))
    es.addEventListener('leave', (ev) => remove((JSON.parse((ev as MessageEvent).data) as { clientId: string }).clientId))
    es.addEventListener('kick', () => { stopped = true; es.close(); useLive.setState({ connected: false, ended: true, peers: {} }) })
    es.onerror = () => { if (!stopped) useLive.setState({ connected: false }) } // EventSource reconnects by itself; `hello` resyncs

    function snapshot() {
      const ui = useUi.getState()
      const doc = useDoc.getState().doc
      const slideId = ui.activeSlideId && doc?.slides.some((s) => s.id === ui.activeSlideId) ? ui.activeSlideId : null
      return { clientId, slideId, selection: ui.selection.slice(0, 50), editing: ui.editingId, cursor: pointer.current ? { x: Math.round(pointer.current.x), y: Math.round(pointer.current.y) } : null }
    }
    function send(force = false) {
      if (stopped || !useLive.getState().connected) return
      const alone = othersOf(useLive.getState().peers, useLive.getState().you?.userId).length === 0
      const body = snapshot()
      const base = JSON.stringify({ ...body, cursor: null })
      const sig = alone ? base : base + JSON.stringify(body.cursor) // pointer moves are only worth sending when somebody is there to see them
      const now = Date.now()
      if (!force && sig === lastSent && now - lastAt < KEEPALIVE_MS) return
      lastSent = sig; lastAt = now
      void api.sendPresence(deckId, body).catch(() => {})
    }
    const schedule = () => {
      if (timer) return
      timer = setTimeout(() => { timer = null; last = Date.now(); send() }, Math.max(0, THROTTLE_MS - (Date.now() - last)))
    }
    pointer.poke = schedule
    const offUi = useUi.subscribe(schedule)
    const ka = setInterval(() => send(true), KEEPALIVE_MS)
    return () => {
      stopped = true
      es.close(); offUi(); clearInterval(ka)
      if (timer) clearTimeout(timer)
      pointer.poke = () => {}; pointer.current = null
      useLive.setState({ connected: false, peers: {}, you: null })
    }
  }, [deckId, enabled, pull])
}
