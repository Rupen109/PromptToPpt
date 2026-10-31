import { ArrowLeft, Check } from '@prompttoppt/ui/icons'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { ApiError, isGateError, type AnalyzeResult, type BrandKit, type JobStatus, type JobView, type ModelOption } from '@prompttoppt/api-client'
import type { Direction } from '@prompttoppt/validation'
import { BriefCard } from '@/components/BriefCard'
import { ThinkingLoader } from '@/components/ThinkingLoader'
import { ModelPicker } from '@/components/ModelPicker'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { clearPending, getPendingJob, getPendingLanguage, getPendingPrompt, getPendingSources, setPendingJob } from '@/lib/pending-prompt'

type Retry = { type: 'analyze' } | { type: 'start'; result: AnalyzeResult; slideCount: number; direction?: Direction | undefined } | { type: 'home' }

type Phase =
  | { kind: 'analyzing' }
  | { kind: 'error'; message: string; retry: Retry }
  | { kind: 'pick-direction'; result: AnalyzeResult }
  | { kind: 'pick-length'; result: AnalyzeResult; direction?: Direction }
  | { kind: 'generating'; job: JobView | null }

const STAGES: Record<JobStatus, string> = {
  queued: 'Waiting for a free slot…', analyzing: 'Understanding your request…', outlining: 'Building the outline…', generating: 'Writing the slides…',
  rendering: 'Designing layouts…', validating: 'Checking quality…', completed: 'Done', failed: 'Failed', cancelled: 'Cancelled',
}

/** The visible steps of a generation, in order (queued shows none as active yet). */
const STEPS: [JobStatus, string][] = [['analyzing', 'Understand'], ['outlining', 'Outline'], ['generating', 'Write slides'], ['rendering', 'Design'], ['validating', 'Check']]

const errMessage = (e: unknown) =>
  e instanceof ApiError ? (e.code === 'LIMIT_REACHED' ? e.message : e.code === 'AI_NOT_CONFIGURED' ? 'AI is not configured on this server yet.' : e.message) : 'Something went wrong. Please try again.'

function Card({ children }: { children: ReactNode }) {
  return <div className="mt-8 bg-white rounded-2xl border border-border shadow-sm p-6">{children}</div>
}

/**
 * Step 2: understanding card → choose the LENGTH (just selects it, nothing starts) → choose an AI MODEL, which starts the build.
 * The model chooser is highlighted once a length is chosen, and the length buttons are highlighted if a model is clicked first.
 */
function PickLength({ result, direction, models, modelId, lengths, perSlide, onStart, brand }: { brand?: { kit: BrandKit; checked: boolean; onChange: (v: boolean) => void } | undefined; result: AnalyzeResult; direction?: Direction | undefined; models: ModelOption[]; modelId: string | null; lengths: readonly (readonly [string, number])[]; perSlide: number; onStart: (slides: number, model: string) => void }) {
  const [chosen, setChosen] = useState<number | null>(lengths.length === 1 ? lengths[0]![1] : null)
  const [nudge, setNudge] = useState(false)
  const fixed = !!result.analysis.slideCount
  return (
    <>
      <p className="mt-10 text-[17px]">{direction ? <>Great — <b>{direction.title}</b>. </> : null}{fixed ? 'Check what I understood, then pick an AI model to start.' : 'Check what I understood, choose the length, then pick an AI model to start.'}</p>
      <div className="mt-4"><BriefCard analysis={result.analysis} /></div>
      <div role="radiogroup" aria-label="Presentation length" className={`mt-6 flex flex-wrap gap-3 rounded-2xl ${nudge && chosen === null ? 'ring-2 ring-primary p-2 -m-2 animate-pulse-soft' : ''}`}>
        {lengths.map(([label, n]) => (
          <button key={label} role="radio" aria-checked={chosen === n} onClick={() => { setChosen(n); setNudge(false) }} className={`bg-white border rounded-xl px-5 py-3 text-left transition ${chosen === n ? 'border-primary ring-2 ring-primary/25' : 'border-border hover:border-slate-400'}`}>
            <div className="font-semibold">{label}</div>
            <div className="text-sm text-slate-500">{n} slides · ~{n * perSlide} credits</div>
          </button>
        ))}
      </div>
      {brand && (
        <label className="mt-5 flex items-center gap-3 bg-white border border-border rounded-xl px-4 py-3 w-fit cursor-pointer">
          <input type="checkbox" checked={brand.checked} onChange={(e) => brand.onChange(e.target.checked)} aria-label="Build it in my brand" />
          <span className="text-sm">Build it in my brand: <b>{brand.kit.name}</b></span>
          <span className="flex gap-1" aria-hidden>{[brand.kit.colors.primary, brand.kit.colors.accent].filter((c): c is string => !!c).map((c) => <span key={c} style={{ background: c }} className="w-4 h-4 rounded-full border border-border" />)}</span>
          {brand.kit.logo && <img src={brand.kit.logo.url} alt="" className="h-5 max-w-[60px] object-contain" />}
        </label>
      )}
      {nudge && chosen === null && <p role="alert" className="mt-2 text-sm text-primary font-medium">Pick a length first, then choose the AI model to start.</p>}
      <ModelPicker
        models={models} value={modelId}
        highlight={chosen !== null}
        hint={chosen !== null ? `${chosen} slides selected — click an AI model to start (the highlighted one is your default).` : undefined}
        onChange={(id) => { if (chosen === null) setNudge(true); else onStart(chosen, id) }}
      />
      <p className="mt-3 text-xs text-slate-500">You have {result.creditBalance.toLocaleString()} credits. Failed or cancelled generations are refunded.</p>
    </>
  )
}

export function CreatePage() {
  const navigate = useNavigate()
  const { ent, upgrade, refresh } = useEntitlements()
  const [models, setModels] = useState<ModelOption[]>([])
  const [modelId, setModelId] = useState<string | null>(null)
  const prompt = getPendingPrompt()
  const [phase, setPhase] = useState<Phase>(getPendingJob() ? { kind: 'generating', job: null } : { kind: 'analyzing' })
  // (Re)load the model list whenever the plan changes, so an upgrade unlocks models immediately.
  useEffect(() => {
    let cancelled = false
    api.models().then((r) => {
      if (cancelled) return
      setModels(r.models)
      setModelId((cur) => (cur && r.models.some((m) => m.id === cur && m.allowed) ? cur : r.default))
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [ent?.plan.id])
  const started = useRef(false)
  const idemKey = useRef(crypto.randomUUID())
  /** the user's default brand kit (Pro/Gold): offered as "build it in my brand", on unless they turn it off */
  const [defaultKit, setDefaultKit] = useState<BrandKit | null>(null)
  const [useKit, setUseKit] = useState(true)
  useEffect(() => { api.brandKits().then((r) => setDefaultKit(r.kits.find((k) => k.isDefault) ?? null)).catch(() => {}) }, [])

  const analyze = useCallback(async () => {
    if (!prompt) return
    setPhase({ kind: 'analyzing' })
    try {
      const result = await api.analyze(prompt, getPendingSources(), getPendingLanguage())
      setPhase(result.mode === 'broad' && result.directions ? { kind: 'pick-direction', result } : { kind: 'pick-length', result })
    } catch (e) {
      setPhase({ kind: 'error', message: errMessage(e), retry: { type: 'analyze' } })
    }
  }, [prompt])

  useEffect(() => {
    if (started.current || getPendingJob()) return // StrictMode runs effects twice in dev
    started.current = true
    void analyze()
  }, [analyze])

  const start = useCallback(
    async (result: AnalyzeResult, slideCount: number, direction?: Direction, modelOverride?: string) => {
      if (!prompt) return
      setPhase({ kind: 'generating', job: null })
      try {
        const job = await api.createJob({ prompt, analysis: result.analysis, slideCount, sourceIds: getPendingSources(), ...(getPendingLanguage() ? { language: getPendingLanguage()! } : {}), ...((modelOverride ?? modelId) ? { model: (modelOverride ?? modelId)! } : {}), ...(direction ? { direction } : {}), ...(defaultKit && useKit ? { brandKitId: defaultKit.id } : {}), idempotencyKey: idemKey.current })
        setPendingJob(job.id)
        setPhase({ kind: 'generating', job })
      } catch (e) {
        if (isGateError(e)) {
          upgrade.show(e.message) // server refused (plan/credits/limit): show the upgrade path, keep the choices
          setPhase(result.mode === 'broad' && result.directions ? { kind: 'pick-length', result, ...(direction ? { direction } : {}) } : { kind: 'pick-length', result })
          return
        }
        setPhase({ kind: 'error', message: errMessage(e), retry: { type: 'start', result, slideCount, direction } })
      }
    },
    [prompt, upgrade, modelId, defaultKit, useKit],
  )

  const onRetry = (r: Retry) => (r.type === 'analyze' ? void analyze() : r.type === 'start' ? void start(r.result, r.slideCount, r.direction) : navigate('/', { replace: true }))

  // Poll the job. Refreshing the page resumes here via the stored job id.
  const jobId = phase.kind === 'generating' ? (phase.job?.id ?? getPendingJob()) : null
  useEffect(() => {
    if (!jobId) return
    let stop = false
    const tick = async () => {
      try {
        const job = await api.getJob(jobId)
        if (stop) return
        if (job.status === 'completed' && job.presentationId) {
          clearPending()
          void refresh() // credits changed
          navigate(`/edit/${job.presentationId}`, { replace: true })
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          setPendingJob(null)
          idemKey.current = crypto.randomUUID()
          setPhase({ kind: 'error', message: job.error ?? 'Generation was cancelled.', retry: { type: 'home' } })
        } else setPhase({ kind: 'generating', job })
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          setPendingJob(null)
          navigate('/', { replace: true })
        }
      }
    }
    void tick()
    const t = setInterval(tick, 1500)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [jobId, navigate, refresh])

  if (!prompt && !getPendingJob()) return <Navigate to="/" replace />

  const lengths = (r: AnalyzeResult, d?: Direction) => {
    // A slide count the user wrote in their prompt is an instruction, not a suggestion: offer exactly that.
    if (r.analysis.slideCount) return [['As you asked', Math.min(r.maxSlides, r.analysis.slideCount)]] as const
    const std = d?.suggestedSlideCount ?? r.suggestedSlideCount
    return [['Short', Math.max(4, Math.min(6, std - 2))], ['Standard', std], ['Detailed', Math.min(r.maxSlides, std + 5)]] as const
  }

  return (
    <div className="min-h-screen bg-[#f6f6f6] relative">
      <button onClick={() => navigate('/')} aria-label="Back" className="absolute top-5 left-5 w-10 h-10 rounded-full bg-white border border-border grid place-items-center hover:bg-slate-50"><ArrowLeft aria-hidden size={18} /></button>
      <main className="max-w-[820px] mx-auto pt-8 sm:pt-16 pb-16 sm:pb-24 px-4 sm:px-6">
        {prompt && <div className="ml-auto max-w-[85%] bg-[#ececec] rounded-2xl px-5 py-4 text-[17px] leading-relaxed whitespace-pre-wrap break-words">{prompt}</div>}

        {phase.kind === 'analyzing' && <ThinkingLoader messages={['Reading your request…', 'Working out the topic and audience…', 'Looking for the best angle…', 'Planning the story of your deck…']} />}

        {phase.kind === 'error' && (
          <Card>
            <p role="alert" className="font-semibold mb-3">{phase.message}</p>
            <button onClick={() => onRetry(phase.retry)} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold">Try again</button>
          </Card>
        )}

        {phase.kind === 'pick-direction' && phase.result.directions && (
          <>
            <p className="mt-10 text-[17px]">Which angle should this presentation take?</p>
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              {phase.result.directions.map((d) => (
                <button key={d.id} onClick={() => setPhase({ kind: 'pick-length', result: phase.result, direction: d })} className="text-left bg-white border border-border rounded-xl p-4 hover:border-primary hover:shadow-sm transition">
                  <div className="font-semibold">{d.title}</div>
                  <div className="text-sm text-slate-600 mt-1">{d.description}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setPhase({ kind: 'pick-length', result: phase.result })} className="mt-4 text-sm text-slate-500 underline">Let AI decide</button>
          </>
        )}

        {phase.kind === 'pick-length' && (
          <PickLength
            result={phase.result}
            direction={phase.direction}
            models={models}
            modelId={modelId}
            lengths={lengths(phase.result, phase.direction)}
            perSlide={models.find((m) => m.id === modelId)?.creditsPerSlide ?? 0}
            onStart={(n, model) => { setModelId(model); void start(phase.result, n, phase.direction, model) }}
            brand={defaultKit ? { kit: defaultKit, checked: useKit, onChange: setUseKit } : undefined}
          />
        )}

        {phase.kind === 'generating' && (
          <Card>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="pt-orb" aria-hidden><i /><b /></span>
                <p className="font-heading font-bold text-base truncate" role="status"><span className="pt-shimmer">{phase.job ? STAGES[phase.job.status] : 'Starting…'}</span></p>
              </div>
              {phase.job && (
                <button onClick={() => void api.cancelJob(phase.job!.id)} className="text-sm text-slate-500 underline shrink-0">Cancel</button>
              )}
            </div>
            <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-valuenow={phase.job?.progress ?? 0} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full pt-bar rounded-full transition-all duration-700" style={{ width: `${Math.max(4, phase.job?.progress ?? 0)}%` }} />
            </div>
            <ol className="mt-5 grid grid-cols-5 gap-1 text-center" aria-label="Steps">
              {STEPS.map(([status, label], n) => {
                const at = phase.job ? STEPS.findIndex(([k]) => k === phase.job!.status) : -1
                const state = n < at ? 'done' : n === at ? 'now' : 'next'
                return (
                  <li key={status} className="flex flex-col items-center gap-1.5" aria-current={state === 'now' ? 'step' : undefined}>
                    <span className={`w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold transition-colors ${state === 'done' ? 'bg-primary text-white' : state === 'now' ? 'bg-white text-primary border-2 border-primary pt-step-now' : 'bg-slate-100 text-slate-400'}`}>{state === 'done' ? <Check aria-hidden size={13} strokeWidth={3} /> : n + 1}</span>
                    <span className={`text-[11px] sm:text-xs leading-tight ${state === 'next' ? 'text-slate-400' : 'text-slate-700 font-medium'}`}>{label}</span>
                  </li>
                )
              })}
            </ol>
          </Card>
        )}
      </main>
    </div>
  )
}
