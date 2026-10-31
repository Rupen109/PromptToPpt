import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from '@prompttoppt/ui/icons'
import { ContentPage, Empty, Unavailable } from '@/components/content/parts'
import { Card } from '@/components/ui/Card'
import { getGuides, hrefOf } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Guides — How to Use SlidesDone',
  description: 'Step-by-step guides to make presentations with SlidesDone: create a deck from a prompt, a PDF, a picture or a video, edit it, brand it, share it and export it.',
  alternates: { canonical: '/guides' },
}

export const revalidate = 60

export default async function GuidesPage() {
  const g = await getGuides()
  return (
    <ContentPage eyebrow="Guides" title="How to use SlidesDone" intro="Step-by-step help for every part of the product, from your first deck to sharing and exporting.">
      {!g.ok ? <Unavailable what="guides" /> : g.data.length === 0 ? <Empty>The first guides are coming soon.</Empty> : (
        <div className="flex flex-col gap-14">
          {g.data.map((s) => (
            <section key={s.name} aria-labelledby={`s-${s.name}`}>
              <h2 id={`s-${s.name}`} className="font-heading font-extrabold text-2xl text-foreground">{s.name}</h2>
              <ul className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {s.items.map((p, i) => (
                  <li key={p.id} className="list-none">
                    <Link href={hrefOf(p)} aria-label={p.title} className="block h-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      <Card as="article" tone="white" radius="2xl" shadow="sm" border reveal={false} className="p-5 h-full flex flex-col gap-2" wrapperClassName="h-full">
                        <span className="font-heading font-extrabold text-xs text-primary">{String(i + 1).padStart(2, '0')}</span>
                        <h3 className="font-heading font-extrabold text-lg leading-snug text-foreground">{p.title}</h3>
                        <p className="text-sm leading-6 font-medium text-[#475569]">{p.summary}</p>
                        <span className="mt-auto pt-2 inline-flex items-center gap-1 font-heading font-bold text-xs text-primary">Read the guide<ArrowRight aria-hidden size={12} /></span>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </ContentPage>
  )
}
