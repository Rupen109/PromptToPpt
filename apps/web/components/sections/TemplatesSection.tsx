'use client'

import { ArrowRight } from '@prompttoppt/ui/icons'
import Link from 'next/link'
import { useState } from 'react'
import { CATEGORIES, DESIGNS, SKELETONS, type CategoryId } from '@prompttoppt/theme'
import { TemplateThumb } from '@/components/templates/TemplateThumb'
import { Button, type ButtonVariant } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CardCarousel } from '@/components/ui/Carousel'
import { Section, SectionHeader } from './ui'

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
      <SectionHeader
        align="left" max="max-w-[600px]"
        title="Curated Decks Crafted for Every Kind of Presentation"
        subtitle={`${DESIGNS.length} animated designs across 10 categories — each one a ready-made story you can open in the editor and make yours.`}
        aside={
          <div className="flex flex-wrap gap-2 xl:justify-end" role="group" aria-label="Template filters">
            {FILTERS.map((f) => (
              <Button key={f.id} size="sm" variant={filter === f.id ? 'ink' : 'white'} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</Button>
            ))}
          </div>
        }
      />

      {/* keyed by the filter, so a new filter starts the carousel back at its first card */}
      <CardCarousel key={filter} from="lg" label="Template designs" className="mt-4 lg:mt-16" gridClassName="lg:grid lg:grid-cols-3 lg:gap-8 lg:p-0">
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
      </CardCarousel>
      <p className="mt-6 lg:mt-10 text-center"><Link href="/templates" className="font-heading font-extrabold text-sm text-foreground underline underline-offset-4 decoration-2 hover:text-primary inline-flex items-center gap-1.5">Browse all {DESIGNS.length} templates<ArrowRight aria-hidden size={14} /></Link></p>
    </Section>
  )
}

export default TemplatesSection
