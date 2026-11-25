'use client'

import { HoverLink } from '@/components/ui/HoverLink'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight } from '@prompttoppt/ui/icons'
import { CATEGORIES, DESIGNS, type CategoryId } from '@prompttoppt/theme'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { TemplateThumb } from './TemplateThumb'

const PER_PAGE = 12 // four rows of three

/** the page numbers to show: always the first and last, the current one and its neighbours, "…" for the gaps */
export function pageList(page: number, pages: number): (number | '…')[] {
  const keep = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)
  return keep.flatMap((n, i) => (i > 0 && n - keep[i - 1]! > 1 ? (n - keep[i - 1]! === 2 ? [n - 1, n] : ['…' as const, n]) : [n]))
}

/**
 * Every design, filterable by category and search, twelve to a page. Each card is a real page (/templates/<id>) for people and search engines (all of them are also
 * in the sitemap and on the free-template category pages). The category, search and page live in the address (?category=…&q=…&page=…), so coming back from a template
 * lands on the same page.
 */
export function TemplateGallery({ initialCategory = 'all' }: { initialCategory?: CategoryId | 'all' }) {
  // the page is prerendered (page 1, for people and crawlers); the browser then opens it on the category, search and page in the address
  return <Suspense fallback={<Gallery cat0={initialCategory} q0="" page0={1} />}><FromAddress fallback={initialCategory} /></Suspense>
}

type Start = { cat0: CategoryId | 'all'; q0: string; page0: number }

/** a shared or restored link opens on its category, search and page */
function FromAddress({ fallback }: { fallback: CategoryId | 'all' }) {
  const sp = useSearchParams()
  const c = sp.get('category')
  const cat0 = c && CATEGORIES.some((x) => x.id === c) ? (c as CategoryId) : fallback
  const page0 = Math.max(1, Number.parseInt(sp.get('page') ?? '', 10) || 1)
  return <Gallery cat0={cat0} q0={(sp.get('q') ?? '').slice(0, 60)} page0={page0} />
}

function Gallery({ cat0, q0, page0 }: Start) {
  const [cat, setCat] = useState<CategoryId | 'all'>(cat0)
  const [q, setQ] = useState(q0)
  const [page, setPage] = useState(page0)
  const top = useRef<HTMLDivElement>(null)
  const shown = useMemo(() => DESIGNS.filter((d) => (cat === 'all' || d.category === cat) && `${d.name} ${d.tagline}`.toLowerCase().includes(q.trim().toLowerCase())), [cat, q])
  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE))
  const at = Math.min(page, pages)
  const onPage = shown.slice((at - 1) * PER_PAGE, at * PER_PAGE)
  // ...and back into the address as they change (replace: the back button leaves the gallery instead of stepping through its pages)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const set = (k: string, v: string | null) => (v ? sp.set(k, v) : sp.delete(k))
    set('category', cat === 'all' ? null : cat); set('q', q.trim() || null); set('page', at > 1 ? String(at) : null)
    const qs = sp.toString()
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, '', next)
  }, [cat, q, at])
  const go = (n: number) => { setPage(n); top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const current = CATEGORIES.find((c) => c.id === cat)
  return (
    <div ref={top} className="scroll-mt-28">
      <div className="flex flex-wrap gap-2 mb-5" role="tablist" aria-label="Template categories">
        {[{ id: 'all', name: 'All templates' }, ...CATEGORIES].map((c) => (
          <Button key={c.id} role="tab" aria-selected={cat === c.id} size="sm" variant={cat === c.id ? 'ink' : 'white'} onClick={() => { setCat(c.id as CategoryId | 'all'); setPage(1) }}>{c.name}</Button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
        <p className="text-slate-600 text-sm">{current ? current.blurb : 'Pick a category, or search by name or mood.'}{(cat !== 'all' || q.trim()) && <span className="text-slate-600"> · {shown.length} {shown.length === 1 ? 'template' : 'templates'}</span>}</p>
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="Search templates…" aria-label="Search templates" className="border-2 border-foreground rounded-xl px-4 py-2 text-sm w-64 bg-white focus:outline-none focus:border-primary" />
      </div>
      {shown.length === 0 ? <p className="py-16 text-center text-slate-500">No templates match “{q}”.</p> : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {onPage.map((d, i) => (
            <li key={d.id}>
              <Card index={i % 6} className="group/card overflow-hidden h-full">
                <HoverLink href={`/templates/${d.id}`} className="block" aria-label={`${d.name} — ${d.tagline}`}>
                  <div className="p-5 pb-0"><div className="border-2 border-foreground rounded-2xl overflow-hidden"><TemplateThumb designId={d.id} className="transition-transform duration-500 motion-safe:group-hover/card:scale-[1.04]" /></div></div>
                  <div className="p-5">
                    <div className="font-heading font-extrabold text-xs tracking-wide uppercase text-primary">{CATEGORIES.find((c) => c.id === d.category)?.name}{d.premium ? ' · Pro' : ' · Free'}</div>
                    <h3 className="font-heading font-extrabold text-xl text-foreground mt-1">{d.name}</h3>
                    <p className="text-sm text-slate-600 mt-1">{d.tagline}</p>
                  </div>
                </HoverLink>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label="Template pages" className="mt-12 flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" variant="white" onClick={() => go(at - 1)} disabled={at === 1} aria-label="Previous page"><ArrowLeft aria-hidden size={16} />Prev</Button>
          {pageList(at, pages).map((n, i) => n === '…'
            ? <span key={`gap-${i}`} aria-hidden className="px-1 font-heading font-bold text-slate-500">…</span>
            : <Button key={n} size="sm" variant={n === at ? 'ink' : 'white'} onClick={() => go(n)} aria-label={`Page ${n}`} aria-current={n === at ? 'page' : undefined}>{n}</Button>)}
          <Button size="sm" variant="white" onClick={() => go(at + 1)} disabled={at === pages} aria-label="Next page">Next<ArrowRight aria-hidden size={16} /></Button>
          <p className="basis-full text-center text-sm text-slate-600 mt-1">Showing {(at - 1) * PER_PAGE + 1}–{Math.min(at * PER_PAGE, shown.length)} of {shown.length} templates</p>
        </nav>
      )}
    </div>
  )
}
