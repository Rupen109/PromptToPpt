import { useState } from 'react'
import { compact, int, pct } from '@/lib/format'
import { cost as usd } from '../currency'
import { ShareBars } from '../charts'
import { Badge, DataTable, EmptyNote, Panel, SectionPage, Stat, Stats, TimeBars, dateTime, useSection } from '../ui'
import { useFilters } from '../useUsage'
import { Pager, label, type Paged } from './productKit'

interface Summary { ready: number; pending: number; stalePending: number; deleted: number; failed: number; ledgerAttempts: number; ledgerImages: number; failureRate: number; costUsd: number; avgCostUsd: number; storageBytes: number; liveStorageBytes: number; avgBytes: number; activeUsers: number; decksWithImages: number; imagesPerDeck: number }
interface Point { t: string; images: number; costUsd: number; bytes: number }
interface Group { key: string; images: number; costUsd: number; avgCostUsd: number; bytes: number; users: number }
interface DeckBucket { bucket: string; decks: number }
interface TopUser { userId: string; email: string | null; plan: string; images: number; costUsd: number }
interface Quota { threshold: number; usersWithImages: number; atLimit: number; nearLimit: number; users: { userId: string; email: string | null; plan: string; used: number; limit: number; ratio: number }[] }
interface Recent { id: string; email: string | null; model: string; prompt: string; costUsd: number; bytes: number; createdAt: string; deleted: boolean }

const bytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} KB` : `${int(n)} B`)

function RecentImages() {
  const [page, setPage] = useState(1)
  const r = useSection<Paged<Recent>>('/images/recent', { page, pageSize: 15 })
  return (
    <Panel title="Recent images" note="Prompts are truncated to 120 characters. Thumbnails are intentionally not shown.">
      {r.error ? <p role="alert" className="text-sm text-red-700">{r.error}</p> : r.loading && !r.data ? <p role="status" className="text-sm text-slate-600">Loading…</p> : r.data && (
        <>
          <DataTable rows={r.data.rows} rowKey={(x) => x.id} empty="No images generated in this range." columns={[
            { header: 'When', cell: (x) => dateTime(x.createdAt) },
            { header: 'User', cell: (x) => x.email ?? 'deleted user', className: 'max-w-[200px] truncate' },
            { header: 'Model', cell: (x) => x.model },
            { header: 'Prompt', cell: (x) => <span title={x.prompt}>{x.prompt}</span>, className: 'max-w-[320px] truncate' },
            { header: 'Cost', cell: (x) => usd(x.costUsd), align: 'right' },
            { header: 'Size', cell: (x) => bytes(x.bytes), align: 'right' },
            { header: 'State', cell: (x) => (x.deleted ? <Badge tone="amber">Deleted by user</Badge> : <Badge tone="green">Live</Badge>) },
          ]} />
          {r.data.total > 0 && <Pager page={page} pageSize={r.data.pageSize} total={r.data.total} onPage={setPage} label="Recent images" />}
        </>
      )}
    </Panel>
  )
}

export default function Images() {
  const { filters } = useFilters()
  const summary = useSection<Summary>('/images/summary')
  const series = useSection<Point[]>('/images/timeseries')
  const models = useSection<Group[]>('/images/breakdown', { by: 'model' })
  const plans = useSection<Group[]>('/images/breakdown', { by: 'plan' })
  const perDeck = useSection<DeckBucket[]>('/images/per-deck')
  const top = useSection<TopUser[]>('/images/top-users', { limit: 10 })
  const quota = useSection<Quota>('/images/quota', { threshold: 0.8 })
  const s = summary.data
  const error = summary.error ?? series.error

  return (
    <SectionPage title="Images" subtitle="AI picture generation: volume, cost, storage and who is hitting their limits." error={error} loading={summary.loading && !s}>
      {s && (
        <>
          <Stats>
            <Stat title="Images generated" value={int(s.ready)} sub={`${int(s.activeUsers)} users · ${int(s.decksWithImages)} decks`} />
            <Stat title="Provider cost" value={usd(s.costUsd)} sub={`${usd(s.avgCostUsd)} average per image`} />
            <Stat title="Storage" value={bytes(s.storageBytes)} sub={`${bytes(s.liveStorageBytes)} still live · ${bytes(s.avgBytes)} average`} />
            <Stat title="Failed attempts" value={int(s.failed)} sub={`${pct(s.failureRate)} of ${int(s.ledgerAttempts)} ledger attempts (not charged)`} tone={s.failureRate > 0.1 ? 'bad' : undefined} />
            <Stat title="In progress" value={int(s.pending)} sub="Reserved, model still running" />
            <Stat title="Stuck pending" value={int(s.stalePending)} sub="Reserved over 5 minutes ago" tone={s.stalePending > 0 ? 'bad' : undefined} />
            <Stat title="Deleted by users" value={int(s.deleted)} sub={s.ready ? `${pct(s.deleted / s.ready)} of generated` : undefined} />
            <Stat title="Images per deck" value={s.imagesPerDeck.toFixed(1)} sub="Among decks with at least one image" />
          </Stats>
          <p className="text-xs text-slate-600 -mt-3 mb-6">Failed generations remove their reserved row and refund credits, so failures are counted from the AI usage ledger. Plans shown are each user&apos;s current plan.</p>

          <Panel title="Images per day"><TimeBars points={(series.data ?? []).map((p) => ({ t: p.t, v: p.images }))} format={compact} label="Images generated per day" /></Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="By model"><GroupTable rows={models.data ?? []} error={models.error} first="Model" /></Panel>
            <Panel title="By user plan"><GroupTable rows={plans.data ?? []} error={plans.error} first="Plan" format={label} /></Panel>
            <Panel title="Images per presentation" note="Decks grouped by how many AI images they have.">
              {perDeck.error ? <p role="alert" className="text-sm text-red-700">{perDeck.error}</p> : perDeck.data?.length ? <ShareBars rows={perDeck.data.map((b) => ({ key: b.bucket, label: `${b.bucket} images`, value: b.decks }))} format={(n) => `${int(n)} decks`} /> : <EmptyNote />}
            </Panel>
            <Panel title="Top users" note="By images generated in this range.">
              {top.error ? <p role="alert" className="text-sm text-red-700">{top.error}</p> : (
                <DataTable rows={top.data ?? []} rowKey={(u) => u.userId} columns={[
                  { header: 'User', cell: (u) => u.email ?? 'deleted user', className: 'max-w-[220px] truncate' },
                  { header: 'Plan', cell: (u) => label(u.plan) },
                  { header: 'Images', cell: (u) => int(u.images), align: 'right' },
                  { header: 'Cost', cell: (u) => usd(u.costUsd), align: 'right' },
                ]} />
              )}
            </Panel>
          </div>

          <Panel title="Quota pressure" note={`Current allowance period (not the date range). Showing users at or above ${pct(quota.data?.threshold ?? 0.8)} of their plan's monthly image limit.`}>
            {quota.error ? <p role="alert" className="text-sm text-red-700">{quota.error}</p> : quota.data && (
              <>
                <p className="text-sm text-slate-700 mb-3"><strong className="tabular-nums">{int(quota.data.atLimit)}</strong> at the limit · <strong className="tabular-nums">{int(quota.data.nearLimit)}</strong> near it · {int(quota.data.usersWithImages)} users generated images this period</p>
                <DataTable rows={quota.data.users} rowKey={(u) => u.userId} empty="Nobody is near their image limit." columns={[
                  { header: 'User', cell: (u) => u.email ?? 'deleted user', className: 'max-w-[240px] truncate' },
                  { header: 'Plan', cell: (u) => label(u.plan) },
                  { header: 'Used', cell: (u) => `${int(u.used)} / ${int(u.limit)}`, align: 'right' },
                  { header: 'Status', cell: (u) => (u.ratio >= 1 ? <Badge tone="red">At limit · {pct(u.ratio)}</Badge> : <Badge tone="amber">Near limit · {pct(u.ratio)}</Badge>) },
                ]} />
              </>
            )}
          </Panel>

          <RecentImages key={filters.from ?? 'all'} />
        </>
      )}
    </SectionPage>
  )
}

function GroupTable({ rows, error, first, format = (k) => k }: { rows: Group[]; error: string | null; first: string; format?: (k: string) => string }) {
  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>
  return (
    <DataTable rows={rows} rowKey={(g) => g.key} columns={[
      { header: first, cell: (g) => format(g.key), className: 'max-w-[220px] truncate' },
      { header: 'Images', cell: (g) => int(g.images), align: 'right' },
      { header: 'Cost', cell: (g) => usd(g.costUsd), align: 'right' },
      { header: 'Avg cost', cell: (g) => usd(g.avgCostUsd), align: 'right' },
      { header: 'Users', cell: (g) => int(g.users), align: 'right' },
    ]} />
  )
}
