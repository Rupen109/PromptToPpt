import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, isGateError } from '@prompttoppt/api-client'
import type { Presentation } from '@prompttoppt/validation'
import { api } from '@/lib/api'
import { useDoc } from './store'

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'offline' | 'conflict' | 'error'

const DEBOUNCE_MS = 1500
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
  const failures = useRef(0)
  const statusRef = useRef<SaveStatus>('saved')
  const channel = useRef<BroadcastChannel | null>(null)
  const scheduleRef = useRef<(ms?: number) => void>(() => {})
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
        if (e instanceof ApiError && e.code === 'CONFLICT') set('conflict', 'This presentation was changed in another tab or device.')
        else if (isGateError(e)) set('error', e.message) // e.g. slide cap / premium theme: server said no — keep edits, tell the user
        else if (e instanceof ApiError && e.status >= 400 && e.status < 500) set('error', e.message)
        else {
          failures.current++
          set('offline', 'Offline — your changes are kept and will sync automatically.')
          scheduleRef.current(Math.min(30_000, 2000 * 2 ** failures.current))
        }
      } finally {
        inflight.current = false
      }
    },
    [id],
  )

  useEffect(() => {
    const schedule = (ms = DEBOUNCE_MS) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void save(), ms)
    }
    scheduleRef.current = schedule
    savedSeq.current = useDoc.getState().seq
    const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`prompttoppt:deck:${id}`) : null
    channel.current = ch
    if (ch) {
      ch.onmessage = async (ev: MessageEvent<{ type: string; revision: number }>) => {
        if (ev.data?.type !== 'saved' || ev.data.revision <= useDoc.getState().revision) return
        if (statusRef.current === 'saved') {
          try {
            const latest = await api.getPresentation(id) // idle tab: quietly adopt the other tab's work
            adopt.current(latest.document, latest.revision)
            savedSeq.current = useDoc.getState().seq
          } catch {
            /* next save will surface any problem */
          }
        } else set('conflict', 'This presentation was changed in another tab.')
      }
    }

    const unsub = useDoc.subscribe((s, prev) => {
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

  return { status, message, saveNow: (snapshot = false) => save(snapshot), resolve }
}
