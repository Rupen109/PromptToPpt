import { Star } from '@prompttoppt/ui/icons'
import Link from 'next/link'
import type { PublicReviews } from '@prompttoppt/api-client'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { API_URL } from '@/lib/env'
import { Badge } from './ui'

/** Approved customer reviews from the API (refreshed every minute). If the API is down the section shows its "be one of the first" state, never made-up quotes. */
async function loadReviews(): Promise<PublicReviews> {
  try {
    const res = await fetch(`${API_URL}/api/v1/reviews`, { next: { revalidate: 60 } })
    if (!res.ok) throw new Error(String(res.status))
    return ((await res.json()) as { data: PublicReviews }).data
  } catch {
    return { count: 0, average: null, items: [] }
  }
}

const Stars = ({ n }: { n: number }) => (
  <span role="img" aria-label={`${n} out of 5 stars`} className="inline-flex gap-0.5 text-[#f59e0b]">{Array.from({ length: 5 }, (_, i) => <Star key={i} aria-hidden size={16} fill="currentColor" className={i < Math.round(n) ? '' : 'text-[#cbd5e1]'} />)}</span>
)

export async function ReviewsSection() {
  const { count, average, items } = await loadReviews()
  return (
    <section id="reviews" className="bg-[#f3f4f9] border-b-2 border-foreground px-5 md:px-10 pt-16 pb-16 md:pb-28 scroll-mt-20">
      <div className="max-w-[1200px] mx-auto">
        <div className="text-center">
          <Badge>Reviews</Badge>
          <h2 className="mt-6 font-heading font-extrabold text-4xl md:text-5xl leading-[1.05] text-foreground">What people say about SlidesDone</h2>
          {count > 0 && average !== null && (
            <p className="mt-4 text-lg font-medium text-[#475569]"><Stars n={average} /> <strong className="text-foreground">{average.toFixed(1)}</strong> from {count} review{count === 1 ? '' : 's'} by people who made a presentation with us</p>
          )}
        </div>

        {items.length > 0 ? (
          <ul className="mt-12 flex flex-wrap justify-center gap-6">
            {items.map((r) => (
              <li key={r.id} className="list-none w-full md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)]">
                <Card tone="white" radius="2xl" shadow="md" border hover={false} reveal={false} className="p-6 h-full flex flex-col" wrapperClassName="h-full">
                  <Stars n={r.rating} />
                  <p className="mt-3 text-base leading-7 font-medium text-[#334155]">“{r.body}”</p>
                  <p className="mt-auto pt-5 font-heading font-extrabold text-sm text-foreground">{r.name}{r.role && <span className="font-medium text-[#64748b]"> · {r.role}</span>}</p>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Card tone="yellow" shadow="lg" hover={false} reveal={false} wrapperClassName="max-w-[816px] mx-auto h-auto mt-12" className="px-6 md:px-12 py-14 text-center flex flex-col items-center">
            <h3 className="font-heading font-extrabold text-3xl md:text-4xl leading-[1.1] text-foreground max-w-[620px]">We’re new, so there are no reviews yet. Be one of the first.</h3>
            <p className="mt-5 text-lg leading-7 font-medium text-foreground max-w-[560px]">Make a presentation for free, then tell us honestly how it went. Reviews appear here after we check them, and only from people who have really used SlidesDone.</p>
            <div className="mt-8"><Link href="/signup"><Button variant="accent" size="lg" arrow>Start free</Button></Link></div>
            <p className="mt-5 font-heading font-bold text-xs text-foreground">No credit card required • The free plan includes 100 credits</p>
          </Card>
        )}

        {items.length > 0 && (
          <div className="mt-12 text-center">
            <Link href="/signup"><Button variant="accent" size="lg" arrow>Try it free</Button></Link>
            <p className="mt-4 font-heading font-bold text-xs text-foreground">No credit card required • The free plan includes 100 credits</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default ReviewsSection
