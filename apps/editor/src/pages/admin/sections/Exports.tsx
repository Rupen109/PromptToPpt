import { useState } from 'react'
import { compact, int, ms, pct } from '@/lib/format'
import { ShareBars } from '../charts'
import { Badge, DataTable, EmptyNote, Panel, SectionPage, Stat, Stats, TimeBars, dateTime, useSection } from '../ui'
import { useFilters } from '../useUsage'
import { Pager, label, type Paged } from './productKit'

interface Summary { total: number; success: number; failed: number; abandoned: number; inProgress: number; successRate: number; failureRate: number; abandonedRate: number; avgDurationMs: number; p95DurationMs: number; avgBytes: number; avgSlides: number; activeUsers: number; decks: number }
interface Point { t: string; total: number; success: number; failed: number; abandoned: number }
interface Group { key: string; total: number; success: number; failed: number; abandoned: number; successRate: number; avgDurationMs: number; p95DurationMs: number; avgBytes: number; avgSlides: number }
interface ErrorRow { message: string; count: number; formats: string[]; lastAt: string }
interface SlideBucket { bucket: string; exports: number }
interface TopUser { userId: string; email: string | null; plan: string; exports: number; failed: number }
interface Recent { id: string; email: string | null; presentationId: string; format: string; mode: string; status: string; bytes: number | null; durationMs: number | null; error: string | null; createdAt: string }

const bytes = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} KB` : `${int(n)} B`)
const MODE: Record<string, string> = { server: 'Server', client: 'Browser' }
const STATUS: Record<string, { text: string; tone: 'green' | 'red' | 'amber' | 'slate' }> = { success: { text: 'Success', tone: 'green' }, failed: { text: 'Failed', tone: 'red' }, abandoned: { text: 'Abandoned', tone: 'amber' }, started: { text: 'In progress', tone: 'slate' } }
const FILTERS = ['', 'success', 'failed', 'abandoned', 'started'] as const

function RecentExports() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<(typeof FILTERS)[number]>('')
  const r = useSection<Paged<Recent>>('/exports/recent', { page, pageSize: 15, status: status || undefined })
  return (
    <Panel title="Recent exports" right={
      <label className="text-sm flex items-center gap-2">Status
        <select className="border border-border rounded-lg px-2 py-1 bg-white" value={status} onChange={(e) => { setStatus(e.target.value as (typeof FILTERS)[number]); setPage(1) }}>
          {FILTERS.map((f) => <option key={f} value={f}>{f ? STATUS[f]!.text : 'All'}</option>)}
        </select>
      </label>
    }>
      {r.error ? <p role="alert" className="text-sm text-red-700">{r.error}</p> : r.loading && !r.data ? <p role="status" className="text-sm text-slate-600">Loading…</p> : r.data && (
        <>
          <DataTable rows={r.data.rows} rowKey={(x) => x.id} empty="No exports match." columns={[
            { header: 'When', cell: (x) => dateTime(x.createdAt) },
            { header: 'User', cell: (x) => x.email ?? 'deleted user', className: 'max-w-[200px] truncate' },
            { header: 'Deck', cell: (x) => <code className="text-xs" title={x.presentationId}>{x.presentationId.slice(0, 8)}</code> },
            { header: 'Format', cell: (x) => x.format.toUpperCase() },
            { header: 'Where', cell: (x) => MODE[x.mode] ?? x.mode },
            { header: 'Status', cell: (x) => <Badge tone={STATUS[x.status]?.tone}>{STATUS[x.status]?.text ?? x.status}</Badge> },
            { header: 'Size', cell: (x) => (x.bytes === null ? '—' : bytes(x.bytes)), align: 'right' },
            { header: 'Duration', cell: (x) => (x.durationMs === null ? '—' : ms(x.durationMs)), align: 'right' },
            { header: 'Error', cell: (x) => (x.error ? <span title={x.error}>{x.error}</span> : '—'), className: 'max-w-[240px] truncate' },
          ]} />
          {r.data.total > 0 && <Pager page={page} pageSize={r.data.pageSize} total={r.data.total} onPage={setPage} label="Recent exports" />}
        </>
      )}
    </Panel>
  )
}

export default function Exports() {
  const { filters } = useFilters()
  const summary = useSection<Summary>('/exports/summary')
  const series = useSection<Point[]>('/exports/timeseries')
  const formats = useSection<Group[]>('/exports/breakdown', { by: 'format' })
  const modes = useSection<Group[]>('/exports/breakdown', { by: 'mode' })
  const plans = useSection<Group[]>('/exports/breakdown', { by: 'plan' })
  const errors = useSection<ErrorRow[]>('/exports/errors', { limit: 10 })
  const slides = useSection<SlideBucket[]>('/exports/slides')
  const top = useSection<TopUser[]>('/exports/top-users', { limit: 10 })
  const s = summary.data

  return (
    <SectionPage title="Exports" subtitle="Which formats people export, how reliably, and how long it takes." error={summary.error ?? series.error} loading={summary.loading && !s}>
      <p className="text-xs text-slate-600 -mt-3 mb-5">PPTX is built on the server and its numbers are exact. PDF, PNG, JPG and HTML are rendered in the browser and report back, so an export still &quot;started&quot; after 15 minutes means the user closed the tab; those are shown as abandoned. Rates exclude exports still in progress. Plans are each user&apos;s current plan.</p>
      {s && (
        <>
          <Stats>
            <Stat title="Exports" value={int(s.total)} sub={`${int(s.activeUsers)} users · ${int(s.decks)} decks`} />
            <Stat title="Success rate" value={pct(s.successRate)} sub={`${int(s.success)} succeeded`} tone={s.total > 0 && s.successRate >= 0.95 ? 'good' : s.total > 0 && s.successRate < 0.8 ? 'bad' : undefined} />
            <Stat title="Failure rate" value={pct(s.failureRate)} sub={`${int(s.failed)} reported a failure`} tone={s.failureRate > 0.05 ? 'bad' : undefined} />
            <Stat title="Abandoned" value={int(s.abandoned)} sub={`${pct(s.abandonedRate)} of finished · ${int(s.inProgress)} in progress`} />
            <Stat title="Average duration" value={ms(s.avgDurationMs)} sub="Successful exports" />
            <Stat title="p95 duration" value={ms(s.p95DurationMs)} sub="Successful exports" />
            <Stat title="Average file size" value={bytes(s.avgBytes)} sub="Successful exports" />
            <Stat title="Slides per export" value={s.avgSlides.toFixed(1)} sub="Average, where reported" />
          </Stats>

          <Panel title="Exports per day"><TimeBars points={(series.data ?? []).map((p) => ({ t: p.t, v: p.total }))} format={compact} label="Exports per day" /></Panel>

          <Panel title="By format" note="Duration and size are for successful exports only.">
            {formats.error ? <p role="alert" className="text-sm text-red-700">{formats.error}</p> : (
              <DataTable rows={formats.data ?? []} rowKey={(g) => g.key} columns={[
                { header: 'Format', cell: (g) => g.key.toUpperCase() },
                { header: 'Exports', cell: (g) => int(g.total), align: 'right' },
                { header: 'Success', cell: (g) => pct(g.successRate), align: 'right' },
                { header: 'Failed', cell: (g) => int(g.failed), align: 'right' },
                { header: 'Abandoned', cell: (g) => int(g.abandoned), align: 'right' },
                { header: 'Avg duration', cell: (g) => ms(g.avgDurationMs), align: 'right' },
                { header: 'p95 duration', cell: (g) => ms(g.p95DurationMs), align: 'right' },
                { header: 'Avg size', cell: (g) => bytes(g.avgBytes), align: 'right' },
              ]} />
            )}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Server vs browser">
              {modes.error ? <p role="alert" className="text-sm text-red-700">{modes.error}</p> : <ShareBars rows={(modes.data ?? []).map((g) => ({ key: g.key, label: `${MODE[g.key] ?? g.key} (${pct(g.successRate)} success)`, value: g.total }))} format={(n) => int(n)} />}
            </Panel>
            <Panel title="By user plan">
              {plans.error ? <p role="alert" className="text-sm text-red-700">{plans.error}</p> : <ShareBars rows={(plans.data ?? []).map((g) => ({ key: g.key, label: label(g.key), value: g.total }))} format={(n) => int(n)} />}
            </Panel>
            <Panel title="Slides per export">
              {slides.error ? <p role="alert" className="text-sm text-red-700">{slides.error}</p> : slides.data?.length ? <ShareBars rows={slides.data.map((b) => ({ key: b.bucket, label: `${b.bucket} slides`, value: b.exports }))} format={(n) => int(n)} /> : <EmptyNote />}
            </Panel>
            <Panel title="Top users">
              {top.error ? <p role="alert" className="text-sm text-red-700">{top.error}</p> : (
                <DataTable rows={top.data ?? []} rowKey={(u) => u.userId} columns={[
                  { header: 'User', cell: (u) => u.email ?? 'deleted user', className: 'max-w-[220px] truncate' },
                  { header: 'Plan', cell: (u) => label(u.plan) },
                  { header: 'Exports', cell: (u) => int(u.exports), align: 'right' },
                  { header: 'Failed', cell: (u) => int(u.failed), align: 'right' },
                ]} />
              )}
            </Panel>
          </div>

          <Panel title="Top error messages" note="Failures reported by the exporter, grouped by message.">
            {errors.error ? <p role="alert" className="text-sm text-red-700">{errors.error}</p> : (
              <DataTable rows={errors.data ?? []} rowKey={(e) => e.message} empty="No failed exports with an error message." columns={[
                { header: 'Error', cell: (e) => e.message, className: 'max-w-[420px] break-words' },
                { header: 'Formats', cell: (e) => e.formats.map((f) => f.toUpperCase()).join(', ') },
                { header: 'Count', cell: (e) => int(e.count), align: 'right' },
                { header: 'Last seen', cell: (e) => dateTime(e.lastAt) },
              ]} />
            )}
          </Panel>

          <RecentExports key={filters.from ?? 'all'} />
        </>
      )}
    </SectionPage>
  )
}
