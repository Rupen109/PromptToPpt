import { compact, int, pct } from '@/lib/format'
import { cost as usd } from '../currency'
import { CoverageBanner } from './CoverageBanner'
import { Badge, DataTable, EmptyNote, Panel, SectionPage, Stat, Stats, TimeBars, useSection } from '../ui'

interface Summary {
  fx: { inrPerUsd: number; note: string }
  aiCostUsd: number; aiCalls: number; imageCostUsd: number; images: number; assetCostUsd: number; assetCount: number
  revenueUsd: number; refundsUsd: number; netRevenueUsd: number; paymentCount: number
  grossMarginUsd: number; grossMarginPct: number | null; costShareOfRevenue: number | null
  credits: { granted: number; consumed: number; refunded: number; impliedCostPerCreditUsd: number | null; consumedShareOfGranted: number | null }
  sparse: { noPayments: boolean; noUsage: boolean }
}
interface PlanRow { planId: string; paid: boolean; users: number; activeUsers: number; payers: number; revenueUsd: number; aiCostUsd: number; marginUsd: number; marginPct: number | null; costPerUserUsd: number | null }
interface PerUser { users: number; activeUsers: number; aiCostUsd: number; costPerUserUsd: number | null; costPerActiveUserUsd: number | null }
interface Plans { plans: PlanRow[]; perUser: { paying: PerUser; free: PerUser } }
interface TopUser { userId: string; email: string | null; planId: string; aiCostUsd: number; calls: number; revenueUsd: number; marginUsd: number }
interface Point { t: string; aiCostUsd: number; revenueUsd: number }

const dash = '—'
const usdOr = (n: number | null) => (n === null ? dash : usd(n))
const pctOr = (n: number | null) => (n === null ? dash : pct(n))
/** signed dollars: negative margin is shown with a minus sign, not only a colour */
const signed = (n: number) => (n < 0 ? `−${usd(-n)}` : usd(n))

function Notice({ s }: { s: Summary }) {
  const msgs: string[] = []
  if (s.sparse.noPayments) msgs.push('No captured payments in this range, so revenue and margin percentages are not meaningful yet (test-mode payments count once captured).')
  if (s.sparse.noUsage) msgs.push('No AI usage recorded in this range.')
  if (msgs.length === 0) return null
  return <p role="status" className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">{msgs.join(' ')}</p>
}

function PlansPanels({ p }: { p: Plans }) {
  const row = (label: string, u: PerUser) => ({ label, ...u })
  return (
    <>
      <Panel title="Margin by plan" note="Users are grouped by their current plan; revenue and AI cost are those users' totals in the range. Free users (Starter) have cost but no revenue.">
        <DataTable rows={p.plans} rowKey={(r) => r.planId} empty="No users yet." columns={[
          { header: 'Plan', cell: (r) => <>{r.planId} {!r.paid && <Badge>free</Badge>}</>, className: 'capitalize' },
          { header: 'Users', align: 'right', cell: (r) => int(r.users) },
          { header: 'Paying in range', align: 'right', cell: (r) => int(r.payers) },
          { header: 'Revenue', align: 'right', cell: (r) => usd(r.revenueUsd) },
          { header: 'AI cost', align: 'right', cell: (r) => usd(r.aiCostUsd) },
          { header: 'Margin', align: 'right', cell: (r) => signed(r.marginUsd) },
          { header: 'Margin %', align: 'right', cell: (r) => pctOr(r.marginPct) },
        ]} />
      </Panel>
      <Panel title="AI cost per user: paying vs free" note="Average over all users on each side (including those who did nothing), and over active users only (those with AI usage in the range).">
        <DataTable rows={[row('Paying users', p.perUser.paying), row('Free users', p.perUser.free)]} rowKey={(r) => r.label} columns={[
          { header: 'Group', cell: (r) => r.label },
          { header: 'Users', align: 'right', cell: (r) => int(r.users) },
          { header: 'Active users', align: 'right', cell: (r) => int(r.activeUsers) },
          { header: 'Total AI cost', align: 'right', cell: (r) => usd(r.aiCostUsd) },
          { header: 'Per user', align: 'right', cell: (r) => usdOr(r.costPerUserUsd) },
          { header: 'Per active user', align: 'right', cell: (r) => usdOr(r.costPerActiveUserUsd) },
        ]} />
      </Panel>
    </>
  )
}

export default function Margin() {
  const summary = useSection<Summary>('/margin/summary')
  const plans = useSection<Plans>('/margin/plans')
  const top = useSection<TopUser[]>('/margin/top-users', { limit: 10 })
  const series = useSection<Point[]>('/margin/timeseries')
  const s = summary.data
  return (
    <SectionPage title="Cost & margin" subtitle="Revenue from captured payments against provider cost from the AI usage ledger." error={summary.error} loading={summary.loading && !s}>
      <CoverageBanner />
      {s && (
        <>
          <p className="text-xs text-slate-600 -mt-3 mb-5">FX assumption: {s.fx.note} Provider cost is already in USD. Gross margin = revenue − refunds − AI cost (payment-processor fees and infrastructure are not included).</p>
          <Notice s={s} />
          <Stats>
            <Stat title="Revenue" value={usd(s.revenueUsd)} sub={`${int(s.paymentCount)} captured payments · ${usd(s.refundsUsd)} refunded`} />
            <Stat title="AI provider cost" value={usd(s.aiCostUsd)} sub={`${int(s.aiCalls)} model calls`} />
            <Stat title="Gross margin" value={signed(s.grossMarginUsd)} sub={s.grossMarginPct === null ? 'no revenue to compare against' : `${pct(s.grossMarginPct)} of net revenue`} tone={s.grossMarginUsd < 0 ? 'bad' : s.grossMarginUsd > 0 ? 'good' : undefined} />
            <Stat title="Cost share of revenue" value={pctOr(s.costShareOfRevenue)} sub={s.costShareOfRevenue === null ? 'no revenue' : 'AI cost ÷ net revenue'} />
            <Stat title="Image cost" value={usd(s.imageCostUsd)} sub={`${int(s.images)} images · included in AI cost`} />
            <Stat title="Credits granted" value={compact(s.credits.granted)} sub="plan grants + top-ups" />
            <Stat title="Credits consumed" value={compact(s.credits.consumed)} sub={`net of refunds · ${s.credits.consumedShareOfGranted === null ? dash : pct(s.credits.consumedShareOfGranted)} of granted`} />
            <Stat title="Implied cost per credit" value={usdOr(s.credits.impliedCostPerCreditUsd)} sub={s.credits.impliedCostPerCreditUsd === null ? 'no credits consumed' : 'AI cost ÷ credits consumed'} />
          </Stats>
          <p className="text-xs text-slate-600 -mt-3 mb-6">Images are recorded once in the usage ledger and are part of the AI cost above; the stored-asset table reports {usd(s.assetCostUsd)} across {int(s.assetCount)} pictures as a cross-check and is not added again.</p>
        </>
      )}
      <Panel title="Cost vs revenue over time" note="Revenue (green) and AI cost (red) per day, in the display currency.">
        {series.error ? <p role="alert" className="text-sm text-red-700">{series.error}</p> : series.loading ? <p role="status" className="py-8 text-center text-sm text-slate-600">Loading…</p> : !series.data || series.data.length === 0 ? <EmptyNote /> : (
          <div className="grid gap-4 md:grid-cols-2">
            <div><h3 className="text-sm font-semibold mb-1">Revenue</h3><TimeBars label="Revenue per day" points={series.data.map((p) => ({ t: p.t, v: p.revenueUsd }))} format={usd} color="#15803D" /></div>
            <div><h3 className="text-sm font-semibold mb-1">AI cost</h3><TimeBars label="AI cost per day" points={series.data.map((p) => ({ t: p.t, v: p.aiCostUsd }))} format={usd} color="#B91C1C" /></div>
          </div>
        )}
      </Panel>
      {plans.error ? <Panel title="Margin by plan"><p role="alert" className="text-sm text-red-700">{plans.error}</p></Panel> : plans.data ? <PlansPanels p={plans.data} /> : <p role="status" className="py-6 text-center text-sm text-slate-600">Loading…</p>}
      <Panel title="Most expensive users" note="Top 10 by AI provider cost in the range, beside what they paid.">
        {top.error ? <p role="alert" className="text-sm text-red-700">{top.error}</p> : top.loading ? <p role="status" className="py-8 text-center text-sm text-slate-600">Loading…</p> : (
          <DataTable rows={top.data ?? []} rowKey={(r) => r.userId} empty="No attributed AI usage in this range." columns={[
            { header: 'User', cell: (r) => <span className="block max-w-[260px] truncate" title={r.email ?? r.userId}>{r.email ?? r.userId}</span> },
            { header: 'Plan', cell: (r) => r.planId, className: 'capitalize' },
            { header: 'Calls', align: 'right', cell: (r) => int(r.calls) },
            { header: 'AI cost', align: 'right', cell: (r) => usd(r.aiCostUsd) },
            { header: 'Revenue', align: 'right', cell: (r) => usd(r.revenueUsd) },
            { header: 'Margin', align: 'right', cell: (r) => signed(r.marginUsd) },
          ]} />
        )}
      </Panel>
    </SectionPage>
  )
}
