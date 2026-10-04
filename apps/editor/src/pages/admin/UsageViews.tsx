import { useMemo } from 'react'
import type { UsageDimension, UsageRow } from '@prompttoppt/api-client'
import { api } from '@/lib/api'
import { compact, int, ms, pct } from '@/lib/format'
import { cost as usd } from './currency'
import { Empty, Legend, ShareBars, TokenBars } from './charts'
import { Filters } from './Filters'
import { CoverageBanner } from './sections/CoverageBanner'
import { useAsync, useFilters } from './useUsage'

const Card = ({ title, value, sub }: { title: string; value: string; sub?: string }) => (
  <div className="bg-white border border-border rounded-xl p-4">
    <div className="text-xs font-semibold text-slate-500">{title}</div>
    <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
    {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
  </div>
)
const Panel = ({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) => (
  <section className="bg-white border border-border rounded-xl p-5 mb-6">
    <div className="flex items-center justify-between mb-3"><h2 className="font-semibold">{title}</h2>{right}</div>
    {children}
  </section>
)
const ErrorBox = ({ message }: { message: string }) => <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">{message}</p>

function Table({ rows, keyLabel }: { rows: UsageRow[]; keyLabel: string }) {
  if (rows.length === 0) return <Empty />
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-slate-500 border-b border-border">{[keyLabel, 'Calls', 'Input', 'Output', 'Reasoning', 'Total tokens', 'Cost', 'Failed', 'Avg latency'].map((h, i) => <th key={h} className={`py-2 pr-4 font-semibold ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-slate-100 last:border-0">
              <td className="py-2 pr-4 max-w-[280px] truncate" title={r.label ?? r.key}>{r.label ?? r.key}</td>
              {[int(r.calls), compact(r.inputTokens), compact(r.outputTokens), compact(r.reasoningTokens), compact(r.totalTokens), usd(r.costUsd), int(r.failed), ms(r.avgLatencyMs)].map((v, i) => <td key={i} className="py-2 pr-4 text-right tabular-nums">{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function useData(dim: UsageDimension | null, limit = 20) {
  const { filters } = useFilters()
  const key = JSON.stringify(filters)
  const summary = useAsync(() => api.admin.summary(filters), `s${key}`)
  const series = useAsync(() => api.admin.timeseries(filters, filters.from && Date.now() - new Date(filters.from).getTime() <= 2 * 864e5 ? 'hour' : 'day'), `t${key}`)
  const rows = useAsync(() => (dim ? api.admin.breakdown(filters, dim, limit) : Promise.resolve([] as UsageRow[])), `b${dim}${limit}${key}`)
  const models = useAsync(() => api.admin.breakdown({}, 'model', 100), 'models')
  const providers = useAsync(() => api.admin.breakdown({}, 'provider', 20), 'providers')
  return { filters, summary, series, rows, modelNames: useMemo(() => models.data?.map((m) => m.key) ?? [], [models.data]), providerNames: useMemo(() => providers.data?.map((m) => m.key) ?? [], [providers.data]) }
}

function Header({ title, subtitle, d }: { title: string; subtitle: string; d: ReturnType<typeof useData> }) {
  return (
    <>
      <h1 className="font-heading font-bold text-2xl">{title}</h1>
      <p className="text-slate-600 text-sm mb-5">{subtitle}</p>
      <CoverageBanner />
      <Filters models={d.modelNames} providers={d.providerNames} />
      {(d.summary.error || d.rows.error) && <ErrorBox message={d.summary.error ?? d.rows.error ?? ''} />}
    </>
  )
}

const SeriesPanel = ({ d }: { d: ReturnType<typeof useData> }) => (
  <Panel title="Token usage over time" right={<Legend />}>
    {d.series.loading ? <p className="py-10 text-center text-sm text-slate-500">Loading…</p> : <TokenBars bucket={d.series.data && d.series.data.length > 0 && d.series.data[0] && d.series.data[1] && new Date(d.series.data[1].t).getTime() - new Date(d.series.data[0].t).getTime() < 864e5 ? 'hour' : 'day'} points={(d.series.data ?? []).map((p) => ({ t: p.t, input: p.inputTokens, output: p.outputTokens, reasoning: p.reasoningTokens }))} />}
  </Panel>
)

export function Overview() {
  const d = useData('model', 8)
  const s = d.summary.data
  return (
    <>
      <Header title="Overview" subtitle="Worldwide AI usage from the immutable usage ledger (all users, all environments unless filtered)." d={d} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card title="Total tokens" value={s ? compact(s.totalTokens) : '—'} sub={s ? `${compact(s.inputTokens)} in · ${compact(s.outputTokens)} out · ${compact(s.reasoningTokens)} reasoning` : ''} />
        <Card title="Model calls" value={s ? int(s.calls) : '—'} sub={s ? `${pct(s.failureRate)} failed` : ''} />
        <Card title="AI cost" value={s ? usd(s.costUsd) : '—'} sub={s && s.reportedCalls ? `${usd(s.reportedCostUsd)} provider-reported on ${int(s.reportedCalls)} calls` : 'computed from pricing snapshots'} />
        <Card title="Active users" value={s ? int(s.activeUsers) : '—'} sub={s ? `${int(s.jobs)} generation jobs` : ''} />
        <Card title="Avg tokens / job" value={s ? compact(s.avgTokensPerJob) : '—'} />
        <Card title="Cost / job" value={s ? usd(s.costPerJobUsd) : '—'} />
        <Card title="Latency p50 / p95" value={s ? `${ms(s.p50LatencyMs)} / ${ms(s.p95LatencyMs)}` : '—'} />
        <Card title="Cached tokens" value={s ? compact(s.cachedTokens) : '—'} sub="included in input" />
      </div>
      <SeriesPanel d={d} />
      <Panel title="Top models by tokens"><ShareBars rows={(d.rows.data ?? []).map((r) => ({ key: r.key, label: r.key, value: r.totalTokens }))} format={compact} /></Panel>
    </>
  )
}

export function Tokens() {
  const d = useData('requestType')
  const users = useAsync(() => api.admin.breakdown(d.filters, 'user', 20), `u${JSON.stringify(d.filters)}`)
  return (
    <>
      <Header title="Tokens" subtitle="Input, output, cached and reasoning tokens — total and by who/what consumed them." d={d} />
      <SeriesPanel d={d} />
      <Panel title="By request type"><Table rows={d.rows.data ?? []} keyLabel="Request type" /></Panel>
      <Panel title="Top 20 users by tokens"><Table rows={users.data ?? []} keyLabel="User" /></Panel>
    </>
  )
}

export function Models() {
  const d = useData('model', 50)
  const providers = useAsync(() => api.admin.breakdown(d.filters, 'provider', 10), `p${JSON.stringify(d.filters)}`)
  return (
    <>
      <Header title="Models" subtitle="Which models users choose, what they consume, and what they cost us." d={d} />
      <Panel title="Spend by model"><ShareBars rows={(d.rows.data ?? []).map((r) => ({ key: r.key, label: r.key, value: r.costUsd }))} format={usd} /></Panel>
      <Panel title="All models"><Table rows={d.rows.data ?? []} keyLabel="Model" /></Panel>
      <Panel title="By provider"><Table rows={providers.data ?? []} keyLabel="Provider" /></Panel>
    </>
  )
}

export function Users() {
  const d = useData('user', 20)
  return (
    <>
      <Header title="Users" subtitle="Top 20 users by token usage." d={d} />
      <Panel title="Top users"><Table rows={d.rows.data ?? []} keyLabel="User" /></Panel>
    </>
  )
}

export function Countries() {
  const d = useData('country', 30)
  return (
    <>
      <Header title="Countries" subtitle="Usage by signup country (from our edge's trusted header; 'unknown' when unavailable)." d={d} />
      <Panel title="By country"><Table rows={d.rows.data ?? []} keyLabel="Country" /></Panel>
    </>
  )
}

export function Errors() {
  const d = useData('model', 30)
  const { filters } = d
  const failing = { ...filters, status: 'error' as const }
  const byModel = useAsync(() => api.admin.breakdown(failing, 'model', 20), `em${JSON.stringify(failing)}`)
  const byType = useAsync(() => api.admin.breakdown(failing, 'requestType', 20), `et${JSON.stringify(failing)}`)
  return (
    <>
      <Header title="Errors & failed generations" subtitle="Failed model calls (retries and fallbacks each count as a call)." d={d} />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <Card title="Failed calls" value={d.summary.data ? int(d.summary.data.failedCalls) : '—'} />
        <Card title="Failure rate" value={d.summary.data ? pct(d.summary.data.failureRate) : '—'} />
        <Card title="Total calls" value={d.summary.data ? int(d.summary.data.calls) : '—'} />
      </div>
      <Panel title="Failures by model"><Table rows={byModel.data ?? []} keyLabel="Model" /></Panel>
      <Panel title="Failures by request type"><Table rows={byType.data ?? []} keyLabel="Request type" /></Panel>
    </>
  )
}
