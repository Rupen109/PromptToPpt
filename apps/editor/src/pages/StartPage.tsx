import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { api } from '@/lib/api'
import { setPendingPrompt, setPendingSources } from '@/lib/pending-prompt'

/**
 * Landing-page handoff: /start?draft=<id>. Exchanges the opaque id for the visitor's prompt
 * (single use, bound to this user) and continues to the creation screen.
 */
export function StartPage() {
  const [params] = useSearchParams()
  const draft = params.get('draft')
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  const started = useRef(false) // StrictMode double-invokes effects in dev; claim only once

  useEffect(() => {
    if (!draft || started.current) return
    started.current = true
    api
      .claimDraft(draft)
      .then(({ prompt, sourceIds }) => {
        setPendingPrompt(prompt)
        setPendingSources(sourceIds) // files / links attached on the landing page ride along into generation
        navigate('/create', { replace: true })
      })
      .catch(() => setFailed(true))
  }, [draft, navigate])

  if (!draft) return <Navigate to="/" replace />
  if (failed)
    return (
      <div className="min-h-screen grid place-items-center text-center p-6">
        <div>
          <p className="font-bold mb-1">That prompt link expired.</p>
          <p className="text-slate-600 mb-4">No problem — type it again to get started.</p>
          <button onClick={() => navigate('/', { replace: true })} className="bg-primary text-white px-4 py-2 rounded-md font-bold">
            Go to home
          </button>
        </div>
      </div>
    )
  return <div className="min-h-screen grid place-items-center text-muted">Preparing your presentation…</div>
}
