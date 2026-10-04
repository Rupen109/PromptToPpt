import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Entitlements } from '@prompttoppt/api-client'
import { api } from './api'

interface Ctx {
  ent: Entitlements | null
  refresh: () => Promise<void>
  /** UI-only convenience; the server re-checks every gated action. */
  upgrade: { open: boolean; reason: string | null; show: (reason?: string) => void; hide: () => void }
}
const EntitlementsContext = createContext<Ctx | null>(null)

export const useEntitlements = () => {
  const c = use(EntitlementsContext)
  if (!c) throw new Error('useEntitlements must be used inside <EntitlementsProvider>')
  return c
}

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const [ent, setEnt] = useState<Entitlements | null>(null)
  const [modal, setModal] = useState<{ open: boolean; reason: string | null }>({ open: false, reason: null })

  const refresh = useCallback(async () => {
    try {
      setEnt(await api.entitlements())
    } catch {
      /* non-fatal: UI shows no widget; server still enforces */
    }
  }, [])
  useEffect(() => {
    let cancelled = false
    api.entitlements().then((v) => !cancelled && setEnt(v)).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const show = useCallback((reason?: string) => setModal({ open: true, reason: reason ?? null }), [])
  const hide = useCallback(() => setModal({ open: false, reason: null }), [])
  const value = useMemo<Ctx>(() => ({ ent, refresh, upgrade: { ...modal, show, hide } }), [ent, refresh, modal, show, hide])
  return <EntitlementsContext value={value}>{children}</EntitlementsContext>
}
