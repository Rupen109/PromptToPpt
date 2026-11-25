import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { CreditCard, LayoutGrid, LifeBuoy, LogOut } from '@prompttoppt/ui/icons'
import { SigningOut, useSignOut } from '@prompttoppt/ui/sign-out'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { WEB_URL } from '@/lib/env'
import { useUser } from '@/lib/session'

const endSession = () => api.auth.signOut()
const reload = () => window.location.reload()

/**
 * Who is signed in, in the editor's top bar (several accounts on one computer, or a shared deck opened in the wrong browser profile, were easy to miss):
 * the person's initial, their name and email on hover, and a menu with their plan, their decks, billing, help and sign-out.
 */
export function AccountButton() {
  const user = useUser()
  const { ent } = useEntitlements()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const { busy, signOut } = useSignOut(endSession, reload)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50'
  const name = user.name?.trim() || user.email
  return (
    <div className="relative" ref={box}>
      {busy && <SigningOut />}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} title={`Signed in as ${name} (${user.email})`} aria-label={`Account: ${user.email}`} data-testid="editor-account"
        className="h-9 w-9 rounded-full bg-accent text-white font-bold text-sm grid place-items-center hover:ring-2 hover:ring-primary/30 shrink-0">
        {name.charAt(0).toUpperCase()}
      </button>
      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-border bg-white p-1 shadow-lg">
          <div className="px-3 py-2.5 border-b border-border mb-1">
            <div className="font-semibold text-sm truncate">{name}</div>
            <div className="text-xs text-slate-500 truncate" title={user.email} data-testid="editor-account-email">{user.email}</div>
            {ent && <div className="mt-1 text-xs text-slate-600">{ent.plan.name} plan · {ent.credits.balance.toLocaleString('en')} credits</div>}
          </div>
          <Link role="menuitem" to="/" onClick={() => setOpen(false)} className={item}><LayoutGrid aria-hidden size={16} className="text-slate-500" />My presentations</Link>
          <Link role="menuitem" to="/billing" onClick={() => setOpen(false)} className={item}><CreditCard aria-hidden size={16} className="text-slate-500" />Plan &amp; billing</Link>
          <a role="menuitem" href={`${WEB_URL}/support`} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className={item}><LifeBuoy aria-hidden size={16} className="text-slate-500" />Help &amp; support</a>
          <button role="menuitem" type="button" disabled={busy} onClick={() => void signOut()} className={item}><LogOut aria-hidden size={16} className="text-slate-500" />Sign out</button>
        </div>
      )}
    </div>
  )
}
