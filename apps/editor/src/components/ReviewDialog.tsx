import { Star, X } from '@prompttoppt/ui/icons'
import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, type MyReview } from '@prompttoppt/api-client'
import { Portal } from '@/components/Portal'
import { api } from '@/lib/api'
import { useDialog } from '@/lib/useDialog'
import { useUser } from '@/lib/session'

/** "Rate SlidesDone": one review per person, written after making a presentation. It is shown on the website only after the owner approves it. */
export function ReviewDialog({ onClose }: { onClose: () => void }) {
  const user = useUser()
  const ref = useDialog<HTMLDivElement>(true, onClose)
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [name, setName] = useState(user.name.split(' ')[0] ?? '')
  const [role, setRole] = useState('')
  const [existing, setExisting] = useState<MyReview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    api.myReview().then((r) => { if (!r) return; setExisting(r); setRating(r.rating); setBody(r.body); setName(r.displayName); setRole(r.role ?? '') }).catch(() => {})
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (rating < 1) return setError('Choose a star rating first.')
    setBusy(true); setError(null)
    try { await api.saveMyReview({ rating, body, displayName: name, ...(role.trim() ? { role: role.trim() } : {}) }); setDone(true) }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.') }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!confirm('Delete your review?')) return
    try { await api.deleteMyReview(); onClose() } catch { setError('Could not delete it. Please try again.') }
  }

  const input = 'w-full border border-border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary'
  return (
    <Portal><div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Rate SlidesDone" className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl outline-none max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-bold text-xl">Rate SlidesDone</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-500 hover:text-slate-800 text-xl leading-none"><X aria-hidden size={20} /></button>
        </div>
        {done ? (
          <div role="status" className="text-sm text-slate-700 space-y-3">
            <p className="font-semibold text-green-800">Thank you! Your review is saved.</p>
            <p>We read every review before it appears on the website. You can edit or delete it here any time (an edit is checked again).</p>
            <button onClick={onClose} className="w-full bg-primary text-white rounded-lg py-2.5 font-semibold">Close</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {existing && <p className="text-xs rounded-lg bg-slate-100 px-3 py-2 text-slate-700">Your review is {existing.status === 'approved' ? 'live on the website' : existing.status === 'rejected' ? 'not shown on the website' : 'waiting for approval'}. Saving changes sends it for a new check.</p>}
            <div role="radiogroup" aria-label="Your rating" className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)} className={`leading-none ${n <= rating ? 'text-amber-500' : 'text-slate-300'} hover:text-amber-500`}><Star aria-hidden size={30} fill={n <= rating ? 'currentColor' : 'none'} /></button>
              ))}
            </div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required minLength={20} maxLength={600} rows={5} aria-label="Your review" placeholder="What did you make, and how did it go? (20–600 characters, no links)" className={input} />
            <div className="grid grid-cols-2 gap-3">
              <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} aria-label="Name to show" placeholder="Name to show" className={input} />
              <input value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} aria-label="Role (optional)" placeholder="Role (optional)" className={input} />
            </div>
            <p className="text-xs text-slate-500">Only your name and role are shown, never your e-mail.</p>
            {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="flex-1 bg-primary text-white rounded-lg py-2.5 font-semibold disabled:opacity-60">{busy ? 'Saving…' : existing ? 'Update review' : 'Send review'}</button>
              {existing && <button type="button" onClick={() => void remove()} className="px-4 rounded-lg border border-border text-sm font-semibold text-red-700">Delete</button>}
            </div>
          </form>
        )}
      </div>
    </div></Portal>
  )
}
