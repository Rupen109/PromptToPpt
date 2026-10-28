import { bus, type LiveEvent, type Peer } from './bus.ts'

/** Presence + fan-out for this API process. Every process keeps the full picture because every event arrives over the bus. */
const COLORS = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5']
export const colorFor = (userId: string) => { let h = 0; for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]! }

const STALE_MS = 40_000
const peers = new Map<string, Map<string, Peer>>() // deck → `${userId}:${clientId}` → peer
const listeners = new Map<string, Set<(e: LiveEvent) => void>>()
const key = (userId: string, clientId: string) => `${userId}:${clientId}`
let started = false

function dispatch(e: LiveEvent) {
  for (const fn of listeners.get(e.deck) ?? []) { try { fn(e) } catch { /* one broken stream must not stop the others */ } }
}

export function startHub() {
  if (started) return
  started = true
  bus().subscribe((e) => {
    if (e.t === 'presence') { let m = peers.get(e.deck); if (!m) peers.set(e.deck, (m = new Map())); m.set(key(e.peer.userId, e.peer.clientId), e.peer) }
    else if (e.t === 'leave') {
      const m = peers.get(e.deck)
      if (m) for (const k of [...m.keys()]) if (k.endsWith(`:${e.clientId}`)) m.delete(k)
      if (m?.size === 0) peers.delete(e.deck)
    } else if (e.t === 'kick') {
      const m = peers.get(e.deck)
      if (m) for (const [k, p] of m) if (p.userId === e.userId) m.delete(k)
    }
    dispatch(e)
  })
  setInterval(() => {
    const now = Date.now()
    for (const [deck, m] of peers) for (const [k, p] of m) if (now - p.at > STALE_MS) { m.delete(k); dispatch({ t: 'leave', deck, clientId: p.clientId }) }
  }, 10_000).unref()
}

export const peersOf = (deck: string): Peer[] => [...(peers.get(deck)?.values() ?? [])]
export function listen(deck: string, fn: (e: LiveEvent) => void): () => void {
  let s = listeners.get(deck)
  if (!s) listeners.set(deck, (s = new Set()))
  s.add(fn)
  return () => { s!.delete(fn); if (s!.size === 0) listeners.delete(deck) }
}
export const totalListeners = () => { let n = 0; for (const s of listeners.values()) n += s.size; return n }
export const deckListeners = (deck: string) => listeners.get(deck)?.size ?? 0

/** Test hook: forget everything. */
export const resetHub = () => { peers.clear(); listeners.clear() }
