import type { Metadata } from 'next'
import Link from 'next/link'
import { ContentPage } from '@/components/content/parts'
import { JsonLd } from '@/components/seo/JsonLd'
import { SITE_URL } from '@/lib/env'
import { FREE_TOOLS } from '@/lib/free-tool-list'
import { LEGAL, missingOwnerFields } from '@/lib/legal'
import { modified } from '@/lib/page-dates'
import { FEATURES, ORG_ID, SITE_DESCRIPTION, SUPPORT_MAIL, breadcrumbLd, withShare } from '@/lib/seo'

export const metadata: Metadata = withShare({
  title: 'About SlidesDone',
  description: 'About SlidesDone, the AI presentation maker: what it does, the free tools, how your content is handled, and how to contact us.',
  alternates: { canonical: '/about' },
})

/**
 * Who we are, for people and for search / answer engines (the organisation's own page). Facts only: the product description and features are the same ones the
 * structured data uses (lib/seo.ts), the tools come from the one tool list, and the company name and address show only once the owner has filled them in.
 */
export default function Page() {
  const company = missingOwnerFields().some((k) => k === 'entityName' || k === 'registeredAddress') ? null : { name: LEGAL.entityName, address: LEGAL.registeredAddress }
  return (
    <ContentPage eyebrow="About" title="About SlidesDone" intro={`SlidesDone is an ${SITE_DESCRIPTION}`}>
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'AboutPage', '@id': `${SITE_URL}/about#page`, url: `${SITE_URL}/about`, name: 'About SlidesDone', mainEntity: { '@id': ORG_ID }, ...modified('/about') },
          { ...breadcrumbLd([['Home', '/'], ['About', '/about']]), '@context': undefined },
        ],
      }} />
      <div className="prose max-w-[760px] mx-auto">
        <h2>What SlidesDone does</h2>
        <ul>{FEATURES.map((f) => <li key={f}>{f}.</li>)}</ul>
        <p>You can start free with monthly credits and no card. Paid plans add exports, more credits, longer decks and stronger AI models: see <Link href="/pricing">pricing</Link>.</p>

        <h2>Free tools</h2>
        <p>Small tools for the jobs around a presentation, free and without sign-up:</p>
        <ul>{FREE_TOOLS.map((t) => <li key={t.href}><Link href={t.href}>{t.name}</Link>: {t.text}</li>)}</ul>

        <h2>Your content</h2>
        <p>Your presentations and uploaded sources are private to your account. To write your slides, the text of your prompt and sources is sent to the AI model provider that generates them. The details are in the <Link href="/privacy">privacy policy</Link>.</p>

        <h2>Who runs SlidesDone</h2>
        {company ? <p>SlidesDone is run by <strong>{company.name}</strong>, {company.address}.</p> : <p>The company details are on the <Link href="/legal">legal page</Link>.</p>}

        <h2>Contact</h2>
        <p>Write to <a href={`mailto:${SUPPORT_MAIL}`}>{SUPPORT_MAIL}</a> or use the <Link href="/support">support form</Link>. Common questions are answered in the <Link href="/faq">FAQ</Link>.</p>
      </div>
    </ContentPage>
  )
}
