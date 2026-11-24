import { MORPH_TEMPLATES } from '@prompttoppt/theme/morph-templates'
import { int, pct } from '@/lib/format'
import { Badge, DataTable, EmptyNote, Panel, SectionPage, Stat, Stats, dateTime, useSection } from '../ui'

interface Summary { total: number; template: number; custom: number; started: number; followed: number; switched: number; choseAi: number; choseTemplateAnyway: number; avgConfidence: number }
interface TemplateRow { id: string; recommended: number; used: number }
interface Unmatched { byCategory: { category: string; n: number }[]; recent: { topic: string; category: string | null; language: string; reason: string; createdAt: string }[] }

const nameOf = (id: string) => MORPH_TEMPLATES.find((t) => t.id === id)?.name ?? id

/** Owner section: how Morph decks are matched to topics. The "no template fits" list is what to build next. No names, emails or ids are shown. */
export default function Morph() {
  const summary = useSection<Summary>('/morph/summary')
  const templates = useSection<TemplateRow[]>('/morph/templates')
  const unmatched = useSection<Unmatched>('/morph/unmatched', { limit: 40 })
  const s = summary.data
  return (
    <SectionPage title="Morph matches" subtitle="Which designed Morph template is recommended for a topic, whether people take it, and the topics that have no template." error={summary.error} loading={summary.loading && !s}>
      {s && (
        <>
          <Stats>
            <Stat title="Matches asked" value={int(s.total)} sub="Each time someone chose “Best match for my topic”" />
            <Stat title="A template fit" value={s.total ? pct(s.template / s.total) : '—'} sub={`${int(s.template)} templates · ${int(s.custom)} custom`} />
            <Stat title="Recommendation taken" value={s.started ? pct(s.followed / s.started) : '—'} sub={`${int(s.followed)} of ${int(s.started)} decks started`} />
            <Stat title="Switched template" value={int(s.switched)} sub="Started with a different template" />
            <Stat title="Chose AI-planned" value={int(s.choseAi)} sub="Had a recommendation, built the generic deck" />
            <Stat title="Average confidence" value={s.template ? s.avgConfidence.toFixed(2) : '—'} sub="Of the template recommendations" />
          </Stats>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Templates" note="How often each was recommended, and how often a deck was started from it (by any route).">
              {templates.error ? <p role="alert" className="text-sm text-red-700">{templates.error}</p> : (
                <DataTable rows={templates.data ?? []} rowKey={(t) => t.id} empty="No matches in this range." columns={[
                  { header: 'Template', cell: (t) => nameOf(t.id) },
                  { header: 'Recommended', cell: (t) => int(t.recommended), align: 'right' },
                  { header: 'Started', cell: (t) => int(t.used), align: 'right' },
                ]} />
              )}
            </Panel>
            <Panel title="No template fits: by deck type" note="Custom decisions, grouped by the category the topic was understood as. The biggest group is the next template to build.">
              {unmatched.error ? <p role="alert" className="text-sm text-red-700">{unmatched.error}</p> : unmatched.data?.byCategory.length ? (
                <DataTable rows={unmatched.data.byCategory} rowKey={(c) => c.category} columns={[
                  { header: 'Category', cell: (c) => c.category },
                  { header: 'Custom decks', cell: (c) => int(c.n), align: 'right' },
                ]} />
              ) : <EmptyNote>Every topic in this range had a template.</EmptyNote>}
            </Panel>
          </div>
          <Panel title="Recent topics with no template" note="A 140-character excerpt of the topic, never who asked.">
            {unmatched.error ? null : (
              <DataTable rows={unmatched.data?.recent ?? []} rowKey={(r) => r.createdAt + r.topic} empty="Nothing yet." columns={[
                { header: 'When', cell: (r) => dateTime(r.createdAt) },
                { header: 'Topic', cell: (r) => <span title={r.topic}>{r.topic}</span>, className: 'max-w-[320px] truncate' },
                { header: 'Type', cell: (r) => (r.category ? <Badge tone="blue">{r.category}</Badge> : <Badge tone="amber">unknown</Badge>) },
                { header: 'Language', cell: (r) => r.language },
                { header: 'Why', cell: (r) => <span title={r.reason}>{r.reason}</span>, className: 'max-w-[320px] truncate' },
              ]} />
            )}
          </Panel>
        </>
      )}
    </SectionPage>
  )
}
