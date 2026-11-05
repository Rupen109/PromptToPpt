import { useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { useLive } from '@/editor/live'

/**
 * While a deck is still being written (some slides are placeholders) this follows the job: it asks for the newest revision every couple of seconds
 * (the live channel normally delivers it first: every 2 s only while it is NOT connected, every 10 s as a safety net when it is) and, if the job ends without finishing, says so once.
 */
export function useDeckBuild(id: string, pending: number, pull: () => unknown, flash: (text: string) => void) {
  const told = useRef(false)
  const live = useLive((s) => s.connected) // while the live channel delivers every revision, this only needs to check now and then (a slow safety net, not a second feed)
  useEffect(() => {
    if (pending === 0) { told.current = false; return }
    let stop = false
    const tick = async () => {
      try {
        const b = await api.deckBuild(id)
        if (stop) return
        if (b && (b.status === 'failed' || b.status === 'cancelled') && !told.current) { told.current = true; flash(b.error ?? 'Writing stopped. The slides that were finished are kept.') }
      } catch { /* the next tick tries again */ }
      if (!stop) void pull()
    }
    const t = setInterval(() => void tick(), live ? 10_000 : 2000)
    void tick()
    return () => { stop = true; clearInterval(t) }
  }, [id, pending > 0, live, pull, flash]) // eslint-disable-line react-hooks/exhaustive-deps
}
