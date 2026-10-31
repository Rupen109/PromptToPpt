import type { Metadata } from 'next'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { PricingSection } from '@/components/sections/PricingSection'
import FaqSection from '@/components/sections/FaqSection'
import { JsonLd } from '@/components/seo/JsonLd'
import { PRICING_FAQS } from '@/lib/faq'
import { breadcrumbLd } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Pricing and plans',
  description: 'Start free with 100 credits. Upgrade to Pro or Gold for export, premium models, AI edits and more.',
  alternates: { canonical: '/pricing' },
}

export default function PricingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <JsonLd data={breadcrumbLd([['Home', '/'], ['Pricing', '/pricing']])} />
      <Header />
      <main>
        <PricingSection heading="h1" />
        <FaqSection faqs={PRICING_FAQS} />
      </main>
      <Footer />
    </div>
  )
}
