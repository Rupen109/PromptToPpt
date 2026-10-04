import type { Metadata } from 'next'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { PricingSection } from '@/components/sections/PricingSection'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Start free with 100 credits. Upgrade to Pro or Gold for export, premium models, AI edits and more.',
  alternates: { canonical: '/pricing' },
}

export default function PricingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main>
        <PricingSection heading="h1" />
      </main>
      <Footer />
    </div>
  )
}
