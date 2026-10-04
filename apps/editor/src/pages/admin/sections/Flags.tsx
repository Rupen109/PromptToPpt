import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Badge, ErrorBox, SectionPage, dateTime } from '../ui'

interface Flag {
  key: string; description: string; default: boolean; enabled: boolean; effective: boolean; custom: boolean
  rolloutPercent: number; plans: string[]; note: string | null; updatedBy: string | null; updatedAt: string | null
}
type Draft = Pick<Flag, 'enabled' | 'rolloutPercent' | 'plans' | 'note'>
const PLANS = ['starter', 'pro', 'gold'] as const

const draftOf = (f: Flag): Draft => ({ enabled: f.enabled, rolloutPercent: f.rolloutPercent, plans: f.plans, note: f.note })
const same = (a: Draft, b: Draft) => a.enabled === b.enabled && a.rolloutPercent === b.rolloutPercent && (a.note ?? '') === (b.note ?? '') && a.plans.join() === b.plans.join()
const stateOf = (f: Pick<Flag, 'enabled' | 'rolloutPercent' | 'plans'>) => (!f.enabled ? 'OFF' : f.rolloutPercent < 100 || f.plans.length ? 'PARTIAL' : 'ON')

export default function Flags() {
  const [flags, setFlags] = useState<Flag[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.admin.get<Flag[]>('/flags').then(setFlags).catch((e: Error) => setError(e.message))
  }, [])

  const replace = (f: Flag) => setFlags((all) => all && all.map((x) => (x.key === f.key ? f : x)))
  const maintenance = flags?.find((f) => f.key === 'maintenance_mode')

  return (
    <SectionPage title="Flags" subtitle="Switch features on or off without a deploy. Changes apply within seconds and are written to the audit log." noRange error={error} loading={!flags && !error}>
      {maintenance?.enabled && (
        <div role="alert" className="mb-5 rounded-lg border border-amber-400 bg-amber-50 text-amber-900 px-4 py-3 text-sm font-semibold">
          Maintenance mode is ON{maintenance.rolloutPercent < 100 || maintenance.plans.length ? ' (partial)' : ''}: new AI generation and AI assistant/edit requests are being refused.
        </div>
      )}
      <div className="grid gap-4">{flags?.map((f) => <FlagCard key={f.key} flag={f} onChange={replace} />)}</div>
    </SectionPage>
  )
}

function FlagCard({ flag, onChange }: { flag: Flag; onChange: (f: Flag) => void }) {
  const [draft, setDraft] = useState<Draft>(draftOf(flag))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const dirty = !same(draft, draftOf(flag))
  const id = `flag-${flag.key}`

  async function run(call: () => Promise<Flag>, optimistic: Flag) {
    const prev = flag
    setBusy(true)
    setErr(null)
    onChange(optimistic) // optimistic: show the new state now, roll back if the server says no
    try {
      const saved = await call()
      onChange(saved)
      setDraft(draftOf(saved))
    } catch (e) {
      onChange(prev)
      setDraft(draftOf(prev))
      setErr((e as Error).message || 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  function save() {
    if (flag.key === 'maintenance_mode' && draft.enabled && !flag.enabled && !confirm('Turn ON maintenance mode?\n\nNew AI generation jobs and AI assistant/edit requests will be refused for users until you turn it off.')) return
    void run(() => api.admin.send<Flag>('PUT', `/flags/${flag.key}`, { ...draft, note: draft.note?.trim() || null }), { ...flag, ...draft, custom: true })
  }
  function reset() {
    if (!confirm(`Reset "${flag.key}" to its code default (${flag.default ? 'ON' : 'OFF'})?`)) return
    void run(() => api.admin.send<Flag>('DELETE', `/flags/${flag.key}`), { ...flag, enabled: flag.default, rolloutPercent: 100, plans: [], note: null, custom: false })
  }

  const state = stateOf(flag)
  return (
    <section aria-labelledby={`${id}-name`} className="bg-white border border-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 id={`${id}-name`} className="font-semibold font-mono text-sm flex items-center gap-2">
            {flag.key}
            <Badge tone={state === 'ON' ? 'green' : state === 'OFF' ? 'red' : 'amber'}>{state === 'PARTIAL' ? `PARTIAL ${flag.rolloutPercent}%${flag.plans.length ? ` · ${flag.plans.join('/')}` : ''}` : state}</Badge>
            {!flag.custom && <Badge>default</Badge>}
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-[640px]">{flag.description}</p>
        </div>
        <button type="button" role="switch" aria-checked={draft.enabled} aria-label={`${flag.key} enabled`} disabled={busy} onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${draft.enabled ? 'bg-blue-600' : 'bg-slate-300'}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${draft.enabled ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mt-4">
        <div>
          <label htmlFor={`${id}-pct`} className="text-xs font-semibold text-slate-600">Rollout: {draft.rolloutPercent}% of users</label>
          <div className="flex items-center gap-2 mt-1">
            <input id={`${id}-pct`} type="range" min={0} max={100} step={5} value={draft.rolloutPercent} disabled={busy} onChange={(e) => setDraft({ ...draft, rolloutPercent: Number(e.target.value) })} className="flex-1" />
            <input aria-label={`${flag.key} rollout percent`} type="number" min={0} max={100} value={draft.rolloutPercent} disabled={busy} onChange={(e) => setDraft({ ...draft, rolloutPercent: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })} className="w-16 border border-border rounded-lg px-2 py-1 text-sm" />
          </div>
        </div>
        <fieldset>
          <legend className="text-xs font-semibold text-slate-600">Only these plans (none = everyone)</legend>
          <div className="flex gap-3 mt-2">
            {PLANS.map((p) => (
              <label key={p} className="text-sm flex items-center gap-1.5 capitalize">
                <input type="checkbox" disabled={busy} checked={draft.plans.includes(p)} onChange={(e) => setDraft({ ...draft, plans: PLANS.filter((x) => (x === p ? e.target.checked : draft.plans.includes(x))) })} />{p}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={`${id}-note`} className="text-xs font-semibold text-slate-600">Note ({(draft.note ?? '').length}/200)</label>
          <input id={`${id}-note`} value={draft.note ?? ''} maxLength={200} disabled={busy} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className="mt-1 w-full border border-border rounded-lg px-3 py-1.5 text-sm" placeholder="Why is this changed?" />
        </div>
      </div>

      {err && <div className="mt-3"><ErrorBox message={err} /></div>}
      <div className="flex items-center justify-between gap-3 flex-wrap mt-4">
        <p className="text-xs text-slate-600">{flag.updatedAt ? `Last changed by ${flag.updatedBy ?? 'unknown'} at ${dateTime(flag.updatedAt)}` : 'Never changed — using the code default.'}</p>
        <div className="flex gap-2">
          <button type="button" onClick={reset} disabled={busy || !flag.custom} className="px-3 py-1.5 text-sm rounded-lg border border-border bg-white hover:bg-slate-50 disabled:opacity-40">Reset to default</button>
          <button type="button" onClick={save} disabled={busy || !dirty} className="px-3 py-1.5 text-sm rounded-lg bg-foreground text-white disabled:opacity-40">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </section>
  )
}
