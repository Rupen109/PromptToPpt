import { useState } from 'react'
import { int, pct } from '@/lib/format'
import { Badge, DataTable, EmptyNote, Panel, SectionPage, Stat, Stats, TimeBars, dateTime, money, useSection } from '../ui'

interface CurrencySummary { currency: string; grossMinor: number; refundsMinor: number; netMinor: number; refundCount: number; paymentCount: number; failedCount: number; failureRate: number; payingCustomers: number; arppuMinor: number; avgOrderMinor: number }
interface Recurring { currency: string; activeSubscriptions: number; mrrMinor: number; arrMinor: number }
interface Summary { currencies: CurrencySummary[]; mrr: Recurring[] }
interface SeriesPoint { t: string; currency: string; revenueMinor: number; payments: number; refundsMinor: number }
interface BreakdownRow { key: string; currency: string; revenueMinor: number; payments: number; customers: number }
interface PaymentRow { id: string; userId: string; email: string | null; planId: string | null; interval: string | null; currency: string; amountMinor: number; status: string; method: string | null; failureReason: string | null; paidAt: string }
interface Payments { total: number; limit: number; offset: number; rows: PaymentRow[] }
interface TopCustomer { userId: string; email: string | null; currency: string; revenueMinor: number; payments: number; lastPaidAt: string }

const PAGE = 15
const dash = '—'
const statusTone = { captured: 'green', failed: 'red', refunded: 'amber' } as const

/** Prev/Next for a paginated table; announces the visible range. */
function Pager({ offset, limit, total, onChange }: { offset: number; limit: number; total: number; onChange: (o: number) => void }) {
  if (total <= limit) return null
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-3 text-sm">
      <span role="status" className="text-slate-600">{int(offset + 1)}–{int(Math.min(total, offset + limit))} of {int(total)}</span>
      <div className="flex gap-2">
        <button onClick={() => onChange(Math.max(0, offset - limit))} disabled={offset === 0} className="px-3 py-1 rounded-lg border border-border disabled:opacity-40 hover:bg-slate-50">Previous</button>
        <button onClick={() => onChange(offset + limit)} disabled={offset + limit >= total} className="px-3 py-1 rounded-lg border border-border disabled:opacity-40 hover:bg-slate-50">Next</button>
      </div>
    </nav>
  )
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-border overflow-hidden bg-white text-sm">
      {options.map((o) => <button key={o} onClick={() => onChange(o)} aria-pressed={value === o} className={`px-3 py-1 capitalize ${value === o ? 'bg-foreground text-white' : 'hover:bg-slate-50'}`}>{o}</button>)}
    </div>
  )
}

function SummaryPanels({ s }: { s: Summary }) {
  const currencies = [...new Set([...s.currencies.map((c) => c.currency), ...s.mrr.map((m) => m.currency)])].sort()
  if (currencies.length === 0) return <Panel title="Revenue"><EmptyNote>No payments in this range and no active subscriptions yet. Revenue appears once a payment is captured (test-mode payments count too).</EmptyNote></Panel>
  return (
    <>
      {currencies.map((cur) => {
        const c = s.currencies.find((x) => x.currency === cur)
        const m = s.mrr.find((x) => x.currency === cur)
        return (
          <section key={cur} aria-label={`${cur} revenue`} className="mb-2">
            <h2 className="font-semibold mb-2">{cur} <span className="text-xs font-normal text-slate-600">(never added to other currencies)</span></h2>
            <Stats>
              <Stat title="Gross revenue" value={c ? money(c.grossMinor, cur) : dash} sub={c ? `${int(c.paymentCount)} captured payments` : 'no payments in range'} />
              <Stat title="Refunds" value={c ? money(c.refundsMinor, cur) : dash} sub={c ? `${int(c.refundCount)} refunds · net ${money(c.netMinor, cur)}` : ''} />
              <Stat title="Failed payments" value={c ? int(c.failedCount) : dash} sub={c ? `${pct(c.failureRate)} failure rate` : ''} tone={c && c.failureRate > 0.2 ? 'bad' : undefined} />
              <Stat title="Avg order value" value={c && c.paymentCount ? money(Math.round(c.avgOrderMinor), cur) : dash} sub={c && c.payingCustomers ? `ARPPU ${money(Math.round(c.arppuMinor), cur)} · ${int(c.payingCustomers)} payers` : 'no paying customers'} />
              <Stat title="MRR (estimate)" value={m ? money(m.mrrMinor, cur) : dash} sub={m ? `${int(m.activeSubscriptions)} active subscriptions` : 'no active subscriptions'} />
              <Stat title="ARR (estimate)" value={m ? money(m.arrMinor, cur) : dash} sub="MRR × 12, yearly plans ÷ 12" />
            </Stats>
          </section>
        )
      })}
    </>
  )
}

function SeriesPanel() {
  const [bucket, setBucket] = useState<'day' | 'week' | 'month'>('day')
  const { data, error, loading } = useSection<SeriesPoint[]>('/sales/timeseries', { bucket })
  const currencies = [...new Set((data ?? []).map((p) => p.currency))].sort()
  return (
    <Panel title="Revenue over time" right={<Choice label="Group by" value={bucket} options={['day', 'week', 'month'] as const} onChange={setBucket} />} note="Captured revenue per period, charted separately for each currency.">
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : loading ? <p role="status" className="py-8 text-center text-sm text-slate-600">Loading…</p> : currencies.length === 0 ? <EmptyNote /> : currencies.map((cur) => (
        <div key={cur} className="mb-4 last:mb-0">
          <h3 className="text-sm font-semibold mb-1">{cur}</h3>
          <TimeBars label={`${cur} revenue per ${bucket}`} points={(data ?? []).filter((p) => p.currency === cur).map((p) => ({ t: p.t, v: p.revenueMinor }))} format={(n) => money(Math.round(n), cur)} />
        </div>
      ))}
    </Panel>
  )
}

function BreakdownPanel() {
  const [by, setBy] = useState<'plan' | 'interval' | 'method'>('plan')
  const { data, error, loading } = useSection<BreakdownRow[]>('/sales/breakdown', { by })
  return (
    <Panel title="Revenue breakdown" right={<Choice label="Break down by" value={by} options={['plan', 'interval', 'method'] as const} onChange={setBy} />}>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : loading ? <p role="status" className="py-8 text-center text-sm text-slate-600">Loading…</p> : (
        <DataTable rows={data ?? []} rowKey={(r) => `${r.key}${r.currency}`} empty="No captured payments in this range." columns={[
          { header: by === 'method' ? 'Payment method' : by === 'interval' ? 'Billing interval' : 'Plan', cell: (r) => <span className="capitalize">{r.key}</span> },
          { header: 'Currency', cell: (r) => r.currency },
          { header: 'Revenue', align: 'right', cell: (r) => money(r.revenueMinor, r.currency) },
          { header: 'Payments', align: 'right', cell: (r) => int(r.payments) },
          { header: 'Customers', align: 'right', cell: (r) => int(r.customers) },
        ]} />
      )}
    </Panel>
  )
}

function PaymentsPanel() {
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState<'all' | 'captured' | 'failed' | 'refunded'>('all')
  const { data, error, loading } = useSection<Payments>('/sales/payments', { limit: PAGE, offset, status: status === 'all' ? undefined : status })
  return (
    <Panel title="Recent payments" right={<Choice label="Status" value={status} options={['all', 'captured', 'failed', 'refunded'] as const} onChange={(v) => { setStatus(v); setOffset(0) }} />}>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : !data && loading ? <p role="status" className="py-8 text-center text-sm text-slate-600">Loading…</p> : (
        <>
          <DataTable rows={data?.rows ?? []} rowKey={(r) => r.id} empty="No payments in this range." columns={[
            { header: 'Customer', cell: (r) => <span className="block max-w-[220px] truncate" title={r.email ?? r.userId}>{r.email ?? r.userId}</span> },
            { header: 'Plan', cell: (r) => (r.planId ? `${r.planId}${r.interval ? ` · ${r.interval}` : ''}` : dash), className: 'capitalize' },
            { header: 'Amount', align: 'right', cell: (r) => money(r.amountMinor, r.currency) },
            { header: 'Status', cell: (r) => <Badge tone={statusTone[r.status as keyof typeof statusTone] ?? 'slate'}>{r.status}</Badge> },
            { header: 'Method', cell: (r) => r.method ?? dash },
            { header: 'Failure reason', cell: (r) => r.failureReason ?? dash },
            { header: 'Paid at', cell: (r) => dateTime(r.paidAt), className: 'whitespace-nowrap' },
          ]} />
          {data && <Pager offset={data.offset} limit={data.limit} total={data.total} onChange={setOffset} />}
        </>
      )}
    </Panel>
  )
}

function TopCustomersPanel() {
  const { data, error, loading } = useSection<TopCustomer[]>('/sales/top-customers', { limit: 10 })
  return (
    <Panel title="Top paying customers" note="Highest captured revenue in the range, per currency.">
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : loading ? <p role="status" className="py-8 text-center text-sm text-slate-600">Loading…</p> : (
        <DataTable rows={data ?? []} rowKey={(r) => `${r.userId}${r.currency}`} empty="No captured payments in this range." columns={[
          { header: 'Customer', cell: (r) => <span className="block max-w-[260px] truncate" title={r.email ?? r.userId}>{r.email ?? r.userId}</span> },
          { header: 'Revenue', align: 'right', cell: (r) => money(r.revenueMinor, r.currency) },
          { header: 'Payments', align: 'right', cell: (r) => int(r.payments) },
          { header: 'Last payment', cell: (r) => dateTime(r.lastPaidAt), className: 'whitespace-nowrap' },
        ]} />
      )}
    </Panel>
  )
}

export default function Sales() {
  const summary = useSection<Summary>('/sales/summary')
  return (
    <SectionPage title="Sales & revenue" subtitle="Money that actually moved, from captured payments. Each currency is reported on its own; refunds are never counted as revenue." error={summary.error} loading={summary.loading && !summary.data}>
      {summary.data && <SummaryPanels s={summary.data} />}
      <SeriesPanel />
      <BreakdownPanel />
      <PaymentsPanel />
      <TopCustomersPanel />
    </SectionPage>
  )
}
