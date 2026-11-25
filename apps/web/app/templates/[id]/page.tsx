import { LayoutList, Clapperboard, Ruler, Pencil } from '@prompttoppt/ui/icons'
import { HoverLink } from '@/components/ui/HoverLink'
import type { Metadata } from 'next'
import { JsonLd } from '@/components/seo/JsonLd'
import { ORG_ID, breadcrumbLd, fit, firstFit, withShare } from '@/lib/seo'
import { SITE_URL } from '@/lib/env'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CATEGORIES, DESIGNS, SKELETONS, designById, isDark, slideTitle } from '@prompttoppt/theme'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { TemplatePreview, UseTemplateButton } from '@/components/templates/TemplatePreview'
import { TemplateThumb } from '@/components/templates/TemplateThumb'

export const dynamicParams = false
export const generateStaticParams = () => DESIGNS.map((d) => ({ id: d.id }))

const categoryOf = (id: string) => CATEGORIES.find((c) => c.id === id)!

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const d = designById(id)
  if (!d) return {}
  const cat = categoryOf(d.category)
  return withShare({
    // "Free" only on the templates that are free (3 per category); a Pro template is never called free
    title: d.premium
      ? firstFit([`${d.name}: ${cat.name} presentation template`, `${d.name}: ${cat.name} template`, `${d.name} presentation template`], 47)
      : firstFit([`Free ${d.name}: ${cat.name} presentation template`, `Free ${d.name} ${cat.name} template`, `Free ${d.name} presentation template`, `Free ${d.name} template`], 47),
    description: fit(`${d.tagline}. A ready-made ${SKELETONS[d.category].length}-slide ${cat.name.toLowerCase()} deck with animated transitions. Open it in the editor and make it yours.`, 155),
    alternates: { canonical: `/templates/${d.id}` },
  })
}

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const d = designById(id)
  if (!d) notFound()
  const cat = categoryOf(d.category)
  const slides = SKELETONS[d.category]
  const related = DESIGNS.filter((x) => x.category === d.category && x.id !== d.id).slice(0, 3)
  const motion = d.theme.motion
  return (
    <div className="flex flex-col min-h-screen bg-[#f3f4f9]">
      {/* the template as answer engines read it: a presentation document with its slides, look and price, and where it sits */}
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'PresentationDigitalDocument', '@id': `${SITE_URL}/templates/${d.id}#template`, url: `${SITE_URL}/templates/${d.id}`, name: `${d.name} ${cat.name.toLowerCase()} presentation template`,
            description: `${d.tagline}. ${slides.length} slides covering ${cat.covers}.`, genre: cat.name, inLanguage: 'en', isAccessibleForFree: !d.premium,
            numberOfPages: slides.length, hasPart: slides.map((x, i) => ({ '@type': 'CreativeWork', position: i + 1, name: slideTitle(x) })), publisher: { '@id': ORG_ID } },
          { ...breadcrumbLd([['Home', '/'], ['Templates', '/templates'], [d.name, `/templates/${d.id}`]]), '@context': undefined },
        ],
      }} />
      <Header />
      <main className="max-w-[1280px] w-full mx-auto px-5 md:px-10 py-8 md:py-12">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-600 mb-6"><Link href="/templates" className="text-primary underline underline-offset-2 hover:no-underline">Templates</Link> <span aria-hidden>/</span> <span>{cat.name}</span> <span aria-hidden>/</span> <span className="text-foreground font-semibold">{d.name}</span></nav>
        <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_380px] gap-8 lg:gap-12 items-start">
          <TemplatePreview designId={d.id} />
          <aside className="lg:sticky lg:top-28">
            <div className="font-heading font-extrabold text-xs uppercase tracking-wide text-primary mb-2">{cat.name} · {d.premium ? 'Pro' : 'Free'}</div>
            <h1 className="font-heading font-extrabold text-4xl text-foreground leading-tight mb-3">{d.premium ? d.name : `Free ${d.name} template`}</h1>
            <p className="text-slate-700 text-lg mb-6">{d.tagline}.</p>
            <ul className="text-sm text-slate-700 space-y-2 mb-8">
              <li className="flex items-start gap-2"><LayoutList aria-hidden size={16} className="mt-1 shrink-0" /><span><b>{slides.length} slides</b>: {cat.covers}.</span></li>
              <li className="flex items-start gap-2"><Clapperboard aria-hidden size={16} className="mt-1 shrink-0" /><span>Animated: {motion && motion.entrance !== 'none' ? `${motion.entrance.replace('-', ' ')} entrances and ${motion.transition} slide transitions` : 'smooth slide transitions'}.</span></li>
              <li className="flex items-start gap-2"><Ruler aria-hidden size={16} className="mt-1 shrink-0" /><span>Works in 16:9, 4:3 and square.</span></li>
              <li className="flex items-start gap-2"><Pencil aria-hidden size={16} className="mt-1 shrink-0" /><span>Fully editable — and the AI assistant can rewrite it for your topic.</span></li>
            </ul>
            <UseTemplateButton designId={d.id} premium={d.premium} />
            <p className="text-xs text-slate-600 mt-6">Sample text and numbers are placeholders for a fictional company — replace them with your own.</p>
          </aside>
        </div>
        {/* what the deck holds, readable without JavaScript (search and answer engines read this, not the live preview) */}
        <div className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section aria-labelledby="inside">
            <h2 id="inside" className="font-heading font-extrabold text-2xl text-foreground mb-2">What is inside the {d.name} template</h2>
            <p className="text-slate-700 mb-6">{slides.length} slides in a proven order for a {cat.name.toLowerCase()} deck: {cat.covers}. Each slide comes with a presenter note.</p>
            <ol className="space-y-3">
              {slides.map((x, i) => (
                <li key={i} className="list-none rounded-xl border border-border bg-white p-4">
                  <div className="font-heading font-extrabold text-foreground">{i + 1}. {slideTitle(x)}</div>
                  {x.speakerNotes && <p className="mt-1 text-sm text-slate-700">{x.speakerNotes}</p>}
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="details">
            <h2 id="details" className="font-heading font-extrabold text-2xl text-foreground mb-4">Template details</h2>
            <dl className="rounded-xl border border-border bg-white p-4 text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="font-bold text-foreground">Category</dt><dd className="text-slate-700">{cat.name}</dd>
              <dt className="font-bold text-foreground">Slides</dt><dd className="text-slate-700">{slides.length}</dd>
              <dt className="font-bold text-foreground">Look</dt><dd className="text-slate-700">{isDark(d.theme.colors.background) ? 'Dark' : 'Light'} background</dd>
              <dt className="font-bold text-foreground">Fonts</dt><dd className="text-slate-700">{d.theme.fonts.heading === d.theme.fonts.body ? d.theme.fonts.heading : `${d.theme.fonts.heading} (headings), ${d.theme.fonts.body} (text)`}</dd>
              <dt className="font-bold text-foreground">Sizes</dt><dd className="text-slate-700">16:9, 4:3 and square</dd>
              <dt className="font-bold text-foreground">Price</dt><dd className="text-slate-700">{d.premium ? 'Pro template (paid plans)' : 'Free'}</dd>
              <dt className="font-bold text-foreground">Edit</dt><dd className="text-slate-700">In the browser, by hand or with the AI assistant; export to PowerPoint and PDF on paid plans</dd>
            </dl>
          </section>
        </div>
        <section className="mt-20" aria-labelledby="more">
          <h2 id="more" className="font-heading font-extrabold text-2xl text-foreground mb-6">More {cat.name.toLowerCase()} templates</h2>
          <ul className="grid sm:grid-cols-3 gap-8">
            {related.map((r, i) => (
              <li key={r.id}>
                <Card index={i} className="group/card overflow-hidden h-full">
                  <HoverLink href={`/templates/${r.id}`} className="block">
                    <div className="p-4 pb-0"><div className="border-2 border-foreground rounded-xl overflow-hidden"><TemplateThumb designId={r.id} className="transition-transform duration-500 motion-safe:group-hover/card:scale-[1.04]" /></div></div>
                    <div className="p-4"><div className="font-heading font-extrabold text-lg">{r.name}</div><div className="text-sm text-slate-600">{r.tagline}</div></div>
                  </HoverLink>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <Footer />
    </div>
  )
}
