import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { formatMoney, type BillingOverview } from '@prompttoppt/api-client'
import { Sidebar } from '@/components/Sidebar'
import { api } from '@/lib/api'
import { checkoutErrorMessage, subscribe, TEST_MODE_HINT } from '@/lib/checkout'
import { useEntitlements } from '@/lib/entitlements'

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

function Bar({ label, value, max, tone = 'bg-primary' }: { label: string; value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return <div className="h-2 rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}><div className={`h-full ${tone}`} style={{ width: `${pct}%` }} /></div>
}

function Limit({ label, used, max }: { label: string; used?: number; max: number | null }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="text-sm text-slate-600">{label}</div>
      <div className="font-heading font-bold text-xl mt-0.5">{used === undefined ? (max === null ? 'Unlimited' : max.toLocaleString()) : <>{used.toLocaleString()} <span className="text-sm font-medium text-slate-600">/ {max === null ? 'unlimited' : max.toLocaleString()}</span></>}</div>
      {used !== undefined && max !== null && <div className="mt-2"><Bar label={label} value={used} max={max} tone={used >= max ? 'bg-red-500' : 'bg-primary'} /></div>}
    </div>
  )
}

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
  const credits = ent?.credits
  const used = credits ? Math.max(0, credits.monthlyAllowance - credits.balance) : 0
  return (
    <div className="flex min-h-screen pt-14 lg:pt-0 bg-[#f6f7fb]">
      <Sidebar />
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-4xl">
        <h1 className="font-heading font-bold text-3xl mb-6">Plan &amp; credits</h1>
        {testHint && <p className="mb-4 rounded-lg px-4 py-3 text-sm bg-amber-50 border border-amber-200 text-amber-900">{TEST_MODE_HINT}</p>}
        {msg && <p role={msg.kind === 'err' ? 'alert' : 'status'} className={`mb-4 rounded-lg px-4 py-3 text-sm ${msg.kind === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}

        <section className="bg-white border border-border rounded-xl p-5 mb-6" aria-label="Current plan">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm text-slate-600">Current plan</div>
              <div className="font-heading font-bold text-2xl flex items-center gap-2">{ent?.plan.name ?? '…'} {ent && <span className="text-[11px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5 align-middle">ACTIVE</span>}</div>
              {sub ? (
                <div className="text-sm text-slate-600 mt-1">
                  {sub.interval === 'year' ? 'Billed yearly' : 'Billed monthly'} · {sub.cancelAtPeriodEnd ? <span className="text-amber-700">Ends {when(sub.currentPeriodEnd)} (not renewing)</span> : <>Renews {when(sub.currentPeriodEnd)}</>}
                  {sub.status === 'past_due' && <span className="text-red-700"> · last payment failed — update your payment method with Razorpay or it will not renew</span>}
                </div>
              ) : ent && <div className="text-sm text-slate-600 mt-1">Free plan · credits renew on {when(ent.credits.resetsAt)}</div>}
            </div>
            <div className="flex flex-col gap-2 items-end shrink-0">
              {ent?.plan.id !== 'gold' && <button onClick={() => upgrade.show()} className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold">{sub ? 'Change plan' : 'Upgrade'}</button>}
              {sub && !sub.cancelAtPeriodEnd && (
                <button
                  disabled={busy}
                  onClick={() => window.confirm(`Cancel your subscription? You keep ${ent?.plan.name} until ${when(sub.currentPeriodEnd)}.`) && void run(() => api.cancelSubscription(), 'Subscription cancelled. You keep your plan until the period ends.')}
                  className="text-sm text-slate-600 underline disabled:opacity-50"
                >
                  Cancel subscription
                </button>
              )}
            </div>
          </div>
          {data && !data.billingEnabled && <p className="text-xs text-amber-700 mt-3">Payments are not configured on this server yet.</p>}
        </section>

        <section className="bg-white border border-border rounded-xl p-5 mb-6" aria-label="Credits">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm text-slate-600">Credits left</div>
              <div className="font-heading font-bold text-4xl">{credits ? credits.balance.toLocaleString() : '…'} {credits && <span className="text-base font-medium text-slate-600">of {credits.monthlyAllowance.toLocaleString()}</span>}</div>
            </div>
            {credits && <div className="text-sm text-slate-600 text-right">Resets on <b>{when(credits.resetsAt)}</b><br /><span className="text-slate-600">{used.toLocaleString()} used this period</span></div>}
          </div>
          {credits && <div className="mt-4"><Bar label="Credits left this period" value={credits.balance} max={credits.monthlyAllowance} tone={credits.balance / Math.max(1, credits.monthlyAllowance) < 0.1 ? 'bg-red-500' : 'bg-primary'} /></div>}
        </section>

        {ent && (
          <section className="mb-6" aria-label="Plan limits">
            <h2 className="font-heading font-bold text-lg mb-3">Your plan limits</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Limit label="Decks this month" used={ent.usage.presentationsThisPeriod} max={ent.limits.maxPresentationsPerMonth} />
              <Limit label="Slides per deck" max={ent.limits.maxSlides} />
            </div>
          </section>
        )}

        <section className="bg-white border border-border rounded-xl p-5" aria-label="Payment history">
          <h2 className="font-heading font-bold text-lg mb-3">Payment history</h2>
          {!data ? <p className="text-slate-600 text-sm">Loading…</p> : data.payments.length === 0 ? <p className="text-slate-600 text-sm">No payments yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-600"><th className="py-1 font-medium">Date</th><th className="font-medium">Plan</th><th className="font-medium">Status</th><th className="text-right font-medium">Amount</th></tr></thead>
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
