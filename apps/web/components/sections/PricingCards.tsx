'use client'

import { useEffect, useState } from 'react'
import { planHighlights, priceFor, type BillingInterval, type PlansResponse } from '@prompttoppt/api-client'
import { api } from '@/lib/api'
import { EDITOR_URL } from '@/lib/env'
import { Button } from '@/components/ui/Button'
import { Card, type CardTone } from '@/components/ui/Card'
import { HARD } from './ui'

const Tick = ({ dark }: { dark?: boolean }) => (
  <span className={`w-5 h-5 rounded-full grid place-items-center shrink-0 bg-highlight ${dark ? '' : 'border border-foreground'}`} aria-hidden>
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4.2 3.2 6.4 7 1.6" stroke="#181b25" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
)
const Cross = () => <span className="w-5 h-5 rounded-full grid place-items-center shrink-0 bg-[#e2e8f0] border border-[#94a3b8] text-[11px] font-bold text-foreground" aria-hidden>✕</span>

const CARD: Record<'starter' | 'pro' | 'gold', { label: string; tone: CardTone; labelColor: string; desc: string }> = {
  starter: { label: 'Free explorer', tone: 'cream', labelColor: 'text-[#475569]', desc: 'Try the AI presentation engine with 100 free credits.' },
  pro: { label: 'For founders & teams', tone: 'ink', labelColor: 'text-highlight', desc: 'Premium models, export and no watermark — for anyone who presents often.' },
  gold: { label: 'Power users & firms', tone: 'lavender', labelColor: 'text-primary', desc: 'Frontier models, brand control and the highest limits.' },
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
  const order = ['starter', 'pro', 'gold'].map((id) => byId[id]).filter((p): p is NonNullable<typeof p> => !!p)
  const saving = byId['pro'] ? priceFor(byId['pro'], 'year')?.saving : null
  const savingPct = saving?.replace('Save ', '').toUpperCase()

  return (
    <>
      <div className="mt-8 flex justify-center">
        <div role="group" aria-label="Billing period" className={`inline-flex items-center gap-1 bg-[#f3f4f9] border-2 border-foreground rounded-2xl p-1.5 ${HARD.sm}`}>
          <Button size="sm" depth={interval === 'month' ? 'sm' : 'none'} variant={interval === 'month' ? 'yellow' : 'ghost'} aria-pressed={interval === 'month'} onClick={() => setInterval('month')} className="!text-foreground">Monthly</Button>
          <Button size="sm" depth={interval === 'year' ? 'sm' : 'none'} variant={interval === 'year' ? 'yellow' : 'ghost'} aria-pressed={interval === 'year'} onClick={() => setInterval('year')} className="!text-foreground">Annual{savingPct ? ` (Save ${savingPct} 🔥)` : ''}</Button>
        </div>
      </div>

      <div className="mt-16 grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch max-w-[520px] lg:max-w-none mx-auto">
        {order.map((plan, i) => {
          const c = CARD[plan.id]
          const pro = plan.id === 'pro'
          const price = priceFor(plan, interval)
          const h = planHighlights(plan, i > 0 ? order[i - 1] : undefined)
          const items = h.items.slice(0, 7)
          const href = plan.id === 'starter' ? '/signup' : `${EDITOR_URL}/billing?plan=${plan.id}&interval=${interval}`
          const free = plan.id === 'starter'
          return (
            <Card key={plan.id} tone={c.tone} shadow={pro ? 'lg' : 'md'} index={i} wrapperClassName={pro ? 'h-auto lg:-mt-4' : 'h-full'} className="relative p-8 flex flex-col h-full">
              {pro && <span className={`absolute -top-4 left-1/2 -translate-x-1/2 bg-accent text-white border-2 border-foreground rounded-full px-4 py-1.5 font-heading font-extrabold text-xs uppercase ${HARD.sm} motion-safe:animate-pulse`}>Most popular</span>}
              <div className={`font-heading font-extrabold text-xs uppercase tracking-[0.6px] leading-4 mt-1 ${c.labelColor}`}>{c.label}</div>
              <h3 className={`font-heading font-extrabold mt-2 ${pro ? 'text-3xl leading-9 text-white' : 'text-2xl leading-8 text-foreground'}`}>{plan.name}</h3>
              <p className={`text-sm leading-5 mt-3 min-h-10 ${pro ? 'text-[#cbd5e1]' : 'text-[#475569]'}`}>{c.desc}</p>
              <div className="mt-6">
                {price ? (
                  <>
                    <span className={`font-heading font-extrabold text-5xl leading-none ${pro ? 'text-secondary' : 'text-foreground'}`}>{price.text}</span>
                    <span className={`text-sm font-bold ${pro ? 'text-[#cbd5e1]' : 'text-[#475569]'}`}>{free ? ' / month forever' : ' / month'}</span>
                    {!free && <div className={`text-xs mt-2 ${pro ? 'text-[#cbd5e1]' : 'text-[#475569]'}`}>{price.billed}{price.saving ? ` · ${price.saving}` : ''}</div>}
                  </>
                ) : <span className="text-sm opacity-70">Not available in your currency yet</span>}
              </div>
              <ul className="mt-8 flex flex-col gap-3 flex-1">
                {items.map((t) => {
                  const no = /^(No export|Watermark)/i.test(t) // limitations are shown as greyed ✕, not as benefits
                  return (
                    <li key={t} className={`flex items-start gap-2.5 text-sm leading-5 font-medium ${no ? 'text-foreground opacity-75' : pro ? 'text-[#e2e8f0]' : 'text-foreground'}`}>{no ? <Cross /> : <Tick dark={pro} />}<span>{t}</span></li>
                  )
                })}
              </ul>
              <Button href={href} block arrow={pro} size={pro ? 'lg' : 'md'} variant={pro ? 'accent' : plan.id === 'gold' ? 'primary' : 'white'} className="mt-8">{free ? 'Start free now' : `Get ${plan.name}`}</Button>
            </Card>
          )
        })}
      </div>
      <p className="mt-10 text-center text-sm text-[#475569]">Prices are billed {interval === 'year' ? 'annually' : 'monthly'} and may vary by country. Cancel any time.</p>
    </>
  )
}
