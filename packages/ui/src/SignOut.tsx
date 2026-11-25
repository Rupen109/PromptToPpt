'use client'

import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Signing out, the same in the website and the editor: the moment it is clicked a full-screen "Signing out…" cover with a spinner appears and stays until the
 * next page has loaded, so a slow, distant connection never looks like the click did nothing, and a second click cannot start it twice.
 * `end` ends the session (its errors are ignored: the page that loads next shows the real state); `then` leaves the page.
 */
export function useSignOut(end: () => Promise<unknown>, then: () => void) {
  const [busy, setBusy] = useState(false)
  const started = useRef(false)
  const signOut = useCallback(async () => {
    if (started.current) return
    started.current = true
    setBusy(true)
    try { await end() } catch { /* the next page shows the real state */ }
    then()
  }, [end, then])
  return { busy, signOut }
}

/** the cover shown while signing out: in <body> (a blurred or transformed header would otherwise trap a fixed cover inside it), with inline styles so it looks
 * the same in both apps whatever their stylesheets. It only renders after a click, so there is always a document here. */
export function SigningOut() {
  return createPortal(
    <div role="status" aria-live="polite" data-testid="signing-out"
      style={{ position: 'fixed', inset: 0, zIndex: 2147483000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(2px)', cursor: 'progress' }}>
      <style>{'@keyframes sd-spin{to{transform:rotate(360deg)}}'}</style>
      <span aria-hidden style={{ width: 34, height: 34, borderRadius: '50%', border: '3px solid #cbd5e1', borderTopColor: '#0f172a', animation: 'sd-spin 0.8s linear infinite' }} />
      <span style={{ font: '700 15px/1.4 system-ui, sans-serif', color: '#0f172a' }}>Signing out…</span>
    </div>,
    document.body,
  )
}
