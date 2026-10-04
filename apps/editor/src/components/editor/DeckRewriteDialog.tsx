import { Portal } from '@/components/Portal'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, isGateError, type AnalyzeResult, type JobView } from '@prompttoppt/api-client'
import { BriefCard } from '@/components/BriefCard'
import type { Presentation } from '@prompttoppt/validation'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { useDialog } from '@/lib/useDialog'

const EXAMPLES = [
  'I did a QA internship. I learned to write test cases, test real features and log real bugs. Cover everything I learned and did.',
  'Pitch for my home-bakery startup: what we sell, who buys it, why we are different and what we need to grow.',
  'Quarterly marketing review: what we ran, what worked, what did not and what we will do next quarter.',
]
const STAGES: Record<string, string> = { queued: 'Waiting for a free slot…', analyzing: 'Understanding what you told me…', outlining: 'Planning the story…', generating: 'Writing every slide…', rendering: 'Applying your design and pictures…', validating: 'Checking quality…', completed: 'Done', failed: 'Failed', cancelled: 'Cancelled' }

/**
 * "Tell me what this presentation is about": the user describes their content, the server runs the full generation pipeline
 * INTO THIS DECK (same design, new story, pictures) and the editor loads the result. The old version stays in Version history.
 * `autoBrief` starts immediately (used when the AI assistant decided the whole deck must be rewritten).
 */
export function DeckRewriteDialog({ presentationId, autoBrief, picturesOnly, slideCount, onDone, onClose }: { presentationId: string; autoBrief?: string | undefined; picturesOnly?: boolean | undefined; slideCount: number; onDone: (doc: Presentation, revision: number) => void; onClose: () => void }) {
  const { upgrade, refresh } = useEntitlements()
  const [brief, setBrief] = useState(autoBrief ?? '')
  const [job, setJob] = useState<JobView | null>(null)
  const [phase, setPhase] = useState<'ask' | 'understand' | 'confirm' | 'run' | 'error'>(autoBrief ? 'run' : 'ask')
  const [brief0, setBrief0] = useState<AnalyzeResult | null>(null)
  const [count, setCount] = useState(slideCount)
  const [error, setError] = useState<string | null>(null)
  const [perSlide, setPerSlide] = useState<number | null>(null)
  const started = useRef(false)
  const idem = useRef(crypto.randomUUID())
  const busy = phase === 'run'
  const close = useCallback(() => { if (!busy) onClose() }, [busy, onClose])
  const ref = useDialog<HTMLDivElement>(true, close)

  useEffect(() => { api.models().then((r) => setPerSlide(r.models.find((m) => m.id === r.default)?.creditsPerSlide ?? null)).catch(() => {}) }, [])

  const start = useCallback(async (text: string, analysis?: AnalyzeResult['analysis'], slides?: number) => {
    setPhase('run'); setError(null)
    try {
      const j = await api.createJob({ prompt: text, targetPresentationId: presentationId, idempotencyKey: idem.current, ...(picturesOnly ? { picturesOnly: true } : {}), ...(analysis ? { analysis } : {}), ...(slides ? { slideCount: slides } : {}) })
      setJob(j)
    } catch (e) {
      idem.current = crypto.randomUUID()
      if (isGateError(e)) upgrade.show(e.message)
      setError(e instanceof ApiError ? e.message : 'Something went wrong. You were not charged.')
      setPhase(autoBrief ? 'error' : 'ask')
    }
  }, [presentationId, upgrade, autoBrief, picturesOnly])

  useEffect(() => {
    if (autoBrief && !started.current) { started.current = true; void start(autoBrief) }
  }, [autoBrief, start])

  const jobId = job?.id
  useEffect(() => {
    if (!jobId) return
    let stop = false
    const tick = async () => {
      try {
        const j = await api.getJob(jobId)
        if (stop) return
        setJob(j)
        if (j.status === 'completed') {
          const p = await api.getPresentation(presentationId)
          if (stop) return
          void refresh()
          onDone(p.document, p.revision)
        } else if (j.status === 'failed' || j.status === 'cancelled') {
          setError(j.error ?? 'It was cancelled. You were not charged.'); setPhase('error')
        }
      } catch { /* transient: next tick retries */ }
    }
    void tick()
    const t = setInterval(tick, 1500)
    return () => { stop = true; clearInterval(t) }
  }, [jobId, presentationId, onDone, refresh])

  // Stage 0: understand first (cheap), show what was understood, and only then spend credits
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (brief.trim().length < 10) return
    setPhase('understand'); setError(null)
    try {
      const r = await api.analyze(brief.trim(), [])
      setBrief0(r); setCount(Math.min(r.maxSlides, r.analysis.slideCount ?? slideCount)); setPhase('confirm')
    } catch (x) {
      setError(x instanceof ApiError ? x.message : 'I could not read that just now. Please try again.'); setPhase('ask')
    }
  }
  const cost = perSlide ? perSlide * slideCount : null

  return (
    <Portal><div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Tell me what to put in your presentation" className="bg-white rounded-2xl w-full max-w-xl p-6 shadow-xl outline-none">
        {phase === 'understand' ? (
          <div role="status" aria-live="polite"><h2 className="font-heading font-bold text-xl mb-1">Reading what you wrote…</h2><p className="text-sm text-slate-600">One moment — I’ll show you what I understood before I build anything.</p></div>
        ) : phase === 'confirm' && brief0 ? (
          <div>
            <h2 className="font-heading font-bold text-xl mb-3">Does this look right?</h2>
            <BriefCard analysis={brief0.analysis} keepDesign />
            <label className="mt-3 flex items-center gap-2 text-sm">Slides
              <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="border border-border rounded-md px-2 py-1 bg-white">{Array.from({ length: Math.min(brief0.maxSlides, 20) - 2 }, (_, i) => i + 3).map((n) => <option key={n} value={n}>{n}</option>)}</select>
              {perSlide ? <span className="text-xs text-slate-600">≈ {perSlide * count} credits</span> : null}
            </label>
            <div className="flex items-center justify-between gap-3 mt-5">
              <button type="button" onClick={() => setPhase('ask')} className="text-sm text-slate-600 underline">← Edit my text</button>
              <button onClick={() => void start(brief.trim(), brief0.analysis, count)} className="bg-primary text-white rounded-lg px-5 py-2.5 text-sm font-semibold">Looks right — build it</button>
            </div>
          </div>
        ) : phase === 'run' ? (
          <div role="status" aria-live="polite">
            <h2 className="font-heading font-bold text-xl mb-1">{picturesOnly ? 'Finding pictures that match your slides…' : 'Building your presentation…'}</h2>
            <p className="text-sm text-slate-600 mb-4">I’m writing every slide from your details and keeping this design. This takes about a minute.</p>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-valuenow={job?.progress ?? 0} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-primary transition-all duration-700" style={{ width: `${Math.max(6, job?.progress ?? 0)}%` }} /></div>
            <div className="flex items-center justify-between mt-3 text-sm"><span className="font-semibold">{job ? (STAGES[job.status] ?? '…') : 'Starting…'}</span>{job && <button onClick={() => void api.cancelJob(job.id)} className="text-slate-500 underline">Cancel</button>}</div>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-heading font-bold text-xl">Tell me what to put in your slides</h2>
                <p className="text-sm text-slate-600 mt-1">Describe your topic, experience or notes. I’ll write every slide, add pictures and keep this template’s look.</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="text-slate-500 hover:text-slate-800 text-2xl leading-none">×</button>
            </div>
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={6} maxLength={3000} autoFocus aria-label="What is your presentation about?" placeholder="e.g. I did a QA internship. I learned to write test cases, test the real functionality and report real bugs. Cover everything." className="mt-4 w-full border border-border rounded-xl p-3 text-[15px] focus:outline-none focus:border-primary resize-none" />
            <div className="flex flex-wrap gap-2 mt-2" aria-label="Examples">
              {EXAMPLES.map((x) => <button key={x} type="button" onClick={() => setBrief(x)} className="text-xs border border-border rounded-full px-3 py-1 hover:border-primary text-left">{x.length > 46 ? `${x.slice(0, 46)}…` : x}</button>)}
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex items-center justify-between gap-3 mt-5">
              <button type="button" onClick={onClose} className="text-sm text-slate-600 underline">Skip — I’ll edit the sample myself</button>
              <div className="text-right">
                <button disabled={brief.trim().length < 10} className="bg-primary text-white rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-50">✨ Create my slides</button>
                {cost !== null && <div className="text-[11px] text-slate-600 mt-1">I’ll show what I understood first · your current version stays in Version history</div>}
              </div>
            </div>
          </form>
        )}
        {phase === 'error' && (
          <div className="mt-2">
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            <div className="flex gap-3 mt-4"><button onClick={() => { setPhase('ask'); setJob(null); idem.current = crypto.randomUUID() }} className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold">Try again</button><button onClick={onClose} className="text-sm text-slate-600 underline">Close</button></div>
          </div>
        )}
      </div>
    </div></Portal>
  )
}
