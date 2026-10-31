import type { PlansResponse } from '@prompttoppt/api-client'
import { API_URL } from '@/lib/env'
import { PricingCards } from './PricingCards'
import { JsonLd } from '@/components/seo/JsonLd'
import { SITE_URL } from '@/lib/env'
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
  // every plan as a priced offer, generated from the live plan data (so the markup can never disagree with the page)
  const offers = (initial?.plans ?? []).flatMap((pl) => pl.prices.filter((x) => x.interval === 'month' || pl.prices.length === 1).map((x) => ({
    '@type': 'Offer', name: `${pl.name} plan`, price: (x.amountMinor / 100).toFixed(2), priceCurrency: x.currency, url: `${SITE_URL}/pricing`, availability: 'https://schema.org/InStock',
    priceSpecification: { '@type': 'UnitPriceSpecification', price: (x.amountMinor / 100).toFixed(2), priceCurrency: x.currency, billingDuration: 1, unitCode: x.interval === 'year' ? 'ANN' : 'MON' },
  })))
  return (
    <Section id="pricing">
      {offers.length > 0 && <JsonLd data={{ '@context': 'https://schema.org', '@type': 'SoftwareApplication', '@id': `${SITE_URL}/#software`, name: 'SlidesDone', applicationCategory: 'BusinessApplication', operatingSystem: 'Web', offers }} />}
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
