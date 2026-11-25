import Link from 'next/link'
import type { ReactNode } from 'react'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { JsonLd } from '@/components/seo/JsonLd'
import { LEGAL,assertLegalReady, missingOwnerFields, ownerText, type OwnerField, NOT_REGISTERED } from '@/lib/legal'
import { breadcrumbLd } from '@/lib/seo'

export const LEGAL_PAGES = [
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/cookies', label: 'Cookie notice' },
  { href: '/refunds', label: 'Cancellation and refunds' },
] as const

/** An owner-supplied value (legal name, address…). While it is still TODO it is printed as a visible, marked placeholder; a production build refuses to ship it (lib/legal.ts). */
export function Owner({ k }: { k: OwnerField }) {
  const missing = missingOwnerFields().includes(k)
  const text = ownerText(k)
  return missing ? <mark className="rounded bg-yellow-200 px-1 text-[#422006]" data-owner-todo={k}>{text}</mark> : <>{text}</>
}

export const Mail = ({ address }: { address: string }) => <a href={`mailto:${address}`}>{address}</a>
export const SupportMail = () => <Mail address={LEGAL.supportEmail} />

/** Who runs the service: used at the top of every legal page and in the contact section. */
/** " GSTIN: …" after the operator's address; nothing when the operator is not registered for GST (a TODO still shows, marked, so it gets filled in) */
export function Gstin() {
  return (LEGAL.gstin as string) === NOT_REGISTERED ? null : <> GSTIN: <Owner k="gstin" />.</>
}

export function Operator() {
  return <><strong><Owner k="entityName" /></strong>, <Owner k="registeredAddress" /></>
}

export function LegalPage({ path, title, intro, children }: { path: string; title: string; intro: string; children: ReactNode }) {
  assertLegalReady() // production build with an unfilled owner field fails here
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <JsonLd data={breadcrumbLd([['Home', '/'], ['Legal', '/legal'], [title, path]])} />
      <Header />
      <main className="px-5 md:px-10 py-12 md:py-16">
        <div className="mx-auto max-w-[820px]">
          <h1 className="font-heading font-extrabold text-4xl md:text-5xl text-foreground">{title}</h1>
          <p className="mt-4 text-lg font-medium text-[#475569]">{intro}</p>
          <p className="mt-2 text-sm font-bold text-[#475569]">Effective: <Owner k="effectiveDate" /></p>
          <nav aria-label="Legal pages" className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-y-2 border-[#e2e8f0] py-3 text-sm font-heading font-bold">
            {LEGAL_PAGES.map((p) => (
              <Link key={p.href} href={p.href} aria-current={p.href === path ? 'page' : undefined} className={p.href === path ? 'text-foreground underline underline-offset-4' : 'text-primary hover:underline'}>{p.label}</Link>
            ))}
          </nav>
          <div className="sd-prose mt-8">{children}</div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
