import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, isGateError } from '@prompttoppt/api-client'
import type { Presentation } from '@prompttoppt/validation'
import { api } from '@/lib/api'
import { mergeDocs } from './docdiff'
import { useLive, othersOf } from './live'
import { useDoc } from './store'

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'offline' | 'conflict' | 'error'

const DEBOUNCE_MS = 1500
const LIVE_DEBOUNCE_MS = 700 // somebody is watching: publish sooner (still under the 120 saves/min limit)
const MAX_REBASES = 8
const backupKey = (id: string) => `prompttoppt:draft:${id}`

interface Backup {
  doc: Presentation
  revision: number
}
/** Unsaved edits survive a refresh/crash/offline period in localStorage (best-effort; never the source of truth). */
export function readBackup(id: string): Backup | null {
  try {
    const raw = localStorage.getItem(backupKey(id))
    return raw ? (JSON.parse(raw) as Backup) : null
  } catch {
    return null
  }
}
const writeBackup = (id: string, b: Backup) => {
  try {
    localStorage.setItem(backupKey(id), JSON.stringify(b))
  } catch {
    /* storage full/blocked — saving to the server still works */
  }
}
const clearBackup = (id: string) => {
  try {
    localStorage.removeItem(backupKey(id))
  } catch {
    /* ignore */
  }
}

/**
 * Debounced, conflict-safe autosave.
 *  - saves ~1.5 s after the last change, immediately when the tab is hidden/closed, and on demand (Ctrl/Cmd+S → snapshot)
 *  - sends the revision it is based on; a 409 means another tab/device saved first → we STOP and ask, never overwrite silently
 *  - network failure → status "offline", exponential backoff retry; edits stay in memory + localStorage
 *  - tells other tabs about each save (BroadcastChannel) so an idle tab adopts it and a dirty tab learns of the conflict early
 */
export function useAutosave(id: string, onAdopt: (doc: Presentation, revision: number) => void) {
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [message, setMessage] = useState<string | null>(null)
  const savedSeq = useRef(useDoc.getState().seq)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef(false)
  /** per deck id: the revision the server last confirmed and the last edit count it holds — read when leaving a deck (the editor has cleared the store by then, and this hook is reused when you move to another deck) */
  const deckState = useRef(new Map<string, { revision: number; savedSeq: number }>())
  const failures = useRef(0)
  const statusRef = useRef<SaveStatus>('saved')
  const channel = useRef<BroadcastChannel | null>(null)
  const scheduleRef = useRef<(ms?: number) => void>(() => {})
  /** the deck exactly as the server last confirmed it (loaded or saved): the common ancestor for three-way merges with collaborators */
  const synced = useRef<Presentation | null>(useDoc.getState().doc)
  const pulling = useRef(false)
  const pullAgain = useRef(false)
  const pullRef = useRef<(force?: boolean) => Promise<void>>(async () => {})
  const rebases = useRef(0)
  const adopt = useRef(onAdopt)
  useEffect(() => {
    adopt.current = onAdopt
  })
  const set = (s: SaveStatus, m: string | null = null) => {
    statusRef.current = s
    setStatus(s)
    setMessage(m)
  }

  const save = useCallback(
    async (snapshot = false) => {
      if (inflight.current || statusRef.current === 'conflict') return
      const { doc, revision, seq } = useDoc.getState()
      if (!doc || (seq === savedSeq.current && !snapshot)) return
      inflight.current = true
      set('saving')
      try {
        const res = await api.savePresentation(id, revision, doc, snapshot)
        failures.current = 0
        useDoc.getState().setRevision(res.revision)
        deckState.current.set(id, { revision: res.revision, savedSeq: seq })
        synced.current = doc
        rebases.current = 0
        savedSeq.current = seq
        channel.current?.postMessage({ type: 'saved', revision: res.revision })
        if (useDoc.getState().seq !== seq) {
          set('dirty')
          scheduleRef.current(300)
        } else {
          clearBackup(id)
          set('saved')
        }
      } catch (e) {
        if (e instanceof ApiError && e.code === 'CONFLICT') {
          // someone saved first: merge their version with my unsaved edits and save again; only ask the user if that keeps failing
          if (++rebases.current > MAX_REBASES) set('conflict', 'This presentation keeps changing in another tab or device.')
          else { set('dirty'); void pullRef.current(true) }
        }
        else if (isGateError(e)) set('error', e.message) // e.g. slide cap / premium theme: server said no — keep edits, tell the user
        else if (e instanceof ApiError && e.status >= 400 && e.status < 500) set('error', e.message)
        else {
          failures.current++
          set('offline', 'Offline — your changes are kept and will sync automatically.')
          scheduleRef.current(Math.min(30_000, 2000 * 2 ** failures.current))
        }
      } finally {
        inflight.current = false
        if (pullAgain.current) { pullAgain.current = false; void pullRef.current() }
      }
    },
    [id],
  )

  /**
   * A collaborator (or another tab) saved a newer revision. Nothing unsaved here → just adopt it. Unsaved edits here → three-way merge
   * (their version + what I changed since my last sync) and save the result on top. History is kept: undo only ever reverts MY changes.
   */
  const pull = useCallback(async (force = false) => {
    if (pulling.current || inflight.current) { pullAgain.current = true; return }
    pulling.current = true
    try {
      const latest = await api.getPresentation(id)
      const st = useDoc.getState()
      if (!st.doc || (!force && latest.revision <= st.revision)) return
      const dirty = st.seq !== savedSeq.current
      if (!dirty) {
        useDoc.getState().adoptRemote(latest.document, latest.revision)
        synced.current = latest.document
        savedSeq.current = useDoc.getState().seq
        if (statusRef.current !== 'conflict') set('saved')
        return
      }
      const merged = mergeDocs(synced.current ?? latest.document, st.doc, latest.document)
      synced.current = latest.document
      useDoc.getState().mergeRemote(merged, latest.revision) // bumps seq: the merged deck still has to be saved
      if (statusRef.current === 'conflict') set('dirty')
      scheduleRef.current(150)
    } catch {
      /* offline or transient: the next event or save retries */
    } finally {
      pulling.current = false
      if (pullAgain.current && !inflight.current) { pullAgain.current = false; void pullRef.current() }
    }
  }, [id])
  useEffect(() => { pullRef.current = pull }, [pull])

  useEffect(() => {
    const schedule = (ms = DEBOUNCE_MS) => {
      if (timer.current) clearTimeout(timer.current)
      const live = othersOf(useLive.getState().peers, useLive.getState().you?.userId).length > 0
      timer.current = setTimeout(() => void save(), live ? Math.min(ms, LIVE_DEBOUNCE_MS) : ms)
    }
    scheduleRef.current = schedule
    savedSeq.current = useDoc.getState().seq
    const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`prompttoppt:deck:${id}`) : null
    channel.current = ch
    if (ch) {
      ch.onmessage = (ev: MessageEvent<{ type: string; revision: number }>) => {
        if (ev.data?.type === 'saved' && ev.data.revision > useDoc.getState().revision) void pullRef.current() // another tab of mine saved: merge it in
      }
    }

    const last: { doc: Presentation | null; revision: number; seq: number } = { doc: useDoc.getState().doc, revision: useDoc.getState().revision, seq: useDoc.getState().seq }
    const unsub = useDoc.subscribe((s, prev) => {
      if (s.doc) {
        last.doc = s.doc; last.revision = s.revision; last.seq = s.seq
        const known = deckState.current.get(id)
        deckState.current.set(id, { revision: s.revision, savedSeq: s.seq === 0 ? 0 : (known?.savedSeq ?? 0) })
      }
      if (s.doc && s.doc !== prev.doc && s.seq === 0) {
        // a fresh load (another deck, or a reload): this is exactly what the server holds, and the edit counter starts again at 0.
        // The saved-edit marker must restart too: left over from the previous deck it made the first edit here look "already saved",
        // so the edit was never sent and the status stayed "Unsaved changes…" forever.
        synced.current = s.doc
        savedSeq.current = 0
        return
      }
      if (s.seq === prev.seq || !s.doc) return
      if (statusRef.current !== 'conflict') set(statusRef.current === 'saving' ? 'saving' : 'dirty')
      writeBackup(id, { doc: s.doc, revision: s.revision })
      schedule()
    })
    const flush = () => {
      if (statusRef.current === 'dirty' || statusRef.current === 'offline') void save()
    }
    const onHide = () => document.visibilityState === 'hidden' && flush()
    const onUnload = (e: BeforeUnloadEvent) => {
      if (statusRef.current === 'dirty' || statusRef.current === 'saving' || statusRef.current === 'offline') {
        flush()
        e.preventDefault()
      }
    }
    const onOnline = () => void save()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('online', onOnline)
    return () => {
      unsub()
      // Leaving this deck (another deck, Home, Back) with an edit still waiting for the debounce: send it instead of dropping it.
      // By now the editor has already cleared the open deck from the store, so the last state seen here is what gets saved.
      const snap = { ...last }
      const unsent = statusRef.current !== 'saved' && statusRef.current !== 'conflict' && snap.doc && snap.seq !== (deckState.current.get(id)?.savedSeq ?? 0)
      if (unsent) {
        void (async () => {
          for (let i = 0; i < 40 && inflight.current; i++) await new Promise((r) => setTimeout(r, 100)) // a save is already on its way: let it land first
          const st = deckState.current.get(id)
          if (!snap.doc || snap.seq === (st?.savedSeq ?? 0)) return // that save already carried this edit
          try { await api.savePresentation(id, st?.revision ?? snap.revision, snap.doc, false) } catch { /* the local backup keeps the edit if this fails */ }
        })()
      }
      if (timer.current) clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('online', onOnline)
      ch?.close()
    }
  }, [id, save])

  /** Conflict resolution. `reload` discards local edits; `overwrite` keeps them and replaces the other copy. */
  const resolve = useCallback(
    async (how: 'reload' | 'overwrite') => {
      const latest = await api.getPresentation(id)
      if (how === 'reload') {
        useDoc.getState().load(latest.document, latest.revision)
        synced.current = latest.document
        savedSeq.current = 0
        clearBackup(id)
        adopt.current(latest.document, latest.revision)
        set('saved')
      } else {
        useDoc.getState().setRevision(latest.revision)
        set('dirty')
        await save(true)
      }
    },
    [id, save],
  )

  return { status, message, saveNow: (snapshot = false) => save(snapshot), resolve, pull: useCallback(() => void pullRef.current(), []) }
}
