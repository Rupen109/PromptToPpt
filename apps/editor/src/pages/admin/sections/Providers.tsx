import { compact, int, ms, pct } from '@/lib/format'
import { cost as usd } from '../currency'
import { Badge, DataTable, EmptyNote, Panel, SectionPage, Stat, Stats, dateTime, useSection } from '../ui'

interface CatalogRow { id: string; model: string; displayName: string; kind: string; accessTier: string; enabled: boolean; environments: string[]; pricingVerifiedOn: string; snapshotAgeDays: number | null; pricingStale: boolean }
interface Card {
  provider: string; configured: boolean; active: boolean
  calls: number; successRate: number; errorRate: number; failed: number; avgLatencyMs: number; p95LatencyMs: number
  costUsd: number; reportedCostUsd: number; reportedCalls: number
  reconciliation: { comparable: boolean; delta: number; deltaPct: number; flagged: boolean }
  tokens: number; images: number; lastSuccessAt: string | null; lastError: { code: string; at: string | null } | null
  modelsUsed: { model: string; calls: number; failed: number; costUsd: number }[]
  catalog: CatalogRow[]; enabledModels: number; disabledModels: number; stalePricingModels: number
}
interface Integrations {
  ai: { active: string; configured: boolean; configuredProviders: string[]; mock: boolean; imagesEnabled: boolean }
  imageStorage: { driver: string; configured: boolean }
  payments: { provider: string; configured: boolean; mode: 'test' | 'live' | null; internationalEnabled: boolean; webhookConfigured: boolean }
  email: { provider: string | null; configured: boolean; note: string }
  googleSignIn: { configured: boolean }
  microsoftSignIn: { configured: boolean }
  environment: string
}
interface Data { staleAfterDays: number; reconcileTolerance: number; providers: Card[]; integrations: Integrations }

const YesNo = ({ yes, yesText = 'Yes', noText = 'No' }: { yes: boolean; yesText?: string; noText?: string }) => <Badge tone={yes ? 'green' : 'amber'}>{yes ? yesText : noText}</Badge>
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${usd(Math.abs(n))}`

function ProviderCard({ c, staleDays, tolerance }: { c: Card; staleDays: number; tolerance: number }) {
  const rec = c.reconciliation
  return (
    <Panel title={c.provider} right={<span className="flex gap-2">{c.active && <Badge tone="blue">Active</Badge>}<YesNo yes={c.configured} yesText="Configured" noText="Not configured" /></span>}>
      <Stats>
        <Stat title="Calls" value={int(c.calls)} sub={`${int(c.failed)} failed`} />
        <Stat title="Success rate" value={c.calls ? pct(c.successRate) : 'No calls'} sub={c.calls ? `error rate ${pct(c.errorRate)}` : undefined} tone={c.calls && c.errorRate > 0.05 ? 'bad' : undefined} />
        <Stat title="Latency" value={ms(c.avgLatencyMs)} sub={`average, p95 ${ms(c.p95LatencyMs)}`} />
        <Stat title="Tokens / images" value={`${compact(c.tokens)} / ${int(c.images)}`} />
      </Stats>
      <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 mb-4">
        <div><dt className="text-xs font-semibold text-slate-600">Spend, computed by us</dt><dd className="tabular-nums">{usd(c.costUsd)}</dd></div>
        <div><dt className="text-xs font-semibold text-slate-600">Spend, reported by provider</dt><dd className="tabular-nums">{rec.comparable ? `${usd(c.reportedCostUsd)} (${int(c.reportedCalls)} calls)` : 'Provider does not report cost'}</dd></div>
        <div><dt className="text-xs font-semibold text-slate-600">Reconciliation (reported minus computed, same calls)</dt>
          <dd>{rec.comparable ? <><span className="tabular-nums">{signed(rec.delta)} ({pct(Math.abs(rec.deltaPct))})</span>{' '}{rec.flagged ? <Badge tone="red">Differs by more than {pct(tolerance)}</Badge> : <Badge tone="green">Within {pct(tolerance)}</Badge>}</> : 'Nothing to compare'}</dd></div>
        <div><dt className="text-xs font-semibold text-slate-600">Last success</dt><dd>{c.lastSuccessAt ? dateTime(c.lastSuccessAt) : 'Never'}</dd></div>
        <div><dt className="text-xs font-semibold text-slate-600">Last error</dt><dd>{c.lastError ? <><code>{c.lastError.code}</code>{c.lastError.at && <> at {dateTime(c.lastError.at)}</>}</> : 'None'}</dd></div>
        <div><dt className="text-xs font-semibold text-slate-600">Catalogue</dt><dd>{int(c.enabledModels)} enabled, {int(c.disabledModels)} disabled{c.stalePricingModels > 0 && <> <Badge tone="amber">{int(c.stalePricingModels)} with stale pricing</Badge></>}</dd></div>
      </dl>
      <h3 className="text-sm font-semibold mb-1">Models used in range</h3>
      <DataTable rows={c.modelsUsed} rowKey={(m) => m.model} empty="No calls in this range." columns={[
        { header: 'Model', cell: (m) => m.model }, { header: 'Calls', cell: (m) => int(m.calls), align: 'right' }, { header: 'Failed', cell: (m) => int(m.failed), align: 'right' }, { header: 'Cost', cell: (m) => usd(m.costUsd), align: 'right' },
      ]} />
      {c.catalog.length > 0 && (
        <>
          <h3 className="text-sm font-semibold mt-4 mb-1">Catalogue and pricing freshness</h3>
          <DataTable rows={c.catalog} rowKey={(m) => m.id} columns={[
            { header: 'Model', cell: (m) => m.displayName, className: 'max-w-[240px] truncate' },
            { header: 'Kind', cell: (m) => m.kind },
            { header: 'Tier', cell: (m) => m.accessTier },
            { header: 'State', cell: (m) => <Badge tone={m.enabled ? 'green' : 'slate'}>{m.enabled ? 'Enabled' : 'Disabled'}</Badge> },
            { header: 'Pricing snapshot', cell: (m) => (m.snapshotAgeDays === null ? <Badge tone="amber">No snapshot</Badge> : <>{int(m.snapshotAgeDays)} days old {m.pricingStale && <Badge tone="amber">Older than {staleDays} days</Badge>}</>) },
            { header: 'Verified on', cell: (m) => m.pricingVerifiedOn },
          ]} />
        </>
      )}
    </Panel>
  )
}

export default function Providers() {
  const { data, error, loading } = useSection<Data>('/providers/overview')
  const i = data?.integrations
  return (
    <SectionPage title="Providers" subtitle="AI provider health, spend reconciliation and integration status." error={error} loading={loading && !data}>
      {i && (
        <Panel title="Integrations status" note="Yes or no only. Keys and secrets are never sent to the browser.">
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-xs font-semibold text-slate-600">AI provider (AI_PROVIDER)</dt><dd><code>{i.ai.active}</code> <YesNo yes={i.ai.configured} yesText="Configured" noText="Not configured" />{i.ai.mock && <> <Badge tone="amber">Mock</Badge></>}</dd></div>
            <div><dt className="text-xs font-semibold text-slate-600">Picture generation</dt><dd><YesNo yes={i.ai.imagesEnabled} yesText="Enabled" noText="Switched off" /></dd></div>
            <div><dt className="text-xs font-semibold text-slate-600">Image storage</dt><dd><code>{i.imageStorage.driver}</code> <YesNo yes={i.imageStorage.configured} yesText="Configured" noText="Not configured" /></dd></div>
            <div><dt className="text-xs font-semibold text-slate-600">Payments ({i.payments.provider})</dt><dd><YesNo yes={i.payments.configured} yesText="Configured" noText="Not configured" />{i.payments.mode && <> <Badge tone={i.payments.mode === 'live' ? 'blue' : 'amber'}>{i.payments.mode === 'live' ? 'Live mode' : 'Test mode'}</Badge></>}</dd></div>
            <div><dt className="text-xs font-semibold text-slate-600">International payments</dt><dd><YesNo yes={i.payments.internationalEnabled} yesText="Enabled" noText="Not enabled" /></dd></div>
            <div><dt className="text-xs font-semibold text-slate-600">Payment webhook secret</dt><dd><YesNo yes={i.payments.webhookConfigured} yesText="Configured" noText="Not configured" /></dd></div>
            <div><dt className="text-xs font-semibold text-slate-600">Email provider</dt><dd><YesNo yes={i.email.configured} yesText="Configured" noText="None" /> <span className="text-xs text-slate-600">{i.email.configured ? '' : i.email.note}</span></dd></div>
            <div><dt className="text-xs font-semibold text-slate-600">Google sign-in</dt><dd><YesNo yes={i.googleSignIn.configured} yesText="Configured" noText="Not configured" /></dd></div>
            <div><dt className="text-xs font-semibold text-slate-600">Microsoft sign-in</dt><dd><YesNo yes={i.microsoftSignIn.configured} yesText="Configured" noText="Not configured" /></dd></div>
            <div><dt className="text-xs font-semibold text-slate-600">Environment</dt><dd><code>{i.environment}</code></dd></div>
          </dl>
        </Panel>
      )}
      {data && (data.providers.length === 0
        ? <EmptyNote>No AI providers seen or configured yet.</EmptyNote>
        : data.providers.map((c) => <ProviderCard key={c.provider} c={c} staleDays={data.staleAfterDays} tolerance={data.reconcileTolerance} />))}
    </SectionPage>
  )
}
