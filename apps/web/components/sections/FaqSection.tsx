'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge, Section, SectionHeader } from './ui'

/** Answers describe what the product does today — no unverifiable claims (certifications, retention policies, user counts). */
const FAQS = [
  {
    q: 'Are the exported presentations really 100% editable in PowerPoint?',
    a: 'Every slide is built from real text boxes, shapes, charts and tables — not flattened pictures — which is what makes a PowerPoint export editable. Export to PPTX, PDF and images is part of the Pro and Gold plans; check the pricing section for exactly what each plan includes.',
  },
  {
    q: 'Is my sensitive financial model or confidential pitch IP safe?',
    a: 'Your presentations and uploaded sources are private to your account. To write your slides, the text of your prompt and sources is sent to the AI model provider that generates them. We never put your prompts, files or slide content into analytics tools, and you can delete any presentation or source at any time.',
  },
  {
    q: 'What is the page limit for PDF and financial spreadsheet ingestion?',
    a: 'PDFs can be up to 10 MB and 100 pages, PowerPoint (.pptx) files up to 15 MB, and text or Markdown files up to 1 MB. You can also add website links or paste text, and attach up to 10 sources to one deck. Scanned (image-only) PDFs and spreadsheets are not supported yet.',
  },
] as const

const Chevron = ({ open }: { open: boolean }) => (
  <svg width="14" height="9" viewBox="0 0 14 9" fill="none" aria-hidden className={`shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}><path d="M1 1.5 7 7.5 13 1.5" stroke="#181b25" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
)

export default function FaqSection() {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <Section id="faq" bg="bg-[#f3f4f9]" className="!pb-0 !border-b-0">
      <div className="max-w-[816px] mx-auto">
        <SectionHeader badge={<Badge bg="bg-white">Clear answers</Badge>} title="Frequently Asked Questions" />
        <div className="mt-8 flex flex-col gap-4">
          {FAQS.map((f, i) => (
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
