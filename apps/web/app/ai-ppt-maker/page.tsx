import { ArrowRight, FileText, LayoutTemplate, MessageSquare, PencilRuler, Presentation, Sparkles } from '@prompttoppt/ui/icons'
import type { Metadata } from 'next'
import Link from 'next/link'
import { DESIGNS } from '@prompttoppt/theme'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { JsonLd } from '@/components/seo/JsonLd'
import FaqSection from '@/components/sections/FaqSection'
import { GENERAL_FAQS } from '@/lib/faq'
import { SITE_NAME, breadcrumbLd } from '@/lib/seo'
import { SITE_URL } from '@/lib/env'

export const metadata: Metadata = {
  title: 'AI PPT Maker: Make a PowerPoint with AI',
  description: 'Describe your topic or add a PDF, Word file or web link and get a designed, editable PowerPoint presentation in seconds. Start free, no design skills needed.',
  alternates: { canonical: '/ai-ppt-maker' },
}

const STEPS = [
  { icon: Sparkles, title: 'Say what it is about', text: 'Type a topic in a sentence or two, or add a PDF, Word, Excel or PowerPoint file, an email, a website link or a YouTube video as the source.' },
  { icon: Presentation, title: 'The AI builds the deck', text: 'It writes every slide, picks a template that fits your topic and lays out text, pictures, charts and tables for you.' },
  { icon: PencilRuler, title: 'Edit, share, export', text: 'Change anything in your browser, ask the AI to rewrite a slide, share a link, and export to PowerPoint, PDF or images on a paid plan.' },
] as const

const FEATURES = [
  { icon: FileText, title: 'Start from your own material', text: 'Turn a report, spreadsheet, email thread or video into slides. The AI uses your facts and numbers, so the deck says what your source says.' },
  { icon: LayoutTemplate, title: `${DESIGNS.length} designer templates`, text: 'Light and dark looks for pitch decks, sales, marketing, strategy, education and reports. Pick one yourself or let the AI choose.' },
  { icon: MessageSquare, title: 'Edit by chatting', text: 'Ask for a shorter slide, a different tone or a new background. The AI changes the slide and you can undo it.' },
  { icon: PencilRuler, title: 'Or build it yourself', text: 'Create from scratch with text, shapes, tables, charts, pictures and backgrounds. No AI credits are used.' },
] as const

export default function AIPPTMakerPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <JsonLd data={breadcrumbLd([['Home', '/'], ['AI PPT maker', '/ai-ppt-maker']])} />
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'AI PPT Maker', url: `${SITE_URL}/ai-ppt-maker`, isPartOf: { '@id': `${SITE_URL}/#website` }, about: { '@id': `${SITE_URL}/#software` } }} />
      <Header />
      <main>
        <section className="bg-gradient-to-b from-[#f8f9fc] to-[#f0f4f8] border-b-2 border-foreground px-5 md:px-10 py-14 md:py-20">
          <div className="max-w-[880px] mx-auto text-center">
            <p className="font-heading font-extrabold text-xs uppercase tracking-wide text-primary">AI PowerPoint maker</p>
            <h1 className="mt-3 font-heading font-extrabold text-4xl md:text-5xl leading-[1.05] text-foreground">AI PPT Maker: make a PowerPoint presentation in seconds</h1>
            {/* the answer first: what it is, in plain words (also what an AI assistant will quote) */}
            <p className="mt-5 text-lg leading-7 font-medium text-[#475569] max-w-[700px] mx-auto">
              {SITE_NAME} is an AI PPT maker. Describe your topic or add a document, and it writes the slides, picks a design and gives you an editable presentation you can open in your browser or export to PowerPoint.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="inline-flex items-center gap-2 bg-primary text-white font-heading font-extrabold px-6 py-3 rounded-lg border-2 border-foreground shadow-solid">Create a free deck <ArrowRight aria-hidden size={18} /></Link>
              <Link href="/templates" className="inline-flex items-center gap-2 bg-white text-foreground font-heading font-extrabold px-6 py-3 rounded-lg border-2 border-foreground">Browse templates</Link>
            </div>
          </div>
        </section>

        <section className="px-5 md:px-10 py-14 md:py-20">
          <div className="max-w-[1000px] mx-auto">
            <h2 className="font-heading font-extrabold text-2xl md:text-3xl text-foreground text-center">How to make a presentation with AI</h2>
            <ol className="mt-8 grid gap-5 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl border-2 border-foreground bg-white p-6">
                  <div className="flex items-center gap-3"><span className="grid place-items-center w-10 h-10 rounded-xl bg-secondary border-2 border-foreground font-heading font-extrabold">{i + 1}</span><s.icon aria-hidden size={22} className="text-primary" /></div>
                  <h3 className="mt-4 font-heading font-extrabold text-lg">{s.title}</h3>
                  <p className="mt-2 text-[#475569] leading-6">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="px-5 md:px-10 pb-14 md:pb-20">
          <div className="max-w-[1000px] mx-auto">
            <h2 className="font-heading font-extrabold text-2xl md:text-3xl text-foreground text-center">What you can do with it</h2>
            <ul className="mt-8 grid gap-5 md:grid-cols-2">
              {FEATURES.map((f) => (
                <li key={f.title} className="rounded-2xl border-2 border-foreground bg-white p-6 flex gap-4">
                  <f.icon aria-hidden size={26} className="text-primary shrink-0 mt-1" />
                  <div><h3 className="font-heading font-extrabold text-lg">{f.title}</h3><p className="mt-1 text-[#475569] leading-6">{f.text}</p></div>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-center text-[#475569]">
              Also see the <Link href="/free-tools" className="text-primary font-semibold underline">free presentation tools</Link>, <Link href="/pricing" className="text-primary font-semibold underline">pricing</Link> and the <Link href="/guides" className="text-primary font-semibold underline">how-to guides</Link>.
            </p>
          </div>
        </section>

        <FaqSection faqs={GENERAL_FAQS.slice(0, 6)} />
      </main>
      <Footer />
    </div>
  )
}
