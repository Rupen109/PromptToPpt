import { Folder } from '@prompttoppt/ui/icons'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { PresentationSummary } from '@prompttoppt/api-client'
import { DeckThumb } from '@/components/DeckThumb'
import { Sidebar } from '@/components/Sidebar'
import { api } from '@/lib/api'
import { useProjects } from '@/lib/projects'

/** Everything you've made (or one project's decks): search, move to a project, delete. Also the page behind /projects/:id. */
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

  useEffect(() => {
    let off = false
    api.listPresentations(projectId).then((d) => !off && setLoaded({ key, list: d })).catch(() => !off && setLoaded({ key, list: [] }))
    return () => {
      off = true
    }
  }, [projectId, key])

  const shown = useMemo(() => (decks ?? []).filter((d) => d.title.toLowerCase().includes(q.trim().toLowerCase())), [decks, q])

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
  async function del(deck: PresentationSummary) {
    if (!confirm(`Delete "${deck.title}"? This can't be undone.`)) return
    try {
      await api.deletePresentation(deck.id)
      setDecks((cur) => cur?.filter((d) => d.id !== deck.id) ?? cur)
      void useProjects.getState().load()
    } catch {
      setError('Could not delete that presentation.')
    }
  }

  if (projectId && useProjects.getState().loaded && !project) return <div className="min-h-screen grid place-items-center"><div className="text-center"><p className="mb-3">That project doesn&apos;t exist.</p><Link to="/created" className="text-primary underline">Back to your presentations</Link></div></div>

  return (
    <div className="flex min-h-screen pt-14 lg:pt-0 bg-[#f6f7fb]">
      <Sidebar />
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-[1100px]">
        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="font-heading font-bold text-3xl">{project ? <span className="inline-flex items-center gap-2"><Folder aria-hidden size={28} />{project.name}</span> : 'Created by me'}</h1>
            <p className="text-slate-600 text-sm mt-1">{decks ? `${decks.length} presentation${decks.length === 1 ? '' : 's'}` : 'Loading…'}</p>
          </div>
          <div className="flex gap-2 items-center">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search presentations" className="border border-border rounded-lg px-3 py-2 text-sm bg-white" />
            {project && (
              <>
                <button onClick={() => { const n = prompt('Rename project', project.name)?.trim(); if (n && n !== project.name) void rename(project.id, n) }} className="border border-border rounded-lg px-3 py-2 text-sm bg-white">Rename</button>
                <button onClick={async () => { if (confirm(`Delete the project "${project.name}"? Its presentations are kept.`)) { await remove(project.id); navigate('/created') } }} className="border border-border rounded-lg px-3 py-2 text-sm bg-white text-red-600">Delete project</button>
              </>
            )}
            <Link to="/templates" className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold">New from template</Link>
          </div>
        </div>
        {error && <p role="alert" className="mb-4 text-sm bg-red-50 text-red-700 rounded-lg p-3">{error}</p>}
        {decks && shown.length === 0 ? (
          <p className="py-20 text-center text-slate-600">{q ? 'No presentations match your search.' : project ? 'This project is empty. Move presentations here from “Created by me”.' : <>No presentations yet. <Link to="/" className="text-primary underline">Create one with AI</Link> or <Link to="/templates" className="text-primary underline">start from a template</Link>.</>}</p>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {shown.map((d) => (
              <li key={d.id} className="min-w-0 bg-white border border-border rounded-xl p-4 flex flex-col gap-3">
                <Link to={`/edit/${d.id}`} className="block">
                  <DeckThumb deck={d} />
                  <div className="font-semibold truncate">{d.title}</div>
                  <div className="text-xs text-slate-600 mt-1">Updated {new Date(d.updatedAt).toLocaleDateString()} · {d.aspectRatio}</div>
                </Link>
                <div className="flex items-center gap-2 mt-auto">
                  <select aria-label={`Project for ${d.title}`} value={d.projectId ?? ''} onChange={(e) => void move(d, e.target.value)} className="flex-1 min-w-0 border border-border rounded-md px-2 py-1 text-xs bg-white">
                    <option value="">No project</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button onClick={() => void del(d)} aria-label={`Delete ${d.title}`} className="text-xs text-red-600 px-2 py-1 hover:bg-red-50 rounded-md">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
