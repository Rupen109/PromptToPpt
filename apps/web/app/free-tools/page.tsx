import type { Metadata } from 'next'
import Link from 'next/link'
import { DESIGNS } from '@prompttoppt/theme'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { Card, type CardTone } from '@/components/ui/Card'

export const metadata: Metadata = {
  title: 'Free Presentation & PDF Tools',
  description: 'Free AI tools for presentations: outline generator, PDF to presentation, PDF to PPT converter and free templates. No sign-up needed.',
  alternates: { canonical: '/free-tools' },
}

interface Tool { href: string; badge: string; name: string; text: string; points: string[]; tone: CardTone }

/** Templates always come first. Three cards fill the first row; the fourth sits centred under them. Same card design for all four. */
const CARDS: Tool[] = [
  { href: '/templates', badge: 'Templates', name: 'Free Presentation Templates', text: `${DESIGNS.length}+ designed templates. Edit online, let AI fill them in.`, points: ['Pitch, sales, marketing, strategy…', 'Edit and present from your browser', 'First 3 designs per collection free'], tone: 'mist' },
  { href: '/free-tools/presentation-outline-generator', badge: 'AI · Free', name: 'AI Presentation Outline Generator', text: 'Your topic in, a clear slide-by-slide outline out.', points: ['Pick the type, audience and length', 'A story that flows from open to close', 'One click turns it into a full deck'], tone: 'cream' },
  { href: '/free-tools/pdf-to-presentation', badge: 'AI · Free', name: 'PDF to Presentation', text: 'Turn a report or paper into a summary and slides.', points: ['Summary, key points and slide outline', 'Executive, academic, business and more', 'Continue as an editable designed deck'], tone: 'lavender' },
  { href: '/free-tools/pdf-to-ppt', badge: 'In your browser', name: 'PDF to PPT Converter', text: 'Convert a PDF to a PowerPoint file. Nothing is uploaded.', points: ['Exact look, or editable text boxes', 'Up to 60 pages, no sign-up', 'Download the .pptx instantly'], tone: 'peach' },
]

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
              <span aria-hidden className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-foreground text-white text-[10px] leading-4 text-center font-extrabold">✓</span>{p}
            </li>
          ))}
        </ul>
        <span className="mt-auto pt-6 inline-block font-heading font-extrabold text-base text-primary">Try it free →</span>
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
          <h1 className="font-heading font-extrabold text-4xl md:text-5xl text-foreground text-center">Free presentation tools</h1>
          <p className="mt-4 text-lg font-medium text-[#475569] text-center max-w-[640px] mx-auto">Small, fast tools for the jobs that come before a great deck. No sign-up needed.</p>
          <ul className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {CARDS.map((t, i) => (
              <li key={t.href} className={`list-none${i === CARDS.length - 1 ? ' sm:col-span-2 sm:max-w-[calc(50%-1rem)] sm:justify-self-center lg:col-span-1 lg:col-start-2 lg:max-w-none' : ''}`}><ToolCard t={t} /></li>
            ))}
          </ul>
        </div>
      </main>
      <Footer />
    </div>
  )
}
