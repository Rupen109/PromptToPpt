import type { ReactNode } from 'react'
import Link from 'next/link'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { ldJson, toolGraph } from '@/lib/seo'

export interface Faq { q: string; a: string }
/** A short guide section under "How it works": real, specific help about the tool (what to choose, what happens to the file, limits), readable without JavaScript */
export interface GuideSection { title: string; paragraphs?: string[]; points?: string[]; table?: { head: string[]; rows: string[][] } }

/** Common frame for every free tool: header, H1 + promise, the tool itself, short explainer copy, FAQ, footer; the tool, its steps, breadcrumbs and FAQ as JSON-LD (lib/seo.ts toolGraph). */
export function ToolShell({ path, title, intro, children, steps, guide, faqs, related, wide }: {
  /** the page's own address, e.g. /free-tools/pdf-to-ppt (the same as its canonical) */
  path: string; wide?: boolean; guide?: GuideSection[]; title: string; intro: string; children: ReactNode; steps: { title: string; text: string }[]; faqs: Faq[]; related: { href: string; label: string }[]
}) {
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
          <div className={`${wide ? 'max-w-[1240px]' : 'max-w-[880px]'} mx-auto mt-10`}>{children}</div>
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

        {guide?.length ? (
          <section className="px-5 md:px-10 pb-14 md:pb-20" aria-label="Guide">
            <div className="max-w-[816px] mx-auto flex flex-col gap-12">
              {guide.map((g) => (
                <article key={g.title}>
                  <h2 className="font-heading font-extrabold text-2xl md:text-3xl text-foreground">{g.title}</h2>
                  {g.paragraphs?.map((t) => <p key={t} className="mt-4 text-base leading-7 font-medium text-[#475569]">{t}</p>)}
                  {g.points && <ul className="mt-4 flex flex-col gap-2 list-disc pl-6 text-base leading-7 font-medium text-[#475569]">{g.points.map((t) => <li key={t}>{t}</li>)}</ul>}
                  {g.table && (
                    <div className="mt-5 overflow-x-auto rounded-2xl border-2 border-foreground">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-[#f3f4f9]"><tr>{g.table.head.map((h) => <th key={h} scope="col" className="px-4 py-3 font-heading font-extrabold text-foreground">{h}</th>)}</tr></thead>
                        <tbody>{g.table.rows.map((r) => <tr key={r[0]} className="border-t border-[#e2e8f0]">{r.map((c, i) => (i === 0 ? <th key={i} scope="row" className="px-4 py-3 font-bold text-foreground">{c}</th> : <td key={i} className="px-4 py-3 font-medium text-[#475569]">{c}</td>))}</tr>)}</tbody>
                      </table>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ) : null}

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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(toolGraph({ path, title, intro, steps, faqs })) }} />
      </main>
      <Footer />
    </div>
  )
}
