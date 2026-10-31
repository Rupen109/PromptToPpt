'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, BookOpen, ChevronDown, FileText, Newspaper } from '@prompttoppt/ui/icons'

const TRIGGER = 'relative inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-heading font-bold text-sm whitespace-nowrap transition-colors'

/**
 * A header link that also opens a panel: on hover (with a short delay so the pointer can travel into the panel), on keyboard focus, or on click/tap.
 * The label itself still links to `href`, so it works without the panel too. Escape and clicking elsewhere close it.
 */
function HoverMenu({ label, href, children, width }: { label: string; href: string; children: (close: () => void) => ReactNode; width: string }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const show = () => { clearTimeout(timer.current); setOpen(true) }
  const hideSoon = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 140) }
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <div ref={box} className="relative" onMouseEnter={show} onMouseLeave={hideSoon} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false) }}>
      <div className={`${TRIGGER} ${open ? 'bg-[#f1f5f9] text-primary' : 'text-[#475569] hover:bg-[#f1f5f9] hover:text-primary'}`}>
        <Link href={href} onClick={() => setOpen(false)} className="text-inherit focus:outline-none focus-visible:underline">{label}</Link>
        <button type="button" aria-label={`${label} menu`} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="!bg-transparent !border-0 grid place-items-center -mr-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <ChevronDown aria-hidden size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div role="region" aria-label={`${label} links`} className={`absolute left-1/2 -translate-x-1/2 top-full pt-2 z-50 ${width}`}>
          <div className="rounded-2xl border-2 border-foreground bg-white p-3 shadow-[4px_5px_0_0_#181b25]">{children(() => setOpen(false))}</div>
        </div>
      )}
    </div>
  )
}

const ROW = 'flex gap-3 rounded-xl p-3 hover:bg-[#f1f5f9] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

/** Templates: the template collections people look for, and a clear "View all templates" button */
export function TemplatesMenu({ items }: { items: { href: string; label: string }[] }) {
  return (
    <HoverMenu label="Templates" href="/templates" width="w-[560px]">
      {(close) => (
        <>
          <p className="px-3 pt-1 pb-2 font-heading font-extrabold text-[11px] uppercase tracking-wide text-[#64748b]">Popular collections</p>
          <ul className="grid grid-cols-2 gap-x-2">
            {items.map((i) => <li key={i.href} className="list-none"><Link href={i.href} onClick={close} className="block rounded-lg px-3 py-2 font-heading font-bold text-sm text-foreground hover:bg-[#f1f5f9] hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">{i.label}</Link></li>)}
          </ul>
          <div className="mt-2 border-t border-[#e2e8f0] pt-3 px-1">
            <Link href="/templates" onClick={close} className="flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-accent px-4 py-2.5 font-heading font-extrabold text-sm text-white shadow-[2px_3px_0_0_#181b25] hover:shadow-[4px_5px_0_0_#181b25] transition-shadow">View all templates<ArrowRight aria-hidden size={16} /></Link>
          </div>
        </>
      )}
    </HoverMenu>
  )
}

/** Resources: the blog, tech news and the how-to guides */
export function ResourcesMenu() {
  const items = [
    { href: '/blog', label: 'Blog', text: 'Articles on better presentations', Icon: FileText },
    { href: '/news', label: 'Tech news', text: 'Short AI and software updates', Icon: Newspaper },
    { href: '/guides', label: 'Guides', text: 'How to use SlidesDone, step by step', Icon: BookOpen },
  ]
  return (
    <HoverMenu label="Resources" href="/guides" width="w-[320px]">
      {(close) => (
        <ul>
          {items.map(({ href, label, text, Icon }) => (
            <li key={href} className="list-none">
              <Link href={href} onClick={close} className={ROW}>
                <span aria-hidden className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border-2 border-foreground bg-[#fffbe6]"><Icon size={16} /></span>
                <span><span className="block font-heading font-extrabold text-sm text-foreground">{label}</span><span className="block text-xs font-medium text-[#475569]">{text}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HoverMenu>
  )
}
