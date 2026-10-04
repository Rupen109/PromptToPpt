import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import type { PresentationSummary, SourceSummary } from '@prompttoppt/api-client'
import { SourcesDialog } from '@/components/SourcesDialog'
import { api } from '@/lib/api'
import { MaintenanceBanner } from '@/lib/flags'
import { DeckThumb } from '@/components/DeckThumb'
import { Sidebar } from '@/components/Sidebar'
import { clearPending, setPendingPrompt, setPendingSources } from '@/lib/pending-prompt'

export function HomePage() {
  const [prompt, setPrompt] = useState('')
  const navigate = useNavigate()
  const [sources, setSources] = useState<SourceSummary[]>([])
  const [dialog, setDialog] = useState(false)
  const [decks, setDecks] = useState<PresentationSummary[] | null>(null)
  useEffect(() => {
    api.listPresentations().then(setDecks).catch(() => setDecks([]))
  }, [])

  function submit(e: FormEvent) {
    e.preventDefault()
    const text = prompt.trim() || (sources.length ? 'Create a presentation from the attached sources' : '')
    if (!text) return
    clearPending() // a new request must never inherit a previous run's job/sources
    setPendingPrompt(text)
    setPendingSources(sources.map((s) => s.id))
    navigate('/create')
  }

  return (
    <div className="flex min-h-screen pt-14 lg:pt-0">
      <Sidebar />
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 pb-12 lg:pb-16">
        <MaintenanceBanner />
        <form onSubmit={submit} className="max-w-[960px] mx-auto mt-8 sm:mt-14 lg:mt-24 bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={4000}
            placeholder="To start creating, type here or upload a file…"
            aria-label="Presentation prompt"
            className="w-full h-32 sm:h-28 resize-none px-4 sm:px-7 pt-5 sm:pt-6 text-lg sm:text-[22px] placeholder:text-slate-400 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e)
            }}
          />
          <div className="flex flex-wrap items-center gap-3 px-3 sm:px-4 pb-4">
            <button type="button" onClick={() => setDialog(true)} className="border border-border rounded-lg px-4 py-2.5 text-sm hover:bg-slate-50">
              Upload files, or links
            </button>
            {sources.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 bg-slate-100 rounded-full pl-3 pr-1.5 py-1 text-xs max-w-[180px]">
                <span className="truncate">{s.title}</span>
                <button type="button" aria-label={`Remove ${s.title}`} onClick={() => { setSources((p) => p.filter((x) => x.id !== s.id)); void api.deleteSource(s.id) }} className="w-4 h-4 rounded-full hover:bg-slate-300 leading-none">×</button>
              </span>
            ))}
            <button
              type="submit"
              disabled={!prompt.trim() && sources.length === 0}
              className="w-full sm:w-auto sm:ml-auto bg-primary text-white rounded-lg px-5 py-3 sm:py-2.5 text-sm font-semibold disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              Create Presentation
            </button>
          </div>
        </form>

        <div className="max-w-[960px] mx-auto mt-10 sm:mt-14">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-[15px] font-semibold">Recent presentations</h2>
            <Link to="/created" className="text-sm text-primary">View all</Link>
          </div>
          {decks && decks.length === 0 ? (
            <p className="py-16 text-center text-slate-500">No presentations yet. Your decks will appear here.</p>
          ) : (
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 pt-6">
              {(decks ?? []).map((d) => (
                <li key={d.id} className="min-w-0">
                  <Link to={`/edit/${d.id}`} className="block bg-white border border-border rounded-xl p-5 hover:shadow-md transition">
                    <DeckThumb deck={d} />
                    <div className="font-semibold truncate">{d.title}</div>
                    <div className="text-xs text-slate-500 mt-1">Updated {new Date(d.updatedAt).toLocaleDateString()}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      {dialog && <SourcesDialog count={sources.length} onAdd={(s) => setSources((p) => [...p, s])} onClose={() => setDialog(false)} />}
    </div>
  )
}
