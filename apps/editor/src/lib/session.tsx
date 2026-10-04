import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import type { CurrentUser } from '@prompttoppt/api-client'
import { api } from './api'
import { WEB_URL } from './env'

const SessionContext = createContext<CurrentUser | null>(null)
export const useUser = () => {
  const user = use(SessionContext)
  if (!user) throw new Error('useUser must be used inside <RequireAuth>')
  return user
}

/** Login lives on the main site; it sends the user back here via ?next= after sign-in. */
export function redirectToLogin() {
  window.location.assign(`${WEB_URL}/login?next=${encodeURIComponent(window.location.href)}`)
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; user: CurrentUser }>({
    status: 'loading',
  })

  useEffect(() => {
    let cancelled = false
    api
      .me()
      .then((user) => {
        if (cancelled) return
        if (!user) return redirectToLogin()
        setState({ status: 'ready', user })
      })
      .catch(() => !cancelled && setState({ status: 'error' }))
    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'error')
    return (
      <div className="min-h-screen grid place-items-center text-center p-6">
        <div>
          <p className="font-bold mb-3">We couldn&apos;t reach the server.</p>
          <button onClick={() => window.location.reload()} className="bg-primary text-white px-4 py-2 rounded-md font-bold">
            Retry
          </button>
        </div>
      </div>
    )
  if (state.status === 'loading') return <div className="min-h-screen grid place-items-center text-muted">Loading…</div>
  return <SessionContext value={state.user}>{children}</SessionContext>
}
