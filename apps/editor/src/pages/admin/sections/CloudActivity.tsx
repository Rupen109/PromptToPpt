import { api } from '@/lib/api'
import { int } from '@/lib/format'
import { Badge, DataTable, ErrorBox, Panel, Stat, Stats, dateTime } from '../ui'
import { useAsync } from '../useUsage'

interface ActionRow { action: string; calls: number; errors: number; actions: number; images: number; inputTokens: number; outputTokens: number; costInr: number; creditsNet: number; creditsRefunded: number; costInrPerAction: number | null; costInrPerCredit: number | null }
interface JobRow { jobId: string; at: string; email: string | null; status: string | null; calls: number; slides: number; images: number; costInr: number; imageCostInr: number; creditsNet: number; costInrPerSlide: number | null }
interface Stage { requestType: string; model: string; calls: number; costInr: number; share: number | null }
interface Activity { totalCostInr: number; automatedCostInr: number; checkinAt: string | null; byAction: ActionRow[]; recentJobs: JobRow[]; stages: Stage[] }
interface PlanRow { planId: string; name: string; monthlyCredits: number; priceInr: number; revenueInrPerCredit: number | null; costInrIfFullyUsed: number | null; marginInrIfFullyUsed: number | null; marginPctIfFullyUsed: number | null; costInrIfAllWorstAction: number | null; marginInrIfAllWorstAction: number | null }
interface Economics { measuredCostInrPerCredit: number | null; worstCostInrPerCredit: number | null; creditsConsumed: number; byAction: { ref: string; costInr: number; credits: number; costInrPerCredit: number | null }[]; plans: PlanRow[] }

const inr = (n: number | null, d = 2) => (n === null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: d }).format(n))
const LABEL: Record<string, string> = { deck_generation: 'Create deck from prompt', ai_edit: 'AI edit', ai_assist: 'AI assistant', image: 'Generate image', other: 'Other (no credits)', free_tools: 'Free tools (visitors, no login)', internal: 'Internal scripts (no user)' }
const tone = (n: number | null) => (n === null ? undefined : n >= 0 ? 'good' : 'bad') as 'good' | 'bad' | undefined

/** What each kind of action cost us since the last balance reading, and whether each plan stays profitable when its credits are used. */
export default function CloudActivity({ rev }: { rev: number }) {
  const act = useAsync(() => api.admin.get<Activity>('/margin/activity'), `act${rev}`)
  const eco = useAsync(() => api.admin.get<Economics>('/margin/plan-economics'), `eco${rev}`)
  const a = act.data, e = eco.data
  return (
    <>
      <Panel title="Cost per action" note={a?.checkinAt ? `Everything since your last reading (${dateTime(a.checkinAt)}), real user actions only; automated-test accounts cost ${inr(a.automatedCostInr)} (counted in the reconciliation above, not here).` : 'All time, real user actions only.'}>
        {act.error && <ErrorBox message={act.error} />}
        {a && (
          <DataTable rows={a.byAction.filter((r) => r.calls > 0 || r.actions > 0)} rowKey={(r) => r.action} columns={[
            { header: 'Action', cell: (r) => LABEL[r.action] ?? r.action }, { header: 'Done', cell: (r) => int(r.actions), align: 'right' },
            { header: 'Model calls', cell: (r) => `${int(r.calls)}${r.errors ? ` (${int(r.errors)} failed)` : ''}`, align: 'right' },
            { header: 'Tokens in / out', cell: (r) => `${int(r.inputTokens)} / ${int(r.outputTokens)}`, align: 'right' },
            { header: 'Our cost', cell: (r) => inr(r.costInr), align: 'right' }, { header: 'Per action', cell: (r) => inr(r.costInrPerAction), align: 'right' },
            { header: 'Credits charged (net)', cell: (r) => int(r.creditsNet), align: 'right' }, { header: 'Cost / credit', cell: (r) => inr(r.costInrPerCredit, 3), align: 'right' },
          ]} />
        )}
      </Panel>

      <Panel title="Profitability by plan" note="Price per month against our measured provider cost if the customer spends the whole credit grant. 'Blended' uses the real mix of actions so far; 'worst' assumes every credit goes on the most expensive action.">
        {eco.error && <ErrorBox message={eco.error} />}
        {e && (
          <>
            <Stats>
              <Stat title="Blended cost / credit" value={inr(e.measuredCostInrPerCredit, 3)} sub={`${int(e.creditsConsumed)} credits consumed so far`} />
              <Stat title="Worst-case cost / credit" value={inr(e.worstCostInrPerCredit, 3)} sub="most expensive action type" />
              {e.plans.filter((p) => p.priceInr > 0).map((p) => <Stat key={p.planId} title={`${p.name} revenue / credit`} value={inr(p.revenueInrPerCredit, 3)} sub={p.revenueInrPerCredit !== null && e.measuredCostInrPerCredit !== null ? (p.revenueInrPerCredit > e.measuredCostInrPerCredit ? 'above blended cost' : 'BELOW blended cost') : ''} tone={p.revenueInrPerCredit !== null && e.measuredCostInrPerCredit !== null ? (p.revenueInrPerCredit > e.measuredCostInrPerCredit ? 'good' : 'bad') : undefined} />)}
            </Stats>
            <DataTable rows={e.plans} rowKey={(p) => p.planId} columns={[
              { header: 'Plan', cell: (p) => p.name }, { header: 'Price / month', cell: (p) => inr(p.priceInr, 0), align: 'right' }, { header: 'Credits', cell: (p) => int(p.monthlyCredits), align: 'right' },
              { header: 'Cost if fully used (blended)', cell: (p) => inr(p.costInrIfFullyUsed, 0), align: 'right' },
              { header: 'Margin (blended)', cell: (p) => <Badge tone={p.marginInrIfFullyUsed === null ? 'slate' : p.marginInrIfFullyUsed >= 0 ? 'green' : 'red'}>{inr(p.marginInrIfFullyUsed, 0)}</Badge>, align: 'right' },
              { header: 'Margin (worst)', cell: (p) => <Badge tone={tone(p.marginInrIfAllWorstAction) === 'bad' ? 'red' : 'green'}>{inr(p.marginInrIfAllWorstAction, 0)}</Badge>, align: 'right' },
            ]} />
            <p className="text-xs text-slate-600 mt-3">Free plan has no revenue: its cost is a marketing spend. Most subscribers never use every credit, so blended margin on a fully used plan is the cautious case.</p>
          </>
        )}
      </Panel>

      <Panel title="Recent deck creations" note="One row per prompt-to-deck run: every model call it made, summed.">
        {a && <DataTable rows={a.recentJobs} rowKey={(j) => j.jobId} empty="No deck creations yet." columns={[
          { header: 'When', cell: (j) => dateTime(j.at) }, { header: 'User', cell: (j) => j.email ?? '—', className: 'max-w-[220px] truncate' },
          { header: 'Slides', cell: (j) => int(j.slides), align: 'right' }, { header: 'Calls', cell: (j) => int(j.calls), align: 'right' },
          { header: 'Our cost', cell: (j) => inr(j.costInr), align: 'right' }, { header: 'Per slide', cell: (j) => inr(j.costInrPerSlide, 3), align: 'right' },
          { header: 'Images', cell: (j) => `${int(j.images)} (${inr(j.imageCostInr)})`, align: 'right' }, { header: 'Credits', cell: (j) => int(j.creditsNet), align: 'right' },
        ]} />}
      </Panel>

      <Panel title="Where the money goes" note="Provider cost by request type and model.">
        {a && <DataTable rows={a.stages} rowKey={(s) => s.requestType + s.model} columns={[
          { header: 'Request', cell: (s) => s.requestType }, { header: 'Model', cell: (s) => s.model }, { header: 'Calls', cell: (s) => int(s.calls), align: 'right' },
          { header: 'Cost', cell: (s) => inr(s.costInr), align: 'right' }, { header: 'Share', cell: (s) => (s.share === null ? '—' : `${(s.share * 100).toFixed(0)}%`), align: 'right' },
        ]} />}
      </Panel>
    </>
  )
}
