import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { SharedDeck } from '@prompttoppt/api-client'
import { Sidebar } from '@/components/Sidebar'
import { api } from '@/lib/api'

/** Presentations other people invited me to edit. */
export function SharedPage() {
  const [decks, setDecks] = useState<SharedDeck[] | null>(null)
  const load = () => api.listShared().then(setDecks).catch(() => setDecks([]))
  useEffect(() => { void load() }, [])
  async function leave(d: SharedDeck) {
    if (!window.confirm(`Leave “${d.title}”? You will lose access until ${d.owner} invites you again.`)) return
    await api.leaveDeck(d.id).catch(() => {})
    void load()
  }
  return (
    <div className="flex min-h-screen pt-14 lg:pt-0 bg-[#f6f7fb]">
      <Sidebar />
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-[1100px]">
        <h1 className="font-heading font-bold text-2xl sm:text-3xl mb-1">Shared with me</h1>
        <p className="text-slate-600 mb-6">Presentations you can edit because someone invited you. The AI uses the owner's credits.</p>
        {decks && decks.length === 0 ? <p className="py-16 text-center text-slate-500">Nothing shared with you yet.</p> : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {(decks ?? []).map((d) => (
              <li key={d.id} className="min-w-0 bg-white border border-border rounded-xl p-4 flex flex-col gap-1">
                <Link to={`/edit/${d.id}`} className="font-semibold truncate hover:underline">{d.title}</Link>
                <div className="text-xs text-slate-500">From {d.owner} · updated {new Date(d.updatedAt).toLocaleDateString()}</div>
                <div className="mt-2 flex items-center justify-between"><Link to={`/edit/${d.id}`} className="text-sm text-primary font-semibold">Open</Link><button onClick={() => void leave(d)} className="text-xs text-slate-500 hover:text-red-700">Leave</button></div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
