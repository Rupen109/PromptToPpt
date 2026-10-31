'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, CreditCard, LayoutGrid, LogOut } from '@prompttoppt/ui/icons'
import { Button } from '@/components/ui/Button'
import { API_URL, EDITOR_URL } from '@/lib/env'

/**
 * Who is signed in, for the header. The login cookie is shared with the API, so one small request answers it. Until it answers the buttons keep their
 * space but are invisible (a signed-in person never sees "Log In" flash first); if the request fails the visitor is treated as signed out.
 */
export type Viewer = { email: string } | null | undefined // undefined = still asking
let asked: Promise<Viewer> | null = null
// the auth system's session endpoint answers 200 with an empty result when nobody is signed in (so a signed-out visitor gets no red error in the console)
const askOnce = (): Promise<Viewer> => (asked ??= fetch(`${API_URL}/api/auth/get-session`, { credentials: 'include' })
  .then(async (r) => (r.ok ? ((await r.json().catch(() => null)) as { user?: { email?: string } } | null)?.user?.email : undefined))
  .then((email) => (email ? { email } : null))
  .catch(() => null))

export function useViewer(): Viewer {
  const [v, setV] = useState<Viewer>(undefined)
  useEffect(() => { let on = true; void askOnce().then((x) => { if (on) setV(x) }); return () => { on = false } }, [])
  return v
}

/** Ends the session (the login cookie belongs to the API) and shows the signed-out header. */
async function signOut() {
  try { await fetch(`${API_URL}/api/auth/sign-out`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' }) } catch { /* the page reload below shows the real state */ }
  window.location.assign('/')
}

/** The signed-in person's menu: who they are, My decks, billing, sign out. The header has no separate My decks button. */
function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const item = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-heading font-bold text-sm text-foreground hover:bg-[#f1f5f9]'
  return (
    <div ref={box} className="relative hidden sm:block">
      <button type="button" data-testid="account-menu" aria-haspopup="menu" aria-expanded={open} aria-label={`Account menu, signed in as ${email}`} title={email} onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 h-11 pl-1.5 pr-2.5 rounded-full !border-2 !border-solid !border-foreground !bg-white hover:!bg-[#f8f9fc] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span aria-hidden className="w-8 h-8 rounded-full bg-foreground text-white grid place-items-center text-sm font-extrabold uppercase">{email[0]}</span>
        <ChevronDown aria-hidden size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 top-full mt-2 w-64 rounded-2xl border-2 border-foreground bg-white p-2 shadow-[4px_5px_0_0_#181b25]">
          <div className="px-3 py-2 border-b border-[#e2e8f0] mb-1">
            <p className="font-heading font-bold text-[11px] uppercase tracking-wide text-[#64748b]">Signed in as</p>
            <p data-testid="signed-in-email" className="font-heading font-extrabold text-sm text-foreground break-all">{email}</p>
          </div>
          <Link role="menuitem" href={EDITOR_URL} onClick={() => setOpen(false)} className={item}><LayoutGrid aria-hidden size={16} />My decks</Link>
          <Link role="menuitem" href={`${EDITOR_URL}/billing`} onClick={() => setOpen(false)} className={item}><CreditCard aria-hidden size={16} />Plan & billing</Link>
          <button role="menuitem" type="button" onClick={() => void signOut()} className={item}><LogOut aria-hidden size={16} />Sign out</button>
        </div>
      )}
    </div>
  )
}

/** the desktop header: "Log In" + "Create Free Deck", or the account menu (My decks, plan & billing, sign out) */
export function DesktopAuth() {
  const v = useViewer()
  const hidden = v === undefined ? 'invisible' : ''
  if (v) {
    return (
      <>
        <AccountMenu email={v.email} />
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
        <Link href={EDITOR_URL} onClick={onNavigate} className="text-center py-3 rounded-xl border-2 border-foreground bg-accent text-white font-heading font-bold text-sm">My decks</Link>
        <button type="button" onClick={() => void signOut()} className="inline-flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-foreground bg-white font-heading font-bold text-sm text-foreground"><LogOut aria-hidden size={16} />Sign out</button>
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
