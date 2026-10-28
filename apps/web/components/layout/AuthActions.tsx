'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { API_URL, EDITOR_URL } from '@/lib/env'

/**
 * Who is signed in, for the header. The login cookie is shared with the API, so one small request answers it. Until it answers the buttons keep their
 * space but are invisible (a signed-in person never sees "Log In" flash first); if the request fails the visitor is treated as signed out.
 */
type Viewer = { email: string } | null | undefined // undefined = still asking
let asked: Promise<Viewer> | null = null
// the auth system's session endpoint answers 200 with an empty result when nobody is signed in (so a signed-out visitor gets no red error in the console)
const askOnce = (): Promise<Viewer> => (asked ??= fetch(`${API_URL}/api/auth/get-session`, { credentials: 'include' })
  .then(async (r) => (r.ok ? ((await r.json().catch(() => null)) as { user?: { email?: string } } | null)?.user?.email : undefined))
  .then((email) => (email ? { email } : null))
  .catch(() => null))

function useViewer(): Viewer {
  const [v, setV] = useState<Viewer>(undefined)
  useEffect(() => { let on = true; void askOnce().then((x) => { if (on) setV(x) }); return () => { on = false } }, [])
  return v
}

/** the desktop header: "Log In" + "Create Free Deck", or the signed-in e-mail + "My presentations" */
export function DesktopAuth() {
  const v = useViewer()
  const hidden = v === undefined ? 'invisible' : ''
  if (v) {
    return (
      <>
        <Link href={EDITOR_URL} aria-label={`Signed in as ${v.email}. Open my decks`} title={v.email} data-testid="signed-in-email" className="hidden sm:inline-flex items-center gap-2 max-w-[190px] font-heading font-bold text-sm text-foreground hover:text-primary">
          <span aria-hidden className="w-7 h-7 shrink-0 rounded-full bg-foreground text-white grid place-items-center text-xs uppercase">{v.email[0]}</span>
          <span className="truncate">{v.email}</span>
        </Link>
        <Button href={EDITOR_URL} variant="accent" size="md" className="hidden sm:inline-flex !normal-case !tracking-normal !text-sm">My decks</Button>
      </>
    )
  }
  return (
    <>
      <Button href="/login" variant="ghost" size="sm" className={`hidden sm:inline-flex !normal-case !tracking-normal !text-sm !font-bold ${hidden}`}>Log In</Button>
      <Button href="/signup" variant="accent" size="md" arrow className={`hidden sm:inline-flex !normal-case !tracking-normal !text-sm ${hidden}`}>Create Free Deck</Button>
    </>
  )
}

/** the same two actions at the bottom of the mobile menu */
export function MobileAuth({ onNavigate }: { onNavigate: () => void }) {
  const v = useViewer()
  if (v) {
    return (
      <div className="flex flex-col gap-3 pt-4">
        <p className="text-sm text-slate-600 truncate" data-testid="signed-in-email-mobile">Signed in as <b className="text-foreground">{v.email}</b></p>
        <Link href={EDITOR_URL} onClick={onNavigate} className="text-center py-3 rounded-xl border-2 border-foreground bg-accent text-white font-heading font-bold text-sm">My presentations</Link>
      </div>
    )
  }
  return (
    <div className={`flex gap-3 pt-4 ${v === undefined ? 'invisible' : ''}`}>
      <Link href="/login" onClick={onNavigate} className="flex-1 text-center py-3 rounded-xl border-2 border-foreground font-heading font-bold text-sm">Log In</Link>
      <Link href="/signup" onClick={onNavigate} className="flex-1 text-center py-3 rounded-xl border-2 border-foreground bg-accent text-white font-heading font-bold text-sm">Create Free Deck</Link>
    </div>
  )
}
