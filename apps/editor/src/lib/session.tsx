import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { CurrentUser } from '@prompttoppt/api-client'
import { Portal } from '@/components/Portal'
import { api, SESSION_CHANGED_EVENT, setSessionUser } from './api'
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

/** How often a visible tab re-checks who is signed in (it also checks the moment it regains focus). */
const SESSION_CHECK_MS = 30_000

/**
 * The session cookie is shared by every tab. If you sign out, or sign in as someone else, in another tab, this tab would keep showing
 * the old account while its requests run as the new one. So the tab re-checks when it regains focus and every 30 s while visible, and
 * stops with a clear message instead of carrying on as the wrong person. (The server also refuses writes from a tab whose account
 * no longer matches, which covers the moment between the switch and the next check.)
 */
function SessionWatcher({ user }: { user: CurrentUser }) {
  const [change, setChange] = useState<null | { signedOut: true } | { signedOut: false; email: string }>(null)
  const done = useRef(false)
  const check = useCallback(async () => {
    if (done.current) return
    try {
      const now = await api.me()
      if (done.current) return
      if (!now) { done.current = true; setChange({ signedOut: true }) }
      else if (now.id !== user.id) { done.current = true; setChange({ signedOut: false, email: now.email }) }
    } catch { /* offline or the server is busy: try again later, never lock the user out on a network blip */ }
  }, [user.id])

  useEffect(() => {
    setSessionUser(user.id)
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    const timer = window.setInterval(onVisible, SESSION_CHECK_MS)
    window.addEventListener('focus', check)
    window.addEventListener(SESSION_CHANGED_EVENT, check)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', check)
      window.removeEventListener(SESSION_CHANGED_EVENT, check)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user.id, check])

  if (!change) return null
  return (
    <Portal>
      <div className="fixed inset-0 z-[100] bg-black/50 grid place-items-center p-4">
        <div role="alertdialog" aria-modal="true" aria-labelledby="session-changed-title" className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
          <h2 id="session-changed-title" className="font-heading font-bold text-xl mb-2">{change.signedOut ? 'You were signed out' : 'Your account changed'}</h2>
          <p className="text-sm text-slate-600 mb-5">
            {change.signedOut
              ? 'You signed out in another tab. Sign in again to keep working.'
              : <>This tab was signed in as <b>{user.email}</b>, but you are now signed in as <b>{change.email}</b> in another tab. Continue as {change.email} — nothing here has been changed under the wrong account.</>}
          </p>
          <button autoFocus onClick={() => (change.signedOut ? redirectToLogin() : window.location.reload())} className="w-full bg-primary text-white rounded-lg py-2.5 font-semibold">
            {change.signedOut ? 'Sign in' : `Continue as ${change.email}`}
          </button>
        </div>
      </div>
    </Portal>
  )
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
        setSessionUser(user.id) // before any child can send a write
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
  return (
    <SessionContext value={state.user}>
      {children}
      <SessionWatcher user={state.user} />
    </SessionContext>
  )
}
