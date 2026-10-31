import { FileText, Newspaper, BookOpen, Plus, Search } from '@prompttoppt/ui/icons'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api } from '@/lib/api'
import { SectionPage, dateTime } from '../ui'

export type Kind = 'blog' | 'news' | 'guide'
export const KIND_LABEL: Record<Kind, string> = { blog: 'Blog post', news: 'Tech news', guide: 'Guide' }
export const KIND_ICON = { blog: FileText, news: Newspaper, guide: BookOpen } as const
interface Row { id: string; kind: Kind; slug: string; title: string; summary: string; state: 'draft' | 'scheduled' | 'published'; tags: string[]; section: string | null; trending: boolean; featured: boolean; publishedAt: string | null; updatedAt: string }
interface Page { items: Row[]; total: number; page: number; pages: number; counts: Record<string, number> }
const STATE_STYLE = { draft: 'bg-slate-100 text-slate-700', scheduled: 'bg-amber-100 text-amber-800', published: 'bg-green-100 text-green-800' } as const

/** Owner section: everything written for the website, in one list. Start a new post by choosing its type. */
export default function Posts() {
  const [sp, setSp] = useSearchParams()
  const kind = (sp.get('kind') as Kind | null) ?? undefined
  const state = sp.get('state') ?? ''
  const q = sp.get('q') ?? ''
  const page = Number(sp.get('page') ?? '1') || 1
  const [data, setData] = useState<Page | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState(q)
  const set = (k: string, v: string) => { setData(null); const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }) }
  const load = useCallback(() => { api.admin.get<Page>('/posts', { ...(kind ? { kind } : {}), ...(state ? { state } : {}), ...(q ? { q } : {}), page }).then(setData).catch((e: Error) => setError(e.message)) }, [kind, state, q, page])
  useEffect(() => { load() }, [load])
  const submit = (e: FormEvent) => { e.preventDefault(); set('q', search.trim()) }
  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0

  return (
    <SectionPage title="Blog, news & guides" subtitle="Write for the website here. Choose the type first: a blog article, a short tech news item, or a how-to guide. Drafts stay private until you publish." noRange error={error} loading={data === null && !error}
      actions={<Link to="/admin/posts/new" className="inline-flex items-center gap-2 rounded-lg bg-foreground text-white px-4 h-10 text-sm font-semibold"><Plus aria-hidden size={16} />New post</Link>}>
      <div role="tablist" aria-label="Type" className="flex flex-wrap gap-2 mb-4">
        {([['', 'All', total], ['blog', 'Blog', data?.counts['blog'] ?? 0], ['news', 'Tech news', data?.counts['news'] ?? 0], ['guide', 'Guides', data?.counts['guide'] ?? 0]] as const).map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={(kind ?? '') === k} onClick={() => set('kind', k)} className={`px-3 py-1.5 rounded-full text-sm font-semibold ${(kind ?? '') === k ? 'bg-foreground text-white' : 'bg-white border border-border text-slate-700'}`}>{label} <span className="opacity-70">{n}</span></button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mb-4">
        <form onSubmit={submit} className="flex gap-2" role="search">
          <label className="sr-only" htmlFor="post-search">Search posts</label>
          <input id="post-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title or address" className="border border-border rounded-lg h-10 px-3 text-sm bg-white w-64 max-w-full" />
          <button className="inline-flex items-center gap-1.5 border border-border rounded-lg h-10 px-3 text-sm font-semibold bg-white"><Search aria-hidden size={14} />Search</button>
        </form>
        <label className="sr-only" htmlFor="post-state">Status</label>
        <select id="post-state" value={state} onChange={(e) => set('state', e.target.value)} className="border border-border rounded-lg h-10 px-3 text-sm bg-white">
          <option value="">Any status</option><option value="draft">Drafts</option><option value="scheduled">Scheduled</option><option value="published">Published</option>
        </select>
      </div>
      {data && data.items.length === 0 && (
        <div className="py-14 text-center text-sm text-slate-600">
          <p>{q || state || kind ? 'No posts match.' : 'Nothing written yet.'}</p>
          {!q && !state && !kind && <Link to="/admin/posts/new" className="mt-3 inline-block font-semibold text-primary">Write your first post</Link>}
        </div>
      )}
      <ul className="space-y-2">
        {(data?.items ?? []).map((r) => { const Icon = KIND_ICON[r.kind]; return (
          <li key={r.id}>
            <Link to={`/admin/posts/${r.id}`} className="block bg-white border border-border rounded-xl p-4 hover:border-slate-400">
              <div className="flex items-start gap-3">
                <Icon aria-hidden size={18} className="mt-0.5 shrink-0 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><strong className="truncate">{r.title}</strong>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATE_STYLE[r.state]}`}>{r.state}</span>
                    {r.trending && <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-orange-100 text-orange-800">trending</span>}
                    {r.featured && <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-indigo-100 text-indigo-800">featured</span>}
                  </div>
                  <p className="text-sm text-slate-600 truncate">{r.summary || 'No summary yet'}</p>
                  <p className="text-xs text-slate-500 mt-1">{KIND_LABEL[r.kind]}{r.section ? ` · ${r.section}` : ''} · /{r.slug}{r.tags.length ? ` · ${r.tags.join(', ')}` : ''} · {r.state === 'draft' ? `edited ${dateTime(r.updatedAt)}` : `${r.state === 'scheduled' ? 'goes live' : 'live since'} ${dateTime(r.publishedAt ?? r.updatedAt)}`}</p>
                </div>
              </div>
            </Link>
          </li>
        ) })}
      </ul>
      {data && data.pages > 1 && (
        <div className="mt-5 flex items-center justify-between text-sm">
          <button disabled={page <= 1} onClick={() => set('page', String(page - 1))} className="px-3 py-1.5 rounded-lg border border-border bg-white disabled:opacity-40">Previous</button>
          <span>Page {data.page} of {data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => set('page', String(page + 1))} className="px-3 py-1.5 rounded-lg border border-border bg-white disabled:opacity-40">Next</button>
        </div>
      )}
    </SectionPage>
  )
}
