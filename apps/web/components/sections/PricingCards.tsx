'use client'

import { X } from '@prompttoppt/ui/icons'
import { useEffect, useState } from 'react'
import { planHighlights, priceFor, type BillingInterval, type PlansResponse } from '@prompttoppt/api-client'
import { api } from '@/lib/api'
import { EDITOR_URL } from '@/lib/env'
import { Button } from '@/components/ui/Button'
import { Card, type CardTone } from '@/components/ui/Card'
import { CardCarousel } from '@/components/ui/Carousel'
import { HARD } from './ui'

const Tick = () => (
  <span className="w-5 h-5 rounded-full grid place-items-center shrink-0 bg-highlight border border-foreground" aria-hidden>
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4.2 3.2 6.4 7 1.6" stroke="#181b25" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
)
const Cross = () => <span className="w-5 h-5 rounded-full grid place-items-center shrink-0 bg-[#e2e8f0] border border-[#94a3b8] text-foreground" aria-hidden><X size={11} strokeWidth={3} /></span>

const CARD: Record<'starter' | 'pro' | 'gold' | 'premium', { label: string; tone: CardTone; labelColor: string; desc: string }> = {
  starter: { label: 'Free explorer', tone: 'cream', labelColor: 'text-[#475569]', desc: 'Try the AI presentation engine with 100 free credits.' },
  pro: { label: 'For founders & teams', tone: 'peach', labelColor: 'text-[#b02f00]', desc: 'Premium models, export and no watermark — for anyone who presents often.' },
  gold: { label: 'Power users & firms', tone: 'lavender', labelColor: 'text-primary', desc: 'High-quality generation, brand control and every export format.' },
  premium: { label: 'Studios & heavy users', tone: 'cream', labelColor: 'text-[#475569]', desc: 'Pick any advanced model, with no slide limit beyond your credits.' },
}

/**
 * Renders plans from the API (single source: the `plan`/`plan_price` tables) in the Figma card design. The server renders the
 * default (USD) for SEO; the browser then re-fetches so the API can localise to INR from its own country signal (never ours).
 */
export function PricingCards({ initial }: { initial: PlansResponse | null }) {
  const [data, setData] = useState<PlansResponse | null>(initial)
  const [failed, setFailed] = useState(false)
  const [interval, setInterval] = useState<BillingInterval>('year')

  useEffect(() => {
    api.plans().then(setData).catch(() => !initial && setFailed(true))
  }, [initial])

  if (!data) return <p className="text-center text-slate-600 py-12">{failed ? 'Pricing is temporarily unavailable. Please try again shortly.' : 'Loading pricing…'}</p>

  const byId = Object.fromEntries(data.plans.map((p) => [p.id, p]))
  const order = ['pro', 'gold', 'premium'].map((id) => byId[id]).filter((p): p is NonNullable<typeof p> => !!p)
  const saving = byId['pro'] ? priceFor(byId['pro'], 'year')?.saving : null
  const savingPct = saving?.replace('Save ', '').toUpperCase()

  return (
    <>
      <div className="mt-8 flex justify-center">
        <div role="group" aria-label="Billing period" className={`inline-flex items-center gap-1 bg-[#f3f4f9] border-2 border-foreground rounded-2xl p-1.5 ${HARD.sm}`}>
          <Button size="sm" depth={interval === 'month' ? 'sm' : 'none'} variant={interval === 'month' ? 'yellow' : 'ghost'} aria-pressed={interval === 'month'} onClick={() => setInterval('month')} className="!text-foreground">Monthly</Button>
          <Button size="sm" depth={interval === 'year' ? 'sm' : 'none'} variant={interval === 'year' ? 'yellow' : 'ghost'} aria-pressed={interval === 'year'} onClick={() => setInterval('year')} className="!text-foreground">Annual{savingPct ? ` (Save ${savingPct})` : ''}</Button>
        </div>
      </div>

      <CardCarousel from="lg" label="Pricing plans" className="mt-4 lg:mt-16" gridClassName="lg:grid lg:grid-cols-3 lg:gap-8 lg:items-stretch lg:p-0">
        {order.map((plan, i) => {
          const c = CARD[plan.id]
          const pro = plan.id === 'pro'
          const price = priceFor(plan, interval)
          const h = planHighlights(plan, i > 0 ? order[i - 1] : undefined)
          const items = h.items.slice(0, 9)
          const href = plan.id === 'starter' ? '/signup' : `${EDITOR_URL}/billing?plan=${plan.id}&interval=${interval}`
          const free = plan.id === 'starter'
          return (
            <Card key={plan.id} tone={c.tone} shadow={pro ? 'lg' : 'md'} index={i} wrapperClassName={pro ? 'h-full lg:h-auto lg:-mt-4' : 'h-full'} className="relative p-8 flex flex-col h-full">
              {pro && <span className={`absolute -top-4 left-1/2 -translate-x-1/2 bg-accent text-white border-2 border-foreground rounded-full px-4 py-1.5 font-heading font-extrabold text-xs uppercase ${HARD.sm}`}>Most popular</span>}
              <div className={`font-heading font-extrabold text-xs uppercase tracking-[0.6px] leading-4 mt-1 ${c.labelColor}`}>{c.label}</div>
              <h3 className={`font-heading font-extrabold mt-2 text-foreground ${pro ? 'text-3xl leading-9' : 'text-2xl leading-8'}`}>{plan.name}</h3>
              <p className="text-sm leading-5 mt-3 min-h-10 text-[#475569]">{c.desc}</p>
              <div className="mt-6">
                {price ? (
                  <>
                    <span className="font-heading font-extrabold text-5xl leading-none text-foreground">{price.text}</span>
                    <span className="text-sm font-bold text-[#475569]">{free ? ' / month forever' : ' / month'}</span>
                    {!free && <div className="text-xs mt-2 text-[#475569]">{price.billed}{price.saving ? ` · ${price.saving}` : ''}</div>}
                  </>
                ) : <span className="text-sm opacity-70">Not available in your currency yet</span>}
              </div>
              <ul className="mt-8 flex flex-col gap-3 flex-1">
                {items.map((t) => {
                  const no = /^(No export|Watermark)/i.test(t) // limitations are shown as greyed crosses, not as benefits
                  return (
                    <li key={t} className={`flex items-start gap-2.5 text-sm leading-5 font-medium text-foreground ${no ? 'opacity-75' : ''}`}>{no ? <Cross /> : <Tick />}<span>{t}</span></li>
                  )
                })}
              </ul>
              <Button href={href} block size="md" variant={pro ? 'accent' : plan.id === 'gold' ? 'primary' : 'white'} className="mt-8">{free ? 'Start free now' : `Get ${plan.name}`}</Button>
            </Card>
          )
        })}
      </CardCarousel>
      <p className="mt-6 lg:mt-10 text-center text-sm text-[#475569]">New here? <a href="/signup" className="font-bold underline">Start free with 100 credits</a>. Free decks carry a watermark and cannot be exported or presented.</p>
      <p className="mt-3 text-center text-sm text-[#475569]">Prices are billed {interval === 'year' ? 'annually' : 'monthly'} and may vary by country. Cancel any time.</p>
    </>
  )
}
