import { Portal } from '@/components/Portal'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError, isGateError, type ModelOption } from '@prompttoppt/api-client'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { useDialog } from '@/lib/useDialog'
import { clearPending, setPendingJob, setPendingPrompt } from '@/lib/pending-prompt'

const IDEAS = [
  'A customer-facing version: leave out internal details',
  'An all-hands version for the whole company, in plain language',
  'A short version with only the must-know points',
  'A simpler version with less jargon and fewer words',
]

/**
 * Remix: describe how this presentation should change (new audience, shorter, simpler…) and get a NEW presentation built from its slides:
 * same look, same facts and figures. The original is never touched. Charged per slide like a new deck.
 */
/** A slide count the user wrote in the instruction ("6 slides", "make it 8-slide"), or null. */
export const slidesInText = (t: string): number | null => { const m = /\b(\d{1,2})\s*[- ]?\s*slides?\b/i.exec(t); return m ? Number(m[1]) : null }

export function RemixDialog({ presentationId, title, slideCount, handEdited, beforeStart, onClose }: { presentationId: string; title: string; slideCount: number; /** slides edited by hand: a remix reads what they show now */ handEdited: number; /** saves what is on screen first: a remix reads the SAVED deck */ beforeStart: () => Promise<unknown>; onClose: () => void }) {
  const { ent, upgrade } = useEntitlements()
  const navigate = useNavigate()
  const cap = ent?.limits.maxSlides ?? 40
  const [text, setText] = useState('')
  const [count, setCount] = useState(String(Math.min(slideCount, cap))) // text, so typing "12" does not jump on the first digit
  const [touched, setTouched] = useState(false)
  const clamp = (v: string) => Math.max(3, Math.min(cap, Math.round(Number(v)) || 3))
  const [models, setModels] = useState<ModelOption[]>([])
  const [modelId, setModelId] = useState<string | null>(null)
  const perSlide = models.find((m) => m.id === modelId)?.creditsPerSlide ?? null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idem = useRef(crypto.randomUUID())
  const ref = useDialog<HTMLDivElement>(true, () => { if (!busy) onClose() })
  useEffect(() => { api.models().then((r) => { setModels(r.models); setModelId(r.default) }).catch(() => {}) }, [])

  async function start() {
    const instruction = text.trim()
    if (instruction.length < 3 || busy) return
    setBusy(true); setError(null)
    try {
      await beforeStart().catch(() => {}) // never remix a stale copy: save what is on screen first
      const slides = clamp(count)
      const src = await api.remixSource(presentationId)
      const job = await api.createJob({ prompt: instruction, slideCount: slides, sourceIds: [src.sourceId], remixOf: presentationId, ...(modelId ? { model: modelId } : {}), idempotencyKey: idem.current })
      clearPending(); setPendingPrompt(`Remix of "${title}": ${instruction}`); setPendingJob(job.id)
      navigate('/create') // the create screen shows the progress and opens the new presentation when it is ready
    } catch (e) {
      if (isGateError(e)) { onClose(); upgrade.show(e.message) } else setError(e instanceof ApiError ? e.message : 'Something went wrong. You were not charged.')
      setBusy(false)
    }
  }

  return (
    <Portal><div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Remix this presentation" className="bg-white rounded-2xl w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-xl outline-none">
        <h2 className="font-heading font-bold text-xl">Remix this presentation</h2>
        <p className="text-sm text-slate-600 mt-1">Describe how it should change. You get a <b>new</b> presentation built from your slides, with the same look and the same facts and figures. “{title}” stays as it is.</p>
        <textarea aria-label="How should it change?" value={text} onChange={(e) => { setText(e.target.value); const n = slidesInText(e.target.value); if (n && !touched) setCount(String(clamp(String(n)))) }} maxLength={1000} rows={3} placeholder="e.g. A 6-slide version for our team meeting, without the financials" className="mt-4 w-full border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Ideas">
          {IDEAS.map((i) => <button key={i} type="button" onClick={() => setText(i)} className="text-xs border border-border rounded-full px-3 py-1 hover:border-primary hover:text-primary">{i}</button>)}
        </div>
        <label className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">Slides in the new version
          <input type="number" inputMode="numeric" aria-label="Slides in the new version" min={3} max={cap} value={count} onChange={(e) => { setTouched(true); setCount(e.target.value) }} onBlur={() => setCount(String(clamp(count)))} className="w-20 border border-border rounded-lg px-2 py-1.5" />
          <span className="text-slate-500">(now {slideCount})</span>
        </label>
        {models.filter((m) => m.allowed).length > 0 && (
          <label className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">AI model
            <select aria-label="AI model" value={modelId ?? ''} onChange={(e) => setModelId(e.target.value)} className="min-w-0 flex-1 border border-border rounded-lg px-2 py-1.5 bg-white">
              {models.filter((m) => m.allowed).map((m) => <option key={m.id} value={m.id}>{m.displayName} · {m.creditsPerSlide} credits/slide</option>)}
            </select>
          </label>
        )}
        {handEdited > 0 && <p className="mt-3 text-xs text-slate-600">{handEdited === 1 ? '1 slide you edited by hand' : `${handEdited} slides you edited by hand`} will be remixed as {handEdited === 1 ? 'it looks' : 'they look'} now, with your changes.</p>}
        {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">{perSlide !== null ? `About ${clamp(count) * perSlide} credits · refunded if it fails` : ''}</span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm rounded-lg border border-border disabled:opacity-50">Cancel</button>
            <button onClick={() => void start()} disabled={busy || text.trim().length < 3} className="px-4 py-2 text-sm rounded-lg bg-primary text-white font-semibold disabled:opacity-50">{busy ? 'Starting…' : 'Create remixed copy'}</button>
          </div>
        </div>
      </div>
    </div></Portal>
  )
}
