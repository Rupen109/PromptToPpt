import { ArrowRight } from '@prompttoppt/ui/icons'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CATEGORIES, DESIGNS, SKELETONS } from '@prompttoppt/theme'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { TemplateThumb } from '@/components/templates/TemplateThumb'
import { LANDINGS, landingBySlug } from '@/lib/template-landing'
import { SITE_URL } from '@/lib/env'

export const dynamicParams = false
export const generateStaticParams = () => LANDINGS.map((l) => ({ slug: l.slug }))

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const l = landingBySlug(slug)
  if (!l) return {}
  const n = DESIGNS.filter((d) => d.category === l.category).length
  return {
    title: `Free ${l.noun} Presentation Templates — Edit Online`,
    description: `${n} designed ${l.noun.toLowerCase()} presentation templates. Open one, edit it in your browser and let AI fill it in for your topic. No design skills needed.`,
    alternates: { canonical: `/free-templates/${l.slug}` },
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const l = landingBySlug(slug)
  if (!l) notFound()
  const cat = CATEGORIES.find((c) => c.id === l.category)!
  const designs = DESIGNS.filter((d) => d.category === l.category)
  const free = designs.filter((d) => !d.premium).length
  const slides = SKELETONS[l.category].length
  const others = LANDINGS.filter((x) => x.slug !== l.slug)
  const ld = [
    { '@context': 'https://schema.org', '@type': 'ItemList', name: `${l.noun} presentation templates`, itemListElement: designs.map((d, i) => ({ '@type': 'ListItem', position: i + 1, name: d.name, url: `${SITE_URL}/templates/${d.id}` })) },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: l.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
  ]
  return (
    <div className="flex flex-col min-h-screen bg-[#f3f4f9]">
      <Header />
      <main>
        <section className="px-5 md:px-10 pt-10 md:pt-14 pb-8">
          <div className="max-w-[1280px] mx-auto">
            <nav aria-label="Breadcrumb" className="text-sm text-slate-600 mb-5"><Link href="/templates" className="text-primary underline underline-offset-2 hover:no-underline">Templates</Link> <span aria-hidden>/</span> {cat.name}</nav>
            <h1 className="font-heading font-extrabold text-4xl md:text-5xl leading-[1.05] text-foreground max-w-[860px]">Free {l.noun} Presentation Templates</h1>
            <div className="mt-5 max-w-[760px] flex flex-col gap-3 text-lg leading-7 font-medium text-[#475569]">{l.intro.map((p) => <p key={p}>{p}</p>)}</div>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <Button href="#templates" variant="accent" size="lg" arrow>Browse {designs.length} templates</Button>
              <p className="text-sm font-medium text-[#475569]">{slides} slides each · edit free in your browser · {free} designs free, {designs.length - free} with Pro</p>
            </div>
          </div>
        </section>

        <section id="templates" aria-labelledby="t-h" className="px-5 md:px-10 pb-16 scroll-mt-24">
          <div className="max-w-[1280px] mx-auto">
            <h2 id="t-h" className="sr-only">{l.noun} templates</h2>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {designs.map((d, i) => (
                <li key={d.id}>
                  <Card index={i % 6} className="group/card overflow-hidden h-full">
                    <Link href={`/templates/${d.id}`} className="block" aria-label={`${d.name} — ${d.tagline}`}>
                      <div className="p-5 pb-0"><div className="border-2 border-foreground rounded-2xl overflow-hidden"><TemplateThumb designId={d.id} index={i} /></div></div>
                      <div className="p-5">
                        <div className="font-heading font-extrabold text-xs tracking-wide uppercase text-primary">{d.premium ? 'Pro' : 'Free'}</div>
                        <h3 className="font-heading font-extrabold text-xl text-foreground mt-1">{d.name}</h3>
                        <p className="text-sm text-slate-600 mt-1">{d.tagline}</p>
                        <span className="mt-3 inline-flex items-center gap-1.5 font-heading font-extrabold text-sm text-primary">Use this template<ArrowRight aria-hidden size={14} /></span>
                      </div>
                    </Link>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="bg-white border-y-2 border-foreground px-5 md:px-10 py-14 md:py-16">
          <div className="max-w-[1000px] mx-auto">
            <h2 className="font-heading font-extrabold text-2xl md:text-3xl text-foreground text-center">What every {l.noun.toLowerCase()} template covers</h2>
            <p className="mt-3 text-center text-sm md:text-base font-medium text-[#475569] max-w-[680px] mx-auto">{cat.covers.charAt(0).toUpperCase() + cat.covers.slice(1)}.</p>
            <ul className="mt-8 grid gap-5 md:grid-cols-3">
              {l.tips.map((t) => (
                <li key={t.title} className="list-none"><Card tone="cream" radius="2xl" shadow="sm" border hover={false} className="p-6 h-full" wrapperClassName="h-full"><h3 className="font-heading font-extrabold text-lg text-foreground">{t.title}</h3><p className="mt-2 text-sm leading-6 font-medium text-[#475569]">{t.text}</p></Card></li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-5 md:px-10 py-14 md:py-16">
          <div className="max-w-[816px] mx-auto">
            <h2 className="font-heading font-extrabold text-2xl md:text-3xl text-foreground text-center">Questions</h2>
            <div className="mt-8 flex flex-col gap-4">
              {l.faqs.map((f) => <Card key={f.q} tone="white" radius="2xl" shadow="sm" border hover={false} className="p-6" wrapperClassName="h-auto"><h3 className="font-heading font-extrabold text-base text-foreground">{f.q}</h3><p className="mt-2 text-sm leading-6 font-medium text-[#475569]">{f.a}</p></Card>)}
            </div>
          </div>
        </section>

        <section className="bg-secondary border-y-2 border-foreground px-5 md:px-10 py-12 text-center">
          <h2 className="font-heading font-extrabold text-2xl md:text-3xl text-foreground">Prefer to start from a prompt?</h2>
          <p className="mt-3 text-base font-medium text-foreground max-w-[560px] mx-auto">Describe your topic and the AI builds a designed, editable deck for you in about a minute.</p>
          <div className="mt-6"><Button href="/signup" variant="accent" size="lg" arrow>Create a free deck</Button></div>
        </section>

        <section className="px-5 md:px-10 py-12" aria-labelledby="more-h">
          <div className="max-w-[1280px] mx-auto">
            <h2 id="more-h" className="font-heading font-extrabold text-xl text-foreground">More template collections</h2>
            <ul className="mt-4 flex flex-wrap gap-3">{others.map((o) => <li key={o.slug}><Link href={`/free-templates/${o.slug}`} className="inline-block rounded-full border-2 border-foreground bg-white px-4 py-2 text-sm font-bold text-foreground hover:bg-secondary">{o.noun}</Link></li>)}</ul>
          </div>
        </section>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      </main>
      <Footer />
    </div>
  )
}
