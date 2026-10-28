import type { ReactNode } from 'react'
import Link from 'next/link'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'

export interface Faq { q: string; a: string }

/** Common frame for every free tool: header, H1 + promise, the tool itself, short explainer copy, FAQ (also emitted as JSON-LD), footer. */
export function ToolShell({ title, intro, children, steps, faqs, related }: {
  title: string; intro: string; children: ReactNode; steps: { title: string; text: string }[]; faqs: Faq[]; related: { href: string; label: string }[]
}) {
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main>
        <section className="bg-gradient-to-b from-[#f8f9fc] to-[#f0f4f8] border-b-2 border-foreground px-5 md:px-10 py-12 md:py-16">
          <div className="max-w-[880px] mx-auto text-center">
            <p className="font-heading font-extrabold text-xs uppercase tracking-wide text-primary">Free tool · no sign-up needed</p>
            <h1 className="mt-3 font-heading font-extrabold text-4xl md:text-5xl leading-[1.05] text-foreground">{title}</h1>
            <p className="mt-4 text-lg leading-7 font-medium text-[#475569] max-w-[680px] mx-auto">{intro}</p>
          </div>
          <div className="max-w-[880px] mx-auto mt-10">{children}</div>
        </section>

        <section className="px-5 md:px-10 py-14 md:py-20">
          <div className="max-w-[1000px] mx-auto">
            <h2 className="font-heading font-extrabold text-2xl md:text-3xl text-foreground text-center">How it works</h2>
            <ol className="mt-8 grid gap-5 md:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.title} className="list-none">
                  <Card tone="white" radius="2xl" shadow="sm" border hover={false} className="p-6 h-full" wrapperClassName="h-full">
                    <span className="font-heading font-extrabold text-sm text-primary">Step {i + 1}</span>
                    <h3 className="mt-2 font-heading font-extrabold text-lg text-foreground">{s.title}</h3>
                    <p className="mt-2 text-sm leading-6 font-medium text-[#475569]">{s.text}</p>
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-[#f3f4f9] border-y-2 border-foreground px-5 md:px-10 py-14 md:py-20">
          <div className="max-w-[816px] mx-auto">
            <h2 className="font-heading font-extrabold text-2xl md:text-3xl text-foreground text-center">Questions</h2>
            <div className="mt-8 flex flex-col gap-4">
              {faqs.map((f) => (
                <Card key={f.q} tone="white" radius="2xl" shadow="sm" border hover={false} className="p-6" wrapperClassName="h-auto">
                  <h3 className="font-heading font-extrabold text-base text-foreground">{f.q}</h3>
                  <p className="mt-2 text-sm leading-6 font-medium text-[#475569]">{f.a}</p>
                </Card>
              ))}
            </div>
            <p className="mt-10 text-center text-sm font-medium text-[#475569]">
              More free tools:{' '}
              {related.map((r, i) => <span key={r.href}>{i > 0 && ' · '}<Link href={r.href} className="font-bold text-primary hover:underline">{r.label}</Link></span>)}
            </p>
          </div>
        </section>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      </main>
      <Footer />
    </div>
  )
}
