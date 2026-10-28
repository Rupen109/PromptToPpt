import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError, type InvitePreview } from '@prompttoppt/api-client'
import { api } from '@/lib/api'

/** /invite/:token — shown after signing in. Accepting works only for the mailbox the invitation was sent to. */
export function InvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [inv, setInv] = useState<InvitePreview | null>(null)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.getInvite(token).then(setInv).catch(() => setMissing(true)) }, [token])

  async function accept() {
    setBusy(true); setError(null)
    try { const r = await api.acceptInvite(token); navigate(`/edit/${r.presentationId}`, { replace: true }) } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not accept the invitation.'); setBusy(false) }
  }

  return (
    <div className="min-h-screen grid place-items-center p-4 bg-[#f6f7fb]">
      <div className="bg-white rounded-2xl border border-border shadow-sm w-full max-w-md p-6 sm:p-8 text-center">
        {missing ? (
          <>
            <h1 className="font-heading font-bold text-xl mb-2">This invitation isn't available</h1>
            <p className="text-slate-600 mb-5">It may have expired, been withdrawn, or the link is incomplete. Ask the owner to send a new one.</p>
            <Link to="/" className="text-primary font-semibold">Go to my presentations</Link>
          </>
        ) : !inv ? <p className="text-slate-500">Loading…</p> : (
          <>
            <h1 className="font-heading font-bold text-2xl mb-2">{inv.from} invited you to edit</h1>
            <p className="text-lg font-semibold mb-4">“{inv.title}”</p>
            {inv.status === 'active' && inv.presentationId ? (
              <button onClick={() => navigate(`/edit/${inv.presentationId}`, { replace: true })} className="px-5 py-3 rounded-lg bg-primary text-white font-semibold">Open the presentation</button>
            ) : inv.forThisAccount ? (
              <>
                <p className="text-sm text-slate-600 mb-5">You'll be able to edit the slides together. When the AI helps you, it uses {inv.from}'s credits, not yours.</p>
                <button onClick={() => void accept()} disabled={busy} className="px-5 py-3 rounded-lg bg-primary text-white font-semibold disabled:opacity-50">{busy ? 'Joining…' : 'Accept and open'}</button>
              </>
            ) : (
              <p role="alert" className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">This invitation was sent to a different email address than the one you're signed in with. Log out and sign in with the invited address to accept it.</p>
            )}
            {error && <p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
