import { useState } from 'react'
import { int, pct } from '@/lib/format'
import { ShareBars } from '../charts'
import { Badge, DataTable, EmptyNote, Panel, SectionPage, Stat, Stats, TimeBars, dateTime, useSection } from '../ui'

interface Dist { key: string; count: number }
interface Overview {
  jobs: number; users: number; completed: number; failed: number; cancelled: number; completionRate: number
  funnel: { key: string; label: string; count: number; rateFromPrevious: number | null }[]
  status: Dist[]; language: Dist[]; tone: Dist[]; audience: Dist[]; topic: Dist[]; objective: Dist[]; mode: Dist[]; sources: Dist[]; model: Dist[]; theme: Dist[]; slideCount: Dist[]
}
interface UseCases { sampled: number; total: number; capped: boolean; useCases: { key: string; count: number; share: number }[]; perDay: { t: string; total: number; byUseCase: Record<string, number> }[] }
interface Keywords { sampled: number; total: number; capped: boolean; keywords: { term: string; count: number }[]; phrases: { term: string; count: number }[] }
interface Recent { page: number; pageSize: number; total: number; rows: { id: string; createdAt: string; status: string; prompt: string; truncated: boolean; country: string | null; user: string; useCase: string }[] }

const rows = (d: Dist[]) => d.map((x) => ({ key: x.key, label: x.key, value: x.count }))
const USE_CASE_LABELS: Record<string, string> = { pitch: 'Pitch & Investors', sales: 'Sales & Proposals', marketing: 'Marketing & Campaigns', strategy: 'Business & Strategy', product: 'Product & Roadmap', tech: 'Technology & Architecture', reports: 'Reports & Analytics', education: 'Education & Training', 'case-studies': 'Case Studies & Consulting', team: 'Team & HR', other: 'Other' }
const statusTone = (s: string) => (s === 'completed' ? 'green' : s === 'failed' ? 'red' : s === 'cancelled' ? 'amber' : 'blue')

function Dists({ title, data, note }: { title: string; data: Dist[]; note?: string }) {
  return <Panel title={title} note={note}>{data.length ? <ShareBars rows={rows(data)} format={int} /> : <EmptyNote />}</Panel>
}

export default function Prompts() {
  const ov = useSection<Overview>('/prompts/overview')
  const uc = useSection<UseCases>('/prompts/use-cases')
  const kw = useSection<Keywords>('/prompts/keywords')
  const [page, setPage] = useState(1)
  const [pick, setPick] = useState('all')
  const recent = useSection<Recent>('/prompts/recent', { page, pageSize: 20 })
  const o = ov.data

  const series = (uc.data?.perDay ?? []).map((d) => ({ t: d.t, v: pick === 'all' ? d.total : (d.byUseCase[pick] ?? 0) }))
  const pages = recent.data ? Math.max(1, Math.ceil(recent.data.total / recent.data.pageSize)) : 1
  const err = ov.error ?? uc.error ?? kw.error ?? recent.error

  return (
    <SectionPage title="Prompts & use cases" subtitle="What people ask the product to build, and how far requests get." error={err} loading={ov.loading && !o}>
      <p className="text-xs text-slate-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
        <strong>Privacy:</strong> prompts are personal data. This page shows aggregates, and the table at the bottom shows only the first 140 characters of each prompt with the user&apos;s country and an anonymous
        hash. Names and emails are never shown. Use-case and keyword figures are computed over the most recent {int(uc.data?.sampled ?? 5000)} prompts in the range.
      </p>
      {o && (
        <>
          <Stats>
            <Stat title="Jobs created" value={int(o.jobs)} sub={`${int(o.users)} people`} />
            <Stat title="Completed" value={int(o.completed)} sub={`${pct(o.completionRate)} of jobs`} tone="good" />
            <Stat title="Failed" value={int(o.failed)} tone={o.failed ? 'bad' : undefined} />
            <Stat title="Cancelled" value={int(o.cancelled)} />
          </Stats>

          <Panel title="Conversion funnel" note="Prompt analysed (AI call) → job created → job completed. Analysis and job counts come from different tables, so a step can exceed 100% (retries, or jobs created without analysis).">
            <ol className="grid gap-3 sm:grid-cols-3">
              {o.funnel.map((f) => (
                <li key={f.key} className="border border-border rounded-lg p-3">
                  <div className="text-xs font-semibold text-slate-600">{f.label}</div>
                  <div className="text-xl font-bold tabular-nums">{int(f.count)}</div>
                  <div className="text-xs text-slate-600">{f.rateFromPrevious === null ? 'Start of funnel' : `${pct(f.rateFromPrevious)} of previous step`}</div>
                </li>
              ))}
            </ol>
          </Panel>

          <div className="grid gap-x-6 lg:grid-cols-2">
            <Panel title="Use cases" note={uc.data?.capped ? `Keyword classifier over the latest ${int(uc.data.sampled)} of ${int(uc.data.total)} prompts.` : 'Transparent keyword classifier: the category with the most distinct keyword hits wins; no hit means Other.'}>
              {uc.data && uc.data.useCases.some((u) => u.count) ? <ShareBars rows={uc.data.useCases.map((u) => ({ key: u.key, label: `${USE_CASE_LABELS[u.key] ?? u.key} (${pct(u.share)})`, value: u.count }))} format={int} /> : <EmptyNote />}
            </Panel>
            <Panel title="Use cases per day" right={
              <label className="text-sm flex items-center gap-2">Use case
                <select value={pick} onChange={(e) => setPick(e.target.value)} className="border border-border rounded-lg px-2 py-1 text-sm bg-white">
                  <option value="all">All</option>
                  {Object.entries(USE_CASE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>}>
              <TimeBars points={series} format={int} label={`Prompts per day: ${pick}`} />
            </Panel>
          </div>

          <div className="grid gap-x-6 lg:grid-cols-2">
            <Panel title="Top keywords" note="Stop words removed; each prompt counts a term once.">
              {kw.data && kw.data.keywords.length ? <ShareBars rows={kw.data.keywords.slice(0, 15).map((k) => ({ key: k.term, label: k.term, value: k.count }))} format={int} /> : <EmptyNote />}
            </Panel>
            <Panel title="Top phrases" note="Two-word phrases seen in at least two prompts.">
              {kw.data && kw.data.phrases.length ? <ShareBars rows={kw.data.phrases.slice(0, 15).map((k) => ({ key: k.term, label: k.term, value: k.count }))} format={int} /> : <EmptyNote>No phrase appears in two or more prompts yet.</EmptyNote>}
            </Panel>
          </div>

          <div className="grid gap-x-6 lg:grid-cols-2">
            <Dists title="Requested slide count" data={o.slideCount} note="Auto = no count requested." />
            <Dists title="Broad vs specific" data={o.mode} note="Broad = the person picked one of the suggested directions; specific = they went straight to generation." />
            <Dists title="Language" data={o.language} />
            <Dists title="Tone" data={o.tone} />
            <Dists title="Audience" data={o.audience} />
            <Dists title="Objective" data={o.objective} />
            <Dists title="Topic" data={o.topic} />
            <Dists title="Sources attached" data={o.sources} />
            <Dists title="Model" data={o.model} />
            <Dists title="Theme" data={o.theme} />
            <Dists title="Outcome" data={o.status} />
          </div>
        </>
      )}

      <Panel title="Recent prompts (excerpts)" note="Truncated to 140 characters. Identified only by country and an anonymous hash.">
        <DataTable
          rows={recent.data?.rows ?? []}
          rowKey={(r) => r.id}
          empty="No prompts in this range."
          columns={[
            { header: 'When', cell: (r) => <span className="whitespace-nowrap">{dateTime(r.createdAt)}</span> },
            { header: 'Prompt', cell: (r) => <span title={r.truncated ? 'Truncated' : undefined}>{r.prompt}</span>, className: 'max-w-[420px]' },
            { header: 'Use case', cell: (r) => USE_CASE_LABELS[r.useCase] ?? r.useCase },
            { header: 'Status', cell: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
            { header: 'Country', cell: (r) => r.country ?? 'unknown' },
            { header: 'User hash', cell: (r) => <code className="text-xs">{r.user}</code> },
          ]}
        />
        {recent.data && recent.data.total > recent.data.pageSize && (
          <nav aria-label="Recent prompts pages" className="flex items-center justify-between mt-3 text-sm">
            <span className="text-slate-600">Page {int(page)} of {int(pages)} ({int(recent.data.total)} prompts)</span>
            <span className="flex gap-2">
              <button className="px-3 py-1 border border-border rounded-lg disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <button className="px-3 py-1 border border-border rounded-lg disabled:opacity-40" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </span>
          </nav>
        )}
      </Panel>
    </SectionPage>
  )
}
