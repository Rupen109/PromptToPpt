'use client'

import { ArrowRight } from '@prompttoppt/ui/icons'
import Link from 'next/link'
import { useState } from 'react'
import { CATEGORIES, DESIGNS, SKELETONS, type CategoryId } from '@prompttoppt/theme'
import { TemplateThumb } from '@/components/templates/TemplateThumb'
import { Button, type ButtonVariant } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge, Section } from './ui'

const pick = (cat: CategoryId, ...idx: number[]) => idx.map((i) => DESIGNS.filter((d) => d.category === cat)[i]!.id)
/** Each filter shows real designs from the catalogue; every card opens that template's own page. */
const FILTERS = [
  { id: 'all', label: 'All Decks', ids: [...pick('pitch', 0, 1), ...pick('strategy', 0)] },
  { id: 'pitch', label: 'VC Pitch', ids: pick('pitch', 0, 1, 2) },
  { id: 'board', label: 'Board Updates', ids: pick('strategy', 0, 1, 2) },
  { id: 'product', label: 'Product Roadmaps', ids: pick('product', 0, 1, 2) },
] as const
const ACCENTS: { badge: string; label: string; button: ButtonVariant }[] = [
  { badge: 'bg-foreground', label: 'text-primary', button: 'primary' },
  { badge: 'bg-accent', label: 'text-accent', button: 'accent' },
  { badge: 'bg-foreground', label: 'text-foreground', button: 'ink' },
]

export function TemplatesSection() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const ids = FILTERS.find((f) => f.id === filter)!.ids
  return (
    <Section id="templates" bg="bg-[#f3f4f9]">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
        <div className="max-w-[656px] flex flex-col gap-3 items-start">
          <Badge>Pre-engineered blueprints</Badge>
          <h2 className="font-heading font-extrabold text-3xl md:text-4xl leading-[1.1] text-foreground">Curated Decks Crafted for Every Kind of Presentation</h2>
          <p className="text-base leading-6 text-[#475569]">{DESIGNS.length} animated designs across 10 categories — each one a ready-made story you can open in the editor and make yours.</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:max-w-[476px] lg:justify-end" role="group" aria-label="Template filters">
          {FILTERS.map((f) => (
            <Button key={f.id} size="sm" variant={filter === f.id ? 'ink' : 'white'} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</Button>
          ))}
        </div>
      </div>

      <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {ids.map((id, i) => {
          const d = DESIGNS.find((x) => x.id === id)!
          const cat = CATEGORIES.find((c) => c.id === d.category)!
          const a = ACCENTS[i % 3]!
          return (
            <Card key={id} as="article" index={i} className="flex flex-col h-full group/card">
              <Link href={`/templates/${id}`} className="p-6 pb-0 flex-1 block" aria-label={`${d.name} template`}>
                <div className="relative rounded-2xl border-2 border-foreground overflow-hidden bg-[#eef1fe] [&_svg]:transition-transform">
                  <TemplateThumb designId={id} />
                  <span className={`absolute top-3 right-3 ${a.badge} text-white border border-white rounded-lg px-2.5 py-[3px] font-heading font-extrabold text-xs uppercase`}>{SKELETONS[d.category].length} slides</span>
                </div>
                <div className={`mt-6 font-heading font-extrabold text-xs uppercase tracking-[0.6px] ${a.label}`}>{cat.name}</div>
                <h3 className="mt-2 font-heading font-extrabold text-xl leading-7 text-foreground">{d.name}</h3>
                <p className="mt-2 text-sm leading-5 text-[#475569] line-clamp-3">{d.tagline}. {cat.blurb}</p>
              </Link>
              <div className="p-6 pt-5">
                <Button href={`/templates/${id}`} variant={a.button} block arrow>Use this blueprint</Button>
              </div>
            </Card>
          )
        })}
      </div>
      <p className="mt-10 text-center"><Link href="/templates" className="font-heading font-extrabold text-sm text-foreground underline underline-offset-4 decoration-2 hover:text-primary inline-flex items-center gap-1.5">Browse all {DESIGNS.length} templates<ArrowRight aria-hidden size={14} /></Link></p>
    </Section>
  )
}

export default TemplatesSection
