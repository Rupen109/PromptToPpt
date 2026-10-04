import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'

/** Before the first response (or if it fails) assume the code defaults; the server enforces every flag regardless. */
const DEFAULTS: Record<string, boolean> = { maintenance_mode: false, ai_assistant: true, image_generation: true, exports: true }
const FlagsContext = createContext<Record<string, boolean>>(DEFAULTS)

/** Loads GET /api/v1/flags once after login. UI-only convenience — never a security boundary. */
export function FlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<Record<string, boolean>>(DEFAULTS)
  useEffect(() => {
    let cancelled = false
    api.flags().then((v) => !cancelled && setFlags({ ...DEFAULTS, ...v })).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return <FlagsContext value={flags}>{children}</FlagsContext>
}

export const useFlag = (key: string): boolean => use(FlagsContext)[key] ?? DEFAULTS[key] ?? false

export function MaintenanceBanner() {
  if (!useFlag('maintenance_mode')) return null
  return (
    <div role="status" className="mx-auto max-w-[960px] mt-6 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm px-4 py-3">
      We&rsquo;re doing some quick maintenance. AI features are paused for a short while &mdash; your presentations are safe and everything else works.
    </div>
  )
}
