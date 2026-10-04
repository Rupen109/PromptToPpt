'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CATEGORIES, DESIGNS, type CategoryId } from '@prompttoppt/theme'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { TemplateThumb } from './TemplateThumb'

/** Every design, filterable by category and search. Each card is a real page (/templates/<id>) for people and search engines. */
export function TemplateGallery({ initialCategory = 'all' }: { initialCategory?: CategoryId | 'all' }) {
  const [cat, setCat] = useState<CategoryId | 'all'>(initialCategory)
  const [q, setQ] = useState('')
  const shown = useMemo(() => DESIGNS.filter((d) => (cat === 'all' || d.category === cat) && `${d.name} ${d.tagline}`.toLowerCase().includes(q.trim().toLowerCase())), [cat, q])
  const current = CATEGORIES.find((c) => c.id === cat)
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5" role="tablist" aria-label="Template categories">
        {[{ id: 'all', name: 'All templates' }, ...CATEGORIES].map((c) => (
          <Button key={c.id} role="tab" aria-selected={cat === c.id} size="sm" variant={cat === c.id ? 'ink' : 'white'} onClick={() => setCat(c.id as CategoryId | 'all')}>{c.name}</Button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
        <p className="text-slate-600 text-sm">{current ? current.blurb : 'Pick a category, or search by name or mood.'} <span className="text-slate-600">· {shown.length} templates</span></p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates…" aria-label="Search templates" className="border-2 border-foreground rounded-xl px-4 py-2 text-sm w-64 bg-white focus:outline-none focus:border-primary" />
      </div>
      {shown.length === 0 ? <p className="py-16 text-center text-slate-500">No templates match “{q}”.</p> : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {shown.map((d, i) => (
            <li key={d.id}>
              <Card index={i % 6} className="group/card overflow-hidden h-full">
                <Link href={`/templates/${d.id}`} className="block" aria-label={`${d.name} — ${d.tagline}`}>
                  <div className="p-5 pb-0"><div className="border-2 border-foreground rounded-2xl overflow-hidden"><TemplateThumb designId={d.id} className="transition-transform duration-500 motion-safe:group-hover/card:scale-[1.04]" /></div></div>
                  <div className="p-5">
                    <div className="font-heading font-extrabold text-xs tracking-wide uppercase text-primary">{CATEGORIES.find((c) => c.id === d.category)?.name}{d.premium ? ' · Pro' : ' · Free'}</div>
                    <h3 className="font-heading font-extrabold text-xl text-foreground mt-1">{d.name}</h3>
                    <p className="text-sm text-slate-600 mt-1">{d.tagline}</p>
                  </div>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
