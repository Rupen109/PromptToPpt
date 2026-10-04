import { useState, type FormEvent } from 'react'
import { API_URL } from '@/lib/env'
import { Badge, EmptyNote, Panel, SectionPage, dateTime, useSection } from '../ui'
import { useFilters } from '../useUsage'

interface AuditRow { id: string; createdAt: string; actorUserId: string; actorEmail: string | null; action: string; meta: Record<string, unknown>; ip: string | null }
interface AuditData { rows: AuditRow[]; total: number; limit: number; offset: number; actions: { action: string; n: number }[] }
interface Applied { actor: string; action: string; q: string; ip: string; includeSelf: boolean }

const PAGE = 50
const input = 'border border-border rounded-lg px-3 py-1.5 text-sm bg-white'

export default function Audit() {
  const { filters } = useFilters()
  const [draft, setDraft] = useState<Applied>({ actor: '', action: '', q: '', ip: '', includeSelf: false })
  const [applied, setApplied] = useState<Applied>(draft)
  const [offset, setOffset] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const [csvError, setCsvError] = useState<string | null>(null)

  const query = { actor: applied.actor || undefined, action: applied.action || undefined, q: applied.q || undefined, ip: applied.ip || undefined, includeSelf: applied.includeSelf ? 'true' : undefined }
  const { data, error, loading } = useSection<AuditData>('/audit', { ...query, limit: PAGE, offset })

  const apply = (e?: FormEvent, next: Applied = draft) => {
    e?.preventDefault()
    setApplied(next)
    setOffset(0)
    setOpen(null)
  }

  async function downloadCsv() {
    setCsvError(null)
    try {
      const p = new URLSearchParams()
      for (const [k, v] of Object.entries({ from: filters.from, to: filters.to, ...query })) if (v) p.set(k, String(v))
      const res = await fetch(`${API_URL}/api/v1/admin/audit/export.csv?${p}`, { credentials: 'include' })
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setCsvError((e as Error).message)
    }
  }

  const total = data?.total ?? 0
  return (
    <SectionPage
      title="Audit" subtitle="Who did what: admin page views, flag changes, plan changes and deletions. Newest first."
      error={error} loading={loading && !data}
      actions={<button onClick={downloadCsv} className="px-3 py-1.5 text-sm rounded-lg border border-border bg-white hover:bg-slate-50">Download CSV</button>}
    >
      {csvError && <p role="alert" className="text-sm text-red-700 mb-3">{csvError}</p>}
      <form onSubmit={apply} aria-label="Audit filters" className="flex flex-wrap items-end gap-3 mb-5">
        <label className="text-xs font-semibold text-slate-600 grid gap-1">Actor (email or id)<input value={draft.actor} onChange={(e) => setDraft({ ...draft, actor: e.target.value })} maxLength={200} className={input} placeholder="name@example.com" /></label>
        <label className="text-xs font-semibold text-slate-600 grid gap-1">Action
          <select value={draft.action} onChange={(e) => { const n = { ...draft, action: e.target.value }; setDraft(n); apply(undefined, n) }} className={input}>
            <option value="">All actions</option>
            {(data?.actions ?? []).map((a) => <option key={a.action} value={a.action}>{a.action} ({a.n})</option>)}
            {draft.action && !data?.actions.some((a) => a.action === draft.action) && <option value={draft.action}>{draft.action}</option>}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600 grid gap-1">Search details<input value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} maxLength={200} className={input} placeholder="text in details" /></label>
        <label className="text-xs font-semibold text-slate-600 grid gap-1">IP<input value={draft.ip} onChange={(e) => setDraft({ ...draft, ip: e.target.value })} maxLength={64} className={`${input} w-36`} /></label>
        <label className="text-sm flex items-center gap-2 pb-1.5"><input type="checkbox" checked={draft.includeSelf} onChange={(e) => { const n = { ...draft, includeSelf: e.target.checked }; setDraft(n); apply(undefined, n) }} />Show my own audit reads</label>
        <button type="submit" className="px-3 py-1.5 text-sm rounded-lg bg-foreground text-white">Apply</button>
      </form>

      <Panel title={`${total.toLocaleString()} event${total === 1 ? '' : 's'}`} note="Details never contain secrets, prompts or personal content.">
        {!data || data.rows.length === 0 ? <EmptyNote>No audit events match these filters.</EmptyNote> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-600 border-b border-border">{['Time', 'Actor', 'Action', 'Details', 'IP'].map((h) => <th key={h} scope="col" className="py-2 pr-4 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {data.rows.map((r) => {
                  const json = JSON.stringify(r.meta)
                  const empty = json === '{}'
                  const expanded = open === r.id
                  return (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0 align-top">
                      <td className="py-2 pr-4 whitespace-nowrap">{dateTime(r.createdAt)}</td>
                      <td className="py-2 pr-4 break-all">{r.actorEmail ?? <span title="Account no longer exists">{r.actorUserId}</span>}{!r.actorEmail && <> <Badge tone="amber">deleted</Badge></>}</td>
                      <td className="py-2 pr-4"><Badge tone={r.action.startsWith('flag.') ? 'blue' : r.action.startsWith('billing.') ? 'green' : r.action.startsWith('admin.') ? 'slate' : 'amber'}>{r.action}</Badge></td>
                      <td className="py-2 pr-4 max-w-[420px]">
                        {empty ? <span className="text-slate-500">—</span> : (
                          <>
                            <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r.id)} className="text-left font-mono text-xs text-slate-700 hover:underline">
                              {expanded ? 'Hide details' : json.length > 70 ? `${json.slice(0, 70)}… Show` : json}
                            </button>
                            {expanded && <pre className="mt-1 whitespace-pre-wrap break-all bg-slate-50 border border-border rounded p-2 text-xs">{JSON.stringify(r.meta, null, 2)}</pre>}
                          </>
                        )}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap font-mono text-xs">{r.ip ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <nav aria-label="Pagination" className="flex items-center justify-between mt-4 text-sm">
          <span className="text-slate-600">{total === 0 ? '' : `${offset + 1}–${Math.min(offset + PAGE, total)} of ${total.toLocaleString()}`}</span>
          <span className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} className="px-3 py-1 rounded-lg border border-border bg-white disabled:opacity-40">Previous</button>
            <button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)} className="px-3 py-1 rounded-lg border border-border bg-white disabled:opacity-40">Next</button>
          </span>
        </nav>
      </Panel>
    </SectionPage>
  )
}
