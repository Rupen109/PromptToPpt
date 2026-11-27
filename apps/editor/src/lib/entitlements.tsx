import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Entitlements } from '@prompttoppt/api-client'
import type { GateCode } from '@prompttoppt/validation'
import { api } from './api'

interface Ctx {
  ent: Entitlements | null
  refresh: () => Promise<void>
  /** UI-only convenience; the server re-checks every gated action. `code` is the gate the server named, so the window can offer the right thing (credits vs a bigger plan). */
  upgrade: { open: boolean; reason: string | null; code: GateCode | null; show: (reason?: string, code?: GateCode) => void; hide: () => void }
}
/** shown in the upgrade window when a Starter plan opens Present mode */
export const PRESENT_LOCKED = 'Present mode and share links are available on Pro, Gold and Premium.'

const EntitlementsContext = createContext<Ctx | null>(null)

export const useEntitlements = () => {
  const c = use(EntitlementsContext)
  if (!c) throw new Error('useEntitlements must be used inside <EntitlementsProvider>')
  return c
}

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const [ent, setEnt] = useState<Entitlements | null>(null)
  const [modal, setModal] = useState<{ open: boolean; reason: string | null; code: GateCode | null }>({ open: false, reason: null, code: null })

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

  const show = useCallback((reason?: string, code?: GateCode) => setModal({ open: true, reason: reason ?? null, code: code ?? null }), [])
  const hide = useCallback(() => setModal({ open: false, reason: null, code: null }), [])
  const value = useMemo<Ctx>(() => ({ ent, refresh, upgrade: { ...modal, show, hide } }), [ent, refresh, modal, show, hide])
  return <EntitlementsContext value={value}>{children}</EntitlementsContext>
}
