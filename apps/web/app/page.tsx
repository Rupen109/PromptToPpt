import type { Metadata } from 'next'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroSection } from '@/components/sections/HeroSection'
import { LiveSimulatorSection } from '@/components/sections/LiveSimulatorSection'
import { TrustedBySection } from '@/components/sections/TrustedBySection'
import { ModalitiesSection } from '@/components/sections/ModalitiesSection'
import StudioMockupSection from '@/components/sections/StudioMockupSection'
import WorkflowSection from '@/components/sections/WorkflowSection'
import { TemplatesSection } from '@/components/sections/TemplatesSection'
import { PricingSection } from '@/components/sections/PricingSection'
import FaqSection from '@/components/sections/FaqSection'
import CtaSection from '@/components/sections/CtaSection'

export const metadata: Metadata = {
  title: 'promptToPpt — AI Presentation Maker | Create Stunning Slides in Seconds',
  description:
    'Transform any topic or prompt into a beautiful, editable presentation with AI. Upload PDFs, paste text, or enter a YouTube URL — get a professional deck in seconds.',
  alternates: {
    canonical: '/',
  },
}

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen bg-background font-sans text-foreground selection:bg-highlight selection:text-foreground">
      {/* ─── Top Promo Banner ─── */}
      <div className="bg-warning text-foreground text-center py-2 px-4 font-heading text-sm font-extrabold flex justify-center items-center gap-2 relative z-50">
        <span className="font-normal">⚡ Solguruz Edition 3.0 Live:</span> Ingest Raw PDFs, Sketch Photos, &...
        <button className="bg-foreground text-white py-1 px-3 rounded-sm text-xs uppercase hover:bg-slate-800 transition-colors">Try Free</button>
      </div>

      <Header />
      
      <main>
        <HeroSection />
        <LiveSimulatorSection />
        <TrustedBySection />
        <ModalitiesSection />
        <StudioMockupSection />
        <WorkflowSection />
        <TemplatesSection />
        <PricingSection />
        <FaqSection />
        <CtaSection />
      </main>

      <Footer />
    </div>
  )
}
