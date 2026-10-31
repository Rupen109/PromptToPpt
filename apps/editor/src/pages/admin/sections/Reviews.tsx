import { Star } from '@prompttoppt/ui/icons'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { SectionPage, dateTime } from '../ui'

interface Row { id: string; rating: number; body: string; displayName: string; role: string | null; status: 'pending' | 'approved' | 'rejected'; email: string; createdAt: string; updatedAt: string }
const TABS = ['pending', 'approved', 'rejected'] as const

/** Owner section: approve or reject customer reviews. Only approved reviews are shown on the website (name and role only, never the e-mail). */
export default function Reviews() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('pending')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => { api.admin.get<Row[]>('/reviews', { status: tab }).then(setRows).catch((e: Error) => setError(e.message)) }, [tab])
  useEffect(() => { load() }, [load])
  async function act(id: string, status: Row['status'] | 'delete') {
    setError(null)
    try { if (status === 'delete') { if (!confirm('Delete this review for good?')) return; await api.admin.send('DELETE', `/reviews/${id}`) } else await api.admin.send('PATCH', `/reviews/${id}`, { status }); load() }
    catch (e) { setError((e as Error).message) }
  }
  return (
    <SectionPage title="Reviews" subtitle="Customers can write one review each after making a presentation. Approve the honest ones to show them on the website; an edited review goes back to Pending." noRange error={error} loading={rows === null}>
      <div role="tablist" className="flex gap-2 mb-4">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setRows(null); setTab(t) }} className={`px-3 py-1.5 rounded-full text-sm font-semibold capitalize ${tab === t ? 'bg-foreground text-white' : 'bg-white border border-border text-slate-700'}`}>{t}</button>)}
      </div>
      {rows && rows.length === 0 && <p className="py-10 text-center text-sm text-slate-600">Nothing {tab} right now.</p>}
      <ul className="space-y-3">
        {(rows ?? []).map((r) => (
          <li key={r.id} className="bg-white border border-border rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div><span aria-label={`${r.rating} out of 5`} className="inline-flex gap-0.5 align-middle text-amber-500">{Array.from({ length: 5 }, (_, i) => <Star key={i} aria-hidden size={14} fill="currentColor" className={i < r.rating ? '' : 'text-slate-300'} />)}</span> <strong className="ml-2">{r.displayName}</strong>{r.role && <span className="text-slate-600"> · {r.role}</span>}</div>
              <span className="text-xs text-slate-500">{r.email} · {dateTime(r.updatedAt)}</span>
            </div>
            <p className="mt-2 text-sm whitespace-pre-wrap">{r.body}</p>
            <div className="mt-3 flex gap-2">
              {r.status !== 'approved' && <button onClick={() => void act(r.id, 'approved')} className="px-3 py-1.5 rounded-lg bg-green-700 text-white text-sm font-semibold">Approve</button>}
              {r.status !== 'rejected' && <button onClick={() => void act(r.id, 'rejected')} className="px-3 py-1.5 rounded-lg border border-border text-sm font-semibold">Reject</button>}
              <button onClick={() => void act(r.id, 'delete')} className="px-3 py-1.5 rounded-lg text-red-700 text-sm font-semibold">Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </SectionPage>
  )
}
