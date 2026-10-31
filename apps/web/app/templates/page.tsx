import type { Metadata } from 'next'
import { DESIGNS } from '@prompttoppt/theme'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { LANDINGS } from '@/lib/template-landing'
import { TemplateGallery } from '@/components/templates/TemplateGallery'

export const metadata: Metadata = {
  title: 'Presentation templates',
  description: `${DESIGNS.length} designer-made, animated presentation templates for pitch decks, sales, marketing, strategy, reports and training. Free to start.`,
  alternates: { canonical: '/templates' },
}

export default function TemplatesIndexPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[#f3f4f9]">
      <Header />
      <main className="max-w-[1280px] w-full mx-auto px-10 py-16">
        <div className="inline-block bg-secondary text-foreground py-1 px-3 font-heading font-extrabold text-xs rounded-full border border-foreground shadow-[2px_3px_0_0_#181b25] mb-4 uppercase">{DESIGNS.length} animated templates</div>
        <h1 className="font-heading font-extrabold text-4xl md:text-5xl text-foreground leading-tight mb-3">Presentation templates that look finished on slide one</h1>
        <p className="text-slate-600 text-lg max-w-[720px] mb-10">Ten categories, each with its own story already laid out. Pick a design, open it in the editor, and let the AI assistant rewrite it for your topic.</p>
        <TemplateGallery />
        <nav aria-labelledby="collections" className="mt-16">
          <h2 id="collections" className="font-heading font-extrabold text-2xl text-foreground mb-4">Browse by use</h2>
          <ul className="flex flex-wrap gap-3">{LANDINGS.map((l) => <li key={l.slug}><Link href={`/free-templates/${l.slug}`} className="inline-block rounded-full border-2 border-foreground bg-white px-4 py-2 text-sm font-bold text-foreground hover:bg-secondary">{l.noun} templates</Link></li>)}</ul>
        </nav>
      </main>
      <Footer />
    </div>
  )
}
