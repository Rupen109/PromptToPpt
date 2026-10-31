import { Check, Mail, RotateCcw, Trash2 } from '@prompttoppt/ui/icons'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { API_URL } from '@/lib/env'
import { SectionPage, dateTime } from '../ui'

interface Row { id: string; email: string; message: string; files: { index: number; name: string; mime: string; bytes: number }[]; signedIn: boolean; status: 'new' | 'resolved'; createdAt: string }
interface Page { items: Row[]; total: number; pages: number; counts: Record<string, number> }
const TABS = ['new', 'resolved'] as const

/** Owner section: messages from the website's Support page. Reply from your own mailbox (the button opens it), then mark the message resolved. */
export default function Support() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('new')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Page | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => { api.admin.get<Page>('/support', { status: tab, page }).then(setData).catch((e: Error) => setError(e.message)) }, [tab, page])
  useEffect(() => { load() }, [load])
  async function act(id: string, what: 'new' | 'resolved' | 'delete') {
    setError(null)
    try {
      if (what === 'delete') { if (!confirm('Delete this message for good?')) return; await api.admin.send('DELETE', `/support/${id}`) } else await api.admin.send('PATCH', `/support/${id}`, { status: what })
      load()
    } catch (e) { setError((e as Error).message) }
  }
  return (
    <SectionPage title="Support" subtitle="Messages sent from the Support page. Open the e-mail to reply from your own mailbox, then mark the message resolved." noRange error={error} loading={data === null && !error}>
      <div role="tablist" className="flex gap-2 mb-4">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setData(null); setPage(1); setTab(t) }} className={`px-3 py-1.5 rounded-full text-sm font-semibold capitalize ${tab === t ? 'bg-foreground text-white' : 'bg-white border border-border text-slate-700'}`}>{t} <span className="opacity-70">{data?.counts[t] ?? 0}</span></button>)}
      </div>
      {data && data.items.length === 0 && <p className="py-10 text-center text-sm text-slate-600">{tab === 'new' ? 'No new messages.' : 'Nothing resolved yet.'}</p>}
      <ul className="space-y-3">
        {(data?.items ?? []).map((r) => (
          <li key={r.id} className="bg-white border border-border rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div><strong>{r.email}</strong>{r.signedIn && <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">has an account</span>}</div>
              <span className="text-xs text-slate-500">{dateTime(r.createdAt)} · {r.id}</span>
            </div>
            <p className="mt-2 text-sm whitespace-pre-wrap break-words">{r.message}</p>
            {r.files.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-3">
                {r.files.map((f) => (
                  <li key={f.index} className="list-none">
                    <a href={`${API_URL}/api/v1/admin/support/${r.id}/files/${f.index}`} target="_blank" rel="noreferrer" title={`${f.name} · ${Math.round(f.bytes / 1024)} KB`}>
                      <img src={`${API_URL}/api/v1/admin/support/${r.id}/files/${f.index}`} alt={`Screenshot: ${f.name}`} loading="lazy" className="h-24 w-auto max-w-[200px] rounded-lg border border-border object-cover bg-slate-50" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`mailto:${r.email}?subject=${encodeURIComponent('Re: your SlidesDone support message')}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-semibold"><Mail aria-hidden size={14} />Reply by e-mail</a>
              {r.status === 'new'
                ? <button onClick={() => void act(r.id, 'resolved')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-700 text-white text-sm font-semibold"><Check aria-hidden size={14} />Mark resolved</button>
                : <button onClick={() => void act(r.id, 'new')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-semibold"><RotateCcw aria-hidden size={14} />Reopen</button>}
              <button onClick={() => void act(r.id, 'delete')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-red-700 text-sm font-semibold"><Trash2 aria-hidden size={14} />Delete</button>
            </div>
          </li>
        ))}
      </ul>
      {data && data.pages > 1 && (
        <div className="mt-5 flex items-center justify-between text-sm">
          <button disabled={page <= 1} onClick={() => { setData(null); setPage(page - 1) }} className="px-3 py-1.5 rounded-lg border border-border bg-white disabled:opacity-40">Previous</button>
          <span>Page {page} of {data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => { setData(null); setPage(page + 1) }} className="px-3 py-1.5 rounded-lg border border-border bg-white disabled:opacity-40">Next</button>
        </div>
      )}
    </SectionPage>
  )
}
