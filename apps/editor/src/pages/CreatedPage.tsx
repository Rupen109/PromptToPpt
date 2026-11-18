import { Check, Folder, ListChecks, Plus, Search, Trash2, X } from '@prompttoppt/ui/icons'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { PresentationSummary } from '@prompttoppt/api-client'
import { DeckThumb } from '@/components/DeckThumb'
import { Portal } from '@/components/Portal'
import { Sidebar } from '@/components/Sidebar'
import { api } from '@/lib/api'
import { useProjects } from '@/lib/projects'
import { useDialog } from '@/lib/useDialog'
import { ContextMenu, type MenuItem } from '@/components/editor/ContextMenu'

/** "Edited 5 min ago", "Edited yesterday", then the date: what a person scans for when looking for the deck they worked on last. */
function editedAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'Edited just now'
  if (mins < 60) return `Edited ${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `Edited ${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.round(hrs / 24)
  if (days === 1) return 'Edited yesterday'
  if (days < 7) return `Edited ${days} days ago`
  return `Edited ${new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

/** Asks before anything is deleted: says exactly what goes, and the safe choice (Cancel) has the focus. */
function ConfirmDelete({ list, all, busy, onCancel, onConfirm }: { list: PresentationSummary[]; all: boolean; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const ref = useDialog<HTMLDivElement>(true, onCancel)
  const title = list.length === 1 ? 'Delete this presentation?' : all ? `Delete all ${list.length} presentations?` : `Delete ${list.length} presentations?`
  return (
    <Portal>
      <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
        <div ref={ref} tabIndex={-1} role="alertdialog" aria-modal="true" aria-label={title} className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl outline-none">
          <span aria-hidden className="mb-4 w-11 h-11 rounded-full bg-red-50 text-red-600 grid place-items-center"><Trash2 size={20} /></span>
          <h2 className="font-heading font-bold text-xl">{title}</h2>
          <p className="text-sm text-slate-600 mt-1.5">{list.length === 1 ? 'It' : 'They'} will be deleted for good, with {list.length === 1 ? 'its' : 'their'} slides and share links. This can&apos;t be undone.</p>
          <ul className="mt-4 text-sm text-slate-800 space-y-1 rounded-xl bg-slate-50 border border-border px-3.5 py-3">
            {list.slice(0, 4).map((d) => <li key={d.id} className="truncate">{d.title}</li>)}
            {list.length > 4 && <li className="text-slate-500">and {list.length - 4} more</li>}
          </ul>
          <div className="mt-6 flex justify-end gap-2.5">
            <button type="button" autoFocus onClick={onCancel} disabled={busy} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">Cancel</button>
            <button type="button" onClick={onConfirm} disabled={busy} className="rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-60">{busy ? 'Deleting…' : list.length === 1 ? 'Delete' : `Delete ${list.length}`}</button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

/** Everything you've made (or one project's decks): search, sort, move to a project, delete one or many. Also the page behind /projects/:id. */
export function CreatedPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { projects, rename, remove } = useProjects()
  const project = projects.find((p) => p.id === projectId)
  // keyed by project so switching projects shows "loading" instead of the previous list (no setState-in-effect needed)
  const [loaded, setLoaded] = useState<{ key: string; list: PresentationSummary[] } | null>(null)
  const key = projectId ?? ''
  const decks = loaded?.key === key ? loaded.list : null
  const setDecks = (fn: (cur: PresentationSummary[] | null) => PresentationSummary[] | null) => setLoaded((l) => (l && l.key === key ? { key, list: fn(l.list) ?? l.list } : l))
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<'recent' | 'oldest' | 'name'>('recent')
  const [menu, setMenu] = useState<{ x: number; y: number; deck: PresentationSummary } | null>(null)
  /** Select mode: a deliberate switch (the "Select" button). Outside it the cards are plain: no checkboxes, a click opens the deck. */
  const [selecting, setSelecting] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<PresentationSummary[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let off = false
    api.listPresentations(projectId).then((d) => !off && setLoaded({ key, list: d })).catch(() => !off && setLoaded({ key, list: [] }))
    return () => {
      off = true
    }
  }, [projectId, key])

  const shown = useMemo(() => {
    const list = (decks ?? []).filter((d) => d.title.toLowerCase().includes(q.trim().toLowerCase()))
    return list.sort((a, b) => (sort === 'name' ? a.title.localeCompare(b.title) : sort === 'oldest' ? +new Date(a.updatedAt) - +new Date(b.updatedAt) : +new Date(b.updatedAt) - +new Date(a.updatedAt)))
  }, [decks, q, sort])
  /** only the decks currently shown count: one that the search hides is never deleted by accident */
  const picked = shown.filter((d) => sel.has(d.id))
  const toggle = (id: string) => setSel((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const stopSelecting = () => { setSelecting(false); setSel(new Set()) }
  useEffect(() => {
    if (!selecting || confirm) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelecting(false); setSel(new Set()) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecting, confirm])

  async function move(deck: PresentationSummary, to: string) {
    setError(null)
    try {
      await api.moveToProject(deck.id, to || null)
      if (projectId) setDecks((cur) => cur?.filter((d) => d.id !== deck.id) ?? cur) // it left this project
      else setDecks((cur) => cur?.map((d) => (d.id === deck.id ? { ...d, projectId: to || null } : d)) ?? cur)
      void useProjects.getState().load() // counts
    } catch {
      setError('Could not move that presentation.')
    }
  }
  async function deleteNow(list: PresentationSummary[]) {
    setBusy(true); setError(null)
    const gone = new Set<string>()
    for (let i = 0; i < list.length; i += 4) { // a few at a time: quick, and kind to the server
      const chunk = list.slice(i, i + 4)
      const res = await Promise.allSettled(chunk.map((d) => api.deletePresentation(d.id)))
      res.forEach((r, k) => { if (r.status === 'fulfilled') gone.add(chunk[k]!.id) })
    }
    setDecks((cur) => cur?.filter((d) => !gone.has(d.id)) ?? cur)
    setSel((cur) => new Set([...cur].filter((id) => !gone.has(id))))
    if (gone.size < list.length) setError(`Deleted ${gone.size} of ${list.length}. The rest could not be deleted: please try again.`)
    else if (selecting) setSelecting(false)
    void useProjects.getState().load()
    setBusy(false)
    setConfirm(null)
  }

  /** "Move" on a card: the projects it could go to (only offered when there are projects) */
  const moveItems = (d: PresentationSummary): MenuItem[] => [
    ...projects.filter((p) => p.id !== d.projectId).map((p): MenuItem => ({ label: `Move to ${p.name}`, onClick: () => void move(d, p.id) })),
    ...(d.projectId ? [{ label: 'Remove from project', onClick: () => void move(d, '') } as MenuItem] : []),
  ]

  if (projectId && useProjects.getState().loaded && !project) return <div className="min-h-screen grid place-items-center"><div className="text-center"><p className="mb-3">That project doesn&apos;t exist.</p><Link to="/created" className="text-primary underline">Back to Created by me</Link></div></div>

  const icon = 'w-8 h-8 grid place-items-center rounded-lg text-slate-400 transition-colors'
  return (
    <div className="flex min-h-screen pt-14 lg:pt-0 bg-[#f6f7fb]">
      <Sidebar />
      <main className={`flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-[1180px] ${selecting ? 'pb-28' : ''}`}>
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="font-heading font-bold text-3xl">{project ? <span className="inline-flex items-center gap-2"><Folder aria-hidden size={28} />{project.name}</span> : 'Created by me'}</h1>
            <p className="text-slate-600 text-sm mt-1">{decks ? `${decks.length} presentation${decks.length === 1 ? '' : 's'}${q && decks.length ? ` · ${shown.length} shown` : ''}` : 'Loading…'}</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {project && (
              <>
                <button onClick={() => { const n = prompt('Rename project', project.name)?.trim(); if (n && n !== project.name) void rename(project.id, n) }} className="border border-border rounded-xl px-3.5 h-10 text-sm bg-white hover:bg-slate-50">Rename</button>
                <button onClick={async () => { if (window.confirm(`Delete the project "${project.name}"? Its presentations are kept.`)) { await remove(project.id); navigate('/created') } }} className="border border-border rounded-xl px-3.5 h-10 text-sm bg-white text-red-600 hover:bg-red-50">Delete project</button>
              </>
            )}
            <Link to="/templates" className="inline-flex items-center gap-1.5 bg-primary text-white rounded-xl px-4 h-10 text-sm font-semibold shadow-sm hover:opacity-90"><Plus aria-hidden size={16} />New from template</Link>
          </div>
        </div>

        <div className="flex gap-2.5 items-center mb-6 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search aria-hidden size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your presentations" aria-label="Search presentations" className="w-full h-10 border border-border rounded-xl pl-10 pr-9 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary" />
            {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-full text-slate-500 hover:bg-slate-100"><X aria-hidden size={14} /></button>}
          </div>
          <div role="radiogroup" aria-label="Sort presentations" className="inline-flex h-10 p-1 rounded-xl bg-slate-200/60">
            {([['recent', 'Recent'], ['oldest', 'Oldest'], ['name', 'A–Z']] as const).map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={sort === id} onClick={() => setSort(id)} className={`px-3.5 rounded-lg text-sm transition-colors ${sort === id ? 'bg-white text-slate-900 font-semibold shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
            ))}
          </div>
          {!!decks?.length && (
            <button type="button" onClick={() => (selecting ? stopSelecting() : setSelecting(true))} aria-pressed={selecting} className={`ml-auto inline-flex items-center gap-1.5 h-10 rounded-xl px-3.5 text-sm font-medium border transition-colors ${selecting ? 'bg-primary text-white border-primary' : 'bg-white border-border text-slate-700 hover:bg-slate-50'}`}>
              <ListChecks aria-hidden size={16} />{selecting ? 'Done' : 'Select'}
            </button>
          )}
        </div>

        {error && <p role="alert" className="mb-4 text-sm bg-red-50 text-red-700 rounded-lg p-3">{error}</p>}

        {!decks ? (
          <ul aria-hidden className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => <li key={i} className="bg-white border border-border rounded-2xl overflow-hidden"><div className="aspect-video bg-slate-100 animate-pulse" /><div className="p-4"><div className="h-4 w-2/3 rounded bg-slate-100 animate-pulse" /><div className="h-3 w-1/3 rounded bg-slate-100 animate-pulse mt-2.5" /></div></li>)}
          </ul>
        ) : shown.length === 0 ? (
          <div className="py-20 text-center bg-white border border-dashed border-border rounded-2xl">
            <span aria-hidden className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-primary/10 text-primary grid place-items-center">{q ? <Search size={26} /> : <Plus size={26} />}</span>
            <p className="font-semibold text-slate-800">{q ? 'No presentations match your search.' : project ? 'This project is empty.' : 'No presentations yet.'}</p>
            <p className="text-slate-600 text-sm mt-1">{q ? 'Try a different word, or clear the search.' : project ? 'Move presentations here from “Created by me”.' : 'Describe a topic and your first deck is ready in a minute.'}</p>
            {q ? <button onClick={() => setQ('')} className="mt-5 border border-border rounded-xl px-4 py-2 text-sm bg-white hover:bg-slate-50">Clear search</button> : !project && <Link to="/" className="inline-block mt-5 bg-primary text-white rounded-xl px-5 py-2.5 text-sm font-semibold">Create a presentation</Link>}
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {shown.map((d) => {
              const where = projects.find((p) => p.id === d.projectId)
              const on = sel.has(d.id)
              return (
                <li key={d.id} className={`group relative min-w-0 bg-white rounded-2xl overflow-hidden border transition-all ${on ? 'border-primary ring-2 ring-primary/30 shadow-md' : 'border-border hover:border-slate-300 hover:shadow-lg'} ${selecting ? '' : 'hover:-translate-y-0.5'}`}>
                  <Link
                    to={`/edit/${d.id}`}
                    {...(selecting ? { 'aria-label': `Select ${d.title}`, role: 'checkbox', 'aria-checked': on, onClick: (e: React.MouseEvent) => { e.preventDefault(); toggle(d.id) } } : { tabIndex: -1, 'aria-hidden': true })} /* the picture is a second way in to the same link as the title: out of the tab order and the reader's list unless it is the checkbox */
                    className="block focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  >
                    <div className="relative">
                      <DeckThumb deck={d} flush className="mb-0 border-b border-border" />
                      {d.aspectRatio !== '16:9' && <span className="absolute left-2 bottom-2 text-[11px] font-semibold bg-black/60 text-white rounded-md px-1.5 py-0.5">{d.aspectRatio}</span>}
                      {selecting && (
                        <>
                          <span aria-hidden className={`absolute inset-0 transition-colors ${on ? 'bg-primary/15' : 'bg-transparent'}`} />
                          <span aria-hidden className={`absolute top-2.5 left-2.5 w-6 h-6 rounded-full grid place-items-center border-2 transition-colors ${on ? 'bg-white border-white text-primary' : 'bg-black/25 border-white'} shadow ring-1 ring-black/20`}>{on && <Check size={14} strokeWidth={3} />}</span>
                        </>
                      )}
                    </div>
                  </Link>
                  <div className="flex items-start gap-2 px-4 pt-3 pb-3.5">
                    <Link to={`/edit/${d.id}`} tabIndex={selecting ? -1 : 0} {...(selecting ? { onClick: (e: React.MouseEvent) => { e.preventDefault(); toggle(d.id) } } : {})} className="min-w-0 flex-1 block">
                      <div className="font-semibold text-[15px] leading-snug truncate" title={d.title}>{d.title}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 min-w-0">
                        <span className="truncate" title={new Date(d.updatedAt).toLocaleString()}>{editedAgo(d.updatedAt)}</span>
                        {where && <span className="inline-flex items-center gap-1 min-w-0 shrink bg-slate-100 text-slate-600 rounded-md px-1.5 py-0.5"><Folder aria-hidden size={11} className="shrink-0" /><span className="truncate">{where.name}</span></span>}
                      </div>
                    </Link>
                    {!selecting && (
                      <div className="flex items-center shrink-0 -mr-1.5 -mt-0.5">
                        {(projects.length > 0 || d.projectId) && <button type="button" aria-haspopup="menu" aria-label={`Move ${d.title} to a project`} title="Move to a project" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left - 120, y: r.bottom + 4, deck: d }) }} className={`${icon} hover:bg-slate-100 hover:text-slate-700`}><Folder aria-hidden size={16} /></button>}
                        <button type="button" onClick={() => setConfirm([d])} aria-label={`Delete ${d.title}`} title="Delete" className={`${icon} hover:bg-red-50 hover:text-red-600`}><Trash2 aria-hidden size={16} /></button>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {menu && <ContextMenu x={Math.max(8, menu.x)} y={menu.y} items={moveItems(menu.deck)} onClose={() => setMenu(null)} />}
      </main>

      {selecting && (
        <div role="region" aria-label="Selected presentations" className="fixed z-30 bottom-5 left-1/2 -translate-x-1/2 lg:left-[calc(50%+120px)] max-w-[calc(100vw-2rem)] flex items-center gap-1.5 sm:gap-3 rounded-2xl bg-slate-900 text-white pl-5 pr-2 py-2 shadow-2xl">
          <span className="text-sm font-semibold whitespace-nowrap" aria-live="polite">{picked.length ? `${picked.length} selected` : 'Select presentations'}</span>
          <button type="button" onClick={() => setSel(picked.length === shown.length ? new Set() : new Set(shown.map((d) => d.id)))} className="text-sm text-slate-300 hover:text-white px-2 py-2 whitespace-nowrap">{picked.length === shown.length ? 'Deselect all' : `Select all ${shown.length}`}</button>
          <button type="button" disabled={!picked.length} onClick={() => setConfirm(picked)} className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-400 px-4 py-2.5 text-sm font-semibold whitespace-nowrap"><Trash2 aria-hidden size={16} />Delete{picked.length ? ` ${picked.length}` : ''}</button>
          <button type="button" onClick={stopSelecting} aria-label="Cancel selection" className="w-9 h-9 grid place-items-center rounded-xl text-slate-300 hover:text-white hover:bg-white/10"><X aria-hidden size={18} /></button>
        </div>
      )}
      {confirm && <ConfirmDelete list={confirm} all={!!decks && confirm.length === decks.length && decks.length > 1} busy={busy} onCancel={() => !busy && setConfirm(null)} onConfirm={() => void deleteNow(confirm)} />}
    </div>
  )
}
