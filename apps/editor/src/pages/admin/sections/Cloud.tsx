import { useState, type FormEvent } from 'react'
import { api } from '@/lib/api'
import { int, pct } from '@/lib/format'
import { Badge, DataTable, EmptyNote, ErrorBox, Panel, SectionPage, Stat, Stats, dateTime, useSection } from '../ui'
import { useAsync } from '../useUsage'

interface Checkin { id: string; amount: number; kind: string; readAt: string; note: string | null }
interface Win { from: string; to: string; providerBurnInr: number; ledgerInr: number; unexplainedInr: number; coverage: number | null; calls: number; images: number }
interface Overview {
  checkins: Checkin[]; windows: Win[]; inrPerUsd: number
  totals: { providerBurnInr: number; ledgerInr: number; unexplainedInr: number; coverage: number | null; windows: number }
  sinceLast: { readAt: string; amount: number; kind: string; ledgerInr: number; calls: number; images: number; estimatedNow: number; estimatedNowAtCoverage: number | null } | null
  connector: { configured: boolean; setup: string[] }
}
interface Billed { configured: boolean; setup?: string[]; rows: { day: string; service: string; sku: string; cost: number; credits: number; net: number; currency: string }[] }

const inr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
const localNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }

export default function Cloud() {
  const [rev, setRev] = useState(0)
  const ov = useAsync(() => api.admin.get<Overview>('/cloud'), `cloud${rev}`)
  const billed = useSection<Billed>('/cloud/billed')
  const [amount, setAmount] = useState('')
  const [readAt, setReadAt] = useState(localNow)
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<'credit_remaining' | 'cumulative_spend'>('credit_remaining')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const o = ov.data

  async function save(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    const n = Number(amount.replace(/[,₹\s]/g, ''))
    if (!Number.isFinite(n) || n < 0) return setErr('Enter the amount exactly as the console shows it, e.g. 28181.80')
    setBusy(true)
    try {
      await api.admin.send('POST', '/cloud/checkins', { amount: n, kind, readAt: new Date(readAt).toISOString(), ...(note.trim() ? { note: note.trim() } : {}) })
      setAmount(''); setNote(''); setReadAt(localNow()); setRev((x) => x + 1)
    } catch (x) { setErr((x as Error).message || 'Could not save') } finally { setBusy(false) }
  }
  async function remove(id: string) {
    if (!confirm('Remove this reading?')) return
    await api.admin.send('DELETE', `/cloud/checkins/${id}`).catch(() => {})
    setRev((x) => x + 1)
  }

  return (
    <SectionPage title="Google Cloud" subtitle="Check what Google really charged against what our usage ledger recorded." error={ov.error} loading={ov.loading && !o} noRange>
      <Panel title="Why the dashboard cost can be lower than Google's" note="Our AI cost is computed from every call that goes through the app's gateway. Google bills the whole project, so anything outside that — scripts, console experiments, other apps on the same key, filter-blocked image attempts — is invisible to us until we compare.">
        <ol className="list-decimal pl-5 text-sm space-y-1 text-slate-700">
          <li>Open Google Cloud Console → Billing → Credits and read <b>Free trial status</b> (remaining credit).</li>
          <li>Type it below with the time you read it. Do this again later (daily is plenty).</li>
          <li>Between two readings we show Google's burn, what we recorded, and the unexplained gap.</li>
        </ol>
      </Panel>

      <Panel title="Add a reading">
        <form onSubmit={save} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] items-end">
          <label className="text-sm font-medium">{kind === 'credit_remaining' ? 'Credit remaining (₹)' : 'Total spent so far (₹)'}
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="28181.80" required className="mt-1 w-full border border-border rounded-lg px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium">Read at
            <input type="datetime-local" value={readAt} max={localNow()} onChange={(e) => setReadAt(e.target.value)} required className="mt-1 w-full border border-border rounded-lg px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium">Note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. start of day" className="mt-1 w-full border border-border rounded-lg px-3 py-2 font-normal" />
          </label>
          <button disabled={busy} className="h-10 px-5 rounded-lg bg-foreground text-white text-sm font-semibold disabled:opacity-60">{busy ? 'Saving…' : 'Save reading'}</button>
        </form>
        <label className="mt-3 inline-flex items-center gap-2 text-xs text-slate-600">Reading type
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="border border-border rounded-md px-2 py-1 bg-white"><option value="credit_remaining">Credit remaining</option><option value="cumulative_spend">Cumulative spend</option></select>
        </label>
        {err && <div className="mt-3"><ErrorBox message={err} /></div>}
      </Panel>

      {o && (
        <>
          <Stats>
            <Stat title="Google burned" value={o.totals.windows ? inr(o.totals.providerBurnInr) : '—'} sub={o.totals.windows ? `across ${o.totals.windows} period${o.totals.windows === 1 ? '' : 's'} between readings` : 'add two readings to compare'} />
            <Stat title="We recorded" value={o.totals.windows ? inr(o.totals.ledgerInr) : '—'} sub={`at ₹${o.inrPerUsd} per US$`} />
            <Stat title="Unexplained" value={o.totals.windows ? inr(o.totals.unexplainedInr) : '—'} sub="spend that never went through our gateway" tone={o.totals.windows && o.totals.unexplainedInr > 1 ? 'bad' : undefined} />
            <Stat title="Coverage" value={o.totals.coverage === null ? '—' : pct(o.totals.coverage)} sub="recorded ÷ Google burned" tone={o.totals.coverage !== null ? (o.totals.coverage >= 0.9 ? 'good' : 'bad') : undefined} />
          </Stats>

          {o.sinceLast && (
            <Panel title="Since your last reading" note={`Last reading: ${inr(o.sinceLast.amount)} at ${dateTime(o.sinceLast.readAt)}.`}>
              <p className="text-sm text-slate-700">We have recorded <b>{inr(o.sinceLast.ledgerInr)}</b> of AI spend since then ({int(o.sinceLast.calls)} calls, {int(o.sinceLast.images)} images). {o.sinceLast.kind === 'credit_remaining' ? <>Your balance should now be at most <b>{inr(o.sinceLast.estimatedNow)}</b>{o.sinceLast.estimatedNowAtCoverage !== null && <>, about <b>{inr(o.sinceLast.estimatedNowAtCoverage)}</b> if the usual coverage gap repeats</>}.</> : null}</p>
            </Panel>
          )}

          <Panel title="Between readings">
            <DataTable rows={o.windows} rowKey={(w) => w.from + w.to} empty="Add at least two readings to see a comparison." columns={[
              { header: 'From', cell: (w) => dateTime(w.from) }, { header: 'To', cell: (w) => dateTime(w.to) },
              { header: 'Google burned', cell: (w) => inr(w.providerBurnInr), align: 'right' }, { header: 'We recorded', cell: (w) => inr(w.ledgerInr), align: 'right' },
              { header: 'Unexplained', cell: (w) => inr(w.unexplainedInr), align: 'right' }, { header: 'Coverage', cell: (w) => (w.coverage === null ? '—' : pct(w.coverage)), align: 'right' },
              { header: 'Calls / images', cell: (w) => `${int(w.calls)} / ${int(w.images)}`, align: 'right' },
            ]} />
          </Panel>

          <Panel title="Your readings">
            <DataTable rows={o.checkins} rowKey={(c) => c.id} empty="No readings yet." columns={[
              { header: 'Read at', cell: (c) => dateTime(c.readAt) }, { header: 'Amount', cell: (c) => inr(c.amount), align: 'right' },
              { header: 'Type', cell: (c) => <Badge tone={c.kind === 'credit_remaining' ? 'blue' : 'slate'}>{c.kind === 'credit_remaining' ? 'credit left' : 'cumulative spend'}</Badge> },
              { header: 'Note', cell: (c) => c.note ?? '' }, { header: 'Actions', cell: (c) => <button onClick={() => void remove(c.id)} aria-label={`Remove reading from ${dateTime(c.readAt)}`} className="text-xs text-red-700 underline">Remove</button> },
            ]} />
          </Panel>
        </>
      )}

      <Panel title="Live from Google (billing export)" note="Reads Google's own billing export in BigQuery: what Vertex / Gemini actually cost each day, with credits applied. Google publishes it a few hours behind real time.">
        {billed.error && <ErrorBox message={billed.error} />}
        {billed.loading && !billed.data ? <p className="text-sm text-slate-600">Loading…</p> : billed.data?.configured ? (
          <DataTable rows={billed.data.rows} rowKey={(r, i) => `${r.day}${r.sku}${i}`} empty="No Vertex / Gemini charges in this period." columns={[
            { header: 'Day', cell: (r) => r.day }, { header: 'Service', cell: (r) => r.service }, { header: 'SKU', cell: (r) => r.sku, className: 'max-w-[320px] truncate' },
            { header: 'Cost', cell: (r) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: r.currency || 'INR' }).format(r.cost), align: 'right' },
            { header: 'Credits applied', cell: (r) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: r.currency || 'INR' }).format(r.credits), align: 'right' },
            { header: 'You pay', cell: (r) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: r.currency || 'INR' }).format(r.net), align: 'right' },
          ]} />
        ) : (
          <>
            <EmptyNote>Not connected yet. Three steps:</EmptyNote>
            <ol className="list-decimal pl-5 text-sm space-y-2 text-slate-700 max-w-3xl mx-auto">{(billed.data?.setup ?? o?.connector.setup ?? []).map((s) => <li key={s}>{s}</li>)}</ol>
            <p className="text-xs text-slate-600 text-center mt-4">Full guide: docs/GOOGLE_CLOUD_BILLING.md. Until then, your readings above reconcile the ledger by hand.</p>
          </>
        )}
      </Panel>
    </SectionPage>
  )
}
