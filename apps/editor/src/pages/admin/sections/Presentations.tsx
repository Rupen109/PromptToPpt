import { useState } from 'react'
import { compact, int, pct } from '@/lib/format'
import { ShareBars } from '../charts'
import { Badge, DataTable, EmptyNote, Panel, SectionPage, Stat, Stats, TimeBars, dateTime, useSection } from '../ui'
import { useFilters } from '../useUsage'
import { Pager, label, type Paged } from './productKit'

interface Summary { created: number; live: number; deleted: number; creators: number; allTimeLive: number; allTimeDeleted: number; avgSlides: number; avgRevision: number; editedDecks: number; editedShare: number; versionsSaved: number }
interface Point { t: string; decks: number }
interface Bucket { key: string; decks: number }
interface Composition { aspectRatio: Bucket[]; source: Bucket[]; headingFonts: Bucket[]; revisions: Bucket[]; versionsBySource: Bucket[]; decksPerUser: Bucket[] }
interface Templates { total: number; top: { id: string; name: string; category: string; categoryName: string; decks: number }[]; categories: { category: string; name: string; decks: number }[] }
interface TopUser { userId: string; email: string | null; decks: number; revisions: number; lastActiveAt: string }
interface Recent { id: string; title: string; email: string | null; slides: number; source: string; createdAt: string; updatedAt: string }

const SOURCE: Record<string, string> = { ai: 'AI prompt', template: 'Template', blank: 'Blank' }
const SOURCE_TONE: Record<string, 'blue' | 'green' | 'slate'> = { ai: 'blue', template: 'green', blank: 'slate' }
const VERSION_BY: Record<string, string> = { generation: 'AI generation', user: 'Manual edit', ai_edit: 'AI edit' }

const Bars = ({ rows, error, name = (k: string) => k, unit = 'decks' }: { rows?: Bucket[]; error?: string | null; name?: (k: string) => string; unit?: string }) =>
  error ? <p role="alert" className="text-sm text-red-700">{error}</p> : rows?.length ? <ShareBars rows={rows.map((b) => ({ key: b.key, label: name(b.key), value: b.decks }))} format={(n) => `${int(n)} ${unit}`} /> : <EmptyNote />

function RecentDecks() {
  const [page, setPage] = useState(1)
  const r = useSection<Paged<Recent>>('/presentations/recent', { page, pageSize: 15 })
  return (
    <Panel title="Recent presentations" note="Live decks only, newest first.">
      {r.error ? <p role="alert" className="text-sm text-red-700">{r.error}</p> : r.loading && !r.data ? <p role="status" className="text-sm text-slate-600">Loading…</p> : r.data && (
        <>
          <DataTable rows={r.data.rows} rowKey={(x) => x.id} empty="No presentations created in this range." columns={[
            { header: 'Title', cell: (x) => <span title={x.title}>{x.title}</span>, className: 'max-w-[260px] truncate' },
            { header: 'Owner', cell: (x) => x.email ?? 'deleted user', className: 'max-w-[200px] truncate' },
            { header: 'Slides', cell: (x) => int(x.slides), align: 'right' },
            { header: 'Source', cell: (x) => <Badge tone={SOURCE_TONE[x.source]}>{SOURCE[x.source] ?? x.source}</Badge> },
            { header: 'Created', cell: (x) => dateTime(x.createdAt) },
            { header: 'Updated', cell: (x) => dateTime(x.updatedAt) },
          ]} />
          {r.data.total > 0 && <Pager page={page} pageSize={r.data.pageSize} total={r.data.total} onPage={setPage} label="Recent presentations" />}
        </>
      )}
    </Panel>
  )
}

export default function Presentations() {
  const { filters } = useFilters()
  const summary = useSection<Summary>('/presentations/summary')
  const series = useSection<Point[]>('/presentations/timeseries')
  const comp = useSection<Composition>('/presentations/composition')
  const templates = useSection<Templates>('/presentations/templates', { limit: 10 })
  const top = useSection<TopUser[]>('/presentations/top-users', { limit: 10 })
  const s = summary.data

  return (
    <SectionPage title="Presentations" subtitle="What people create: volume, how decks start, which templates win and how much they are edited." error={summary.error ?? series.error} loading={summary.loading && !s}>
      <p className="text-xs text-slate-600 -mt-3 mb-5">Counts use decks created in the selected range; content figures (slides, source, templates, fonts, aspect ratio) cover live decks only and read each deck&apos;s latest saved version. Creation source is derived: a deck with an AI generation job is &quot;AI prompt&quot;; otherwise a deck whose theme names a template is &quot;Template&quot;; everything else is &quot;Blank&quot;. A deck generated with a template selected counts as AI prompt.</p>
      {s && (
        <>
          <Stats>
            <Stat title="Decks created" value={int(s.created)} sub={`${int(s.creators)} creators`} />
            <Stat title="Live vs deleted" value={`${int(s.live)} / ${int(s.deleted)}`} sub={`All time: ${int(s.allTimeLive)} live, ${int(s.allTimeDeleted)} deleted`} />
            <Stat title="Average slides" value={s.avgSlides.toFixed(1)} sub="Per live deck" />
            <Stat title="Edited after creation" value={pct(s.editedShare)} sub={`${int(s.editedDecks)} decks · avg ${s.avgRevision.toFixed(1)} saves`} />
          </Stats>

          <Panel title="Decks created per day"><TimeBars points={(series.data ?? []).map((p) => ({ t: p.t, v: p.decks }))} format={compact} label="Decks created per day" /></Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="How decks start" note="AI prompt, template or blank (rule above)."><Bars rows={comp.data?.source} error={comp.error} name={(k) => SOURCE[k] ?? k} /></Panel>
            <Panel title="Aspect ratio"><Bars rows={comp.data?.aspectRatio} error={comp.error} /></Panel>
            <Panel title="Top templates" note={templates.data ? `${int(templates.data.total)} live decks carry a template.` : undefined}>
              {templates.error ? <p role="alert" className="text-sm text-red-700">{templates.error}</p> : (
                <DataTable rows={templates.data?.top ?? []} rowKey={(t) => t.id} empty="No template decks in this range." columns={[
                  { header: 'Template', cell: (t) => t.name },
                  { header: 'Category', cell: (t) => t.categoryName },
                  { header: 'Decks', cell: (t) => int(t.decks), align: 'right' },
                ]} />
              )}
            </Panel>
            <Panel title="Template categories"><Bars rows={templates.data?.categories.map((c) => ({ key: c.category, decks: c.decks }))} error={templates.error} name={(k) => templates.data?.categories.find((c) => c.category === k)?.name ?? k} /></Panel>
            <Panel title="Decks per user" note="All users, by live decks created in this range."><Bars rows={comp.data?.decksPerUser} error={comp.error} name={(k) => `${k} decks`} unit="users" /></Panel>
            <Panel title="Editing activity" note="Saves per deck (1 = never edited after creation)."><Bars rows={comp.data?.revisions} error={comp.error} /></Panel>
            <Panel title="Versions saved by" note={`${int(s.versionsSaved)} versions written in this range.`}><Bars rows={comp.data?.versionsBySource} error={comp.error} name={(k) => VERSION_BY[k] ?? label(k)} unit="versions" /></Panel>
            <Panel title="Heading fonts"><Bars rows={comp.data?.headingFonts} error={comp.error} /></Panel>
          </div>

          <Panel title="Most active users" note="By live decks created in this range.">
            {top.error ? <p role="alert" className="text-sm text-red-700">{top.error}</p> : (
              <DataTable rows={top.data ?? []} rowKey={(u) => u.userId} columns={[
                { header: 'User', cell: (u) => u.email ?? 'deleted user', className: 'max-w-[260px] truncate' },
                { header: 'Decks', cell: (u) => int(u.decks), align: 'right' },
                { header: 'Total saves', cell: (u) => int(u.revisions), align: 'right' },
                { header: 'Last activity', cell: (u) => dateTime(u.lastActiveAt) },
              ]} />
            )}
          </Panel>

          <RecentDecks key={filters.from ?? 'all'} />
        </>
      )}
    </SectionPage>
  )
}
