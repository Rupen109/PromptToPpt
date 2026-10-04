'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

/** Below `lg` the inline nav is hidden: this hamburger opens the same links plus the sign-in actions. */
export function MobileNav({ items }: { items: { label: string; href: string }[] }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <div className="xl:hidden">
      <button type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((v) => !v)} className="w-11 h-11 grid place-items-center rounded-xl border-2 border-foreground bg-white">
        <span aria-hidden className="relative block w-5 h-3">
          <span className={`absolute left-0 right-0 h-0.5 bg-foreground transition-all ${open ? 'top-1/2 rotate-45' : 'top-0'}`} />
          <span className={`absolute left-0 right-0 top-1/2 h-0.5 bg-foreground transition-opacity ${open ? 'opacity-0' : ''}`} />
          <span className={`absolute left-0 right-0 h-0.5 bg-foreground transition-all ${open ? 'top-1/2 -rotate-45' : 'bottom-0'}`} />
        </span>
      </button>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="absolute left-0 right-0 top-full bg-white border-b-2 border-foreground shadow-lg px-5 py-4 flex flex-col">
          {items.map((i) => <Link key={i.label} href={i.href} onClick={() => setOpen(false)} className="py-3 font-heading font-bold text-base text-foreground border-b border-border">{i.label}</Link>)}
          <div className="flex gap-3 pt-4">
            <Link href="/login" onClick={() => setOpen(false)} className="flex-1 text-center py-3 rounded-xl border-2 border-foreground font-heading font-bold text-sm">Log In</Link>
            <Link href="/signup" onClick={() => setOpen(false)} className="flex-1 text-center py-3 rounded-xl border-2 border-foreground bg-accent text-white font-heading font-bold text-sm">Create Free Deck</Link>
          </div>
        </nav>
      )}
    </div>
  )
}
