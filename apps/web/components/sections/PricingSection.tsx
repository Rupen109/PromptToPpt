import type { PlansResponse } from '@prompttoppt/api-client'
import { API_URL } from '@/lib/env'
import { PricingCards } from './PricingCards'
import { Badge, Section, SectionHeader } from './ui'

/** Server-side fetch for SEO (default currency). Falls back to client-side loading if the API is unreachable at render time. */
async function loadPlans(): Promise<PlansResponse | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/plans`, { next: { revalidate: 300 } })
    if (!res.ok) return null
    return ((await res.json()) as { data: PlansResponse }).data
  } catch {
    return null
  }
}

export async function PricingSection({ heading = 'h2' }: { heading?: 'h1' | 'h2' } = {}) {
  const initial = await loadPlans()
  return (
    <Section id="pricing">
      <SectionHeader
        as={heading}
        size={48}
        badge={<Badge bg="bg-[#fffbe6]">Honest SaaS pricing</Badge>}
        title={<>Invest in Closed Deals, Not<br className="hidden md:block" /> Slide Fatigue</>}
        subtitle={<>Start generating for free. Upgrade when you need to export, use premium models and get more credits.</>}
        max="max-w-[672px]"
      />
      <PricingCards initial={initial} />
    </Section>
  )
}

export default PricingSection
