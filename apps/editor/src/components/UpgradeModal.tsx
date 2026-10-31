import { CalendarClock, Check, Coins, Layers, Sparkles, X } from '@prompttoppt/ui/icons'
import { useEffect, useState } from 'react'
import { planHighlights, priceFor, type BillingInterval, type PlansResponse } from '@prompttoppt/api-client'
import type { PlanId } from '@prompttoppt/validation'
import { api } from '@/lib/api'
import { checkoutErrorMessage, setSimulatorMode, subscribe, testModeHint } from '@/lib/checkout'
import { useDialog } from '@/lib/useDialog'
import { useEntitlements } from '@/lib/entitlements'

/** Shown whenever the server answers UPGRADE_REQUIRED / INSUFFICIENT_CREDITS / LIMIT_REACHED. */
export function UpgradeModal() {
  const { ent, refresh, upgrade } = useEntitlements()
  const [plans, setPlans] = useState<PlansResponse | null>(null)
  const [busy, setBusy] = useState<PlanId | null>(null)
  const [interval, setInterval] = useState<BillingInterval>('year')
  const [error, setError] = useState<string | null>(null)
  const [paid, setPaid] = useState<{ plan: string; credits: number; slides: number; renews: string } | null>(null)
  const [testHint, setTestHint] = useState(false)
  const close = () => {
    setError(null)
    setPaid(null)
    upgrade.hide()
  }
  const dialogRef = useDialog<HTMLDivElement>(upgrade.open, close)

  useEffect(() => {
    if (upgrade.open && !plans) api.plans().then(setPlans).catch(() => {})
    if (upgrade.open) void api.billing().then((b) => { setSimulatorMode(!!b.simulator); setTestHint(b.testMode) }).catch(() => {})
  }, [upgrade.open, plans])

  if (!upgrade.open) return null
  const choices = plans?.plans.filter((p) => p.id !== 'starter') ?? []
  const saving = choices[0] ? priceFor(choices[0], 'year')?.saving : null

  async function pay(id: 'pro' | 'gold') {
    setBusy(id)
    setError(null)
    try {
      const e = await subscribe(id, interval, (c) => setTestHint(c.testMode))
      await refresh()
      setPaid({ plan: e.plan.name, credits: e.credits.balance, slides: e.limits.maxSlides, renews: new Date(e.credits.resetsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) })
    } catch (e) {
      setError(checkoutErrorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Upgrade your plan" className={`bg-white rounded-2xl w-full ${paid ? 'max-w-md p-0 overflow-hidden' : 'max-w-3xl p-6 overflow-y-auto'} shadow-xl max-h-[90vh] outline-none`}>
        {!paid && (
          <div className="flex items-start justify-between mb-1">
            <h2 className="font-heading font-bold text-2xl">Upgrade to continue</h2>
            <button onClick={close} aria-label="Close" className="text-slate-500 hover:text-slate-800 text-2xl leading-none"><X aria-hidden size={24} /></button>
          </div>
        )}
        {paid ? (
          <div data-testid="payment-success">
            <div className="relative px-8 pt-10 pb-8 text-center bg-gradient-to-b from-emerald-50 to-white">
              <button onClick={close} aria-label="Close" className="absolute top-4 right-4 text-slate-400 hover:text-slate-700"><X aria-hidden size={22} /></button>
              <div className="mx-auto w-20 h-20 rounded-full bg-emerald-100 grid place-items-center ring-8 ring-emerald-50">
                <span className="w-14 h-14 rounded-full bg-emerald-500 text-white grid place-items-center shadow-md"><Check aria-hidden size={32} strokeWidth={3} /></span>
              </div>
              <p className="mt-5 text-xs font-bold tracking-widest text-emerald-700 uppercase">Payment successful</p>
              <h2 className="mt-1 font-heading font-extrabold text-3xl">Welcome to {paid.plan}</h2>
              <p className="mt-2 text-slate-600" role="status">You&apos;re on {paid.plan} now — {paid.credits.toLocaleString()} credits are ready.</p>
            </div>
            <dl className="mx-8 grid grid-cols-3 gap-3 text-center border-y border-border py-5">
              <div><Coins aria-hidden size={18} className="mx-auto text-primary" /><dd className="mt-1 font-bold text-lg tabular-nums">{paid.credits.toLocaleString()}</dd><dt className="text-xs text-slate-500">credits</dt></div>
              <div><Layers aria-hidden size={18} className="mx-auto text-primary" /><dd className="mt-1 font-bold text-lg tabular-nums">{paid.slides}</dd><dt className="text-xs text-slate-500">slides per deck</dt></div>
              <div><CalendarClock aria-hidden size={18} className="mx-auto text-primary" /><dd className="mt-1 font-bold text-lg">{paid.renews}</dd><dt className="text-xs text-slate-500">credits renew</dt></div>
            </dl>
            <div className="px-8 py-6">
              <button onClick={close} className="w-full h-12 rounded-xl bg-primary text-white font-semibold inline-flex items-center justify-center gap-2"><Sparkles aria-hidden size={18} />Start creating</button>
              {testHint && <p className="mt-3 text-center text-xs text-amber-700">Test payment: no real money was charged.</p>}
            </div>
          </div>
        ) : (
          <>
            {upgrade.reason && <p className="text-slate-700 mb-4" role="status">{upgrade.reason}</p>}
            {ent && <p className="text-xs text-slate-500 mb-4">You&apos;re on {ent.plan.name} · {ent.credits.balance} credits left · resets {new Date(ent.credits.resetsAt).toLocaleDateString()}</p>}
            <div className="flex justify-center mb-4">
              <div role="group" aria-label="Billing period" className="bg-slate-100 p-1 rounded-full inline-flex text-xs font-bold">
                {([['month', 'MONTHLY'], ['year', saving ? `ANNUAL · ${saving.toUpperCase()}` : 'ANNUAL']] as const).map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={interval === k} onClick={() => setInterval(k)} className={`py-1.5 px-4 rounded-full ${interval === k ? 'bg-white shadow-sm' : 'text-slate-500'}`}>{label}</button>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {choices.map((p) => {
                const price = priceFor(p, interval)
                const h = planHighlights(p, p.id === 'gold' ? plans?.plans.find((x) => x.id === 'pro') : undefined)
                const current = ent?.plan.id === p.id
                return (
                  <div key={p.id} className="border border-border rounded-xl p-4 flex flex-col gap-2">
                    <div className="font-heading font-bold text-lg">{p.name}</div>
                    {price && <div><span className="text-3xl font-extrabold">{price.text}</span><span className="text-slate-500"> /mo</span><div className="text-xs text-slate-500">{price.billed}</div></div>}
                    <ul className="text-sm text-slate-700 space-y-1 my-2">{h.items.slice(0, 7).map((x) => <li key={x} className="flex items-start gap-1.5"><Check aria-hidden size={16} className="mt-0.5 shrink-0 text-primary" />{x}</li>)}</ul>
                    <button onClick={() => void pay(p.id as 'pro' | 'gold')} disabled={busy !== null} className="text-center bg-primary text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
                      {busy === p.id ? 'Opening secure checkout…' : current ? `Switch ${p.name} billing` : `Subscribe to ${p.name}`}
                    </button>
                  </div>
                )
              })}
            </div>
            {testHint && <p className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-2 mt-4">{testModeHint()}</p>}
            {error && <p className="text-sm text-red-600 mt-4" role="alert">{error}</p>}
            <p className="text-xs text-slate-500 mt-4">
              Secure payments by Razorpay (cards, UPI, netbanking). Cancel any time — you keep your plan until the period ends.
              {plans?.currency === 'INR' && ' Prices include applicable taxes.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
