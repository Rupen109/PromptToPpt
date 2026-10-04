import { int, ms, pct } from '@/lib/format'
import { useFilters } from '../useUsage'
import { Badge, DataTable, EmptyNote, Panel, SectionPage, Stat, Stats, dateTime, useSection } from '../ui'

interface Pcts { p50: number; p90: number; p95: number; p99: number }
interface Group extends Pcts { key: string; calls: number; failed: number; errorRate: number }
interface Overview {
  health: { status: 'ok' | 'degraded' | 'down'; reasons: string[]; rules: { degradedErrorRate: number; downErrorRate: number; degradedP95Ms: number; minCalls: number; stuckMinutes: number } }
  calls: number; failed: number; errorRate: number; latency: Pcts
  byModel: Group[]; byRequestType: Group[]
  topErrors: { code: string; count: number; lastAt: string; share: number }[]
  slowest: { id: string; model: string; requestType: string; latencyMs: number; status: string; createdAt: string }[]
}
interface Point { t: string; calls: number; failed: number; errorRate: number; p50: number; p95: number }
interface Generation { completedJobs: number; duration: Pcts; bySlideCount: (Pcts & { key: string; jobs: number })[]; exports: (Pcts & { format: string; count: number; failed: number })[] }
interface Queue { queued: number; running: number; stuck: number; failedLast24h: number; oldestQueuedSeconds: number; retries: number; stuckMinutes: number }

const VERDICT = { ok: { label: 'OK', tone: 'green' }, degraded: { label: 'Degraded', tone: 'amber' }, down: { label: 'Down', tone: 'red' } } as const

/** Two-series line chart (p50 solid, p95 dashed, so the series differ by more than colour). Values live in <title>s. */
function LineChart({ points, label }: { points: Point[]; label: string }) {
  const W = 900, H = 240, pad = { l: 56, r: 12, t: 10, b: 26 }
  if (points.length === 0) return <EmptyNote />
  const max = Math.max(1, ...points.map((p) => Math.max(p.p50, p.p95)))
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b
  const x = (i: number) => pad.l + (points.length === 1 ? iw / 2 : (iw / (points.length - 1)) * i)
  const y = (v: number) => pad.t + ih - (v / max) * ih
  const path = (k: 'p50' | 'p95') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ')
  const every = Math.ceil(points.length / 10)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}, ${points.length} periods`} className="w-full h-auto">
        {[0, 0.5, 1].map((f) => (<g key={f}><line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="#E2E8F0" /><text x={pad.l - 8} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill="#475569">{ms(max * f)}</text></g>))}
        <path d={path('p50')} fill="none" stroke="#0B3DD0" strokeWidth="2" />
        <path d={path('p95')} fill="none" stroke="#FF5722" strokeWidth="2" strokeDasharray="6 4" />
        {points.map((p, i) => (
          <g key={p.t}>
            <title>{`${new Date(p.t).toLocaleString()}: p50 ${ms(p.p50)}, p95 ${ms(p.p95)}, ${int(p.calls)} calls`}</title>
            <circle cx={x(i)} cy={y(p.p50)} r="3" fill="#0B3DD0" />
            <circle cx={x(i)} cy={y(p.p95)} r="3" fill="#FF5722" />
            {i % every === 0 && <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#475569">{new Date(p.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>}
          </g>
        ))}
      </svg>
      <p className="text-xs text-slate-600 flex gap-4"><span><span className="inline-block w-5 border-t-2 border-[#0B3DD0] align-middle mr-1" />p50 (solid)</span><span><span className="inline-block w-5 border-t-2 border-dashed border-[#FF5722] align-middle mr-1" />p95 (dashed)</span></p>
    </div>
  )
}

const pctCols = <T extends Pcts>() => [
  { header: 'p50', cell: (r: T) => ms(r.p50), align: 'right' as const },
  { header: 'p90', cell: (r: T) => ms(r.p90), align: 'right' as const },
  { header: 'p95', cell: (r: T) => ms(r.p95), align: 'right' as const },
  { header: 'p99', cell: (r: T) => ms(r.p99), align: 'right' as const },
]
const groupCols = (first: string) => [
  { header: first, cell: (r: Group) => r.key },
  { header: 'Calls', cell: (r: Group) => int(r.calls), align: 'right' as const },
  ...pctCols<Group>(),
  { header: 'Error rate', cell: (r: Group) => pct(r.errorRate), align: 'right' as const },
]
const secs = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${s}s`)

export default function Performance() {
  const ov = useSection<Overview>('/performance/overview')
  const { range } = useFilters()
  const ts = useSection<Point[]>('/performance/timeseries', { bucket: range === 'today' ? 'hour' : 'day' })
  const gen = useSection<Generation>('/performance/generation')
  const q = useSection<Queue>('/performance/queue')
  const o = ov.data, qu = q.data
  const v = o ? VERDICT[o.health.status] : null
  const r = o?.health.rules
  const err = ov.error ?? ts.error ?? gen.error ?? q.error

  return (
    <SectionPage title="Performance" subtitle="AI latency, errors, generation speed and queue health." error={err} loading={ov.loading && !o}>
      {o && v && r && (
        <>
          <Panel title="Health verdict" right={<Badge tone={v.tone}>{v.label}</Badge>}>
            <p className="text-sm mb-2">{o.health.reasons.length ? o.health.reasons.join('; ') + '.' : o.calls === 0 ? 'No AI calls in this range, so nothing is wrong that we can see.' : 'All checks are within limits.'}</p>
            <p className="text-xs text-slate-600">
              Rule: <strong>Down</strong> if the error rate is above {pct(r.downErrorRate)} (with at least {r.minCalls} calls). <strong>Degraded</strong> if the error rate is above {pct(r.degradedErrorRate)}, or p95 latency is above {ms(r.degradedP95Ms)},
              or any job has been stuck more than {r.stuckMinutes} minutes. Otherwise <strong>OK</strong>. Evaluated over the selected date range.
            </p>
          </Panel>

          <Stats>
            <Stat title="AI calls" value={int(o.calls)} sub={`${int(o.failed)} failed`} />
            <Stat title="Error rate" value={pct(o.errorRate)} tone={o.errorRate > r.degradedErrorRate ? 'bad' : undefined} />
            <Stat title="p50 latency" value={ms(o.latency.p50)} sub={`p90 ${ms(o.latency.p90)}`} />
            <Stat title="p95 / p99 latency" value={ms(o.latency.p95)} sub={`p99 ${ms(o.latency.p99)}`} tone={o.latency.p95 > r.degradedP95Ms ? 'bad' : undefined} />
          </Stats>

          <Panel title="Queue health (right now)" note={`Live state, not limited to the date range. Stuck = not finished and not updated for ${r.stuckMinutes} minutes. Retries counts jobs created in the range with more than one attempt.`}>
            {qu ? (
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
                <Stat title="Queued" value={int(qu.queued)} sub={qu.queued ? `oldest waiting ${secs(qu.oldestQueuedSeconds)}` : undefined} />
                <Stat title="Running" value={int(qu.running)} />
                <Stat title="Stuck" value={int(qu.stuck)} tone={qu.stuck ? 'bad' : 'good'} sub={qu.stuck ? 'needs attention' : 'none'} />
                <Stat title="Failed, last 24h" value={int(qu.failedLast24h)} tone={qu.failedLast24h ? 'bad' : undefined} />
                <Stat title="Retried jobs" value={int(qu.retries)} />
              </div>
            ) : <EmptyNote>Queue status unavailable.</EmptyNote>}
          </Panel>

          <Panel title="Latency over time" note="p50 and p95 of AI call latency per period.">
            <LineChart points={ts.data ?? []} label="AI latency p50 and p95" />
          </Panel>

          <Panel title="Error rate over time">
            {ts.data && ts.data.length ? (
              <DataTable rows={ts.data} rowKey={(p) => p.t} columns={[
                { header: 'Period', cell: (p) => dateTime(p.t) },
                { header: 'Calls', cell: (p) => int(p.calls), align: 'right' },
                { header: 'Failed', cell: (p) => int(p.failed), align: 'right' },
                { header: 'Error rate', cell: (p) => <>{pct(p.errorRate)} {p.errorRate > r.degradedErrorRate && <Badge tone="red">High</Badge>}</>, align: 'right' },
              ]} />
            ) : <EmptyNote />}
          </Panel>

          <Panel title="Top error codes">
            <DataTable rows={o.topErrors} rowKey={(e) => e.code} empty="No errors in this range." columns={[
              { header: 'Code', cell: (e) => <code>{e.code}</code> },
              { header: 'Count', cell: (e) => int(e.count), align: 'right' },
              { header: 'Share of errors', cell: (e) => pct(e.share), align: 'right' },
              { header: 'Last seen', cell: (e) => dateTime(e.lastAt) },
            ]} />
          </Panel>

          <Panel title="Latency by model"><DataTable rows={o.byModel} rowKey={(g) => g.key} columns={groupCols('Model')} /></Panel>
          <Panel title="Latency by request type"><DataTable rows={o.byRequestType} rowKey={(g) => g.key} columns={groupCols('Request type')} /></Panel>
        </>
      )}

      {gen.data && (
        <>
          <Panel title="Generation end to end" note={`Job created to last update, completed jobs only (${int(gen.data.completedJobs)} in range).`}>
            {gen.data.completedJobs === 0 ? <EmptyNote>No completed generations in this range.</EmptyNote> : (
              <>
                <Stats>
                  <Stat title="p50" value={ms(gen.data.duration.p50)} />
                  <Stat title="p90" value={ms(gen.data.duration.p90)} />
                  <Stat title="p95" value={ms(gen.data.duration.p95)} />
                  <Stat title="p99" value={ms(gen.data.duration.p99)} />
                </Stats>
                <DataTable rows={gen.data.bySlideCount} rowKey={(b) => b.key} columns={[{ header: 'Slide count', cell: (b) => b.key }, { header: 'Jobs', cell: (b) => int(b.jobs), align: 'right' }, ...pctCols<Pcts & { key: string; jobs: number }>()]} />
              </>
            )}
          </Panel>
          <Panel title="Export duration by format">
            <DataTable rows={gen.data.exports} rowKey={(e) => e.format} empty="No timed exports in this range." columns={[{ header: 'Format', cell: (e) => e.format }, { header: 'Exports', cell: (e) => int(e.count), align: 'right' }, { header: 'Failed', cell: (e) => int(e.failed), align: 'right' }, ...pctCols<Pcts & { format: string; count: number; failed: number }>()]} />
          </Panel>
        </>
      )}

      {o && (
        <Panel title="Slowest 20 AI calls" note="Model, type and timing only. No prompts or user data.">
          <DataTable rows={o.slowest} rowKey={(s) => s.id} columns={[
            { header: 'Model', cell: (s) => s.model },
            { header: 'Type', cell: (s) => s.requestType },
            { header: 'Latency', cell: (s) => ms(s.latencyMs), align: 'right' },
            { header: 'Status', cell: (s) => <Badge tone={s.status === 'success' ? 'green' : 'red'}>{s.status}</Badge> },
            { header: 'When', cell: (s) => dateTime(s.createdAt) },
          ]} />
        </Panel>
      )}
    </SectionPage>
  )
}
