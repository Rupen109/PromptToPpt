import { ArrowRight, Check } from '@prompttoppt/ui/icons'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { TOOL_CARDS as CARDS, type Tool } from '@/lib/free-tool-list'
import { SITE_URL } from '@/lib/env'
import { breadcrumbLd, ldJson, withShare } from '@/lib/seo'

export const metadata: Metadata = withShare({
  title: 'Free PDF Tools & Presentation Tools',
  description: 'Free online PDF and presentation tools: PDF to PPT, PDF to JPG, PDF editor, AI outline generator, PDF to presentation, YouTube and video to slides. No sign-up.',
  alternates: { canonical: '/free-tools' },
})


function ToolCard({ t }: { t: Tool }) {
  return (
    <Link href={t.href} className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-3xl">
      <Card tone={t.tone} radius="3xl" shadow="md" border reveal={false} className="p-7 md:p-8 h-full min-h-[385px] flex flex-col" wrapperClassName="h-full">
        <span className="self-start rounded-full border-2 border-foreground bg-white px-3 py-1 font-heading font-extrabold text-[11px] uppercase tracking-wide text-foreground">{t.badge}</span>
        <h2 className="mt-5 font-heading font-extrabold text-2xl leading-tight text-foreground">{t.name}</h2>
        <p className="mt-3 text-base leading-6 font-medium text-[#475569]">{t.text}</p>
        <ul className="mt-5 flex flex-col gap-2.5">
          {t.points.map((p) => (
            <li key={p} className="list-none flex gap-2.5 text-sm leading-5 font-medium text-[#334155]">
              <span aria-hidden className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-foreground text-white grid place-items-center"><Check size={10} strokeWidth={3} /></span>{p}
            </li>
          ))}
        </ul>
        <span className="mt-auto pt-6 inline-flex items-center gap-2 font-heading font-extrabold text-base text-primary">Try it free<ArrowRight aria-hidden size={16} /></span>
      </Card>
    </Link>
  )
}

export default function Page() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="px-5 md:px-10 py-14 md:py-20">
        <div className="max-w-[1160px] mx-auto">
          <h1 className="font-heading font-extrabold text-4xl md:text-5xl text-foreground text-center">Free PDF and presentation tools</h1>
          <p className="mt-4 text-lg font-medium text-[#475569] text-center max-w-[640px] mx-auto">Small, fast tools for the jobs that come before a great deck. No sign-up needed.</p>
          <ul className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {CARDS.map((t, i) => (
              <li key={t.href} className={`list-none${i === CARDS.length - 1 ? ' sm:col-span-2 sm:max-w-[calc(50%-1rem)] sm:justify-self-center lg:col-span-1 lg:col-start-2 lg:max-w-none' : ''}`}><ToolCard t={t} /></li>
            ))}
          </ul>
        </div>
        {/* the collection as answer engines read it: every free tool with its address and one-line job, and where this page sits */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson({
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'CollectionPage', '@id': `${SITE_URL}/free-tools#page`, url: `${SITE_URL}/free-tools`, name: 'Free presentation tools', description: metadata.description,
              mainEntity: { '@type': 'ItemList', itemListElement: CARDS.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, url: `${SITE_URL}${t.href}`, description: t.text })) } },
            { ...breadcrumbLd([['Home', '/'], ['Free tools', '/free-tools']]), '@context': undefined },
          ],
        }) }} />
      </main>
      <Footer />
    </div>
  )
}
