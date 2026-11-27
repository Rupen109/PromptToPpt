'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, BookOpen, ChevronDown, FileText, Newspaper, Sparkles, Wrench } from '@prompttoppt/ui/icons'
import { MORPH_CATEGORIES } from '@/lib/morph-categories'
import type { MenuDesign } from './MenuDesignThumbs'

/** the live thumbnails need the whole template design system: they are fetched the first time a menu opens, never with the page */
const MenuDesignThumbs = dynamic(() => import('./MenuDesignThumbs'), {
  ssr: false,
  loading: () => <ul aria-hidden className="mt-3 grid grid-cols-3 gap-x-2 gap-y-3">{Array.from({ length: 6 }, (_, i) => <li key={i} className="list-none"><div className="aspect-video rounded-lg border-2 border-foreground/20 bg-slate-100" /><div className="mx-auto mt-1 h-3 w-16 rounded bg-slate-100" /></li>)}</ul>,
})

const TRIGGER = 'relative inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-heading font-bold text-sm whitespace-nowrap transition-colors'

/**
 * A header link that also opens a panel: on hover (with a short delay so the pointer can travel into the panel), on keyboard focus, or on click/tap.
 * The label itself still links to `href`, so it works without the panel too. Escape and clicking elsewhere close it.
 */
function HoverMenu({ label, href, children, width, align = 'center' }: { label: string; href: string; children: (close: () => void) => ReactNode; width: string; align?: 'center' | 'page' }) {
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
    <div ref={box} className={align === 'page' ? '' : 'relative'} onMouseEnter={show} onMouseLeave={hideSoon} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false) }}>
      <div className={`${TRIGGER} ${open ? 'bg-[#f1f5f9] text-primary' : 'text-[#475569] hover:bg-[#f1f5f9] hover:text-primary'}`}>
        <Link href={href} onClick={() => setOpen(false)} className="text-inherit focus:outline-none focus-visible:underline">{label}</Link>
        <button type="button" aria-label={`${label} menu`} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="!bg-transparent !border-0 grid place-items-center -mr-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <ChevronDown aria-hidden size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {/* the page behind an open menu is dimmed and blurred so the menu is the focus; it starts right under the header and lets the pointer through (so leaving the menu still closes it) */}
      {open && <div aria-hidden className="pointer-events-none fixed left-0 right-0 top-full z-40 h-screen bg-slate-900/30 backdrop-blur-[5px] motion-safe:animate-[menu-dim_160ms_ease-out]" />}
      {open && (
        <div role="region" aria-label={`${label} links`} className={`absolute left-1/2 -translate-x-1/2 top-full pt-2 z-50 ${width}`}>
          <div className="rounded-2xl border-2 border-foreground bg-white p-3 shadow-[4px_5px_0_0_#181b25]">{children(() => setOpen(false))}</div>
        </div>
      )}
    </div>
  )
}

const ROW = 'flex gap-3 rounded-xl p-3 hover:bg-[#f1f5f9] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

const MORPH_HREF = '/morph-animation-templates'
/** the six Morph templates whose stills (apps/web/public/morph-posters) introduce the family in the menu */
const MORPH_SHOWCASE = [{ id: 'pitch-orbit', name: 'Orbit Pitch' }, { id: 'launch-countdown', name: 'Countdown' }, { id: 'edu-atlas', name: 'Learning Atlas' }, { id: 'mkt-billboard', name: 'Billboard Campaign' }, { id: 'tech-neural', name: 'Neural Network' }, { id: 'biz-roadmap', name: 'Roadmap' }]

export interface TemplateCollection { href: string; label: string; blurb: string; designs: MenuDesign[] }

/**
 * Templates: on the left the Morph animation templates and the collections people look for; on the right a preview of whatever is hovered or focused (real template slides for a
 * collection, stills of the Morph templates and their six families for Morph), then a clear "View all templates" button.
 */
export function TemplatesMenu({ items }: { items: TemplateCollection[] }) {
  const [active, setActive] = useState<string>(MORPH_HREF)
  // the six stills are small (about 35 KB each) but only needed once the menu opens: fetch them in the browser's idle time after the page is ready, so the first hover already finds them in the cache
  useEffect(() => {
    const load = () => MORPH_SHOWCASE.forEach((t) => { const img = new Image(); img.decoding = 'async'; img.src = `/morph-posters/${t.id}.webp` })
    if ('requestIdleCallback' in window) { const h = window.requestIdleCallback(load, { timeout: 1500 }); return () => window.cancelIdleCallback(h) }
    const h = setTimeout(load, 1000); return () => clearTimeout(h)
  }, [])
  const row = (key: string) => ({ onMouseEnter: () => setActive(key), onFocus: () => setActive(key) })
  const on = (key: string) => (active === key ? 'bg-[#f1f5f9] text-primary' : 'text-foreground')
  const item = items.find((i) => i.href === active)
  return (
    <HoverMenu label="Templates" href="/templates" width="w-[min(880px,calc(100vw-48px))]" align="page">
      {(close) => (
        <div className="grid grid-cols-[290px_1fr] gap-4">
          <div>
            <Link href={MORPH_HREF} onClick={close} {...row(MORPH_HREF)} className={`flex gap-3 rounded-xl border-2 border-foreground p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active === MORPH_HREF ? 'bg-[#fffbe6]' : 'bg-white'}`}>
              <span aria-hidden className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border-2 border-foreground bg-secondary"><Sparkles size={16} /></span>
              <span><span className="block font-heading font-extrabold text-sm text-foreground">Morph animation templates</span><span className="block text-xs font-medium text-[#475569]">Every slide flows into the next</span></span>
            </Link>
            <p className="px-3 pt-3 pb-1 font-heading font-extrabold text-[11px] uppercase tracking-wide text-[#64748b]">Popular collections</p>
            <ul>
              {items.map((i) => <li key={i.href} className="list-none"><Link href={i.href} onClick={close} {...row(i.href)} className={`block rounded-lg px-3 py-2 font-heading font-bold text-sm hover:bg-[#f1f5f9] hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on(i.href)}`}>{i.label}</Link></li>)}
            </ul>
            <div className="mt-2 border-t border-[#e2e8f0] pt-3 px-1">
              <Link href="/templates" onClick={close} className="flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-accent px-4 py-2.5 font-heading font-extrabold text-sm text-white shadow-[2px_3px_0_0_#181b25] hover:translate-y-px">View all templates <ArrowRight aria-hidden size={16} /></Link>
            </div>
          </div>
          <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
            {active === MORPH_HREF || !item ? (
              <>
                <h3 className="font-heading font-extrabold text-lg text-foreground">Morph animation templates</h3>
                <p className="mt-1 text-sm font-medium text-[#475569]">Objects glide, grow and turn from one slide to the next. Six families, each with its own kind of movement.</p>
                <ul className="mt-3 grid grid-cols-3 gap-x-2 gap-y-3">
                  {MORPH_SHOWCASE.map((t) => (
                    <li key={t.id} className="list-none">
                      <Link href={MORPH_HREF} onClick={close} className="block overflow-hidden rounded-lg border-2 border-foreground bg-white" aria-label={`${t.name} Morph template`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/morph-posters/${t.id}.webp`} alt={`${t.name} Morph template`} width={480} height={270} decoding="async" className="aspect-video w-full object-cover" />
                      </Link>
                      <span className="mt-1 block text-center text-xs font-semibold text-[#475569]">{t.name}</span>
                    </li>
                  ))}
                </ul>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {MORPH_CATEGORIES.map((c) => <li key={c.id} className="list-none"><Link href={`${MORPH_HREF}/${c.slug}`} onClick={close} className="inline-block rounded-full border-2 border-foreground bg-white px-3 py-1 text-xs font-semibold text-foreground hover:bg-secondary">{c.name}</Link></li>)}
                </ul>
                <Link href={MORPH_HREF} onClick={close} className="mt-4 inline-flex items-center gap-2 font-heading font-extrabold text-sm text-primary">Watch them play <ArrowRight aria-hidden size={15} /></Link>
              </>
            ) : (
              <>
                <h3 className="font-heading font-extrabold text-lg text-foreground">{item.label}</h3>
                <p className="mt-1 text-sm font-medium text-[#475569]">{item.blurb}</p>
                <MenuDesignThumbs key={item.href} designs={item.designs} onNavigate={close} />
                <Link href={item.href} onClick={close} className="mt-4 inline-flex items-center gap-2 font-heading font-extrabold text-sm text-primary">See all {item.label.toLowerCase()} <ArrowRight aria-hidden size={15} /></Link>
              </>
            )}
          </div>
        </div>
      )}
    </HoverMenu>
  )
}

/** Resources: the blog, tech news, the how-to guides and the free tools */
export function ResourcesMenu() {
  const items = [
    { href: '/free-tools', label: 'Free tools', text: 'PDF tools and presentation helpers, no sign-up', Icon: Wrench },
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

/**
 * Features: what SlidesDone does, in three groups, each linking to its own page (or the home page section that shows it). Only features that exist and can be used
 * today are listed (landing rules: nothing promised that is not built).
 */
export const FEATURE_GROUPS: { title: string; items: { href: string; label: string; text: string }[] }[] = [
  {
    title: 'Create with AI',
    items: [
      { href: '/ai-ppt-maker', label: 'Topic to PPT', text: 'Describe a topic and get an editable PowerPoint deck' },
      { href: '/free-tools/pdf-to-presentation', label: 'PDF to presentation', text: 'Turn a PDF into a designed, editable deck' },
      { href: '/#modalities', label: 'Word, notes and website links', text: 'Build a deck from a document, your notes or a web page' },
      { href: '/free-tools/video-to-slides', label: 'Video to slides', text: 'Make slides from a recording you upload' },
      { href: '/free-tools/youtube-transcript-to-slides', label: 'YouTube transcript to slides', text: 'Paste a transcript and get a deck from it' },
      { href: '/free-tools/script-to-slides', label: 'Script to slides', text: 'Split a talk script into slides' },
    ],
  },
  {
    title: 'PDF and file tools',
    items: [
      { href: '/free-tools/pdf-to-ppt', label: 'PDF to PPT', text: 'A PowerPoint file with editable text, page by page' },
      { href: '/free-tools/pdf-editor', label: 'PDF editor', text: 'Edit text and pictures in a PDF' },
      { href: '/free-tools/merge-pdf', label: 'Merge and split PDF', text: 'Combine PDFs or take pages out of one' },
      { href: '/free-tools/compress-pdf', label: 'Compress PDF', text: 'Make a PDF smaller, in your browser' },
      { href: '/free-tools/pdf-to-jpg', label: 'PDF to JPG', text: 'Save each page as a picture' },
      { href: '/free-tools/presentation-outline-generator', label: 'Outline generator', text: 'A slide-by-slide outline for any topic' },
    ],
  },
  {
    title: 'Edit and present',
    items: [
      { href: '/#studio', label: 'AI presentation editor', text: 'Change slides by asking in plain words' },
      { href: '/morph-animation-templates', label: 'Morph animation templates', text: 'Slides that flow smoothly into the next' },
      { href: '/templates', label: 'Presentation templates', text: 'Designs for every kind of deck' },
      { href: '/pricing', label: 'Export to PowerPoint and PDF', text: 'Download as PPTX, PDF, images or HTML' },
    ],
  },
]

export function FeaturesMenu() {
  return (
    <HoverMenu label="Features" href="/ai-ppt-maker" width="w-[min(940px,calc(100vw-48px))]" align="page">
      {(close) => (
        <div className="grid grid-cols-3 gap-2">
          {FEATURE_GROUPS.map((g) => (
            <div key={g.title}>
              <p className="px-3 pt-2 pb-1 font-heading font-extrabold text-[11px] uppercase tracking-wide text-primary">{g.title}</p>
              <ul>
                {g.items.map((i) => (
                  <li key={i.href + i.label} className="list-none">
                    <Link href={i.href} onClick={close} className="block rounded-xl px-3 py-2.5 hover:bg-[#f1f5f9] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      <span className="block font-heading font-extrabold text-sm text-foreground">{i.label}</span>
                      <span className="block text-xs font-medium text-[#475569]">{i.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </HoverMenu>
  )
}
