import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CATEGORIES, DESIGNS, SKELETONS, designById } from '@prompttoppt/theme'
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
  return {
    title: `${d.name} — ${cat.name} presentation template`,
    description: `${d.tagline}. A ready-made ${SKELETONS[d.category].length}-slide ${cat.name.toLowerCase()} deck (${cat.covers}) with animated transitions — open it in the editor and make it yours.`,
    alternates: { canonical: `/templates/${d.id}` },
  }
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
      <Header />
      <main className="max-w-[1280px] w-full mx-auto px-5 md:px-10 py-8 md:py-12">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-600 mb-6"><Link href="/templates" className="text-primary underline underline-offset-2 hover:no-underline">Templates</Link> <span aria-hidden>/</span> <span>{cat.name}</span> <span aria-hidden>/</span> <span className="text-foreground font-semibold">{d.name}</span></nav>
        <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_380px] gap-8 lg:gap-12 items-start">
          <TemplatePreview designId={d.id} />
          <aside className="lg:sticky lg:top-28">
            <div className="font-heading font-extrabold text-xs uppercase tracking-wide text-primary mb-2">{cat.name} · {d.premium ? 'Pro' : 'Free'}</div>
            <h1 className="font-heading font-extrabold text-4xl text-foreground leading-tight mb-3">{d.name}</h1>
            <p className="text-slate-700 text-lg mb-6">{d.tagline}.</p>
            <ul className="text-sm text-slate-700 space-y-2 mb-8">
              <li>📑 <b>{slides.length} slides</b>: {cat.covers}.</li>
              <li>🎬 Animated: {motion && motion.entrance !== 'none' ? `${motion.entrance.replace('-', ' ')} entrances and ${motion.transition} slide transitions` : 'smooth slide transitions'}.</li>
              <li>📐 Works in 16:9, 4:3 and square.</li>
              <li>✏️ Fully editable — and the AI assistant can rewrite it for your topic.</li>
            </ul>
            <UseTemplateButton designId={d.id} premium={d.premium} />
            <p className="text-xs text-slate-600 mt-6">Sample text and numbers are placeholders for a fictional company — replace them with your own.</p>
          </aside>
        </div>
        <section className="mt-20" aria-labelledby="more">
          <h2 id="more" className="font-heading font-extrabold text-2xl text-foreground mb-6">More {cat.name.toLowerCase()} templates</h2>
          <ul className="grid sm:grid-cols-3 gap-8">
            {related.map((r, i) => (
              <li key={r.id}>
                <Card index={i} className="group/card overflow-hidden h-full">
                  <Link href={`/templates/${r.id}`} className="block">
                    <div className="p-4 pb-0"><div className="border-2 border-foreground rounded-xl overflow-hidden"><TemplateThumb designId={r.id} className="transition-transform duration-500 motion-safe:group-hover/card:scale-[1.04]" /></div></div>
                    <div className="p-4"><div className="font-heading font-extrabold text-lg">{r.name}</div><div className="text-sm text-slate-600">{r.tagline}</div></div>
                  </Link>
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
