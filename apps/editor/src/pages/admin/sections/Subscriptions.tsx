import { useEffect, useState } from 'react'
import { int, pct } from '@/lib/format'
import { Badge, DataTable, EmptyNote, Panel, SectionPage, Stat, Stats, TimeBars, dateTime, money, useSection } from '../ui'

const STATUSES = ['active', 'trialing', 'past_due', 'cancelled', 'incomplete'] as const
type Status = (typeof STATUSES)[number]
interface Summary {
  plans: { planId: string; counts: Record<Status, number>; total: number }[]
  users: { total: number; paid: number; free: number; paidShare: number }
  newSubscriptions: number; cancellations: number; cancelAtPeriodEnd: number
  churn: { openingSubscriptions: number; churned: number; rate: number | null }
  renewals: { currency: string; next7: number; next30: number; amount7Minor: number; amount30Minor: number }[]
  conversion: { signups: number; converted: number; rate: number | null }
}
interface SeriesPoint { t: string; created: number; cancelled: number }
interface Row { id: string; userId: string; email: string; name: string; planId: string; status: string; interval: string; currency: string; currentPeriodEnd: string; provider: string; cancelAtPeriodEnd: boolean }
interface List { total: number; limit: number; offset: number; rows: Row[] }

const PAGE = 15
const dash = '—'
const rate = (n: number | null) => (n === null ? dash : pct(n))
const statusTone: Record<string, 'green' | 'blue' | 'amber' | 'red' | 'slate'> = { active: 'green', trialing: 'blue', past_due: 'amber', cancelled: 'red', incomplete: 'slate' }
const label = (s: string) => s.replace('_', ' ')

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

function SeriesPanel() {
  const [bucket, setBucket] = useState<'day' | 'week' | 'month'>('day')
  const { data, error, loading } = useSection<SeriesPoint[]>('/subscriptions/timeseries', { bucket })
  return (
    <Panel title="New vs cancelled over time" note="Cancellations are dated by the subscription's last change, since only the current state is stored."
      right={<div role="group" aria-label="Group by" className="inline-flex rounded-lg border border-border overflow-hidden bg-white text-sm">{(['day', 'week', 'month'] as const).map((b) => <button key={b} onClick={() => setBucket(b)} aria-pressed={bucket === b} className={`px-3 py-1 capitalize ${bucket === b ? 'bg-foreground text-white' : 'hover:bg-slate-50'}`}>{b}</button>)}</div>}>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : loading ? <p role="status" className="py-8 text-center text-sm text-slate-600">Loading…</p> : !data || data.length === 0 ? <EmptyNote /> : (
        <div className="grid gap-4 md:grid-cols-2">
          <div><h3 className="text-sm font-semibold mb-1">New subscriptions</h3><TimeBars label={`New subscriptions per ${bucket}`} points={data.map((p) => ({ t: p.t, v: p.created }))} format={int} color="#15803D" /></div>
          <div><h3 className="text-sm font-semibold mb-1">Cancellations</h3><TimeBars label={`Cancellations per ${bucket}`} points={data.map((p) => ({ t: p.t, v: p.cancelled }))} format={int} color="#B91C1C" /></div>
        </div>
      )}
    </Panel>
  )
}

function ListPanel() {
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    const id = setTimeout(() => { setQ(input.trim()); setOffset(0) }, 300)
    return () => clearTimeout(id)
  }, [input])
  const { data, error, loading } = useSection<List>('/subscriptions/list', { q: q || undefined, status: status || undefined, cancelling: cancelling ? 'true' : undefined, limit: PAGE, offset })
  return (
    <Panel title="Subscriptions" right={
      <div className="flex items-center gap-3 flex-wrap text-sm">
        <label className="flex items-center gap-1.5"><span className="sr-only">Search email or name</span><input type="search" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search email or name" maxLength={100} className="border border-border rounded-lg px-3 py-1 w-56" /></label>
        <label className="flex items-center gap-1.5">Status<select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0) }} className="border border-border rounded-lg px-2 py-1 bg-white"><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={cancelling} onChange={(e) => { setCancelling(e.target.checked); setOffset(0) }} />Cancelling only</label>
      </div>
    }>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : !data && loading ? <p role="status" className="py-8 text-center text-sm text-slate-600">Loading…</p> : (
        <>
          <DataTable rows={data?.rows ?? []} rowKey={(r) => r.id} empty="No subscriptions match." columns={[
            { header: 'User', cell: (r) => <span className="block max-w-[240px] truncate" title={`${r.name} <${r.email}>`}>{r.email}<span className="block text-xs text-slate-600 truncate">{r.name}</span></span> },
            { header: 'Plan', cell: (r) => r.planId, className: 'capitalize' },
            { header: 'Status', cell: (r) => <Badge tone={statusTone[r.status] ?? 'slate'}>{label(r.status)}</Badge> },
            { header: 'Interval', cell: (r) => r.interval },
            { header: 'Currency', cell: (r) => r.currency },
            { header: 'Period end', cell: (r) => dateTime(r.currentPeriodEnd), className: 'whitespace-nowrap' },
            { header: 'Provider', cell: (r) => r.provider },
            { header: 'Cancels at period end', cell: (r) => (r.cancelAtPeriodEnd ? <Badge tone="amber">Yes</Badge> : 'No') },
          ]} />
          {data && <Pager offset={data.offset} limit={data.limit} total={data.total} onChange={setOffset} />}
        </>
      )}
    </Panel>
  )
}

export default function Subscriptions() {
  const { data: s, error, loading } = useSection<Summary>('/subscriptions/summary')
  return (
    <SectionPage title="Subscriptions" subtitle="Who is on which plan, how that is changing, and what renews next." error={error} loading={loading && !s}>
      {s && (
        <>
          <Stats>
            <Stat title="Paid users" value={int(s.users.paid)} sub={`${pct(s.users.paidShare)} of ${int(s.users.total)} users · ${int(s.users.free)} free`} />
            <Stat title="New subscriptions" value={int(s.newSubscriptions)} sub="created in range" />
            <Stat title="Cancellations" value={int(s.cancellations)} sub={`cancelled or set to cancel · ${int(s.cancelAtPeriodEnd)} cancelling now`} tone={s.cancellations > s.newSubscriptions ? 'bad' : undefined} />
            <Stat title="Churn (estimate)" value={rate(s.churn.rate)} sub={s.churn.openingSubscriptions ? `${int(s.churn.churned)} of ${int(s.churn.openingSubscriptions)} subscriptions at range start` : 'no subscriptions at range start'} />
            <Stat title="Signup → paid" value={rate(s.conversion.rate)} sub={s.conversion.signups ? `${int(s.conversion.converted)} of ${int(s.conversion.signups)} signups in range` : 'no signups in range'} />
            <Stat title="Renewals in 7 days" value={int(s.renewals.reduce((a, r) => a + r.next7, 0))} sub="active, not cancelling" />
            <Stat title="Renewals in 30 days" value={int(s.renewals.reduce((a, r) => a + r.next30, 0))} sub="active, not cancelling" />
          </Stats>
          <Panel title="Subscriptions by plan and status" note="Current state of every subscription (not limited to the date range). Users with no subscription are on the free Starter plan.">
            <DataTable rows={s.plans} rowKey={(p) => p.planId} empty="No subscriptions yet." columns={[
              { header: 'Plan', cell: (p) => p.planId, className: 'capitalize' },
              ...STATUSES.map((st) => ({ header: label(st), align: 'right' as const, cell: (p: Summary['plans'][number]) => int(p.counts[st]) })),
              { header: 'Total', align: 'right', cell: (p) => int(p.total) },
            ]} />
          </Panel>
          <Panel title="Upcoming renewals" note="Active subscriptions that will renew (not set to cancel), per currency; amounts use current list prices.">
            <DataTable rows={s.renewals} rowKey={(r) => r.currency} empty="No renewals due in the next 30 days." columns={[
              { header: 'Currency', cell: (r) => r.currency },
              { header: 'Next 7 days', align: 'right', cell: (r) => `${int(r.next7)} · ${money(r.amount7Minor, r.currency)}` },
              { header: 'Next 30 days', align: 'right', cell: (r) => `${int(r.next30)} · ${money(r.amount30Minor, r.currency)}` },
            ]} />
          </Panel>
        </>
      )}
      <SeriesPanel />
      <ListPanel />
    </SectionPage>
  )
}
