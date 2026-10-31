'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { JsonLd } from '@/components/seo/JsonLd'
import { GENERAL_FAQS } from '@/lib/faq'
import { faqLd, type Faq } from '@/lib/seo'
import { Badge, Section, SectionHeader } from './ui'

const Chevron = ({ open }: { open: boolean }) => (
  <svg width="14" height="9" viewBox="0 0 14 9" fill="none" aria-hidden className={`shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}><path d="M1 1.5 7 7.5 13 1.5" stroke="#181b25" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
)

/** Answers describe what the product does today (see lib/faq.ts). The same list is emitted as FAQPage structured data. */
export default function FaqSection({ faqs = GENERAL_FAQS, heading = 'h2' }: { faqs?: readonly Faq[]; heading?: 'h1' | 'h2' } = {}) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <Section id="faq" bg="bg-[#f3f4f9]" className="!pb-0 !border-b-0">
      <div className="max-w-[816px] mx-auto">
        <JsonLd data={faqLd(faqs)} />
        <SectionHeader as={heading} badge={<Badge bg="bg-white">Clear answers</Badge>} title="Frequently Asked Questions" />
        <div className="mt-8 flex flex-col gap-4">
          {faqs.map((f, i) => (
            <Card key={f.q} tone="white" radius="2xl" shadow="sm" border index={i} wrapperClassName="h-auto">
              <h3>
                <button type="button" aria-expanded={open === i} aria-controls={`faq-${i}`} id={`faq-q-${i}`} onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between gap-6 text-left px-[22px] py-[22px] font-heading font-extrabold text-lg leading-7 text-foreground rounded-2xl">
                  <span>{f.q}</span>
                  <Chevron open={open === i} />
                </button>
              </h3>
              {/* grid-rows trick: animates height to/from its natural size without measuring */}
              <div id={`faq-${i}`} role="region" aria-labelledby={`faq-q-${i}`} className={`grid transition-[grid-template-rows] duration-300 ease-out ${open === i ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden"><p className="px-[22px] pb-[22px] -mt-2 text-base leading-6 text-[#475569]">{f.a}</p></div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Section>
  )
}
