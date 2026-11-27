import type { Metadata } from 'next'
import { ORG_ID, SUPPORT_MAIL, breadcrumbLd, withShare } from '@/lib/seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { SITE_URL } from '@/lib/env'
import { modified } from '@/lib/page-dates'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { ContactChips, SupportForm } from '@/components/support/SupportForm'
import { Owner, SupportMail } from '@/components/legal/LegalPage'

export const metadata: Metadata = withShare({
  title: 'Support — Contact SlidesDone',
  description: 'Need help with SlidesDone? Send us a message with a screenshot and we will get back to you within 24–48 hours.',
  alternates: { canonical: '/support' },
})

export default function Page() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <JsonLd data={{ '@context': 'https://schema.org', '@graph': [
        { '@type': 'ContactPage', '@id': `${SITE_URL}/support#page`, url: `${SITE_URL}/support`, name: 'Contact SlidesDone', about: { '@id': ORG_ID }, mainEntity: { '@type': 'ContactPoint', contactType: 'customer support', email: SUPPORT_MAIL, availableLanguage: 'English', url: `${SITE_URL}/support` }, ...modified('/support') },
        { ...breadcrumbLd([['Home', '/'], ['Support', '/support']]), '@context': undefined },
      ] }} />
      <main className="px-5 md:px-10 py-12 md:py-16">
        <div className="mx-auto max-w-[860px]">
          <h1 className="font-heading font-extrabold text-4xl md:text-5xl text-foreground">Contact us</h1>
          <p className="mt-4 text-lg font-medium text-[#475569]">Fill out the form and we&apos;ll get back to you within 24–48 hours.</p>
          <div className="mt-6"><ContactChips /></div>
          {/* who runs SlidesDone and how to reach them: a payment provider (Razorpay) checks this page for a name, an e-mail, a phone number and an address in India */}
          <section aria-label="Contact details" className="mt-8 rounded-2xl border-2 border-foreground bg-white p-6">
            <h2 className="font-heading font-extrabold text-xl text-foreground">Contact details</h2>
            <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-[max-content_1fr] text-base">
              <dt className="font-bold text-[#475569]">Operated by</dt><dd className="font-medium text-foreground"><Owner k="entityName" /> (SlidesDone)</dd>
              <dt className="font-bold text-[#475569]">E-mail</dt><dd className="font-medium"><SupportMail /></dd>
              <dt className="font-bold text-[#475569]">Phone</dt><dd className="font-medium text-foreground"><Owner k="phone" /></dd>
              <dt className="font-bold text-[#475569]">Address</dt><dd className="font-medium text-foreground"><Owner k="registeredAddress" /></dd>
              <dt className="font-bold text-[#475569]">Grievance Officer</dt><dd className="font-medium text-foreground"><Owner k="grievanceOfficerName" />, <Owner k="grievanceOfficerEmail" /></dd>
            </dl>
            <p className="mt-4 text-sm font-medium text-[#475569]">We reply within 24–48 hours. Billing and refunds: see the <a href="/refunds" className="underline">cancellation and refund policy</a>.</p>
          </section>
          <div className="mt-10"><SupportForm /></div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
