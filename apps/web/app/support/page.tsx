import type { Metadata } from 'next'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { ContactChips, SupportForm } from '@/components/support/SupportForm'

export const metadata: Metadata = {
  title: 'Support — Contact SlidesDone',
  description: 'Need help with SlidesDone? Send us a message with a screenshot and we will get back to you within 24–48 hours.',
  alternates: { canonical: '/support' },
}

export default function Page() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="px-5 md:px-10 py-12 md:py-16">
        <div className="mx-auto max-w-[860px]">
          <h1 className="font-heading font-extrabold text-4xl md:text-5xl text-foreground">Contact us</h1>
          <p className="mt-4 text-lg font-medium text-[#475569]">Fill out the form and we&apos;ll get back to you within 24–48 hours.</p>
          <div className="mt-6"><ContactChips /></div>
          <div className="mt-10"><SupportForm /></div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
