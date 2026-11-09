import { ArrowRight, Layers, MousePointerClick, Sparkles, Wand2 } from '@prompttoppt/ui/icons'
import type { Metadata } from 'next'
import Link from 'next/link'
import { MORPH_TEMPLATES } from '@prompttoppt/theme/morph-templates'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { TemplateShowcase } from '@/components/morph/TemplateShowcase'
import FaqSection from '@/components/sections/FaqSection'
import { JsonLd } from '@/components/seo/JsonLd'
import { SITE_URL } from '@/lib/env'
import { MORPH_CATEGORIES, categoryById } from '@/lib/morph-categories'
import { MORPH_FAQS, MORPH_POINTS, MORPH_STEPS } from '@/lib/morph-page'
import { SITE_NAME, breadcrumbLd } from '@/lib/seo'

const PATH = '/morph-animation-templates'
const TITLE = 'Morph Animation Templates for Presentations'
const DESCRIPTION = 'Morph animation templates make every slide change one smooth movement. Watch Morph templates for business, pitch decks, marketing, product launches, technology and education play, and build yours with AI.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}${PATH}`, type: 'website', siteName: SITE_NAME },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

export default function MorphTemplatesPage() {
  const ld = [
    breadcrumbLd([['Home', '/'], ['Morph animation templates', PATH]]),
    {
      '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': `${SITE_URL}${PATH}#page`, name: TITLE, description: DESCRIPTION, url: `${SITE_URL}${PATH}`, inLanguage: 'en',
      isPartOf: { '@id': `${SITE_URL}/#website` }, about: { '@type': 'Thing', name: 'Morph transition' }, publisher: { '@id': `${SITE_URL}/#organization` },
      mainEntity: { '@type': 'ItemList', name: 'Morph animation templates', numberOfItems: MORPH_TEMPLATES.length, itemListElement: MORPH_TEMPLATES.map((t, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'CreativeWork', '@id': `${SITE_URL}${PATH}/${categoryById(t.category!).slug}#${t.id}`, name: `${t.name} Morph template`, description: t.description, url: `${SITE_URL}${PATH}/${categoryById(t.category!).slug}#${t.id}`, keywords: t.topics.join(', ') } })) },
    },
  ]
  const featured = MORPH_TEMPLATES.find((t) => t.id === 'pitch-orbit')
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {ld.map((d, i) => <JsonLd key={i} data={d} />)}
      <Header />
      <main>
        <section className="bg-gradient-to-b from-[#f8f9fc] to-[#f0f4f8] border-b-2 border-foreground px-5 md:px-10 py-14 md:py-20">
          <div className="max-w-[880px] mx-auto text-center">
            <p className="font-heading font-extrabold text-xs uppercase tracking-wide text-primary">Morph animation</p>
            <h1 className="mt-3 font-heading font-extrabold text-4xl md:text-5xl leading-[1.05] text-foreground">Morph Animation Templates for Presentations</h1>
            {/* the answer first: what it is, in plain words (also what an AI assistant will quote) */}
            <p className="mt-5 text-lg leading-7 font-medium text-[#475569] max-w-[720px] mx-auto">
              A Morph animation template is a presentation design where every slide change is one smooth movement: the same picture, product or headline grows, shrinks and glides from slide to slide instead of cutting. {SITE_NAME} has Morph templates for different topics, and the AI writes your slides into the one that fits.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="#templates" className="inline-flex items-center gap-2 bg-primary text-white font-heading font-extrabold px-6 py-3 rounded-lg border-2 border-foreground shadow-solid">Watch the templates <ArrowRight aria-hidden size={18} /></Link>
              <Link href="/pricing" className="inline-flex items-center gap-2 bg-white text-foreground font-heading font-extrabold px-6 py-3 rounded-lg border-2 border-foreground">See plans</Link>
            </div>
            <p className="mt-4 text-sm font-medium text-[#475569]">Morph templates are included with the Gold and Premium plans.</p>
          </div>
        </section>

        <section id="templates" aria-labelledby="t-h" className="px-5 md:px-10 py-14 md:py-20 scroll-mt-24">
          <div className="max-w-[1100px] mx-auto">
            <h2 id="t-h" className="font-heading font-extrabold text-2xl md:text-3xl text-foreground text-center">Morph animation templates by family</h2>
            <p className="mt-3 text-center text-[#475569] max-w-[680px] mx-auto">{MORPH_TEMPLATES.length} templates in six families. Open a family to watch each template play, scene after scene.</p>
            <ul className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {MORPH_CATEGORIES.map((c) => {
                const list = MORPH_TEMPLATES.filter((t) => t.category === c.id)
                return (
                  <li key={c.id}>
                    <Link href={`${PATH}/${c.slug}`} className="group block h-full rounded-2xl border-2 border-foreground bg-white p-4 shadow-solid transition-transform hover:-translate-y-1">
                      <div className="grid grid-cols-3 gap-2">
                        {list.slice(0, 3).map((t) => (
                          <div key={t.id} className="relative aspect-video overflow-hidden rounded-lg border border-foreground/30" style={{ background: t.background }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/morph-posters/${t.id}.webp`} alt={`${t.name} Morph template`} width={480} height={270} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                          </div>
                        ))}
                      </div>
                      <h3 className="mt-4 font-heading font-extrabold text-xl text-foreground">{c.name}</h3>
                      <p className="mt-1 text-[#475569] leading-6">{c.short}</p>
                      <p className="mt-3 text-sm font-semibold text-foreground">{list.map((t) => t.name).join(' · ')}</p>
                      <span className="mt-4 inline-flex items-center gap-2 font-heading font-extrabold text-primary">Watch {list.length} templates <ArrowRight aria-hidden size={16} className="transition-transform group-hover:translate-x-1" /></span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        {featured && (
          <section aria-labelledby="f-h" className="px-5 md:px-10 pb-14 md:pb-20">
            <div className="max-w-[1100px] mx-auto">
              <h2 id="f-h" className="font-heading font-extrabold text-2xl md:text-3xl text-foreground text-center">Watch one play</h2>
              <p className="mt-3 text-center text-[#475569] max-w-[640px] mx-auto">This preview is live: it plays the real Morph. Use the arrows to step through it yourself, or press full screen.</p>
              <div className="mt-10"><TemplateShowcase templates={[featured]} headingLevel={3} /></div>
            </div>
          </section>
        )}

        <section aria-labelledby="what-h" className="px-5 md:px-10 pb-14 md:pb-20">
          <div className="max-w-[1000px] mx-auto">
            <h2 id="what-h" className="font-heading font-extrabold text-2xl md:text-3xl text-foreground text-center">What is a Morph transition?</h2>
            <p className="mt-4 text-center text-lg leading-7 text-[#475569] max-w-[760px] mx-auto">A Morph transition moves what two slides have in common from where it was to where it is. A planet that fills half of one slide and sits small in the corner of the next does not jump: it travels, and the audience watches it go.</p>
            <ul className="mt-10 grid gap-5 md:grid-cols-2">
              {MORPH_POINTS.map((p, i) => (
                <li key={p.title} className="rounded-2xl border-2 border-foreground bg-white p-6 flex gap-4">
                  {(() => { const Icon = [Layers, Wand2, Sparkles, MousePointerClick][i]!; return <Icon aria-hidden size={26} className="text-primary shrink-0 mt-1" /> })()}
                  <div><h3 className="font-heading font-extrabold text-lg">{p.title}</h3><p className="mt-1 text-[#475569] leading-6">{p.text}</p></div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="how-h" className="px-5 md:px-10 pb-14 md:pb-20">
          <div className="max-w-[1000px] mx-auto">
            <h2 id="how-h" className="font-heading font-extrabold text-2xl md:text-3xl text-foreground text-center">How to make a Morph presentation</h2>
            <ol className="mt-8 grid gap-5 md:grid-cols-3">
              {MORPH_STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl border-2 border-foreground bg-white p-6">
                  <span className="grid place-items-center w-10 h-10 rounded-xl bg-secondary border-2 border-foreground font-heading font-extrabold">{i + 1}</span>
                  <h3 className="mt-4 font-heading font-extrabold text-lg">{s.title}</h3>
                  <p className="mt-2 text-[#475569] leading-6">{s.text}</p>
                </li>
              ))}
            </ol>
            <p className="mt-8 text-center text-[#475569]">
              More on {SITE_NAME}: the <Link href="/ai-ppt-maker" className="text-primary font-semibold underline">AI PPT maker</Link>, <Link href="/templates" className="text-primary font-semibold underline">all presentation templates</Link>, <Link href="/free-tools" className="text-primary font-semibold underline">free presentation tools</Link> and <Link href="/pricing" className="text-primary font-semibold underline">pricing</Link>.
            </p>
          </div>
        </section>

        <FaqSection faqs={MORPH_FAQS} />
      </main>
      <Footer />
    </div>
  )
}
