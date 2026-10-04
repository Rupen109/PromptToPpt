import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { formatMoney, type BillingOverview } from '@prompttoppt/api-client'
import { Sidebar } from '@/components/Sidebar'
import { api } from '@/lib/api'
import { checkoutErrorMessage, subscribe, TEST_MODE_HINT } from '@/lib/checkout'
import { useEntitlements } from '@/lib/entitlements'

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Plan, renewal, payment history and cancel. Also the landing target of the website's pricing buttons
 * (`/billing?plan=pro&interval=year`): after login it opens checkout straight away.
 */
export function BillingPage() {
  const { ent, refresh, upgrade } = useEntitlements()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<BillingOverview | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [testHint, setTestHint] = useState(false)

  const load = useCallback(() => api.billing().then(setData).catch(() => setMsg({ kind: 'err', text: 'Could not load billing details.' })), [])
  useEffect(() => {
    void api.billing().then((b) => { setData(b); setTestHint(b.testMode) }).catch(() => setMsg({ kind: 'err', text: 'Could not load billing details.' }))
  }, [])

  const run = useCallback(async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      await Promise.all([refresh(), load()])
      setMsg({ kind: 'ok', text: ok })
    } catch (e) {
      const text = checkoutErrorMessage(e)
      if (text) setMsg({ kind: 'err', text })
    } finally {
      setBusy(false)
    }
  }, [refresh, load])

  // Deep link from the pricing page: open checkout once.
  const started = useRef(false)
  useEffect(() => {
    const plan = params.get('plan')
    const interval = params.get('interval')
    if (started.current || (plan !== 'pro' && plan !== 'gold') || (interval !== 'month' && interval !== 'year')) return
    started.current = true
    setParams({}, { replace: true })
    void run(() => subscribe(plan, interval, (c) => setTestHint(c.testMode)), 'Payment successful — your plan is active.')
  }, [params, setParams, run])

  const sub = data?.subscription
  return (
    <div className="flex min-h-screen pt-14 lg:pt-0 bg-[#f6f7fb]">
      <Sidebar />
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-3xl">
        <h1 className="font-heading font-bold text-3xl mb-6">Billing</h1>
        {testHint && <p className="mb-4 rounded-lg px-4 py-3 text-sm bg-amber-50 border border-amber-200 text-amber-900">{TEST_MODE_HINT}</p>}
        {msg && <p role={msg.kind === 'err' ? 'alert' : 'status'} className={`mb-4 rounded-lg px-4 py-3 text-sm ${msg.kind === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}

        <section className="bg-white border border-border rounded-xl p-5 mb-6" aria-label="Current plan">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-slate-500">Current plan</div>
              <div className="font-heading font-bold text-2xl">{ent?.plan.name ?? '…'}</div>
              {ent && <div className="text-sm text-slate-600 mt-1">{ent.credits.balance.toLocaleString()} / {ent.credits.monthlyAllowance.toLocaleString()} credits · resets {when(ent.credits.resetsAt)}</div>}
              {sub && (
                <div className="text-sm text-slate-600 mt-1">
                  {sub.interval === 'year' ? 'Billed yearly' : 'Billed monthly'} · {sub.cancelAtPeriodEnd ? <span className="text-amber-700">Ends {when(sub.currentPeriodEnd)} (not renewing)</span> : <>Renews {when(sub.currentPeriodEnd)}</>}
                  {sub.status === 'past_due' && <span className="text-red-700"> · last payment failed — update your payment method with Razorpay or it will not renew</span>}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 items-end shrink-0">
              {ent?.plan.id !== 'gold' && <button onClick={() => upgrade.show()} className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold">{sub ? 'Change plan' : 'Upgrade'}</button>}
              {sub && !sub.cancelAtPeriodEnd && (
                <button
                  disabled={busy}
                  onClick={() => window.confirm(`Cancel your subscription? You keep ${ent?.plan.name} until ${when(sub.currentPeriodEnd)}.`) && void run(() => api.cancelSubscription(), 'Subscription cancelled. You keep your plan until the period ends.')}
                  className="text-sm text-slate-500 underline disabled:opacity-50"
                >
                  Cancel subscription
                </button>
              )}
            </div>
          </div>
          {data && !data.billingEnabled && <p className="text-xs text-amber-700 mt-3">Payments are not configured on this server yet.</p>}
        </section>

        <section className="bg-white border border-border rounded-xl p-5" aria-label="Payment history">
          <h2 className="font-heading font-bold text-lg mb-3">Payment history</h2>
          {!data ? <p className="text-slate-500 text-sm">Loading…</p> : data.payments.length === 0 ? <p className="text-slate-500 text-sm">No payments yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500"><th className="py-1 font-medium">Date</th><th className="font-medium">Plan</th><th className="font-medium">Status</th><th className="text-right font-medium">Amount</th></tr></thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2">{when(p.paidAt)}</td>
                    <td className="capitalize">{p.planId ?? '—'}</td>
                    <td className={p.status === 'captured' ? 'text-green-700' : p.status === 'failed' ? 'text-red-700' : ''}>{p.status === 'captured' ? 'Paid' : p.status}</td>
                    <td className="text-right">{formatMoney(p.amountMinor, p.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <p className="mt-6 text-sm"><Link to="/" className="text-primary">← Back to home</Link></p>
      </main>
    </div>
  )
}
