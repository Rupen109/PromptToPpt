import { ArrowRight } from '@prompttoppt/ui/icons'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MORPH_TEMPLATES } from '@prompttoppt/theme/morph-templates'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { TemplateShowcase } from '@/components/morph/TemplateShowcase'
import FaqSection from '@/components/sections/FaqSection'
import { JsonLd } from '@/components/seo/JsonLd'
import { SITE_URL } from '@/lib/env'
import { MORPH_CATEGORIES, categoryBySlug } from '@/lib/morph-categories'
import { MORPH_FAQS } from '@/lib/morph-page'
import { SITE_NAME, breadcrumbLd } from '@/lib/seo'

const HUB = '/morph-animation-templates'
export const dynamicParams = false
export const generateStaticParams = () => MORPH_CATEGORIES.map((c) => ({ category: c.slug }))

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const c = categoryBySlug((await params).category)
  if (!c) return {}
  const path = `${HUB}/${c.slug}`
  return {
    title: c.title, description: c.description, alternates: { canonical: path },
    openGraph: { title: c.title, description: c.description, url: `${SITE_URL}${path}`, type: 'website', siteName: SITE_NAME },
    twitter: { card: 'summary_large_image', title: c.title, description: c.description },
  }
}

export default async function MorphCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const c = categoryBySlug((await params).category)
  if (!c) notFound()
  const path = `${HUB}/${c.slug}`
  const templates = MORPH_TEMPLATES.filter((t) => t.category === c.id)
  const faqs = [
    ...c.faqs,
    ...templates.filter((t) => t.audience).map((t) => ({ q: `What topics suit the ${t.name} Morph template?`, a: t.audience! })),
    ...MORPH_FAQS.filter((f) => /plans include|choose which|PowerPoint|fast computer/i.test(f.q)),
  ]
  const ld = [
    breadcrumbLd([['Home', '/'], ['Morph animation templates', HUB], [c.name, path]]),
    {
      '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': `${SITE_URL}${path}#page`, name: c.title, description: c.description, url: `${SITE_URL}${path}`, inLanguage: 'en',
      isPartOf: { '@id': `${SITE_URL}${HUB}#page` }, publisher: { '@id': `${SITE_URL}/#organization` },
      mainEntity: { '@type': 'ItemList', name: c.title, numberOfItems: templates.length, itemListElement: templates.map((t, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'CreativeWork', '@id': `${SITE_URL}${path}#${t.id}`, name: `${t.name} Morph template`, description: t.description, url: `${SITE_URL}${path}#${t.id}` } })) },
    },
  ]
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {ld.map((d, i) => <JsonLd key={i} data={d} />)}
      <Header />
      <main>
        <section className="bg-gradient-to-b from-[#f8f9fc] to-[#f0f4f8] border-b-2 border-foreground px-5 md:px-10 py-12 md:py-16">
          <div className="max-w-[880px] mx-auto text-center">
            <nav aria-label="Breadcrumb" className="text-sm font-medium text-[#475569]">
              <Link href="/" className="underline">Home</Link> / <Link href={HUB} className="underline">Morph animation templates</Link> / <span aria-current="page">{c.name}</span>
            </nav>
            <h1 className="mt-4 font-heading font-extrabold text-4xl md:text-5xl leading-[1.05] text-foreground">{c.title}</h1>
            <p className="mt-5 text-lg leading-7 font-medium text-[#475569] max-w-[740px] mx-auto">{c.intro}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="#templates" className="inline-flex items-center gap-2 bg-primary text-white font-heading font-extrabold px-6 py-3 rounded-lg border-2 border-foreground shadow-solid">Watch the templates <ArrowRight aria-hidden size={18} /></Link>
              <Link href="/pricing" className="inline-flex items-center gap-2 bg-white text-foreground font-heading font-extrabold px-6 py-3 rounded-lg border-2 border-foreground">See plans</Link>
            </div>
            <p className="mt-4 text-sm font-medium text-[#475569]">Morph templates are included with the Gold and Premium plans.</p>
          </div>
        </section>

        <section id="templates" aria-labelledby="t-h" className="px-5 md:px-10 py-14 md:py-20 scroll-mt-24">
          <div className="max-w-[1100px] mx-auto">
            <h2 id="t-h" className="font-heading font-extrabold text-2xl md:text-3xl text-foreground text-center">{templates.length} {c.name} Morph templates</h2>
            <p className="mt-3 text-center text-[#475569] max-w-[640px] mx-auto">Each preview is live: it plays the real Morph, scene after scene. Use the arrows to step through it yourself, or press full screen.</p>
            <div className="mt-10"><TemplateShowcase templates={templates} /></div>
          </div>
        </section>

        <section aria-labelledby="more-h" className="px-5 md:px-10 pb-14 md:pb-20">
          <div className="max-w-[1000px] mx-auto">
            <h2 id="more-h" className="font-heading font-extrabold text-2xl text-foreground text-center">More Morph template families</h2>
            <ul className="mt-6 flex flex-wrap justify-center gap-3">
              {MORPH_CATEGORIES.filter((x) => x.id !== c.id).map((x) => <li key={x.id}><Link href={`${HUB}/${x.slug}`} className="inline-block rounded-full border-2 border-foreground bg-white px-4 py-2 font-semibold hover:bg-secondary">{x.name}</Link></li>)}
              <li><Link href={HUB} className="inline-block rounded-full border-2 border-foreground bg-secondary px-4 py-2 font-semibold">All Morph templates</Link></li>
            </ul>
            <p className="mt-8 text-center text-[#475569]">More on {SITE_NAME}: the <Link href="/ai-ppt-maker" className="text-primary font-semibold underline">AI PPT maker</Link>, <Link href="/templates" className="text-primary font-semibold underline">all presentation templates</Link> and <Link href="/pricing" className="text-primary font-semibold underline">plans</Link>.</p>
          </div>
        </section>

        <FaqSection faqs={faqs} />
      </main>
      <Footer />
    </div>
  )
}
