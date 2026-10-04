import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { UsageFilters } from '@prompttoppt/api-client'

const KEYS = ['from', 'to', 'provider', 'model', 'requestType', 'environment', 'status', 'userId', 'country'] as const

/** Filters live in the URL so a view is shareable/bookmarkable and survives refresh. */
export function useFilters() {
  const [params, setParams] = useSearchParams()
  // "now" is captured when mounted / when the user changes a filter, so render stays pure and ranges don't drift mid-view
  const [anchor, setAnchor] = useState(() => Date.now())
  const range = params.get('range') ?? '30d'
  const filters: UsageFilters = {}
  for (const k of KEYS) {
    const v = params.get(k)
    if (v) (filters as Record<string, string>)[k] = v
  }
  const days = { today: 1, '7d': 7, '30d': 30, '90d': 90 }[range]
  if (days && !filters.from) filters.from = new Date(range === 'today' ? new Date(anchor).setHours(0, 0, 0, 0) : anchor - days * 864e5).toISOString()
  const set = (patch: Record<string, string | undefined>) => {
    setAnchor(Date.now())
    setParams((p) => {
      const n = new URLSearchParams(p)
      for (const [k, v] of Object.entries(patch)) {
        if (v) n.set(k, v)
        else n.delete(k)
      }
      return n
    })
  }
  return { filters, range, set, params }
}

/** Fetch with loading/error state; refetches when the filter key changes. */
export function useAsync<T>(fn: () => Promise<T>, key: string) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true })
  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true })) // eslint-disable-line react-hooks/set-state-in-effect
    fn().then((data) => !cancelled && setState({ data, error: null, loading: false })).catch((e: Error) => !cancelled && setState({ data: null, error: e.message || 'Failed to load', loading: false }))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}
