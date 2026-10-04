import { useEffect, useState } from 'react'
import { planHighlights, priceFor, type BillingInterval, type PlansResponse } from '@prompttoppt/api-client'
import type { PlanId } from '@prompttoppt/validation'
import { api } from '@/lib/api'
import { checkoutErrorMessage, subscribe, TEST_MODE_HINT } from '@/lib/checkout'
import { useDialog } from '@/lib/useDialog'
import { useEntitlements } from '@/lib/entitlements'

/** Shown whenever the server answers UPGRADE_REQUIRED / INSUFFICIENT_CREDITS / LIMIT_REACHED. */
export function UpgradeModal() {
  const { ent, refresh, upgrade } = useEntitlements()
  const [plans, setPlans] = useState<PlansResponse | null>(null)
  const [busy, setBusy] = useState<PlanId | null>(null)
  const [interval, setInterval] = useState<BillingInterval>('year')
  const [error, setError] = useState<string | null>(null)
  const [paid, setPaid] = useState<string | null>(null)
  const [testHint, setTestHint] = useState(false)
  const close = () => {
    setError(null)
    setPaid(null)
    upgrade.hide()
  }
  const dialogRef = useDialog<HTMLDivElement>(upgrade.open, close)

  useEffect(() => {
    if (upgrade.open && !plans) api.plans().then(setPlans).catch(() => {})
    if (upgrade.open) void api.billing().then((b) => setTestHint(b.testMode)).catch(() => {})
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
      setPaid(`You're on ${e.plan.name} now — ${e.credits.balance.toLocaleString()} credits are ready.`)
    } catch (e) {
      setError(checkoutErrorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Upgrade your plan" className="bg-white rounded-2xl w-full max-w-3xl p-6 shadow-xl max-h-[90vh] overflow-y-auto outline-none">
        <div className="flex items-start justify-between mb-1">
          <h2 className="font-heading font-bold text-2xl">{paid ? 'Payment successful' : 'Upgrade to continue'}</h2>
          <button onClick={close} aria-label="Close" className="text-slate-500 hover:text-slate-800 text-2xl leading-none">×</button>
        </div>
        {paid ? (
          <div className="py-6">
            <p className="text-lg text-slate-800 mb-4" role="status">{paid}</p>
            <button onClick={close} className="bg-primary text-white rounded-lg px-5 py-2 font-semibold">Start creating</button>
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
                    <ul className="text-sm text-slate-700 space-y-1 my-2">{h.items.slice(0, 7).map((x) => <li key={x}>✓ {x}</li>)}</ul>
                    <button onClick={() => void pay(p.id as 'pro' | 'gold')} disabled={busy !== null} className="text-center bg-primary text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
                      {busy === p.id ? 'Opening secure checkout…' : current ? `Switch ${p.name} billing` : `Subscribe to ${p.name}`}
                    </button>
                  </div>
                )
              })}
            </div>
            {testHint && <p className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-2 mt-4">{TEST_MODE_HINT}</p>}
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
