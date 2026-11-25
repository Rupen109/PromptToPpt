import type { Metadata } from 'next'
import Link from 'next/link'
import { ContentPage } from '@/components/content/parts'
import { JsonLd } from '@/components/seo/JsonLd'
import { GENERAL_FAQS, PRICING_FAQS } from '@/lib/faq'
import { FREE_TOOLS } from '@/lib/free-tool-list'
import { modified } from '@/lib/page-dates'
import { breadcrumbLd, faqLd, withShare } from '@/lib/seo'

export const metadata: Metadata = withShare({
  title: 'SlidesDone FAQ: AI Presentation Maker Questions',
  description: 'Answers about SlidesDone, the AI presentation maker: what it does, files you can use, editing and exporting to PowerPoint, plans and pricing, privacy.',
  alternates: { canonical: '/faq' },
})

/** every general and pricing question in one place (the same answers the home and pricing pages show), with links to each free tool's own questions */
export default function Page() {
  const all = [...GENERAL_FAQS, ...PRICING_FAQS]
  const group = (title: string, id: string, faqs: readonly { q: string; a: string }[]) => (
    <section aria-labelledby={id} className="mt-10 first:mt-0">
      <h2 id={id} className="font-heading font-extrabold text-2xl md:text-3xl text-foreground">{title}</h2>
      <div className="mt-6 flex flex-col gap-4">
        {faqs.map((f) => (
          <article key={f.q} className="rounded-2xl border-2 border-foreground bg-white p-6">
            <h3 className="font-heading font-extrabold text-base text-foreground">{f.q}</h3>
            <p className="mt-2 text-sm leading-6 font-medium text-[#475569]">{f.a}</p>
          </article>
        ))}
      </div>
    </section>
  )
  return (
    <ContentPage eyebrow="FAQ" title="Frequently asked questions" intro="Answers about SlidesDone, the AI presentation maker: what it does, which files you can use, editing and exporting, plans and privacy.">
      <JsonLd data={{ '@context': 'https://schema.org', '@graph': [{ ...faqLd(all), '@context': undefined, ...modified('/faq') }, { ...breadcrumbLd([['Home', '/'], ['FAQ', '/faq']]), '@context': undefined }] }} />
      <div className="max-w-[816px] mx-auto">
        {group('About SlidesDone', 'general', GENERAL_FAQS)}
        {group('Plans and pricing', 'pricing', PRICING_FAQS)}
        <section aria-labelledby="tools" className="mt-10">
          <h2 id="tools" className="font-heading font-extrabold text-2xl md:text-3xl text-foreground">Free tools</h2>
          <p className="mt-4 text-sm leading-6 font-medium text-[#475569]">Each free tool answers its own questions on its page:</p>
          <ul className="mt-3 flex flex-wrap gap-3">{FREE_TOOLS.map((t) => <li key={t.href}><Link href={t.href} className="inline-block rounded-full border-2 border-foreground bg-white px-4 py-2 text-sm font-bold text-foreground hover:bg-[#f3f4f9]">{t.name}</Link></li>)}</ul>
        </section>
      </div>
    </ContentPage>
  )
}
